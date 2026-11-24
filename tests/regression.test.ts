// Regression test suite covering all 8 quantitative, discovery, farming, parity, determinism, and gate checks.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { buildComparables } from '../lib/comparables.ts';
import { buildRadar, dataScript } from '../lib/model.ts';
import { boardIssue, parseSnapshot, validateDashboardDir, validateDossierBytes } from '../lib/validate.ts';
import { buildDossier } from '../vendor/makefun-board.ts';

const repoRoot = resolve(import.meta.dirname, '..');
const snapshotPath = resolve(repoRoot, '../competition-kit/token-radar-01-kit/input/snapshot.json');
const snapshot = parseSnapshot(readFileSync(snapshotPath, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const { comparables } = buildComparables(snapshot);

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function assertAllFinite(obj: unknown, path = 'root'): void {
  if (typeof obj === 'number') {
    assert.ok(Number.isFinite(obj), `Non-finite number at ${path}: ${obj}`);
    return;
  }
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => assertAllFinite(v, `${path}[${i}]`));
    return;
  }
  if (obj !== null && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      assertAllFinite(v, `${path}.${k}`);
    }
  }
}

test('1. Negative and zero mcap_usd excluded from comparables; zero NaN/Infinity', () => {
  const slugs = new Set(comparables.map((c) => c.slug));
  assert.equal(slugs.has('autofinance'), false, 'autofinance (mcap_usd=-1) must be excluded');
  for (const c of comparables) {
    assert.ok(c.mcap_usd > 0, `${c.slug} has non-positive mcap_usd`);
    assert.ok(c.tvl_usd > 0, `${c.slug} has non-positive tvl_usd`);
  }
  assert.equal(comparables.length, 98);
  assert.ok(radar.calibration.beta_huber >= 0.65 && radar.calibration.beta_huber <= 0.90);
  assertAllFinite(radar);
  assertAllFinite(board);
});

test('2. Ticker collisions isolated and same-sector brand siblings aggregated', () => {
  const bySlug = new Map(comparables.map((c) => [c.slug, c]));
  const aave = bySlug.get('aave-v2');
  assert.ok(aave, 'aave-v2 comparable present');
  assert.equal(aave.n_siblings, 5, '5 AAVE Lending siblings aggregated');
  assert.ok(aave.ratio < 0.25 && aave.ratio > 0.05, `aave-v2 ratio ${aave.ratio} should be ~0.111x, not 18.96x`);

  // Verify benqi-staked-avax (Liquid Staking) is NOT aggregated into benqi-lending (Lending)
  const benqiLend = bySlug.get('benqi-lending');
  assert.ok(benqiLend);
  assert.equal(benqiLend.n_siblings, 1, 'benqi-staked-avax must not contaminate benqi-lending');

  // Verify Bridge/Locker ticker collisions (pumpbtc PUMP, team-finance SWAP) are excluded from comparables
  assert.equal(bySlug.has('pumpbtc'), false);
  assert.equal(bySlug.has('team-finance'), false);

  // Verify synthetic case-insensitive DYDX/dYdX aggregation vs MET/UP ticker collision isolation
  const synth = buildComparables({
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    watchlist: [],
    protocols: [
      { slug: 'dydx-v3', name: 'dYdX V3', category: 'Derivatives', chains: ['Ethereum'], tvl_usd: 10_000_000, change_7d: 0, mcap_usd: 50_000_000, listed_at: null, gecko_id: 'dydx', symbol: 'DYDX' },
      { slug: 'dydx-v4', name: 'dYdX V4', category: 'Derivatives', chains: ['dYdX'], tvl_usd: 40_000_000, change_7d: 0, mcap_usd: null, listed_at: null, gecko_id: null, symbol: 'dYdX' },
      { slug: 'meteora-dlmm', name: 'Meteora DLMM', category: 'Dexs', chains: ['Solana'], tvl_usd: 100_000_000, change_7d: 0, mcap_usd: 20_000_000, listed_at: null, gecko_id: 'met', symbol: 'MET' },
      { slug: 'metronome-synth', name: 'Metronome Synth', category: 'Synthetics', chains: ['Ethereum'], tvl_usd: 50_000_000, change_7d: 0, mcap_usd: null, listed_at: null, gecko_id: null, symbol: 'MET' },
    ],
  });
  const dydx = synth.comparables.find((c) => c.slug === 'dydx-v3');
  const met = synth.comparables.find((c) => c.slug === 'meteora-dlmm');
  assert.equal(dydx?.n_siblings, 2);
  assert.equal(dydx?.tvl_usd, 50_000_000);
  assert.equal(met?.n_siblings, 1, 'MET ticker collision between Meteora and Metronome must stay isolated');
});

test('3. Discovery funnel: 40/40 watchlist + 17 large-cap + 128 early = 185 clean rows, zero leaks', () => {
  assert.equal(radar.summary.watchlist_size, 40);
  assert.equal(radar.summary.large_cap_size, 17);
  assert.equal(radar.summary.early_size, 128);
  assert.equal(board.length, 185);

  const boardSlugs = new Set(board.map((r) => r.slug));
  for (const w of snapshot.watchlist) {
    assert.ok(boardSlugs.has(w), `Watchlist slug ${w} missing`);
  }

  for (const expectedLargeCap of ['polymarket-international', 'sentora-curator', 'defi-saver-asset-management', 'mellow-core', 'extended-perps']) {
    assert.ok(boardSlugs.has(expectedLargeCap), `Large-cap expansion ${expectedLargeCap} missing`);
  }

  for (const leak of [
    'gmx-solana', 'solv-strategies', 'flying-tulip-ftusd', 'kava-mint', 'manta-cedefi',
    'metalx-swap', 'communityv3', 'circle-gateway', 'usdcx', 'txflow-bridge', 'stkesol-by-sol-strategies',
  ]) {
    assert.equal(boardSlugs.has(leak), false, `Polluted/sibling protocol ${leak} leaked onto board`);
  }

  const mezo = board.find((r) => r.slug === 'mezo-earn');
  assert.ok(mezo);
  assert.equal(mezo.sibling_symbol, 'MEZO');
  assert.ok(mezo.flags.some((f) => f.includes('Tokenized Sibling: MEZO')));
});

test('4. Null-field resilience: neutral 1.00 maturity for null listed_at and zero excess for null change_7d', () => {
  for (const slug of ['estate-protocol', 'swan-dao', 'lightning-network', 'noble']) {
    const row = board.find((r) => r.slug === slug);
    assert.ok(row, `${slug} must be present on board`);
    if (row.listed_at === null) {
      assert.equal(row.model.maturity_multiplier, 1.0, `${slug} null listed_at must have 1.00 maturity`);
      assert.ok(row.flags.some((f) => f.includes('Missing listed_at')));
    }
    if (row.change_7d === null) {
      assert.equal(row.model.excess_7d, 0, `${slug} null change_7d must have 0 excess`);
      assert.equal(row.model.growth_multiplier, 1.0, `${slug} null change_7d must have 1.00 growth`);
    }
  }
});

test('5. Chain-aware farming sanity and gate step length constraints', () => {
  for (const r of board) {
    assert.equal(r.farm_steps.length, 6, `${r.slug} must have 6 farm steps`);
    for (const s of r.farm_steps) {
      const len = s.trim().length;
      assert.ok(len >= 20 && len <= 600, `${r.slug} step length ${len} out of [20, 600]`);
    }
  }

  for (const nonEvmSlug of ['lightning-network', 'bittensor-dtao', 'doppler-finance']) {
    const row = board.find((r) => r.slug === nonEvmSlug);
    assert.ok(row);
    const joined = row.farm_steps.join('\n');
    assert.equal(/ERC-20|USDC/i.test(joined), false, `${nonEvmSlug} farm plan leaked ERC-20/USDC`);
  }

  const symbiotic = board.find((r) => r.slug === 'symbiotic');
  assert.ok(symbiotic);
  assert.equal(symbiotic.farm_meta.chain_family, 'eth_l1');
  assert.ok(symbiotic.farm_meta.min_capital_usd >= 500);
  assert.match(symbiotic.farm_steps.join(' '), /deposit-and-hold|no weekly/i);

  const firelight = board.find((r) => r.slug === 'firelight');
  assert.ok(firelight);
  assert.match(firelight.farm_steps[2]!, /underwriting|cover pool/i);

  const steakhouse = board.find((r) => r.slug === 'steakhouse-financial');
  assert.ok(steakhouse);
  assert.notEqual(steakhouse.farm_meta.best_chain, 'Ethereum');
});

test('6. 100% Node <-> browser dashboard/app.js parity for implied value and farm plans across all 185 rows', () => {
  const appJs = readFileSync(join(repoRoot, 'dashboard/app.js'), 'utf8');
  const noopEl = {
    innerHTML: '',
    open: false,
    showModal() { this.open = true; },
    close() { this.open = false; },
    addEventListener() {},
    querySelectorAll() { return []; },
    querySelector() { return null; },
  };
  const context: Record<string, unknown> = {
    window: {
      RADAR: JSON.parse(JSON.stringify(radar)),
      location: { hash: '', pathname: '/index.html', search: '' },
    },
    document: {
      getElementById() { return noopEl; },
    },
    history: { replaceState() {} },
    Math,
    Number,
    String,
    Object,
    Array,
    encodeURIComponent,
    decodeURIComponent,
  };
  (context.window as Record<string, unknown>).window = context.window;
  vm.runInNewContext(appJs, context);

  const parity = (context.window as {
    __RADAR_PARITY: {
      computeImpliedValue: (row: unknown, cal: unknown, ov: null) => { implied: number; low: number; high: number };
      buildFarmPlan: (row: unknown) => Array<{ action: string; cost: string; time: string }>;
    };
  }).__RADAR_PARITY;

  for (const row of board) {
    const rRow = radar.rows.find((x) => x.slug === row.slug)!;
    const browserVal = parity.computeImpliedValue(rRow, radar.calibration, null);
    assert.equal(browserVal.implied, row.implied_value_usd, `Implied parity mismatch for ${row.slug}`);
    assert.equal(browserVal.low, row.implied_low_usd, `Low band mismatch for ${row.slug}`);
    assert.equal(browserVal.high, row.implied_high_usd, `High band mismatch for ${row.slug}`);

    const browserSteps = parity.buildFarmPlan(rRow).map((s) => `${s.action} Cost: ${s.cost}. Time: ${s.time}.`);
    assert.equal(JSON.stringify(browserSteps), JSON.stringify(row.farm_steps), `Farm plan parity mismatch for ${row.slug}`);
  }
});

test('7. Byte-for-byte determinism across two independent CLI runs', () => {
  const tmpA = mkdtempSync(join(tmpdir(), 'tr01-a-'));
  const tmpB = mkdtempSync(join(tmpdir(), 'tr01-b-'));
  try {
    execFileSync(process.execPath, ['main.ts', '--input', snapshotPath, '--output', tmpA], { cwd: repoRoot });
    execFileSync(process.execPath, ['main.ts', '--input', snapshotPath, '--output', tmpB], { cwd: repoRoot });

    for (const f of ['board.json', 'data.js', 'dossier.json']) {
      assert.equal(sha256File(join(tmpA, f)), sha256File(join(tmpB, f)), `${f} is not deterministic across runs`);
    }
    assert.equal(boardIssue(board, snapshot), null);
    assert.equal(dataScript(radar), readFileSync(join(tmpA, 'data.js'), 'utf8'));
  } finally {
    rmSync(tmpA, { recursive: true, force: true });
    rmSync(tmpB, { recursive: true, force: true });
  }
});

test('8. Gate, dashboard byte budget, zero-URL, zero-truncation, and dossier size caps', () => {
  const dashCheck = validateDashboardDir(join(repoRoot, 'dashboard'));
  assert.ok(dashCheck.totalBytes <= 54_000, `Dashboard bytes ${dashCheck.totalBytes} > 54,000`);
  const html = readFileSync(join(repoRoot, 'dashboard/index.html'), 'utf8');
  const js = readFileSync(join(repoRoot, 'dashboard/app.js'), 'utf8');
  assert.equal(/xmlns\s*=/i.test(html), false, 'HTML must not contain xmlns attribute');
  assert.equal(/xmlns\s*=/i.test(js), false, 'JS must not emit xmlns attribute');

  for (const shot of ['1-board.png', '2-detail.png', '3-filtered.png']) {
    const p = join(repoRoot, 'screenshots', shot);
    const bytes = statSync(p).size;
    assert.ok(bytes <= 250_000, `${shot} is ${bytes} bytes (> 250 KB)`);
    const buf = readFileSync(p);
    assert.equal(buf.readUInt32BE(16), 1440);
    assert.equal(buf.readUInt32BE(20), 900);
  }

  const outDir = join(repoRoot, 'out');
  const dossierPath = join(outDir, 'dossier.json');
  const diskBytes = readFileSync(dossierPath);
  const rebuilt = buildDossier(outDir, {
    text_max_bytes: 65_536,
    screenshots: { max: 4, max_bytes: 524_288 },
    dashboard: { max_files: 400, max_bytes: 4_194_304 },
  });
  assert.equal(Buffer.compare(diskBytes, rebuilt), 0, 'dossier.json must match buildDossier byte-for-byte');
  const check = validateDossierBytes(diskBytes);
  assert.ok(check.bytes <= 1_350_000, `dossier.json ${check.bytes} bytes > 1,350,000 target`);
});
