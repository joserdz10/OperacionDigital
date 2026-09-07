import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile, execSync } from 'node:child_process';
import { promisify } from 'node:util';
import { query } from '../db.js';

const execFileAsync = promisify(execFile);

function wrapText(text: string, maxChars: number, maxLines = 6) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) current = candidate;
    else {
      if (current) lines.push(current);
      current = word;
      if (lines.length >= maxLines - 1) break;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  const full = words.join(' ');
  const used = lines.join(' ');
  if (used.length < full.length && lines.length) {
    const last = lines[lines.length - 1];
    lines[lines.length - 1] = `${last.replace(/[.,;:!?-]?$/, '')}…`;
  }
  return lines;
}

function parseSize(input?: string) {
  const m = String(input || '1080x1350').match(/(\d+)\s*x\s*(\d+)/i);
  return m ? { width: Number(m[1]), height: Number(m[2]) } : { width: 1080, height: 1350 };
}

function normalizeSpec(raw: any) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return { notes: String(raw) }; }
}

function inferSection(title: string) {
  const t = String(title || '').toLowerCase();
  if (/metro|movilidad|transporte|viaducto|línea|linea|gonzalitos/.test(t)) return 'MOVILIDAD';
  if (/lluvia|clima|tormenta|inund/.test(t)) return 'PROTECCIÓN CIVIL';
  if (/cateo|fiscal[ií]a|seguridad|fuerza civil|delito|homicidio|robo/.test(t)) return 'SEGURIDAD';
  if (/sheinbaum|gobierno|samuel|congreso|federal|alcald/.test(t)) return 'POLÍTICA';
  if (/inversi[oó]n|industria|empresa|empleo|nearshoring/.test(t)) return 'ECONOMÍA';
  return 'NUEVO LEÓN';
}

function hasCommand(name: string) {
  try { execSync(`which ${name}`, { stdio: 'ignore' }); return true; } catch { return false; }
}

function imageMagickCommand() {
  return hasCommand('magick') ? 'magick' : 'convert';
}

function blockedHostname(hostname: string) {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.local')) return true;
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h)) return true;
  const m = h.match(/^172\.(\d+)\./);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true;
  return false;
}

function safeHttpUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const u = new URL(value);
    if (!['http:', 'https:'].includes(u.protocol) || blockedHostname(u.hostname)) return null;
    return u;
  } catch { return null; }
}

function extractMetaImage(html: string, baseUrl: string) {
  const patterns = [
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["'][^>]*>/i,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["'][^>]*>/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) {
      try { return new URL(m[1].replace(/&amp;/g, '&'), baseUrl).toString(); } catch { /* noop */ }
    }
  }
  return null;
}

async function fetchSourceImage(storyId: string, tmpDir: string) {
  const sources = await query<any>(
    `SELECT source_name, source_url, source_tier, is_primary
     FROM story_sources WHERE story_id=$1
     ORDER BY is_primary DESC, CASE source_tier WHEN 'A' THEN 1 WHEN 'B' THEN 2 ELSE 3 END, source_name
     LIMIT 6`,
    [storyId]
  );

  for (const source of sources) {
    const pageUrl = safeHttpUrl(source.source_url);
    if (!pageUrl) continue;
    try {
      const pageRes = await fetch(pageUrl, {
        redirect: 'follow',
        signal: AbortSignal.timeout(7000),
        headers: { 'user-agent': 'Mozilla/5.0 AI-Media-Network-Operator/0.5' }
      });
      if (!pageRes.ok) continue;
      const type = pageRes.headers.get('content-type') || '';
      if (!type.includes('text/html')) continue;
      const html = (await pageRes.text()).slice(0, 2_000_000);
      const imageUrlText = extractMetaImage(html, pageUrl.toString());
      const imageUrl = safeHttpUrl(imageUrlText);
      if (!imageUrl) continue;

      const imageRes = await fetch(imageUrl, {
        redirect: 'follow',
        signal: AbortSignal.timeout(9000),
        headers: { 'user-agent': 'Mozilla/5.0 AI-Media-Network-Operator/0.5', accept: 'image/*' }
      });
      if (!imageRes.ok) continue;
      const imageType = imageRes.headers.get('content-type') || '';
      if (!imageType.startsWith('image/') || imageType.includes('svg')) continue;
      const ab = await imageRes.arrayBuffer();
      if (ab.byteLength < 10_000 || ab.byteLength > 10_000_000) continue;
      const ext = imageType.includes('png') ? 'png' : imageType.includes('webp') ? 'webp' : 'jpg';
      const file = path.join(tmpDir, `source.${ext}`);
      await fs.writeFile(file, Buffer.from(ab));
      return { file, sourceName: source.source_name, sourceUrl: pageUrl.toString() };
    } catch {
      continue;
    }
  }
  return null;
}

function fallbackImagePath() {
  return path.join(process.cwd(), 'assets', 'nea-fallback-monterrey.jpg');
}

async function runMagick(args: string[]) {
  const cmd = imageMagickCommand();
  if (cmd === 'magick') await execFileAsync(cmd, args);
  else await execFileAsync(cmd, args.slice(1));
}

function brandColors() {
  return {
    green: '#0E3D3A',
    ivory: '#F7F4EC',
    copper: '#BB734A',
    ink: '#10262A',
    muted: '#5B6164',
    red: '#D71920',
  };
}

async function makePhotoBase(photoPath: string, outPath: string, width: number, height: number) {
  await runMagick([
    'convert', photoPath,
    '-auto-orient',
    '-resize', `${width}x${height}^`,
    '-gravity', 'center',
    '-extent', `${width}x${height}`,
    '-quality', '92',
    outPath,
  ]);
}

async function renderStoryLike(photoPath: string, outPath: string, story: any, spec: any, pieceType: string, sourceName: string) {
  const c = brandColors();
  const { width, height } = parseSize(spec.size || '1080x1920');
  const bg = `${outPath}.bg.jpg`;
  await makePhotoBase(photoPath, bg, width, height);

  const title = wrapText(spec.headline || story.title, 23, 6).join('\n');
  const secondary = wrapText(spec.secondary || spec.subheadline || story.summary || '', 39, 4).join('\n');
  const section = spec.section || inferSection(story.title);
  const label = pieceType === 'breaking' ? 'ÚLTIMA HORA' : `${section}`;
  const location = 'NUEVO LEÓN';
  const source = sourceName ? `Fuente: ${sourceName}` : 'Fuente: AI Media Network';

  const args = [
    'convert', bg,
    // dark gradient for text readability
    '(', '-size', `${width}x${height}`, 'gradient:rgba(6,24,24,0.00)-rgba(6,24,24,0.92)', ')', '-gravity', 'south', '-compose', 'over', '-composite',
    '-fill', 'rgba(8,42,40,0.55)', '-draw', `rectangle 0,0 ${width},210`,
    '-fill', c.ivory, '-font', 'DejaVu-Serif-Bold', '-pointsize', '62', '-gravity', 'northwest', '-annotate', '+70+48', 'Norte\nEn Alerta',
    '-fill', c.copper, '-font', 'DejaVu-Sans-Bold', '-pointsize', '26', '-gravity', 'northeast', '-annotate', '+70+62', 'NUEVO LEÓN,\nCON CONTEXTO.',
    '-fill', c.copper, '-draw', `rectangle 70,190 160,198`,
    '-fill', c.ivory, '-font', 'DejaVu-Sans-Bold', '-pointsize', '28', '-gravity', 'southwest', '-annotate', '+70+760', `${location}  |  ${label}`,
    '-fill', c.ivory, '-font', 'DejaVu-Serif-Bold', '-pointsize', pieceType === 'reel' ? '66' : '72', '-interline-spacing', '-7', '-gravity', 'southwest', '-annotate', '+70+430', title,
    '-fill', c.ivory, '-font', 'DejaVu-Sans', '-pointsize', '31', '-interline-spacing', '5', '-gravity', 'southwest', '-annotate', '+72+250', secondary,
    '-fill', c.copper, '-draw', `rectangle 72,${height - 185} 190,${height - 176}`,
    '-fill', c.ivory, '-font', 'DejaVu-Sans', '-pointsize', '19', '-gravity', 'southwest', '-annotate', '+72+108', source,
    '-fill', c.ivory, '-font', 'DejaVu-Sans-Bold', '-pointsize', '20', '-gravity', 'southeast', '-annotate', '+70+108', 'NORTE EN ALERTA',
    '-quality', '94', outPath,
  ];
  await runMagick(args);
  await fs.rm(bg, { force: true });
}

async function renderFeed(photoPath: string, outPath: string, story: any, spec: any, pieceType: string, sourceName: string) {
  const c = brandColors();
  const { width, height } = parseSize(spec.size || '1080x1350');
  const canvas = `${outPath}.canvas.png`;
  const photo = `${outPath}.photo.jpg`;
  const headerH = Math.round(height * 0.15);
  const photoH = Math.round(height * 0.43);
  const photoY = headerH;
  const textY = photoY + photoH;
  const footerH = Math.round(height * 0.11);
  const bodyBottom = height - footerH;
  await makePhotoBase(photoPath, photo, width, photoH);

  await runMagick(['convert', '-size', `${width}x${height}`, `xc:${c.ivory}`, canvas]);
  await runMagick(['convert', canvas, photo, '-gravity', 'north', '-geometry', `+0+${photoY}`, '-compose', 'over', '-composite', canvas]);

  const title = wrapText(spec.headline || story.title, 26, 4).join('\n');
  const secondary = wrapText(spec.subheadline || spec.secondary || story.summary || '', 53, 3).join('\n');
  const section = spec.section || inferSection(story.title);
  const category = `NUEVO LEÓN  |  ${section}`;
  const breaking = pieceType === 'breaking';
  const source = sourceName ? `FUENTE: ${sourceName}` : 'FUENTE: AI MEDIA NETWORK';

  const args = [
    'convert', canvas,
    '-fill', c.ink, '-font', 'DejaVu-Serif-Bold', '-pointsize', '56', '-gravity', 'northwest', '-annotate', '+54+38', 'Norte\nEn Alerta',
    '-fill', c.copper, '-draw', `rectangle 56,${headerH - 35} 142,${headerH - 27}`,
    '-fill', c.muted, '-font', 'DejaVu-Sans-Bold', '-pointsize', '19', '-gravity', 'northeast', '-annotate', '+55+55', 'SERIO  •  CONFIABLE\nEDITORIAL  •  REGIONAL',
    '-fill', c.ink, '-font', 'DejaVu-Sans-Bold', '-pointsize', '23', '-gravity', 'northwest', '-annotate', `+58+${textY + 34}`, category,
  ];

  if (breaking) {
    args.push('-fill', c.red, '-draw', `roundrectangle 58,${textY + 74} 330,${textY + 132} 5,5`);
    args.push('-fill', c.ivory, '-font', 'DejaVu-Sans-Bold', '-pointsize', '26', '-gravity', 'northwest', '-annotate', `+82+${textY + 88}`, 'ÚLTIMA HORA');
  }

  const titleOffset = breaking ? 155 : 95;
  args.push(
    '-fill', c.ink, '-font', 'DejaVu-Serif-Bold', '-pointsize', '58', '-interline-spacing', '-7', '-gravity', 'northwest', '-annotate', `+56+${textY + titleOffset}`, title,
    '-fill', '#2D3A3E', '-font', 'DejaVu-Sans', '-pointsize', '26', '-interline-spacing', '4', '-gravity', 'southwest', '-annotate', `+58+${footerH + 55}`, secondary,
    '-fill', c.copper, '-draw', `rectangle 58,${bodyBottom - 42} 150,${bodyBottom - 34}`,
    '-fill', c.muted, '-font', 'DejaVu-Sans-Bold', '-pointsize', '15', '-gravity', 'southwest', '-annotate', `+58+${footerH + 20}`, source,
    '-fill', c.green, '-draw', `rectangle 0,${bodyBottom} ${width},${height}`,
    '-fill', c.ivory, '-font', 'DejaVu-Serif-Bold', '-pointsize', '32', '-gravity', 'southwest', '-annotate', '+55+50', 'Norte En Alerta',
    '-fill', c.ivory, '-font', 'DejaVu-Sans-Bold', '-pointsize', '18', '-gravity', 'south', '-annotate', '+0+53', 'SERIO  •  CONFIABLE  •  EDITORIAL  •  REGIONAL',
    '-fill', c.copper, '-font', 'DejaVu-Sans-Bold', '-pointsize', '16', '-gravity', 'southeast', '-annotate', '+55+53', 'NUEVO LEÓN, SIEMPRE DA TEMA.',
    '-quality', '94', outPath,
  );

  await runMagick(args);
  await fs.rm(canvas, { force: true });
  await fs.rm(photo, { force: true });
}

async function renderQuote(outPath: string, story: any, spec: any) {
  const c = brandColors();
  const { width, height } = parseSize(spec.size || '1080x1350');
  const quote = wrapText(spec.quote || spec.headline || story.title, 25, 8).join('\n');
  const attribution = wrapText(spec.attribution || '', 36, 2).join('\n');
  await runMagick([
    'convert', '-size', `${width}x${height}`, `xc:${c.ivory}`,
    '-fill', c.green, '-draw', `rectangle 0,0 ${width},175`,
    '-fill', c.ivory, '-font', 'DejaVu-Serif-Bold', '-pointsize', '48', '-gravity', 'northwest', '-annotate', '+55+42', 'Norte En Alerta',
    '-fill', c.copper, '-font', 'DejaVu-Serif-Bold', '-pointsize', '150', '-gravity', 'northwest', '-annotate', '+55+220', '“',
    '-fill', c.ink, '-font', 'DejaVu-Serif-Bold', '-pointsize', '58', '-interline-spacing', '-6', '-gravity', 'center', '-annotate', '+0-40', quote,
    '-fill', c.copper, '-font', 'DejaVu-Sans-Bold', '-pointsize', '25', '-gravity', 'southwest', '-annotate', '+60+145', attribution,
    '-fill', c.green, '-draw', `rectangle 0,${height - 100} ${width},${height}`,
    '-fill', c.ivory, '-font', 'DejaVu-Sans-Bold', '-pointsize', '18', '-gravity', 'south', '-annotate', '+0+38', 'NUEVO LEÓN, CON CONTEXTO.',
    outPath,
  ]);
}

export async function renderPiecePng({ story, contentPiece, pieceType }:{ story:any; contentPiece:any; pieceType:string; }) {
  const spec = normalizeSpec(contentPiece.body);
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aimn-render-'));
  const outPath = path.join(tmpDir, `${randomUUID()}.png`);
  try {
    const fetched = await fetchSourceImage(story.id, tmpDir);
    const photoPath = fetched?.file || fallbackImagePath();
    const sourceName = fetched?.sourceName || 'Imagen editorial de referencia';

    if (pieceType === 'story' || pieceType === 'reel') {
      await renderStoryLike(photoPath, outPath, story, spec, pieceType, sourceName);
    } else if (pieceType === 'quote') {
      await renderQuote(outPath, story, spec);
    } else {
      await renderFeed(photoPath, outPath, story, spec, pieceType, sourceName);
    }

    const buffer = await fs.readFile(outPath);
    return {
      buffer,
      filename: `${story.story_number}-${pieceType}.png`,
      spec,
      imageSource: fetched ? { name: fetched.sourceName, url: fetched.sourceUrl } : null,
      usedFallback: !fetched,
    };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}
