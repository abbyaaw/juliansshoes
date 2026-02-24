import { researchPrices, closeBrowser } from './src/services/pricing.js';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.resolve(__dirname, '../data/shoes.db'));

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

// Only research shoes that are on StockX (sneaker brands)
const researchableIds = [3, 5, 8, 31, 33, 52, 55, 56, 58, 71, 72, 99, 110];

const shoes = db.prepare(`
  SELECT * FROM shoes WHERE id IN (${researchableIds.join(',')})
  ORDER BY id
`).all() as Record<string, any>[];

console.log(`Re-researching ${shoes.length} shoes with improved search...`);

(async () => {
  let found = 0;
  for (const shoe of shoes) {
    const start = Date.now();
    try {
      const results = await researchPrices({
        brand: shoe.brand,
        model: shoe.model,
        colorway: shoe.colorway,
        size: shoe.size,
        year: shoe.year,
        type: shoe.type,
      });

      for (const result of results) {
        db.prepare(`
          INSERT INTO price_sources (shoe_id, source_name, url, price, shoe_condition, box_condition)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(shoe.id, result.source_name, result.url, result.price, result.shoe_condition, result.box_condition);
        autoSetMyPrice(shoe.id);
      }

      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      if (results.length > 0) {
        found++;
        console.log(`[${shoe.id}] ${shoe.brand} ${shoe.model} → $${results[0].price} | ${results[0].url} (${elapsed}s)`);
      } else {
        console.log(`[${shoe.id}] ${shoe.brand} ${shoe.model} → no price (${elapsed}s)`);
      }
    } catch (err: any) {
      console.log(`[${shoe.id}] ERROR: ${shoe.brand} ${shoe.model} → ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 1500));
  }

  await closeBrowser();

  const stats = db.prepare('SELECT COUNT(*) as cnt FROM price_sources').get() as { cnt: number };
  const priced = db.prepare('SELECT COUNT(*) as cnt FROM shoes WHERE my_price IS NOT NULL').get() as { cnt: number };
  const value = db.prepare('SELECT ROUND(SUM(my_price), 2) as total FROM shoes WHERE my_price IS NOT NULL').get() as { total: number };
  db.close();

  console.log(`\nDone! Found ${found}/${shoes.length} prices`);
  console.log(`Total sources: ${stats.cnt}, Priced shoes: ${priced.cnt}, Value: $${value.total}`);
})();
