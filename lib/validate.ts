// Snapshot parser, gate validator, no-URL/size checks, and dossier 1.5 MiB / zero-truncation guards.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { BoardRow, Snapshot } from './types.ts';

export const GATE_DOSSIER_MAX_BYTES = 1_572_864; // 1.5 MiB hard server gate cap
export const TARGET_DASHBOARD_MAX_BYTES = 64_500; // strict <= 64.5 KB zero-truncation target (65,536 B server cap)
export const PLAIN_FILE_NAME_RE = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

const HTTP_URL_RE = /https?:\/\//i;
const HTML_ATTR_URL_RE = /\b[a-zA-Z_:][-a-zA-Z0-9_:.]*\s*=\s*(?:"[^"]*https?:\/\/[^"]*"|'[^']*https?:\/\/[^']*'|[^\s>]*https?:\/\/[^\s>]*)/i;
const HTML_STYLE_URL_RE = /<style\b[^>]*>[\s\S]*?https?:\/\/[\s\S]*?<\/style>/i;
const HTML_INLINE_SCRIPT_IMPORT_RE = /<script\b(?![^>]*\bsrc\b)[^>]*>[\s\S]*?(?:import\s+[^;]*https?:\/\/|import\s*\(\s*['"`]https?:\/\/)[\s\S]*?<\/script>/i;
const JS_IMPORT_URL_RE = /(?:^\s*(?:import|export)\s+[^;\n]*?from\s*['"`]https?:\/\/|^\s*import\s*['"`]https?:\/\/|\brequire\s*\(\s*['"`]https?:\/\/|\bimport\s*\(\s*['"`]https?:\/\/)/m;

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ValidationError('snapshot.json is not valid JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new ValidationError('snapshot.json must be a JSON object');
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) {
    throw new ValidationError('snapshot.json lacks a valid as_of YYYY-MM-DD date');
  }
  if (typeof o.source !== 'string') throw new ValidationError('snapshot.json lacks source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) {
    throw new ValidationError('snapshot.json lacks positive integer floor_usd');
  }
  if (!Array.isArray(o.protocols)) throw new ValidationError('snapshot.json lacks protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) {
    throw new ValidationError('snapshot.json lacks string watchlist');
  }

  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      throw new ValidationError(`snapshot.json protocol[${i}] is not an object`);
    }
    const p = v as Record<string, unknown>;
    if (
      typeof p.slug !== 'string' ||
      typeof p.name !== 'string' ||
      typeof p.tvl_usd !== 'number' ||
      !Number.isFinite(p.tvl_usd)
    ) {
      throw new ValidationError(`snapshot.json protocol[${i}] lacks slug, name, or finite tvl_usd`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });

  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Validate board.json against all sealed scorer rules plus finite-number sanity. */
export function boardIssue(board: readonly BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) {
    return `board has ${board.length} rows (gate requires 100..4000)`;
  }
  const snapSlugs = new Set(snapshot.protocols.map((p) => p.slug));
  const seen = new Set<string>();
  for (const r of board) {
    if (!snapSlugs.has(r.slug)) return `unknown slug ${r.slug}`;
    if (seen.has(r.slug)) return `duplicate slug ${r.slug}`;
    seen.add(r.slug);
    if (r.name.trim().length === 0) return `${r.slug} has empty name`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000) {
      return `${r.slug} has invalid implied_value_usd ${r.implied_value_usd}`;
    }
    if (!Number.isFinite(r.implied_low_usd) || !Number.isFinite(r.implied_high_usd)) {
      return `${r.slug} has non-finite range bounds`;
    }
  }

  const missing = snapshot.watchlist.filter((s) => !seen.has(s));
  if (missing.length > 0) {
    return `board misses ${missing.length} watchlist slug(s): ${missing.slice(0, 5).join(', ')}`;
  }

  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) {
    if (ranks[i] !== i + 1) return `rank sequence broken at ${i + 1}: got ${ranks[i]}`;
  }
  for (let i = 1; i < board.length; i++) {
    if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) {
      return `rank ${board[i]!.rank} (${board[i]!.implied_value_usd}) exceeds rank ${board[i - 1]!.rank} (${board[i - 1]!.implied_value_usd})`;
    }
  }
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share identical implied_value_usd`;
  }

  for (const r of board) {
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) {
      return `${r.slug} has ${r.farm_steps.length} farm_steps (requires 3..12)`;
    }
    for (const s of r.farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) {
        return `${r.slug} has a farm step of ${t.length} trimmed chars (requires 20..600)`;
      }
    }
  }
  return null;
}

/** Validate dashboard/ directory for gate compliance (no http(s)://, plain names, <= 54 KB source). */
export function validateDashboardDir(dir: string): { fileCount: number; totalBytes: number } {
  const files: { rel: string; abs: string; size: number }[] = [];
  const stack = [''];
  while (stack.length > 0) {
    const rel = stack.pop()!;
    const cur = rel === '' ? dir : join(dir, rel);
    for (const entry of readdirSync(cur, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) throw new ValidationError(`dashboard dot entry disallowed: ${entry.name}`);
      const nextRel = rel === '' ? entry.name : `${rel}/${entry.name}`;
      const abs = join(dir, nextRel);
      if (entry.isDirectory()) {
        stack.push(nextRel);
      } else if (entry.isFile()) {
        if (!PLAIN_FILE_NAME_RE.test(entry.name)) {
          throw new ValidationError(`dashboard invalid filename: ${nextRel}`);
        }
        const size = statSync(abs).size;
        files.push({ rel: nextRel, abs, size });
      }
    }
  }

  const hasHtml = files.some((f) => f.rel === 'index.html');
  const hasCss = files.some((f) => f.rel.endsWith('.css'));
  const hasJs = files.some((f) => f.rel.endsWith('.js'));
  if (!hasHtml || !hasCss || !hasJs) {
    throw new ValidationError('dashboard/ must contain index.html, at least one .css, and at least one .js');
  }

  let totalBytes = 0;
  for (const f of files) {
    totalBytes += f.size;
    const text = readFileSync(f.abs, 'utf8');
    if (f.rel.endsWith('.html')) {
      if (HTML_ATTR_URL_RE.test(text) || HTML_STYLE_URL_RE.test(text) || HTML_INLINE_SCRIPT_IMPORT_RE.test(text)) {
        throw new ValidationError(`dashboard/${f.rel} contains forbidden http(s):// reference in HTML attribute/style/import`);
      }
    } else if (f.rel.endsWith('.css')) {
      if (HTTP_URL_RE.test(text)) {
        throw new ValidationError(`dashboard/${f.rel} contains forbidden http(s):// reference in CSS`);
      }
    } else if (f.rel.endsWith('.js') || f.rel.endsWith('.mjs')) {
      if (JS_IMPORT_URL_RE.test(text)) {
        throw new ValidationError(`dashboard/${f.rel} contains forbidden http(s):// import/require specifier`);
      }
    }
  }

  if (totalBytes > TARGET_DASHBOARD_MAX_BYTES) {
    throw new ValidationError(
      `dashboard/ total source is ${totalBytes} bytes, exceeding ${TARGET_DASHBOARD_MAX_BYTES}-byte zero-truncation budget`,
    );
  }

  return { fileCount: files.length, totalBytes };
}

/** Verify serialized dossier.json is under server 1.5 MiB cap and has zero source truncation. */
export function validateDossierBytes(dossierBytes: Uint8Array): { bytes: number; textBytes: number } {
  if (dossierBytes.length > GATE_DOSSIER_MAX_BYTES) {
    throw new ValidationError(
      `dossier.json is ${dossierBytes.length} bytes, exceeding server gate 1.5 MiB cap (${GATE_DOSSIER_MAX_BYTES})`,
    );
  }
  const parsed = JSON.parse(Buffer.from(dossierBytes).toString('utf8')) as { text: string; images: unknown[] };
  if (parsed.text.includes('[Cut at ')) {
    throw new ValidationError('dossier.json text was truncated ("[Cut at ..." marker found)');
  }
  return {
    bytes: dossierBytes.length,
    textBytes: Buffer.byteLength(parsed.text, 'utf8'),
  };
}
