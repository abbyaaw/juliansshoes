import { Router, Request, Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import {
  insertShoe,
  shoeExistsByImagePath,
  getUnidentifiedShoes,
  getShoeById,
  markShoeIdentified,
} from '../db.js';
import { identifyShoe } from '../services/vision.js';
import type { ScanProgress } from '../../../shared/types.js';

const router = Router();

const SHOE_IMAGES_DIR = process.env.SHOE_IMAGES_DIR || "/Users/abigailwalton/Julian's Shoes";
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic']);

// Global scan progress state
let scanProgress: ScanProgress = {
  total: 0,
  completed: 0,
  current_file: '',
  status: 'idle',
  errors: [],
};

/**
 * Parse a folder name into type, location, and sub_location.
 * Format: "Type | Location | Sub Location"
 * Examples:
 *   "Boxed Shoes | Closet | Back" -> type="Boxed Shoes", location="Closet", sub_location="Back"
 *   "Boxless Shoes | Storage Box #1" -> type="Boxless Shoes", location="Storage Box #1", sub_location=null
 */
function parseFolderName(folderName: string): {
  type: string | null;
  location: string | null;
  sub_location: string | null;
  box_condition: string | null;
} {
  const parts = folderName.split(' | ').map(s => s.trim());

  const type = parts[0] || null;
  const location = parts[1] || null;
  const sub_location = parts[2] || null;

  // Set box_condition to "Missing" for Boxless type, null for Boxed (user decides condition later)
  let box_condition: string | null = null;
  if (type && type.toLowerCase().includes('boxless')) {
    box_condition = 'Missing';
  }

  return { type, location, sub_location, box_condition };
}

/**
 * POST /api/scan
 * Scans the shoe image directories and adds new images to the database.
 */
router.post('/', (_req: Request, res: Response) => {
  try {
    let newCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];

    // Read all folders in the shoe images directory
    const entries = fs.readdirSync(SHOE_IMAGES_DIR, { withFileTypes: true });
    const folders = entries.filter(e => e.isDirectory() && !e.name.startsWith('.'));

    for (const folder of folders) {
      const folderPath = path.join(SHOE_IMAGES_DIR, folder.name);
      const { type, location, sub_location, box_condition } = parseFolderName(folder.name);

      // Read all image files in the folder
      let files: fs.Dirent[];
      try {
        files = fs.readdirSync(folderPath, { withFileTypes: true });
      } catch (err) {
        errors.push(`Failed to read folder: ${folder.name}`);
        continue;
      }

      for (const file of files) {
        if (!file.isFile()) continue;

        const ext = path.extname(file.name).toLowerCase();
        if (!IMAGE_EXTENSIONS.has(ext)) continue;

        // image_path is relative to the images directory for URL serving
        const relativePath = path.join(folder.name, file.name);

        // Skip if already in DB
        if (shoeExistsByImagePath(relativePath)) {
          skippedCount++;
          continue;
        }

        try {
          insertShoe({
            image_path: relativePath,
            image_filename: file.name,
            type,
            location,
            sub_location,
            box_condition,
          });
          newCount++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`Failed to insert ${relativePath}: ${msg}`);
        }
      }
    }

    res.json({
      success: true,
      new_shoes: newCount,
      skipped: skippedCount,
      errors,
    });
  } catch (error) {
    console.error('Error scanning directories:', error);
    res.status(500).json({ error: 'Failed to scan directories' });
  }
});

/**
 * POST /api/scan/identify
 * Runs Gemini vision on unidentified shoes. Uses SSE to stream progress.
 * Optional query param: shoe_id for single shoe identification.
 */
router.post('/identify', async (req: Request, res: Response) => {
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
    const singleShoeId = req.query.shoe_id ? parseInt(req.query.shoe_id as string, 10) : null;

    let shoesToIdentify: Record<string, unknown>[];

    if (singleShoeId) {
      const shoe = getShoeById(singleShoeId) as Record<string, unknown> | undefined;
      if (!shoe) {
        sendEvent('error', { message: `Shoe ${singleShoeId} not found` });
        res.end();
        return;
      }
      shoesToIdentify = [shoe];
    } else {
      shoesToIdentify = getUnidentifiedShoes() as Record<string, unknown>[];
    }

    scanProgress = {
      total: shoesToIdentify.length,
      completed: 0,
      current_file: '',
      status: 'scanning',
      errors: [],
    };

    sendEvent('start', { total: shoesToIdentify.length });

    for (const shoe of shoesToIdentify) {
      const shoeId = shoe.id as number;
      const imagePath = shoe.image_path as string;
      const imageFilename = shoe.image_filename as string;

      scanProgress.current_file = imageFilename;
      sendEvent('progress', {
        completed: scanProgress.completed,
        total: scanProgress.total,
        current_file: imageFilename,
      });

      try {
        const fullPath = path.join(SHOE_IMAGES_DIR, imagePath);
        const result = await identifyShoe(fullPath);

        markShoeIdentified(shoeId, {
          brand: result.brand,
          model: result.model,
          colorway: result.colorway,
          size: result.size,
          year: result.year,
          shoe_condition: result.shoe_condition,
        });

        sendEvent('identified', {
          shoe_id: shoeId,
          filename: imageFilename,
          result,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        scanProgress.errors.push(`${imageFilename}: ${msg}`);
        sendEvent('error', {
          shoe_id: shoeId,
          filename: imageFilename,
          error: msg,
        });
      }

      scanProgress.completed++;

      // Rate limit: 4 second delay between API calls
      if (scanProgress.completed < shoesToIdentify.length) {
        await new Promise(resolve => setTimeout(resolve, 4000));
      }
    }

    scanProgress.status = 'done';
    sendEvent('done', {
      total: scanProgress.total,
      completed: scanProgress.completed,
      errors: scanProgress.errors,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    scanProgress.status = 'error';
    sendEvent('error', { message: msg });
  } finally {
    res.end();
  }
});

/**
 * GET /api/scan/status
 * Returns the current scan/identify progress.
 */
router.get('/status', (_req: Request, res: Response) => {
  res.json(scanProgress);
});

/**
 * POST /api/scan/upload
 * Upload one or more shoe photos. Saves to "Uploads" folder and adds to DB.
 * Accepts multipart form data with field name "photos".
 * Optional form fields: type, location, sub_location.
 */
const UPLOADS_FOLDER = 'Uploads';
const uploadsDir = path.join(SHOE_IMAGES_DIR, UPLOADS_FOLDER);

// Ensure uploads directory exists
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    // Preserve original name but avoid collisions
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext);
    const unique = `${base}-${Date.now()}${ext}`;
    cb(null, unique);
  },
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (IMAGE_EXTENSIONS.has(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${ext}`));
    }
  },
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB per file
});

router.post('/upload', upload.array('photos', 20), (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      res.status(400).json({ error: 'No files uploaded' });
      return;
    }

    const type = (req.body.type as string) || 'Boxless Shoes';
    const location = (req.body.location as string) || 'Uploads';
    const sub_location = (req.body.sub_location as string) || null;
    const box_condition = type.toLowerCase().includes('boxless') ? 'Missing' : null;

    const results: { filename: string; id: number }[] = [];
    const errors: string[] = [];

    for (const file of files) {
      const relativePath = path.join(UPLOADS_FOLDER, file.filename);

      if (shoeExistsByImagePath(relativePath)) {
        errors.push(`${file.originalname}: already exists`);
        continue;
      }

      try {
        const result = insertShoe({
          image_path: relativePath,
          image_filename: file.originalname,
          type,
          location,
          sub_location,
          box_condition,
        });
        results.push({ filename: file.originalname, id: Number(result.lastInsertRowid) });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${file.originalname}: ${msg}`);
      }
    }

    res.json({
      success: true,
      uploaded: results.length,
      shoe_ids: results.map((r) => r.id),
      errors,
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

export default router;
