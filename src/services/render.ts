import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile, execSync } from 'node:child_process';
import { promisify } from 'node:util';
import { one } from '../db.js';

const execFileAsync = promisify(execFile);

function escapeXml(input: string) {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrapText(text: string, maxChars: number, maxLines = 8) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
      if (lines.length >= maxLines - 1) break;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length > maxLines) lines.length = maxLines;
  if (words.join(' ').length > lines.join(' ').length) {
    const last = lines[lines.length - 1] || '';
    lines[lines.length - 1] = last.length > 3 ? `${last.slice(0, Math.max(0, last.length - 1))}…` : `${last}…`;
  }
  return lines;
}

function parseSize(input?: string) {
  const raw = String(input || '1080x1350');
  const m = raw.match(/(\d+)\s*x\s*(\d+)/i);
  return m ? { width: Number(m[1]), height: Number(m[2]) } : { width: 1080, height: 1350 };
}

function normalizeSpec(raw: any) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return { notes: String(raw) };
  }
}

function rect(x:number,y:number,w:number,h:number,fill:string,rx=0,opacity=1) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" opacity="${opacity}" />`;
}

function textBlock(lines:string[], x:number, y:number, lineHeight:number, size:number, fill:string, family:string, weight='400', anchor='start') {
  const safe = lines.map((line, i) => `<text x="${x}" y="${y + i * lineHeight}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${escapeXml(line)}</text>`);
  return safe.join('');
}

function renderSvg({ story, identityName, pieceType, spec, colors }:{ story:any; identityName:string; pieceType:string; spec:any; colors:any; }) {
  const { width, height } = parseSize(spec.size);
  const primary = colors?.primary || '#143E3B';
  const secondary = colors?.secondary || '#F4F0E8';
  const accent = colors?.accent || '#B9754E';
  const neutral = colors?.neutral || '#3C3C3C';
  const title = spec.headline || story.title || 'Sin titular';
  const sub = spec.subheadline || spec.secondary || spec.notes || story.summary || '';
  const section = spec.section || inferSection(story.title || 'Nuevo León');
  const footer = spec.footer || 'INFORMAR CON CONTEXTO';

  const isVertical = height > width * 1.55;
  const isSquare = Math.abs(width - height) < 50;
  const serif = 'DejaVu Serif';
  const sans = 'DejaVu Sans';
  const margin = isVertical ? 90 : 72;
  const headerH = isVertical ? 180 : 140;
  const footerH = isVertical ? 160 : 130;
  const contentTop = headerH + 40;
  const contentBottom = height - footerH - 40;
  const availableH = contentBottom - contentTop;

  let titleSize = isVertical ? 72 : 64;
  let subSize = isVertical ? 34 : 30;
  let sectionSize = isVertical ? 30 : 26;
  if (isSquare) { titleSize = 58; subSize = 28; }
  if (pieceType === 'breaking') { titleSize += 8; }
  if (pieceType === 'quote') { titleSize = isVertical ? 54 : 50; }

  const titleLines = wrapText(title, isVertical ? 24 : isSquare ? 22 : 28, pieceType === 'story' || pieceType === 'reel' ? 7 : 6);
  const subLines = wrapText(sub, isVertical ? 34 : 40, pieceType === 'story' || pieceType === 'reel' ? 5 : 4);
  const quoteLines = wrapText(spec.quote || '', isVertical ? 23 : 26, 7);

  const defs = `
    <defs>
      <linearGradient id="bgGradient" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${primary}" />
        <stop offset="100%" stop-color="#0d2927" />
      </linearGradient>
      <linearGradient id="overlayGradient" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.10" />
        <stop offset="100%" stop-color="#ffffff" stop-opacity="0.02" />
      </linearGradient>
    </defs>`;

  let body = '';
  body += rect(0,0,width,height,'url(#bgGradient)');
  body += `<circle cx="${width*0.82}" cy="${height*0.18}" r="${Math.round(Math.min(width,height)*0.18)}" fill="${accent}" opacity="0.18" />`;
  body += `<circle cx="${width*0.18}" cy="${height*0.78}" r="${Math.round(Math.min(width,height)*0.14)}" fill="#ffffff" opacity="0.06" />`;
  body += rect(0,0,width,height,'url(#overlayGradient)');

  // Top card / header
  body += rect(margin, 42, width - margin*2, headerH, secondary, 26, 0.98);
  body += rect(margin, 42, width - margin*2, 10, accent, 10, 1);
  body += textBlock(['NORTE EN ALERTA'], margin + 36, 108, 46, isVertical ? 44 : 40, primary, serif, '700');
  body += textBlock(['NUEVO LEÓN'], width - margin - 36, 100, 40, isVertical ? 24 : 22, accent, sans, '700', 'end');
  body += rect(margin + 36, headerH - 14 + 42, 200, 44, accent, 22, 1);
  body += textBlock([section.toUpperCase()], margin + 136, headerH + 17 + 42, 0, sectionSize, secondary, sans, '700', 'middle');

  if (pieceType === 'quote') {
    body += textBlock(['“'], margin + 4, contentTop + 64, 0, 160, secondary, serif, '700');
    body += textBlock(quoteLines.length ? quoteLines : titleLines, margin + 70, contentTop + 90, 68, titleSize, secondary, serif, '700');
    if (spec.attribution) {
      body += textBlock([`— ${spec.attribution}`], margin + 72, contentTop + 90 + quoteLines.length * 68 + 50, 0, 30, accent, sans, '700');
    }
  } else if (pieceType === 'carousel') {
    body += textBlock(titleLines, margin, contentTop + 50, 82, titleSize, secondary, serif, '700');
    body += textBlock(subLines.length ? subLines : ['Desliza para conocer las claves.'], margin, contentTop + 50 + titleLines.length*82 + 42, 42, subSize, secondary, sans, '400');
    const slides = Array.isArray(spec.slides) ? spec.slides.slice(0, 3) : [];
    const boxY = contentBottom - 320;
    const gap = 26;
    const boxW = (width - margin*2 - gap*2) / 3;
    slides.forEach((s:any, idx:number) => {
      const x = margin + idx * (boxW + gap);
      body += rect(x, boxY, boxW, 220, secondary, 22, 0.95);
      body += rect(x, boxY, boxW, 8, accent, 8, 1);
      body += textBlock([String(idx+1).padStart(2,'0')], x + 30, boxY + 62, 0, 26, accent, sans, '700');
      body += textBlock(wrapText(s.headline || `Clave ${idx+1}`, 16, 3), x + 30, boxY + 112, 38, 28, primary, serif, '700');
    });
  } else {
    body += textBlock(titleLines, margin, contentTop + 60, isVertical ? 84 : 74, titleSize, secondary, serif, '700');
    const subY = contentTop + 60 + titleLines.length * (isVertical ? 84 : 74) + 34;
    if (subLines.length && String(subLines[0]).trim()) {
      body += textBlock(subLines, margin, subY, isVertical ? 46 : 42, subSize, secondary, sans, '400');
    }
    if (pieceType === 'story' || pieceType === 'reel') {
      const cta = spec.cta || (pieceType === 'reel' ? 'Mira el video completo' : 'Conoce los detalles');
      body += rect(margin, contentBottom - 130, width - margin*2, 86, accent, 24, 1);
      body += textBlock([cta.toUpperCase()], width/2, contentBottom - 74, 0, 30, secondary, sans, '700', 'middle');
    }
    if (pieceType === 'breaking') {
      body += rect(width - margin - 220, contentTop + 10, 220, 52, accent, 26, 1);
      body += textBlock(['ALERTA'], width - margin - 110, contentTop + 45, 0, 28, secondary, sans, '700', 'middle');
    }
  }

  // Footer
  body += rect(0, height - footerH, width, footerH, secondary, 0, 1);
  body += rect(0, height - footerH, width, 8, accent, 0, 1);
  body += textBlock(['NORTE EN ALERTA'], margin, height - footerH + 58, 0, 34, primary, serif, '700');
  body += textBlock([footer], margin, height - footerH + 98, 0, 20, neutral, sans, '700');
  body += textBlock(['INFORMAMOS CON RAÍZ · CONTAMOS LO QUE IMPORTA'], width - margin, height - footerH + 60, 0, 22, accent, sans, '700', 'end');
  body += textBlock([new Date().toLocaleDateString('es-MX', { year:'numeric', month:'short', day:'numeric' })], width - margin, height - footerH + 96, 0, 18, neutral, sans, '400', 'end');

  return `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    ${defs}
    ${body}
  </svg>`;
}

function inferSection(title:string) {
  const t = String(title || '').toLowerCase();
  if (/metro|movilidad|transporte|viaducto|línea|linea/.test(t)) return 'Movilidad';
  if (/lluvia|clima|tormenta|inund/.test(t)) return 'Clima';
  if (/cateo|fiscal[ií]a|seguridad|fuerza civil|delito/.test(t)) return 'Seguridad';
  if (/sheinbaum|gobierno|samuel|congreso|federal/.test(t)) return 'Política';
  if (/inversi[oó]n|industria|empresa|empleo/.test(t)) return 'Economía';
  return 'Nuevo León';
}

export async function renderPiecePng({ story, contentPiece, pieceType }:{ story:any; contentPiece:any; pieceType:string; }) {
  const spec = normalizeSpec(contentPiece.body);
  const visualDna = await one<any>('SELECT colors FROM visual_dna WHERE identity_id=$1 AND is_current=true ORDER BY version DESC LIMIT 1', [story.identity_id]);
  const colors = visualDna?.colors || {};
  const svg = renderSvg({ story, identityName: story.identity_name || 'Norte En Alerta', pieceType, spec, colors });

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aimn-render-'));
  const base = randomUUID();
  const svgPath = path.join(tmpDir, `${base}.svg`);
  const pngPath = path.join(tmpDir, `${base}.png`);
  await fs.writeFile(svgPath, svg, 'utf8');
  try {
    const hasMagick = (() => { try { execSync('which magick', { stdio: 'ignore' }); return true; } catch { return false; } })();
    const hasRsvg = (() => { try { execSync('which rsvg-convert', { stdio: 'ignore' }); return true; } catch { return false; } })();

    if (hasRsvg) {
      await execFileAsync('rsvg-convert', ['-w', String(parseSize(spec.size).width), '-h', String(parseSize(spec.size).height), '-o', pngPath, svgPath]);
    } else if (hasMagick) {
      await execFileAsync('magick', ['convert', svgPath, pngPath]);
    } else {
      await execFileAsync('convert', [svgPath, pngPath]);
    }

    const buffer = await fs.readFile(pngPath);
    return { buffer, filename: `${story.story_number}-${pieceType}.png`, spec };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}
