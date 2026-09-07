import OpenAI from 'openai';
import { env } from '../config/env.js';

export const openai = new OpenAI({ apiKey: env.openaiKey });

export function extractJson(text: string): any {
  const trimmed = text.trim();
  try { return JSON.parse(trimmed); } catch {}
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
  throw new Error('Model did not return valid JSON.');
}
