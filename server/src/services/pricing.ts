import { createRequire } from 'module';
import type { Browser, Page } from 'puppeteer';
import type { PriceResult } from '../../../shared/types.js';

const require = createRequire(import.meta.url);
const puppeteerExtra = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteerExtra.use(StealthPlugin());

interface ShoeInfo {
  brand: string | null;
  model: string | null;
  colorway: string | null;
  size: string | null;
  year: string | null;
  type: string | null;
}

// --- Browser lifecycle ---
let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browser || !browser.connected) {
    browser = await puppeteerExtra.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    }) as unknown as Browser;
  }
  return browser;
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

// --- Size normalization ---
/**
 * Normalizes various size formats to a plain numeric StockX size string.
 * Returns null if the size can't be parsed as a US men's size.
 */
function normalizeSize(size: string | null): string | null {
  if (!size) return null;

  let s = size.trim();

  // Remove common prefixes
  s = s.replace(/^(US\s*)?M(?:'?S)?/i, '');  // "US M 12", "M'S12"
  s = s.replace(/^US\s*/i, '');               // "US 12"
  s = s.replace(/\s*(Men'?s?|Women'?s?|Mens|Womens).*$/i, '');  // trailing gender

  s = s.trim();

  // Skip youth/kids sizes
  if (/^\d+\.?\d*Y$/i.test(s)) return null;
  // Skip letter sizes like "L(11-12)"
  if (/^[SMLX]/i.test(s)) return null;
  // Skip width suffixes like "7 B"
  s = s.replace(/\s+[A-E]$/i, '');

  // Convert fractions: "10 1/2" → "10.5"
  s = s.replace(/(\d+)\s+1\/2/, (_, n) => `${n}.5`);

  // Validate it's a number
  const num = parseFloat(s);
  if (isNaN(num) || num < 3 || num > 18) return null;

  // Return clean format
  return num % 1 === 0 ? num.toString() : num.toFixed(1);
}

// --- StockX scraping ---

async function scrapeStockXSearch(page: Page, query: string): Promise<{ urlKey: string; title: string } | null> {
  try {
    await page.goto(`https://stockx.com/search?s=${encodeURIComponent(query)}`, {
      waitUntil: 'networkidle2',
      timeout: 20000,
    });

    // Wait for search results to appear
    await page.waitForSelector('a[href*="/"]', { timeout: 10000 }).catch(() => {});

    const result = await page.evaluate(() => {
      // StockX search results are product cards with links
      const links = document.querySelectorAll('a[data-testid="productTile-ProductSwitcherLink"]');
      if (links.length > 0) {
        const link = links[0] as HTMLAnchorElement;
        const href = link.getAttribute('href') || '';
        const urlKey = href.replace(/^\//, '').split('?')[0];
        const title = link.textContent?.trim() || '';
        return { urlKey, title };
      }

      // Fallback: find first product link that looks like a sneaker page
      const allLinks = Array.from(document.querySelectorAll('a[href]'));
      for (const link of allLinks) {
        const href = (link as HTMLAnchorElement).getAttribute('href') || '';
        // Product pages are like /air-jordan-4-retro-university-blue
        if (href.match(/^\/[a-z0-9-]+$/) && !href.match(/^\/(search|about|help|sell|login|signup|brands|trending|sneakers|shoes)/)) {
          return {
            urlKey: href.replace(/^\//, ''),
            title: link.textContent?.trim() || '',
          };
        }
      }
      return null;
    });

    return result;
  } catch {
    return null;
  }
}

async function scrapeStockXPrice(page: Page, urlKey: string, size: string | null): Promise<number | null> {
  try {
    const sizeParam = size ? `?size=${size}` : '';
    await page.goto(`https://stockx.com/${urlKey}${sizeParam}`, {
      waitUntil: 'networkidle2',
      timeout: 25000,
    });

    // Wait a bit for dynamic content
    await new Promise(r => setTimeout(r, 2000));

    const price = await page.evaluate(() => {
      const text = document.body.innerText;
      // Look for "Buy Now for $X" pattern
      const match = text.match(/Buy Now for\s*\$(\d[\d,]*)/);
      if (match) return parseInt(match[1].replace(/,/g, ''));
      // Fallback: look for "Buy Now" section price
      const match2 = text.match(/Buy Now\s*\$(\d[\d,]*)/);
      if (match2) return parseInt(match2[1].replace(/,/g, ''));
      return null;
    });

    return price;
  } catch {
    return null;
  }
}

// --- sneaks-api product lookup (optional, for URL finding) ---

interface SneaksProduct {
  shoeName: string;
  styleID: string;
  retailPrice: number;
  resellLinks: {
    stockX?: string;
    goat?: string;
    flightClub?: string;
  };
  lowestResellPrice?: {
    stockX?: number;
    goat?: number;
    flightClub?: number;
  };
}

function findProductViaSneaks(query: string): Promise<SneaksProduct | null> {
  return new Promise((resolve) => {
    try {
      // Dynamic import since sneaks-api is CJS
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const SneaksAPI = require('sneaks-api');
      const sneaks = new SneaksAPI();
      sneaks.getProducts(query, 1, (err: Error | null, products: SneaksProduct[]) => {
        if (err || !products || products.length === 0) {
          resolve(null);
          return;
        }
        resolve(products[0]);
      });
    } catch {
      resolve(null);
    }

    // Timeout after 10 seconds
    setTimeout(() => resolve(null), 10000);
  });
}

// --- Main research function ---

/**
 * Researches real marketplace prices for a shoe by scraping StockX.
 * Uses sneaks-api to find the product, then puppeteer to get the actual price.
 */
export async function researchPrices(shoe: ShoeInfo): Promise<PriceResult[]> {
  const results: PriceResult[] = [];
  const size = normalizeSize(shoe.size);

  // Build search query with colorway for more precise matching
  const searchParts = [shoe.brand, shoe.model].filter(Boolean);
  // Add colorway keywords if it looks useful (not just color codes)
  if (shoe.colorway && !/^[A-Z]{3,}\//.test(shoe.colorway)) {
    searchParts.push(shoe.colorway);
  }
  const searchQuery = searchParts.join(' ');

  if (!searchQuery || searchQuery.length < 3) return results;

  const b = await getBrowser();
  const page = await b.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  try {
    // Step 1: Find the StockX product URL
    let urlKey: string | null = null;

    // Try sneaks-api first (fast, no browser needed)
    const sneaksProduct = await findProductViaSneaks(searchQuery);
    if (sneaksProduct?.resellLinks?.stockX) {
      // Validate: product name should be a shoe, not luggage/accessories
      const pName = sneaksProduct.shoeName?.toLowerCase() || '';
      const isSneaker = !pName.includes('luggage') && !pName.includes('suitcase')
        && !pName.includes('backpack') && !pName.includes('hat')
        && !pName.includes('hoodie') && !pName.includes('tee ')
        && !pName.includes('jacket') && !pName.includes('polo');
      if (isSneaker) {
        const match = sneaksProduct.resellLinks.stockX.match(/stockx\.com\/(.+?)(?:\?|$)/);
        if (match) urlKey = match[1];
      }
    }

    // Fallback: search StockX directly via browser
    if (!urlKey) {
      // Try with just brand + model if colorway search failed
      const fallbackQuery = [shoe.brand, shoe.model].filter(Boolean).join(' ');
      const searchResult = await scrapeStockXSearch(page, fallbackQuery);
      if (searchResult) {
        urlKey = searchResult.urlKey;
      }
    }

    if (!urlKey) {
      console.log(`No StockX product found for: ${searchQuery}`);
      return results;
    }

    // Step 2: Get the real price from StockX
    const price = await scrapeStockXPrice(page, urlKey, size);

    if (price && price > 0) {
      const sizeParam = size ? `?size=${size}` : '';
      results.push({
        source_name: 'StockX',
        url: `https://stockx.com/${urlKey}${sizeParam}`,
        price,
        shoe_condition: 'New/DS',
        box_condition: shoe.type?.includes('Boxed') && !shoe.type?.includes('Boxless') ? 'Pristine' : 'Missing',
      });
    } else {
      console.log(`No StockX price available for: ${searchQuery} size ${size}`);
    }
  } finally {
    await page.close();
  }

  return results;
}
