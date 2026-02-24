import { Router, Request, Response } from 'express';
import { getAllShoes, getPriceSourcesByShoeId } from '../db.js';

const router = Router();

// All condition combinations for flattened price columns
const SHOE_CONDITIONS = ['New/DS', 'Excellent', 'Good', 'Fair'] as const;
const BOX_CONDITIONS = ['Pristine', 'Damaged', 'Missing'] as const;

type ConditionCombo = {
  shoeCondition: string;
  boxCondition: string;
  priceKey: string;
  sourceKey: string;
};

function getConditionCombos(): ConditionCombo[] {
  const combos: ConditionCombo[] = [];
  for (const sc of SHOE_CONDITIONS) {
    for (const bc of BOX_CONDITIONS) {
      const scSlug = sc.toLowerCase().replace(/\//g, '_').replace(/\s+/g, '_');
      const bcSlug = bc.toLowerCase().replace(/\s+/g, '_');
      combos.push({
        shoeCondition: sc,
        boxCondition: bc,
        priceKey: `price_${scSlug}_${bcSlug}`,
        sourceKey: `source_${scSlug}_${bcSlug}`,
      });
    }
  }
  return combos;
}

interface ShoeRow {
  id: number;
  image_path: string;
  image_filename: string;
  type: string | null;
  location: string | null;
  sub_location: string | null;
  brand: string | null;
  model: string | null;
  colorway: string | null;
  size: string | null;
  year: string | null;
  shoe_condition: string | null;
  box_condition: string | null;
  my_price: number | null;
  identified: number;
  created_at: string;
  updated_at: string;
}

interface PriceSourceRow {
  id: number;
  shoe_id: number;
  source_name: string;
  url: string;
  price: number;
  shoe_condition: string | null;
  box_condition: string | null;
  created_at: string;
}

function buildExportData() {
  const shoes = getAllShoes() as ShoeRow[];
  const conditionCombos = getConditionCombos();

  return shoes.map(shoe => {
    const priceSources = getPriceSourcesByShoeId(shoe.id) as PriceSourceRow[];

    // Build base record
    const record: Record<string, string | number | null> = {
      id: shoe.id,
      brand: shoe.brand,
      model: shoe.model,
      colorway: shoe.colorway,
      size: shoe.size,
      year: shoe.year,
      type: shoe.type,
      location: shoe.location,
      sub_location: shoe.sub_location,
      shoe_condition: shoe.shoe_condition,
      box_condition: shoe.box_condition,
      my_price: shoe.my_price,
      image_path: shoe.image_path,
      image_filename: shoe.image_filename,
      identified: shoe.identified,
    };

    // For each condition combo, find the best (lowest) price and its source
    for (const combo of conditionCombos) {
      const matching = priceSources.filter(
        ps => ps.shoe_condition === combo.shoeCondition && ps.box_condition === combo.boxCondition
      );

      if (matching.length > 0) {
        // Pick the lowest price
        const best = matching.reduce((a, b) => (a.price < b.price ? a : b));
        record[combo.priceKey] = best.price;
        record[combo.sourceKey] = `${best.source_name}: ${best.url}`;
      } else {
        record[combo.priceKey] = null;
        record[combo.sourceKey] = null;
      }
    }

    return record;
  });
}

function escapeCSV(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  // Escape if contains comma, quote, or newline
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * GET /api/export/csv
 * Exports full collection as CSV with flattened price columns
 */
router.get('/csv', (_req: Request, res: Response) => {
  try {
    const data = buildExportData();

    if (data.length === 0) {
      res.status(200).send('No shoes in collection');
      return;
    }

    // Build CSV header from first record keys
    const headers = Object.keys(data[0]);
    const csvRows: string[] = [];
    csvRows.push(headers.map(h => escapeCSV(h)).join(','));

    for (const record of data) {
      const row = headers.map(h => escapeCSV(record[h]));
      csvRows.push(row.join(','));
    }

    const csv = csvRows.join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="solelibrary_export_${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  } catch (error) {
    console.error('Error exporting CSV:', error);
    res.status(500).json({ error: 'Failed to export CSV' });
  }
});

/**
 * GET /api/export/json
 * Exports full collection as JSON with flattened price columns
 */
router.get('/json', (_req: Request, res: Response) => {
  try {
    const data = buildExportData();

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="solelibrary_export_${new Date().toISOString().slice(0, 10)}.json"`);
    res.json(data);
  } catch (error) {
    console.error('Error exporting JSON:', error);
    res.status(500).json({ error: 'Failed to export JSON' });
  }
});

export default router;
