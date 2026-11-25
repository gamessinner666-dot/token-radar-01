// Token Radar 01 (radar-7) entrypoint — Node 22.18+ erasable TypeScript, stdlib only, zero network.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRadar, dataScript } from './lib/model.ts';
import {
  boardIssue,
  parseSnapshot,
  PLAIN_FILE_NAME_RE,
  validateDashboardDir,
  validateDossierBytes,
} from './lib/validate.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const DASHBOARD_CAPS = { max_files: 400, max_bytes: 4_194_304 };

function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found === undefined ? fallback : found.slice(prefix.length);
}

function copyDirRecursive(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  const entries = readdirSync(from, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const src = join(from, entry.name);
    const dst = join(to, entry.name);
    if (entry.isDirectory()) {
      for (const child of copyDirRecursive(src, dst)) copied.push(`${entry.name}/${child}`);
    } else if (entry.isFile()) {
      copyFileSync(src, dst);
      copied.push(entry.name);
    }
  }
  return copied;
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}\n`);
  process.exit(2);
}
const outDir = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: board failed validation: ${issue}\n`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'board.json'), `${JSON.stringify({ rows: board })}\n`, 'utf8');
writeFileSync(join(outDir, 'data.js'), dataScript(radar), 'utf8');

const dashOut = join(outDir, 'dashboard');
rmSync(dashOut, { recursive: true, force: true });
const dashFiles = copyDirRecursive(join(here, 'dashboard'), dashOut);
const dashCheck = validateDashboardDir(dashOut);

const shotsOut = join(outDir, 'screenshots');
rmSync(shotsOut, { recursive: true, force: true });
const shotFiles = copyDirRecursive(join(here, 'screenshots'), shotsOut);
if (shotFiles.length < 3) {
  process.stderr.write(`token radar: screenshots/ has ${shotFiles.length} image(s); 3–4 required\n`);
  process.exit(1);
}
for (const name of shotFiles) {
  if (!PLAIN_FILE_NAME_RE.test(name)) {
    process.stderr.write(`token radar: invalid screenshot filename screenshots/${name}\n`);
    process.exit(1);
  }
}

const dossierBytes = buildDossier(outDir, {
  text_max_bytes: TEXT_MAX_BYTES,
  screenshots: SCREENSHOT_CAPS,
  dashboard: DASHBOARD_CAPS,
});
const dossierCheck = validateDossierBytes(dossierBytes);
writeFileSync(join(outDir, 'dossier.json'), dossierBytes);

process.stdout.write(
  `token radar (${radar.model_version}): ${snapshot.protocols.length} ledger -> ${board.length} ranked ` +
    `(FARM=${radar.summary.farm_count}, MARGINAL=${radar.summary.marginal_count}, SKIP=${radar.summary.skip_count}; ` +
    `WF=x${radar.calibration.price_model.wf_miss}, LOO=x${radar.calibration.price_model.loo_miss}, ` +
    `Brier=${radar.calibration.odds_model.wf_brier}, crc=${radar.calibration.board_checksum})\n` +
    `token radar: dashboard=${dashFiles.length} files (${dashCheck.totalBytes} B), ` +
    `screenshots=${shotFiles.length}, dossier=${dossierCheck.bytes} B (text=${dossierCheck.textBytes} B, 0 truncation)\n`,
);
