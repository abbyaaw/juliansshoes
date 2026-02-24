import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = process.env.DATABASE_PATH || path.resolve(__dirname, '../../data/shoes.db');

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDb(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS shoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      image_path TEXT NOT NULL,
      image_filename TEXT NOT NULL,
      type TEXT,
      location TEXT,
      sub_location TEXT,
      brand TEXT,
      model TEXT,
      colorway TEXT,
      size TEXT,
      year TEXT,
      shoe_condition TEXT,
      box_condition TEXT,
      my_price REAL,
      identified INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS price_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shoe_id INTEGER NOT NULL,
      source_name TEXT NOT NULL,
      url TEXT NOT NULL,
      price REAL NOT NULL,
      shoe_condition TEXT,
      box_condition TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (shoe_id) REFERENCES shoes(id) ON DELETE CASCADE
    );
  `);

  console.log(`Database initialized at ${DB_PATH}`);
}

// --- Helper functions ---

export function getAllShoes(filters?: {
  brand?: string;
  type?: string;
  location?: string;
  identified?: string;
  priced?: string;
}) {
  let query = 'SELECT * FROM shoes WHERE 1=1';
  const params: Record<string, string | number> = {};

  if (filters?.brand) {
    query += ' AND brand = @brand';
    params.brand = filters.brand;
  }
  if (filters?.type) {
    query += ' AND type = @type';
    params.type = filters.type;
  }
  if (filters?.location) {
    query += ' AND location = @location';
    params.location = filters.location;
  }
  if (filters?.identified === 'true') {
    query += ' AND identified = 1';
  } else if (filters?.identified === 'false') {
    query += ' AND identified = 0';
  }
  if (filters?.priced === 'true') {
    query += ' AND id IN (SELECT DISTINCT shoe_id FROM price_sources)';
  } else if (filters?.priced === 'false') {
    query += ' AND id NOT IN (SELECT DISTINCT shoe_id FROM price_sources)';
  }

  query += ' ORDER BY brand, model, colorway';

  return db.prepare(query).all(params);
}

export function getShoeById(id: number) {
  return db.prepare('SELECT * FROM shoes WHERE id = ?').get(id);
}

export function getPriceSourcesByShoeId(shoeId: number) {
  return db.prepare('SELECT * FROM price_sources WHERE shoe_id = ? ORDER BY price ASC').all(shoeId);
}

export function updateShoe(id: number, fields: Record<string, unknown>) {
  const allowedFields = [
    'brand', 'model', 'colorway', 'size', 'year',
    'shoe_condition', 'box_condition', 'my_price',
    'type', 'location', 'sub_location', 'identified',
  ];

  const updates: string[] = [];
  const params: Record<string, unknown> = { id };

  for (const [key, value] of Object.entries(fields)) {
    if (allowedFields.includes(key)) {
      updates.push(`${key} = @${key}`);
      params[key] = value;
    }
  }

  if (updates.length === 0) return null;

  updates.push("updated_at = datetime('now')");

  const query = `UPDATE shoes SET ${updates.join(', ')} WHERE id = @id`;
  return db.prepare(query).run(params);
}

export function deleteShoe(id: number) {
  // price_sources cascade-deleted via FK
  return db.prepare('DELETE FROM shoes WHERE id = ?').run(id);
}

export function insertShoe(shoe: {
  image_path: string;
  image_filename: string;
  type: string | null;
  location: string | null;
  sub_location: string | null;
  box_condition: string | null;
}) {
  return db.prepare(`
    INSERT INTO shoes (image_path, image_filename, type, location, sub_location, box_condition)
    VALUES (@image_path, @image_filename, @type, @location, @sub_location, @box_condition)
  `).run(shoe);
}

export function shoeExistsByImagePath(imagePath: string): boolean {
  const row = db.prepare('SELECT id FROM shoes WHERE image_path = ?').get(imagePath);
  return !!row;
}

export function getUnidentifiedShoes() {
  return db.prepare('SELECT * FROM shoes WHERE identified = 0 ORDER BY id').all();
}

export function markShoeIdentified(id: number, data: {
  brand: string;
  model: string;
  colorway: string;
  size: string | null;
  year: string | null;
  shoe_condition: string;
}) {
  return db.prepare(`
    UPDATE shoes SET
      brand = @brand,
      model = @model,
      colorway = @colorway,
      size = @size,
      year = @year,
      shoe_condition = @shoe_condition,
      identified = 1,
      updated_at = datetime('now')
    WHERE id = @id
  `).run({ ...data, id });
}

export function insertPriceSource(source: {
  shoe_id: number;
  source_name: string;
  url: string;
  price: number;
  shoe_condition: string | null;
  box_condition: string | null;
}) {
  const result = db.prepare(`
    INSERT INTO price_sources (shoe_id, source_name, url, price, shoe_condition, box_condition)
    VALUES (@shoe_id, @source_name, @url, @price, @shoe_condition, @box_condition)
  `).run(source);

  // Auto-set my_price if not already set
  autoSetMyPrice(source.shoe_id);

  return result;
}

/**
 * Auto-set my_price to a smart default from available price sources.
 * Picks the median price, preferring "Good" or "Excellent" condition sources.
 */
export function autoSetMyPrice(shoeId: number): void {
  const shoe = db.prepare('SELECT my_price FROM shoes WHERE id = ?').get(shoeId) as { my_price: number | null } | undefined;
  if (!shoe || (shoe.my_price !== null && shoe.my_price > 0)) return; // already set

  const sources = db.prepare(
    'SELECT price FROM price_sources WHERE shoe_id = ? AND price > 0 ORDER BY price ASC'
  ).all(shoeId) as { price: number }[];

  if (sources.length === 0) return;

  // Use median price as the default
  const mid = Math.floor(sources.length / 2);
  const median = sources.length % 2 === 0
    ? (sources[mid - 1].price + sources[mid].price) / 2
    : sources[mid].price;

  db.prepare("UPDATE shoes SET my_price = ?, updated_at = datetime('now') WHERE id = ?").run(
    Math.round(median * 100) / 100,
    shoeId
  );
}

export function deletePriceSourcesByShoeId(shoeId: number) {
  return db.prepare('DELETE FROM price_sources WHERE shoe_id = ?').run(shoeId);
}

export function getIdentifiedShoesWithoutPrices() {
  return db.prepare(`
    SELECT * FROM shoes
    WHERE identified = 1
    AND id NOT IN (SELECT DISTINCT shoe_id FROM price_sources)
    ORDER BY id
  `).all();
}

export function getCollectionStats() {
  const totalShoes = db.prepare('SELECT COUNT(*) as count FROM shoes').get() as { count: number };
  const identified = db.prepare('SELECT COUNT(*) as count FROM shoes WHERE identified = 1').get() as { count: number };
  const priced = db.prepare('SELECT COUNT(DISTINCT shoe_id) as count FROM price_sources').get() as { count: number };
  const totalValue = db.prepare('SELECT COALESCE(SUM(my_price), 0) as total FROM shoes WHERE my_price IS NOT NULL').get() as { total: number };

  const byType = db.prepare(`
    SELECT type, COUNT(*) as count, COALESCE(SUM(my_price), 0) as value
    FROM shoes WHERE type IS NOT NULL GROUP BY type
  `).all() as { type: string; count: number; value: number }[];

  const byLocation = db.prepare(`
    SELECT location, COUNT(*) as count, COALESCE(SUM(my_price), 0) as value
    FROM shoes WHERE location IS NOT NULL GROUP BY location
  `).all() as { location: string; count: number; value: number }[];

  const byBrand = db.prepare(`
    SELECT brand, COUNT(*) as count, COALESCE(SUM(my_price), 0) as value
    FROM shoes WHERE brand IS NOT NULL GROUP BY brand ORDER BY count DESC
  `).all() as { brand: string; count: number; value: number }[];

  return {
    total_shoes: totalShoes.count,
    identified_count: identified.count,
    unidentified_count: totalShoes.count - identified.count,
    priced_count: priced.count,
    unpriced_count: totalShoes.count - priced.count,
    total_value: totalValue.total,
    by_type: Object.fromEntries(byType.map(r => [r.type, { count: r.count, value: r.value }])),
    by_location: Object.fromEntries(byLocation.map(r => [r.location, { count: r.count, value: r.value }])),
    by_brand: Object.fromEntries(byBrand.map(r => [r.brand, { count: r.count, value: r.value }])),
  };
}

/**
 * One-time migration: translate abbreviated colorway codes to readable names.
 * Safe to run multiple times — only affects entries that still contain codes.
 */
export function migrateColorwayCodes(normalizeColorway: (c: string) => string): number {
  const rows = db.prepare(
    "SELECT id, colorway FROM shoes WHERE colorway IS NOT NULL AND colorway != ''"
  ).all() as { id: number; colorway: string }[];

  let updated = 0;
  const update = db.prepare("UPDATE shoes SET colorway = ?, updated_at = datetime('now') WHERE id = ?");

  for (const row of rows) {
    const normalized = normalizeColorway(row.colorway);
    if (normalized !== row.colorway) {
      update.run(normalized, row.id);
      updated++;
    }
  }

  if (updated > 0) {
    console.log(`Colorway migration: translated ${updated} coded entries to readable names`);
  }

  return updated;
}

export default db;
