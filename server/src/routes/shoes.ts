import { Router, Request, Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import {
  getAllShoes,
  getShoeById,
  getPriceSourcesByShoeId,
  updateShoe,
  deleteShoe,
  getCollectionStats,
} from '../db.js';

const SHOE_IMAGES_DIR = process.env.SHOE_IMAGES_DIR || "/Users/abigailwalton/Julian's Shoes";
const imageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const router = Router();

/**
 * GET /api/shoes
 * List all shoes with optional filters: brand, type, location, identified, priced
 */
router.get('/', (req: Request, res: Response) => {
  try {
    const { brand, type, location, identified, priced } = req.query;
    const shoes = getAllShoes({
      brand: brand as string | undefined,
      type: type as string | undefined,
      location: location as string | undefined,
      identified: identified as string | undefined,
      priced: priced as string | undefined,
    });
    res.json(shoes);
  } catch (error) {
    console.error('Error listing shoes:', error);
    res.status(500).json({ error: 'Failed to list shoes' });
  }
});

/**
 * GET /api/shoes/stats
 * Collection statistics: totals, breakdowns by type/location/brand, value sums
 */
router.get('/stats', (_req: Request, res: Response) => {
  try {
    const stats = getCollectionStats();
    res.json(stats);
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ error: 'Failed to get collection stats' });
  }
});

/**
 * GET /api/shoes/:id
 * Single shoe with its price_sources
 */
router.get('/:id', (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid shoe ID' });
      return;
    }

    const shoe = getShoeById(id);
    if (!shoe) {
      res.status(404).json({ error: 'Shoe not found' });
      return;
    }

    const priceSources = getPriceSourcesByShoeId(id);
    res.json({ ...shoe, price_sources: priceSources });
  } catch (error) {
    console.error('Error getting shoe:', error);
    res.status(500).json({ error: 'Failed to get shoe' });
  }
});

/**
 * PUT /api/shoes/:id
 * Update shoe fields (shoe_condition, box_condition, my_price, brand, model, etc.)
 */
router.put('/:id', (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid shoe ID' });
      return;
    }

    const shoe = getShoeById(id);
    if (!shoe) {
      res.status(404).json({ error: 'Shoe not found' });
      return;
    }

    const result = updateShoe(id, req.body);
    if (!result) {
      res.status(400).json({ error: 'No valid fields to update' });
      return;
    }

    const updatedShoe = getShoeById(id);
    const priceSources = getPriceSourcesByShoeId(id);
    res.json({ ...updatedShoe, price_sources: priceSources });
  } catch (error) {
    console.error('Error updating shoe:', error);
    res.status(500).json({ error: 'Failed to update shoe' });
  }
});

/**
 * DELETE /api/shoes/:id
 * Delete a shoe and its price sources (cascade)
 */
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid shoe ID' });
      return;
    }

    const shoe = getShoeById(id);
    if (!shoe) {
      res.status(404).json({ error: 'Shoe not found' });
      return;
    }

    deleteShoe(id);
    res.json({ success: true, message: `Shoe ${id} deleted` });
  } catch (error) {
    console.error('Error deleting shoe:', error);
    res.status(500).json({ error: 'Failed to delete shoe' });
  }
});

/**
 * POST /api/shoes/:id/image
 * Upload an image for an existing shoe. Saves to the shoe's image_path.
 */
router.post('/:id/image', imageUpload.single('image'), (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid shoe ID' }); return; }

    const shoe = getShoeById(id) as Record<string, unknown> | undefined;
    if (!shoe) { res.status(404).json({ error: 'Shoe not found' }); return; }

    const file = req.file;
    if (!file) { res.status(400).json({ error: 'No image file' }); return; }

    const imagePath = shoe.image_path as string;
    const fullPath = path.join(SHOE_IMAGES_DIR, imagePath);

    // Ensure directory exists
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, file.buffer);

    res.json({ success: true, path: imagePath });
  } catch (error) {
    console.error('Error uploading shoe image:', error);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

export default router;
