import { researchPrices, closeBrowser } from './src/services/pricing.js';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, '../data/shoes.db');
const db = new Database(dbPath);

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
    Math.round(median * 100) / 100,
    shoeId
  );
}

const shoes = db.prepare(`
  SELECT * FROM shoes
  WHERE identified = 1
  AND id NOT IN (SELECT DISTINCT shoe_id FROM price_sources)
  ORDER BY id
`).all() as Record<string, any>[];

console.log(`Starting bulk research for ${shoes.length} shoes...`);
let completed = 0;
let errors = 0;
let found = 0;

(async () => {
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

      completed++;
      if (results.length > 0) found++;
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`[${completed}/${shoes.length}] ${shoe.brand} ${shoe.model} - ${results.length > 0 ? '$' + results[0].price : 'no price'} (${elapsed}s)`);
    } catch (err: any) {
      completed++;
      errors++;
      console.log(`[${completed}/${shoes.length}] ERROR: ${shoe.brand} ${shoe.model} - ${err.message}`);
    }

    // Brief delay between scrapes
    if (completed < shoes.length) {
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  await closeBrowser();

  const stats = db.prepare('SELECT COUNT(*) as cnt FROM price_sources').get() as { cnt: number };
  const value = db.prepare('SELECT ROUND(SUM(my_price), 2) as total FROM shoes WHERE my_price IS NOT NULL').get() as { total: number };
  db.close();

  console.log(`\nDone! ${found}/${shoes.length} shoes priced, ${errors} errors`);
  console.log(`Total price sources: ${stats.cnt}`);
  console.log(`Total collection value: $${value.total}`);
})();
