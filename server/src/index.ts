import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import express from 'express';
import cors from 'cors';
import { initDb, migrateColorwayCodes } from './db.js';
import { normalizeColorway } from './services/vision.js';
import shoesRouter from './routes/shoes.js';
import scanRouter from './routes/scan.js';
import researchRouter from './routes/research.js';
import exportRouter from './routes/export.js';

const app = express();
const PORT = parseInt(process.env.PORT || '5150', 10);

const SHOE_IMAGES_DIR = process.env.SHOE_IMAGES_DIR || "/Users/abigailwalton/Julian's Shoes";

// Middleware
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

// Serve shoe images as static files
app.use('/images', express.static(SHOE_IMAGES_DIR));

// Routes
app.use('/api/shoes', shoesRouter);
app.use('/api/scan', scanRouter);
app.use('/api/research', researchRouter);
app.use('/api/export', exportRouter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Initialize database and run migrations
initDb();
migrateColorwayCodes(normalizeColorway);

app.listen(PORT, () => {
  console.log(`SoleLibrary server running on http://localhost:${PORT}`);
  console.log(`Serving shoe images from: ${SHOE_IMAGES_DIR}`);
});

export default app;
