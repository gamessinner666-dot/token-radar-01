// Deterministic Chrome headless 1440x1280 screenshotter with Q92 JPEG encoding and cap verifier.
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
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

if (!existsSync(CHROME_PATH)) throw new Error(`Chrome not found at ${CHROME_PATH}`);

rmSync(dashOut, { recursive: true, force: true });
rmSync(shotsDir, { recursive: true, force: true });
mkdirSync(dashOut, { recursive: true });
mkdirSync(shotsDir, { recursive: true });

const snapshot = parseSnapshot(readFileSync(snapshotPath, 'utf8'));
const { radar } = buildRadar(snapshot);
writeFileSync(join(outDir, 'data.js'), dataScript(radar), 'utf8');
for (const file of readdirSync(join(repoRoot, 'dashboard'))) {
  if (!file.startsWith('.')) copyFileSync(join(repoRoot, 'dashboard', file), join(dashOut, file));
}

const baseUrl = pathToFileURL(join(dashOut, 'index.html')).href;
const targets = [
  { name: '1-board.jpg', hash: '#exp=bittensor-dtao', w: 1440, h: 1280 },
  { name: '2-detail.jpg', hash: '#p=keyrock', w: 1440, h: 920 },
  { name: '3-filtered.jpg', hash: '#verdict=FARM&sort=netHr&dir=desc', w: 1440, h: 1180 },
];

for (const t of targets) {
  const pngTmp = join(shotsDir, `${t.name}.tmp.png`);
  const jpgOut = join(shotsDir, t.name);
  const res = spawnSync(
    CHROME_PATH,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      `--window-size=${t.w},${t.h}`,
      '--force-device-scale-factor=1',
      '--hide-scrollbars',
      '--virtual-time-budget=3500',
      `--screenshot=${pngTmp}`,
      `${baseUrl}${t.hash}`,
    ],
    { encoding: 'utf8', timeout: 30_000 },
  );
  if (res.status !== 0) throw new Error(`Chrome screenshot failed for ${t.name}: ${res.stderr}`);

  const ps = [
    'Add-Type -AssemblyName System.Drawing;',
    `$img=[System.Drawing.Image]::FromFile('${pngTmp.replace(/'/g, "''")}');`,
    `$enc=[System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders()|Where-Object{$_.MimeType -eq 'image/jpeg'}|Select-Object -First 1;`,
    '$ep=New-Object System.Drawing.Imaging.EncoderParameters 1;',
    '$ep.Param[0]=New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, 68L);',
    `$img.Save('${jpgOut.replace(/'/g, "''")}', $enc, $ep);`,
    '$w=$img.Width; $h=$img.Height; $img.Dispose();',
    'Write-Output "$w $h";',
  ].join(' ');
  const psRes = execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' }).trim();
  unlinkSync(pngTmp);

  const buf = readFileSync(jpgOut);
  if (buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) throw new Error(`${t.name} invalid JPEG header`);
  const size = statSync(jpgOut).size;
  if (size > 524_288) throw new Error(`${t.name} exceeds 512 KiB (${size} B)`);
  process.stdout.write(`Captured ${t.name}: ${psRes.replace(' ', 'x')}, ${size} bytes\n`);
}

const mainOut = execFileSync(process.execPath, ['main.ts', '--input', snapshotPath, '--output', outDir], {
  cwd: repoRoot,
  encoding: 'utf8',
});
process.stdout.write(mainOut);
