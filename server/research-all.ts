/**
 * Bulk price research using Gemini 2.0 Flash with Google Search grounding.
 * Finds real StockX and GOAT links with actual prices for each shoe's size.
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { GoogleGenAI } from '@google/genai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const db = new Database(path.resolve(__dirname, '../data/shoes.db'));
db.pragma('journal_mode = WAL');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

interface PriceResult {
  source_name: string;
  url: string;
  price: number;
  shoe_condition: string | null;
  box_condition: string | null;
}

function autoSetMyPrice(shoeId: number): void {
  const sources = db.prepare(
    'SELECT price FROM price_sources WHERE shoe_id = ? AND price > 0 ORDER BY price ASC'
  ).all(shoeId) as { price: number }[];
  if (sources.length === 0) return;
  const mid = Math.floor(sources.length / 2);
  const median = sources.length % 2 === 0
    ? (sources[mid - 1].price + sources[mid].price) / 2
    : sources[mid].price;
  db.prepare("UPDATE shoes SET my_price = ?, updated_at = datetime('now') WHERE id = ?").run(
    Math.round(median * 100) / 100, shoeId
  );
}

async function researchShoe(shoe: Record<string, any>): Promise<PriceResult[]> {
  const name = `${shoe.brand} ${shoe.model}`;
  const size = shoe.size || '';
  const colorway = shoe.colorway || '';
  const year = shoe.year || '';
  const isBoxed = shoe.type?.includes('Boxed') && !shoe.type?.includes('Boxless');

  const prompt = `Find the current resale price for this sneaker on StockX and GOAT:

Shoe: ${name}
Colorway: ${colorway}
Size: US Men's ${size}
Year: ${year}

For EACH marketplace (StockX and GOAT), provide:
1. The direct product URL (must be a real URL to the actual product page, not a search page)
2. The current lowest ask/buy price for size ${size}

Return ONLY a JSON array like this, no other text:
[
  {"source": "StockX", "url": "https://stockx.com/...", "price": 150},
  {"source": "GOAT", "url": "https://www.goat.com/sneakers/...", "price": 145}
]

If a shoe is not found on a marketplace, omit that entry. Only include entries where you found a real product page with a price.`;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      const text = response.text ?? '';

      // Extract JSON from response
      let json: any[];
      try {
        json = JSON.parse(text);
      } catch {
        const match = text.match(/\[[\s\S]*?\]/);
        if (match) {
          json = JSON.parse(match[0]);
        } else {
          return [];
        }
      }

      const results: PriceResult[] = [];
      for (const item of json) {
        if (item.url && item.price && item.price > 0 && item.source) {
          // Validate URL looks real
          const url = item.url as string;
          if (url.includes('stockx.com/') || url.includes('goat.com/')) {
            results.push({
              source_name: item.source,
              url: url,
              price: Math.round(item.price),
              shoe_condition: 'New/DS',
              box_condition: isBoxed ? 'Pristine' : 'Missing',
            });
          }
        }
      }
      return results;
    } catch (err: any) {
      const msg = err.message || String(err);
      if ((msg.includes('429') || msg.includes('503') || msg.includes('RESOURCE_EXHAUSTED')) && attempt < 2) {
        console.log(`  Rate limited, waiting ${8 * (attempt + 1)}s...`);
        await new Promise(r => setTimeout(r, 8000 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  return [];
}

// Main
(async () => {
  // Clear all existing price sources and re-research everything
  db.prepare('DELETE FROM price_sources').run();
  db.prepare("UPDATE shoes SET my_price = NULL, updated_at = datetime('now')").run();
  console.log('Cleared all existing prices. Starting fresh research...\n');

  const shoes = db.prepare('SELECT * FROM shoes WHERE identified = 1 ORDER BY id').all() as Record<string, any>[];
  console.log(`Researching prices for ${shoes.length} shoes...\n`);

  let completed = 0;
  let totalSources = 0;
  let errors = 0;

  for (const shoe of shoes) {
    const start = Date.now();
    try {
      const results = await researchShoe(shoe);

      for (const result of results) {
        db.prepare(`
          INSERT INTO price_sources (shoe_id, source_name, url, price, shoe_condition, box_condition)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(shoe.id, result.source_name, result.url, result.price, result.shoe_condition, result.box_condition);
      }
      autoSetMyPrice(shoe.id);

      completed++;
      totalSources += results.length;
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      const prices = results.map(r => `${r.source_name}: $${r.price}`).join(', ');
      console.log(`[${completed}/${shoes.length}] ${shoe.brand} ${shoe.model} (${shoe.size}) → ${prices || 'no price'} (${elapsed}s)`);
    } catch (err: any) {
      completed++;
      errors++;
      console.log(`[${completed}/${shoes.length}] ERROR: ${shoe.brand} ${shoe.model} → ${err.message}`);
    }

    // Rate limit delay
    if (completed < shoes.length) {
      await new Promise(r => setTimeout(r, 4000));
    }
  }

  const value = db.prepare('SELECT ROUND(SUM(my_price), 2) as total FROM shoes WHERE my_price IS NOT NULL').get() as { total: number };
  const sourceCounts = db.prepare('SELECT source_name, COUNT(*) as cnt FROM price_sources GROUP BY source_name').all() as { source_name: string; cnt: number }[];
  db.close();

  console.log(`\n========================================`);
  console.log(`Done! ${completed} shoes researched, ${errors} errors`);
  console.log(`Total price sources: ${totalSources}`);
  sourceCounts.forEach(s => console.log(`  ${s.source_name}: ${s.cnt}`));
  console.log(`Collection value: $${value.total}`);
  console.log(`========================================`);
})();
