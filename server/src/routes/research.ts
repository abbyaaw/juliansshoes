import { Router, Request, Response } from 'express';
import {
  getShoeById,
  insertPriceSource,
  deletePriceSourcesByShoeId,
  getIdentifiedShoesWithoutPrices,
  getPriceSourcesByShoeId,
} from '../db.js';
import { researchPrices, closeBrowser } from '../services/pricing.js';

const router = Router();

/**
 * POST /api/research/bulk
 * Researches prices for all identified shoes without price sources.
 * Uses SSE to stream progress back to client.
 *
 * IMPORTANT: This route must be defined BEFORE /:shoe_id to avoid
 * Express matching "bulk" as a shoe_id parameter.
 */
router.post('/bulk', async (_req: Request, res: Response) => {
  // Set up SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const sendEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const shoes = getIdentifiedShoesWithoutPrices() as Record<string, unknown>[];

    sendEvent('start', { total: shoes.length });

    let completed = 0;
    const errors: string[] = [];

    for (const shoe of shoes) {
      const shoeId = shoe.id as number;
      const brand = shoe.brand as string;
      const model = shoe.model as string;

      sendEvent('progress', {
        completed,
        total: shoes.length,
        current: `${brand} ${model}`,
      });

      try {
        const results = await researchPrices({
          brand: shoe.brand as string | null,
          model: shoe.model as string | null,
          colorway: shoe.colorway as string | null,
          size: shoe.size as string | null,
          year: shoe.year as string | null,
          type: shoe.type as string | null,
        });

        for (const result of results) {
          insertPriceSource({
            shoe_id: shoeId,
            source_name: result.source_name,
            url: result.url,
            price: result.price,
            shoe_condition: result.shoe_condition,
            box_condition: result.box_condition,
          });
        }

        sendEvent('researched', {
          shoe_id: shoeId,
          name: `${brand} ${model}`,
          prices_found: results.length,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${brand} ${model}: ${msg}`);
        sendEvent('error', {
          shoe_id: shoeId,
          name: `${brand} ${model}`,
          error: msg,
        });
      }

      completed++;

      // Brief delay between scrapes to avoid rate limiting
      if (completed < shoes.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    sendEvent('done', {
      total: shoes.length,
      completed,
      errors,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    sendEvent('error', { message: msg });
  } finally {
    await closeBrowser();
    res.end();
  }
});

/**
 * POST /api/research/:shoe_id
 * Researches prices for a single shoe using Gemini with Google Search grounding.
 */
router.post('/:shoe_id', async (req: Request, res: Response) => {
  try {
    const shoeId = parseInt(req.params.shoe_id, 10);
    if (isNaN(shoeId)) {
      res.status(400).json({ error: 'Invalid shoe ID' });
      return;
    }

    const shoe = getShoeById(shoeId) as Record<string, unknown> | undefined;
    if (!shoe) {
      res.status(404).json({ error: 'Shoe not found' });
      return;
    }

    if (!shoe.identified) {
      res.status(400).json({ error: 'Shoe must be identified before researching prices' });
      return;
    }

    const results = await researchPrices({
      brand: shoe.brand as string | null,
      model: shoe.model as string | null,
      colorway: shoe.colorway as string | null,
      size: shoe.size as string | null,
      year: shoe.year as string | null,
      type: shoe.type as string | null,
    });

    // Insert all price sources
    for (const result of results) {
      insertPriceSource({
        shoe_id: shoeId,
        source_name: result.source_name,
        url: result.url,
        price: result.price,
        shoe_condition: result.shoe_condition,
        box_condition: result.box_condition,
      });
    }

    // Return updated shoe with price sources
    const updatedShoe = getShoeById(shoeId);
    const priceSources = getPriceSourcesByShoeId(shoeId);

    res.json({
      success: true,
      shoe: { ...updatedShoe, price_sources: priceSources },
      prices_found: results.length,
    });
  } catch (error) {
    console.error('Error researching prices:', error);
    const msg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: `Failed to research prices: ${msg}` });
  } finally {
    await closeBrowser();
  }
});

/**
 * DELETE /api/research/:shoe_id/prices
 * Clear all price sources for a shoe (to allow re-research).
 */
router.delete('/:shoe_id/prices', (req: Request, res: Response) => {
  try {
    const shoeId = parseInt(req.params.shoe_id, 10);
    if (isNaN(shoeId)) {
      res.status(400).json({ error: 'Invalid shoe ID' });
      return;
    }

    const shoe = getShoeById(shoeId);
    if (!shoe) {
      res.status(404).json({ error: 'Shoe not found' });
      return;
    }

    const result = deletePriceSourcesByShoeId(shoeId);
    res.json({
      success: true,
      deleted: result.changes,
      message: `Cleared price sources for shoe ${shoeId}`,
    });
  } catch (error) {
    console.error('Error clearing prices:', error);
    res.status(500).json({ error: 'Failed to clear price sources' });
  }
});

export default router;
