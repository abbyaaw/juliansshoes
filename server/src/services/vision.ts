import fs from 'fs';
import path from 'path';
import { getAI, VISION_MODEL } from './gemini.js';
import type { VisionResult } from '../../../shared/types.js';

/**
 * Dictionary of common sneaker brand color abbreviation codes → readable names.
 * Primarily Adidas codes, plus some Nike/other brand codes.
 */
const COLOR_CODE_MAP: Record<string, string> = {
  // Adidas codes
  CRYWHT: 'Crystal White',
  WHITIN: 'White Tint',
  CWHITE: 'Cloud White',
  CBLACK: 'Core Black',
  FTWWHT: 'Footwear White',
  FTWBLK: 'Footwear Black',
  GRETHR: 'Grey Three',
  GRETWO: 'Grey Two',
  GREONE: 'Grey One',
  GREFIV: 'Grey Five',
  GREFOU: 'Grey Four',
  GRESIX: 'Grey Six',
  GREON: 'Green Oxide',
  BLACRY: 'Black Crystal',
  BLACRA: 'Black Craft',
  NUABLA: 'Nude Black',
  LEGINK: 'Legend Ink',
  RAWKHA: 'Raw Khaki',
  RAWSTE: 'Raw Steel',
  RAWWHT: 'Raw White',
  ASHPEA: 'Ash Pearl',
  ASHSIL: 'Ash Silver',
  ASHBLU: 'Ash Blue',
  OWHITE: 'Off White',
  NTNAVY: 'Night Navy',
  DKBLUE: 'Dark Blue',
  TRUPNK: 'True Pink',
  ACTRED: 'Active Red',
  ACTGRN: 'Active Green',
  SOLRED: 'Solar Red',
  SOLYEL: 'Solar Yellow',
  SOLGLD: 'Solar Gold',
  COLNAV: 'Collegiate Navy',
  COLRED: 'Collegiate Red',
  COLGRN: 'Collegiate Green',
  COLBUR: 'Collegiate Burgundy',
  COLRYL: 'Collegiate Royal',
  BRIRED: 'Bright Red',
  BRICYA: 'Bright Cyan',
  BRIYEL: 'Bright Yellow',
  BRBLUE: 'Bright Blue',
  TRAORA: 'Trace Orange',
  TRASCA: 'Trace Scarlet',
  TRACAR: 'Trace Cargo',
  TRABLU: 'Trace Blue',
  LINGRN: 'Linen Green',
  LINEN: 'Linen',
  EASGRN: 'Easy Green',
  EASBLU: 'Easy Blue',
  EASCOR: 'Easy Coral',
  EASYEL: 'Easy Yellow',
  CLOWHI: 'Cloud White',
  GUM: 'Gum',
  GUM3: 'Gum 3',
  GUM4: 'Gum 4',
  MESA: 'Mesa',
  SAND: 'Sand',
  SESAME: 'Sesame',
  CLAY: 'Clay',
  SLATE: 'Slate',
  CARBON: 'Carbon',
  CHALK: 'Chalk',
  BLKWHT: 'Black White',
  WHTBLK: 'White Black',
};

/**
 * Translates abbreviated sneaker color codes to readable names.
 * Segments that match known codes (all-caps, 3-8 chars) are translated;
 * others are left as-is. Preserves `/` separators.
 */
export function normalizeColorway(colorway: string): string {
  if (!colorway) return colorway;
  return colorway
    .split('/')
    .map((seg) => {
      const trimmed = seg.trim();
      // Only translate segments that look like codes: all uppercase, 3-8 chars, no spaces
      if (/^[A-Z]{3,8}$/.test(trimmed) && COLOR_CODE_MAP[trimmed]) {
        return COLOR_CODE_MAP[trimmed];
      }
      return trimmed;
    })
    .join(' / ');
}

/**
 * Identifies a shoe from an image using Gemini vision.
 * Reads the image file, sends it to Gemini, and returns structured identification data.
 */
export async function identifyShoe(imagePath: string): Promise<VisionResult> {
  // Read image file as base64
  const absolutePath = path.resolve(imagePath);
  const imageBuffer = fs.readFileSync(absolutePath);
  const base64Image = imageBuffer.toString('base64');

  // Determine MIME type from extension
  const ext = path.extname(absolutePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.heic': 'image/heic',
  };
  const mimeType = mimeTypes[ext] || 'image/jpeg';

  const prompt = `Analyze this shoe image and identify the shoe. Return a JSON object with:
- brand: the brand name (Nike, Jordan, Adidas, etc.)
- model: the specific model name (Air Jordan 1 Retro High OG, Air Force 1 Low, etc.)
- colorway: the colorway name or description
- size: shoe size if visible on box or tag (null if not visible)
- year: release year if identifiable (null if uncertain)
- shoe_condition: one of "New/DS", "Excellent", "Good", "Fair" based on visible wear
- confidence: 0-1 how confident you are in the identification

Return ONLY the JSON object, no other text.`;

  let text = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await getAI().models.generateContent({
        model: VISION_MODEL,
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType, data: base64Image } },
              { text: prompt },
            ],
          },
        ],
        config: {
          responseModalities: ['TEXT'],
          responseMimeType: 'application/json',
        },
      });
      text = response.text ?? '';
      break;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if ((msg.includes('503') || msg.includes('429') || msg.includes('UNAVAILABLE') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('high demand')) && attempt < 2) {
        await new Promise(r => setTimeout(r, 8000 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }

  function parseJSON(raw: string): VisionResult {
    // Try direct parse
    try { return JSON.parse(raw); } catch { /* continue */ }
    // Strip markdown code fences
    const stripped = raw.replace(/```json?\s*/g, '').replace(/```\s*/g, '').trim();
    try { return JSON.parse(stripped); } catch { /* continue */ }
    // Extract JSON object with brace matching
    const start = stripped.indexOf('{');
    if (start !== -1) {
      let depth = 0;
      for (let i = start; i < stripped.length; i++) {
        if (stripped[i] === '{') depth++;
        else if (stripped[i] === '}') { depth--; if (depth === 0) { return JSON.parse(stripped.slice(start, i + 1)); } }
      }
    }
    throw new Error(`Failed to parse vision response: ${raw.slice(0, 200)}`);
  }

  const result = parseJSON(text);

  // Normalize colorway abbreviation codes to readable names
  if (result.colorway) {
    result.colorway = normalizeColorway(result.colorway);
  }

  // Validate required fields
  if (!result.brand || !result.model || !result.colorway || !result.shoe_condition) {
    throw new Error('Missing required fields in vision response');
  }

  // Validate shoe_condition enum
  const validConditions = ['New/DS', 'Excellent', 'Good', 'Fair'];
  if (!validConditions.includes(result.shoe_condition)) {
    result.shoe_condition = 'Good';
  }

  // Clamp confidence
  if (typeof result.confidence !== 'number' || result.confidence < 0 || result.confidence > 1) {
    result.confidence = 0.5;
  }

  return result;
}
