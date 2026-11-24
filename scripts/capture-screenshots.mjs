// Deterministic Chrome headless 1440x900 screenshotter and PNG cap verifier.
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildRadar, dataScript } from '../lib/model.ts';
import { parseSnapshot } from '../lib/validate.ts';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const repoRoot = resolve(import.meta.dirname, '..');
const snapshotPath = resolve(repoRoot, '../competition-kit/token-radar-01-kit/input/snapshot.json');
const outDir = join(repoRoot, 'out');
const dashOut = join(outDir, 'dashboard');
const shotsDir = join(repoRoot, 'screenshots');

if (!existsSync(CHROME_PATH)) {
  throw new Error(`Chrome not found at ${CHROME_PATH}`);
}

mkdirSync(dashOut, { recursive: true });
mkdirSync(shotsDir, { recursive: true });

// Materialize fresh data.js and dashboard/ in out/
const snapshot = parseSnapshot(readFileSync(snapshotPath, 'utf8'));
const { radar } = buildRadar(snapshot);
writeFileSync(join(outDir, 'data.js'), dataScript(radar), 'utf8');
for (const file of ['index.html', 'app.css', 'app.js']) {
  copyFileSync(join(repoRoot, 'dashboard', file), join(dashOut, file));
}

const baseUrl = pathToFileURL(join(dashOut, 'index.html')).href;
const targets = [
  { name: '1-board.png', hash: '' },
  { name: '2-detail.png', hash: '#p=steakhouse-financial' },
  { name: '3-filtered.png', hash: '#tier=large-cap' },
];

function readPngDimensions(filePath) {
  const buf = readFileSync(filePath);
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < sig.length; i++) {
    if (buf[i] !== sig[i]) throw new Error(`${filePath} is not a valid PNG`);
  }
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    bytes: buf.length,
  };
}

for (const t of targets) {
  const outShot = join(shotsDir, t.name);
  const url = `${baseUrl}${t.hash}`;
  const res = spawnSync(
    CHROME_PATH,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--window-size=1440,900',
      '--force-device-scale-factor=1',
      '--hide-scrollbars',
      '--virtual-time-budget=2500',
      `--screenshot=${outShot}`,
      url,
    ],
    { encoding: 'utf8', timeout: 30_000 },
  );
  if (res.status !== 0) {
    throw new Error(`Chrome screenshot failed for ${t.name}: ${res.stderr}`);
  }
  const info = readPngDimensions(outShot);
  const size = statSync(outShot).size;
  if (info.width !== 1440 || info.height !== 900) {
    throw new Error(`${t.name} dimensions ${info.width}x${info.height} !== 1440x900`);
  }
  if (size > 256_000) {
    process.stderr.write(`WARNING: ${t.name} is ${size} bytes (> 256 KB target)\n`);
  }
  process.stdout.write(`Captured ${t.name}: ${info.width}x${info.height}, ${size} bytes\n`);
}

// Run main.ts end-to-end to rebuild board.json, data.js, and dossier.json
const mainOut = execFileSync(process.execPath, ['main.ts', '--input', snapshotPath, '--output', outDir], {
  cwd: repoRoot,
  encoding: 'utf8',
});
process.stdout.write(mainOut);
