import { Router, Request, Response } from 'express';
import {
  getAllShoes,
  getShoeById,
  getPriceSourcesByShoeId,
  updateShoe,
  deleteShoe,
  getCollectionStats,
} from '../db.js';

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

export default router;
