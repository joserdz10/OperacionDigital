import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile, execSync } from 'node:child_process';
import { promisify } from 'node:util';
import { query } from '../db.js';

const execFileAsync = promisify(execFile);

type CanvasSize = { width: number; height: number };

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

function normalizeSpec(raw: any) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return { notes: String(raw) }; }
}

function canvasFor(pieceType: string): CanvasSize {
  if (pieceType === 'story' || pieceType === 'reel') return { width: 1080, height: 1920 };
  if (pieceType === 'square') return { width: 1080, height: 1080 };
  return { width: 1080, height: 1350 };
}

function inferSection(text: string) {
  const t = String(text || '').toLowerCase();
  if (/metro|movilidad|transporte|viaducto|línea|linea|gonzalitos|tr[aá]fico|carretera/.test(t)) return 'MOVILIDAD';
  if (/lluvia|clima|tormenta|inund|protecci[oó]n civil/.test(t)) return 'PROTECCIÓN CIVIL';
  if (/cateo|fiscal[ií]a|seguridad|fuerza civil|delito|homicidio|robo|amenaza|detenid/.test(t)) return 'SEGURIDAD';
  if (/sheinbaum|gobierno|samuel|congreso|federal|alcald|diputad|elecci[oó]n/.test(t)) return 'POLÍTICA';
  if (/inversi[oó]n|industria|empresa|empleo|nearshoring|econom[ií]a/.test(t)) return 'ECONOMÍA';
  if (/tigres|rayados|f[uú]tbol|deporte/.test(t)) return 'DEPORTES';
  return 'NUEVO LEÓN';
}

function inferLocation(text: string) {
  const t = String(text || '').toLowerCase();
  const locations: Array<[RegExp, string]> = [
    [/\bsan pedro\b|garza garc[ií]a/, 'SAN PEDRO'],
    [/\bapodaca\b/, 'APODACA'],
    [/\bguadalupe\b/, 'GUADALUPE'],
    [/\bmonterrey\b/, 'MONTERREY'],
    [/\bsanta catarina\b/, 'SANTA CATARINA'],
    [/\bescobedo\b/, 'ESCOBEDO'],
    [/\bgarc[ií]a\b/, 'GARCÍA'],
    [/\bsan nicol[aá]s\b/, 'SAN NICOLÁS'],
    [/\bju[aá]rez\b/, 'JUÁREZ'],
    [/\bsantiago\b/, 'SANTIAGO'],
    [/\bcadereyta\b/, 'CADEREYTA'],
  ];
  for (const [re, label] of locations) if (re.test(t)) return label;
  return 'NUEVO LEÓN';
}

function kickerFor(story: any, spec: any) {
  const context = `${story.title || ''} ${story.summary || ''} ${spec.section || ''} ${spec.secondary || ''} ${spec.subheadline || ''}`;
  const location = String(spec.location || inferLocation(context)).toUpperCase();
  const section = String(spec.section || inferSection(context)).toUpperCase();
  if (location === section) return location;
  if (location === 'NUEVO LEÓN' && section === 'NUEVO LEÓN') return 'NUEVO LEÓN';
  return `${location}  |  ${section}`;
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
        headers: { 'user-agent': 'Mozilla/5.0 AI-Media-Network-Operator/0.5.2' }
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
        headers: { 'user-agent': 'Mozilla/5.0 AI-Media-Network-Operator/0.5.2', accept: 'image/*' }
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

function assetPath(name: string) {
  return path.join(process.cwd(), 'assets', name);
}

function fallbackImagePath() {
  return assetPath('nea-fallback-monterrey.jpg');
}

function logoFullPath() {
  return assetPath('nea-logo-full.png');
}

function isotipoPath() {
  return assetPath('nea-isotipo.png');
}

async function runMagick(args: string[]) {
  const cmd = imageMagickCommand();
  const normalized = args[0] === 'convert' ? args.slice(1) : args;
  await execFileAsync(cmd, normalized);
}

async function prepareSourceImage(photoPath: string, tmpDir: string) {
  if (!/\.webp$/i.test(photoPath)) return photoPath;
  if (!hasCommand('dwebp')) throw new Error('WebP decoder dwebp is not installed in the container');
  const decoded = path.join(tmpDir, `decoded-${randomUUID()}.png`);
  await execFileAsync('dwebp', [photoPath, '-o', decoded]);
  return decoded;
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

async function makeScaledAsset(asset: string, outPath: string, width: number, height?: number) {
  const geometry = height ? `${width}x${height}` : `${width}x`;
  await runMagick(['convert', asset, '-resize', geometry, outPath]);
}

async function compositeAsset(base: string, asset: string, out: string, x: number, y: number) {
  await runMagick(['convert', base, asset, '-gravity', 'northwest', '-geometry', `+${x}+${y}`, '-compose', 'over', '-composite', out]);
}

async function renderStoryLike(photoPath: string, outPath: string, story: any, spec: any, pieceType: string, sourceName: string, tmpDir: string) {
  const c = brandColors();
  const { width, height } = canvasFor(pieceType); // 1080 x 1920 exact
  const bg = path.join(tmpDir, 'story-bg.jpg');
  const stage1 = path.join(tmpDir, 'story-stage1.png');
  const stage2 = path.join(tmpDir, 'story-stage2.png');
  const logo = path.join(tmpDir, 'logo-story.png');
  const iso = path.join(tmpDir, 'iso-story.png');

  await makePhotoBase(photoPath, bg, width, height);

  const title = wrapText(spec.headline || story.title, 24, 5).join('\n');
  const secondary = wrapText(spec.secondary || spec.subheadline || story.summary || '', 42, 3).join('\n');
  const kicker = kickerFor(story, spec);
  const source = sourceName ? `Fuente: ${sourceName}` : 'Fuente: AI Media Network';

  // Story safe area: 84 px sides, 72 px top, 170 px bottom.
  await runMagick([
    'convert', bg,
    '(', '-size', `${width}x${height}`, 'gradient:rgba(5,20,20,0.02)-rgba(5,20,20,0.94)', ')', '-gravity', 'south', '-compose', 'over', '-composite',
    '-fill', 'rgba(247,244,236,0.94)', '-draw', `roundrectangle 60,52 454,260 26,26`,
    '-fill', c.copper, '-font', 'DejaVu-Sans-Bold', '-pointsize', '24', '-gravity', 'northeast', '-annotate', '+78+72', 'NUEVO LEÓN,\nSIEMPRE DA TEMA.',
    '-fill', c.ivory, '-font', 'DejaVu-Sans-Bold', '-pointsize', '27', '-gravity', 'southwest', '-annotate', '+84+735', kicker,
    '-fill', c.ivory, '-font', 'DejaVu-Serif-Bold', '-pointsize', pieceType === 'reel' ? '66' : '70', '-interline-spacing', '-7', '-gravity', 'southwest', '-annotate', '+84+392', title,
    '-fill', c.ivory, '-font', 'DejaVu-Sans', '-pointsize', '30', '-interline-spacing', '5', '-gravity', 'southwest', '-annotate', '+86+230', secondary,
    '-fill', c.copper, '-draw', `rectangle 86,${height - 188} 204,${height - 179}`,
    '-fill', c.ivory, '-font', 'DejaVu-Sans', '-pointsize', '18', '-gravity', 'southwest', '-annotate', '+86+118', source,
    '-quality', '94', stage1,
  ]);

  await makeScaledAsset(logoFullPath(), logo, 330);
  await compositeAsset(stage1, logo, stage2, 84, 84);
  await makeScaledAsset(isotipoPath(), iso, 74, 74);
  await compositeAsset(stage2, iso, outPath, width - 84 - 74, height - 164);
}

async function renderFeed(photoPath: string, outPath: string, story: any, spec: any, pieceType: string, sourceName: string, tmpDir: string) {
  const c = brandColors();
  const { width, height } = canvasFor(pieceType);
  const margin = pieceType === 'square' ? 62 : 70;
  const headerH = pieceType === 'square' ? 150 : 172;
  const footerH = pieceType === 'square' ? 105 : 118;
  const photoH = pieceType === 'square' ? 410 : 500;
  const photoY = headerH;
  const textY = photoY + photoH;
  const bodyBottom = height - footerH;

  const canvas = path.join(tmpDir, 'feed-canvas.png');
  const stage1 = path.join(tmpDir, 'feed-stage1.png');
  const stage2 = path.join(tmpDir, 'feed-stage2.png');
  const photo = path.join(tmpDir, 'feed-photo.jpg');
  const logo = path.join(tmpDir, 'logo-feed.png');
  const iso = path.join(tmpDir, 'iso-feed.png');

  await makePhotoBase(photoPath, photo, width, photoH);
  await runMagick(['convert', '-size', `${width}x${height}`, `xc:${c.ivory}`, canvas]);
  await runMagick(['convert', canvas, photo, '-gravity', 'north', '-geometry', `+0+${photoY}`, '-compose', 'over', '-composite', stage1]);

  const title = wrapText(spec.headline || story.title, pieceType === 'square' ? 25 : 29, pieceType === 'square' ? 3 : 4).join('\n');
  const secondary = wrapText(spec.subheadline || spec.secondary || story.summary || '', pieceType === 'square' ? 45 : 54, pieceType === 'square' ? 2 : 3).join('\n');
  const kicker = kickerFor(story, spec);
  const breaking = pieceType === 'breaking';
  const source = sourceName ? `FUENTE: ${sourceName}` : 'FUENTE: AI MEDIA NETWORK';
  const titlePoint = pieceType === 'square' ? '48' : '56';
  const bodyPoint = pieceType === 'square' ? '23' : '26';

  const args = [
    'convert', stage1,
    '-fill', c.copper, '-font', 'DejaVu-Sans-Bold', '-pointsize', '18', '-gravity', 'northeast', '-annotate', `+${margin}+48`, 'NUEVO LEÓN, SIEMPRE DA TEMA.',
    '-fill', c.ink, '-font', 'DejaVu-Sans-Bold', '-pointsize', '21', '-gravity', 'northwest', '-annotate', `+${margin}+${textY + 32}`, kicker,
  ];

  let titleY = textY + 88;
  if (breaking) {
    args.push('-fill', c.red, '-draw', `roundrectangle ${margin},${textY + 70} ${margin + 260},${textY + 124} 5,5`);
    args.push('-fill', c.ivory, '-font', 'DejaVu-Sans-Bold', '-pointsize', '23', '-gravity', 'northwest', '-annotate', `+${margin + 22}+${textY + 82}`, 'ÚLTIMA HORA');
    titleY = textY + 152;
  }

  args.push(
    '-fill', c.ink, '-font', 'DejaVu-Serif-Bold', '-pointsize', titlePoint, '-interline-spacing', '-6', '-gravity', 'northwest', '-annotate', `+${margin}+${titleY}`, title,
    '-fill', '#2D3A3E', '-font', 'DejaVu-Sans', '-pointsize', bodyPoint, '-interline-spacing', '4', '-gravity', 'southwest', '-annotate', `+${margin}+${footerH + 52}`, secondary,
    '-fill', c.copper, '-draw', `rectangle ${margin},${bodyBottom - 36} ${margin + 90},${bodyBottom - 29}`,
    '-fill', c.muted, '-font', 'DejaVu-Sans-Bold', '-pointsize', '14', '-gravity', 'southwest', '-annotate', `+${margin}+${footerH + 18}`, source,
    '-fill', c.green, '-draw', `rectangle 0,${bodyBottom} ${width},${height}`,
    '-fill', c.ivory, '-font', 'DejaVu-Sans-Bold', '-pointsize', '16', '-gravity', 'south', '-annotate', '+0+42', 'SERIO  •  CONFIABLE  •  EDITORIAL  •  REGIONAL',
    '-quality', '94', stage2,
  );
  await runMagick(args);

  await makeScaledAsset(logoFullPath(), logo, pieceType === 'square' ? 235 : 270);
  await compositeAsset(stage2, logo, canvas, margin, 35);
  await makeScaledAsset(isotipoPath(), iso, pieceType === 'square' ? 52 : 56, pieceType === 'square' ? 52 : 56);
  await compositeAsset(canvas, iso, outPath, margin, bodyBottom + Math.round((footerH - (pieceType === 'square' ? 52 : 56)) / 2));
}

async function renderQuote(outPath: string, story: any, spec: any, tmpDir: string) {
  const c = brandColors();
  const { width, height } = canvasFor('quote');
  const quote = wrapText(spec.quote || spec.headline || story.title, 27, 7).join('\n');
  const attribution = wrapText(spec.attribution || '', 38, 2).join('\n');
  const stage = path.join(tmpDir, 'quote-stage.png');
  const logo = path.join(tmpDir, 'logo-quote.png');
  const iso = path.join(tmpDir, 'iso-quote.png');

  await runMagick([
    'convert', '-size', `${width}x${height}`, `xc:${c.ivory}`,
    '-fill', c.green, '-draw', `rectangle 0,0 ${width},190`,
    '-fill', c.ivory, '-draw', 'roundrectangle 46,22 390,174 24,24',
    '-fill', c.copper, '-font', 'DejaVu-Serif-Bold', '-pointsize', '150', '-gravity', 'northwest', '-annotate', '+65+235', '“',
    '-fill', c.ink, '-font', 'DejaVu-Serif-Bold', '-pointsize', '58', '-interline-spacing', '-6', '-gravity', 'center', '-annotate', '+0-35', quote,
    '-fill', c.copper, '-font', 'DejaVu-Sans-Bold', '-pointsize', '25', '-gravity', 'southwest', '-annotate', '+70+150', attribution,
    '-fill', c.green, '-draw', `rectangle 0,${height - 115} ${width},${height}`,
    '-fill', c.ivory, '-font', 'DejaVu-Sans-Bold', '-pointsize', '17', '-gravity', 'south', '-annotate', '+0+43', 'NUEVO LEÓN, CON CONTEXTO.',
    stage,
  ]);

  await makeScaledAsset(logoFullPath(), logo, 285);
  await compositeAsset(stage, logo, outPath, 70, 38);
  await makeScaledAsset(isotipoPath(), iso, 58, 58);
  const final = path.join(tmpDir, 'quote-final.png');
  await compositeAsset(outPath, iso, final, 70, height - 86);
  await fs.copyFile(final, outPath);
}

export async function renderPiecePng({ story, contentPiece, pieceType }:{ story:any; contentPiece:any; pieceType:string; }) {
  const spec = normalizeSpec(contentPiece.body);
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aimn-render-'));
  const outPath = path.join(tmpDir, `${randomUUID()}.png`);
  try {
    const fetched = await fetchSourceImage(story.id, tmpDir);
    let photoPath = fallbackImagePath();
    let sourceName = 'Imagen editorial de referencia';
    let imageSource: { name: string; url: string } | null = null;
    let usedFallback = true;

    if (fetched) {
      try {
        photoPath = await prepareSourceImage(fetched.file, tmpDir);
        sourceName = fetched.sourceName;
        imageSource = { name: fetched.sourceName, url: fetched.sourceUrl };
        usedFallback = false;
      } catch (error) {
        console.warn('Source image could not be decoded; using fallback image instead.', error);
      }
    }

    if (pieceType === 'story' || pieceType === 'reel') {
      await renderStoryLike(photoPath, outPath, story, spec, pieceType, sourceName, tmpDir);
    } else if (pieceType === 'quote') {
      await renderQuote(outPath, story, spec, tmpDir);
    } else {
      await renderFeed(photoPath, outPath, story, spec, pieceType, sourceName, tmpDir);
    }

    const buffer = await fs.readFile(outPath);
    return {
      buffer,
      filename: `${story.story_number}-${pieceType}.png`,
      spec: { ...spec, size: `${canvasFor(pieceType).width}x${canvasFor(pieceType).height}` },
      imageSource,
      usedFallback,
    };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}
