// Headless Chrome capture of the 3 Sonar (sonar-3) dashboard screenshots (<=512 KiB, 800..1440px).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = resolve(import.meta.dirname, '..');
const outDir = resolve(repoRoot, 'out');
const shotsDir = resolve(repoRoot, 'screenshots');
const snapPath = resolve(repoRoot, '../kit-v50/token-radar-01-kit/input/snapshot.json');

const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p));
if (!CHROME) throw new Error('Chrome/Edge executable not found');

execFileSync(process.execPath, ['main.ts', '--input', snapPath, '--output', outDir], { cwd: repoRoot, stdio: 'inherit' });
rmSync(shotsDir, { recursive: true, force: true });
mkdirSync(shotsDir, { recursive: true });

const pageBaseUrl = pathToFileURL(join(outDir, 'dashboard', 'index.html')).href;
const targets = [
  { file: '1-board.jpg', hash: '', w: 1440, h: 1280 },
  { file: '2-detail.jpg', hash: '#p=axis', w: 1440, h: 1020 },
  { file: '3-filtered.jpg', hash: '#verdict=FARM&sort=netHr&dir=desc&open=vault-street', w: 1440, h: 1220 },
];

for (const t of targets) {
  const pngPath = join(outDir, `_raw_${t.file}.png`);
  const jpgPath = join(shotsDir, t.file);
  const url = `${pageBaseUrl}${t.hash}`;
  execFileSync(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--allow-file-access-from-files',
    '--hide-scrollbars',
    '--virtual-time-budget=3000',
    `--window-size=${t.w},${t.h}`,
    `--screenshot=${pngPath}`,
    url,
  ], { stdio: 'ignore' });

  const psScript = [
    'Add-Type -AssemblyName System.Drawing',
    `$img = [System.Drawing.Image]::FromFile('${pngPath.replace(/'/g, "''")}')`,
    "$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }",
    '$ep = New-Object System.Drawing.Imaging.EncoderParameters(1)',
    '$ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, 74L)',
    `$img.Save('${jpgPath.replace(/'/g, "''")}', $codec, $ep)`,
    '$img.Dispose()',
  ].join('; ');
  execFileSync('powershell', ['-NoProfile', '-Command', psScript], { stdio: 'inherit' });

  const buf = readFileSync(jpgPath);
  const sz = statSync(jpgPath).size;
  if (buf[0] !== 0xff || buf[1] !== 0xd8 || sz > 524_288) {
    throw new Error(`Invalid JPEG ${t.file}: size=${sz}`);
  }
  console.log(`Captured ${t.file}: ${t.w}x${t.h}, ${sz} bytes`);
}

execFileSync(process.execPath, ['main.ts', '--input', snapPath, '--output', outDir], { cwd: repoRoot, stdio: 'inherit' });
rmSync(outDir, { recursive: true, force: true });
