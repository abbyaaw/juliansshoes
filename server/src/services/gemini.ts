import { GoogleGenAI } from '@google/genai';

export const VISION_MODEL = 'gemini-2.0-flash';
export const RESEARCH_MODEL = 'gemini-2.0-flash';

let _ai: GoogleGenAI | null = null;

export function getAI(): GoogleGenAI {
  if (!_ai) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('GEMINI_API_KEY is not set. Add it to .env file.');
    }
    _ai = new GoogleGenAI({ apiKey: key });
  }
  return _ai;
}

export default { getAI, VISION_MODEL, RESEARCH_MODEL };
