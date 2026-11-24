import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { buildRadar, dataScript } from '../lib/model.ts';
import {
  boardIssue,
  parseSnapshot,
  validateDashboardDir,
  validateDossierBytes,
} from '../lib/validate.ts';

const repoRoot = resolve(import.meta.dirname, '..');
const snapshotPath = resolve(repoRoot, '../competition-kit/token-radar-01-kit/input/snapshot.json');
const snapshot = parseSnapshot(readFileSync(snapshotPath, 'utf8'));
const { board, radar } = buildRadar(snapshot);

test('radar-3 MECE ledger, rank monotonicity, bootstrap bands, and boardIssue', () => {
  assert.equal(radar.model_version, 'radar-3');
  assert.equal(boardIssue(board, snapshot), null);

  const L = radar.ledger;
  const ledgerSum =
    L.watchlist +
    L.large_cap +
    L.early +
    L.priced_comps +
    L.other_tokenized +
    L.excl_bridges +
    L.excl_lst_btc +
    L.excl_cex_ver_sib;
  assert.equal(L.total, 758);
  assert.equal(ledgerSum, 758);
  assert.equal(L.watchlist, 40);
  assert.equal(board.length, L.watchlist + L.large_cap + L.early);
  assert.equal(radar.rows.length, board.length);
  assert.equal(radar.rows.filter((r) => r.tier === 'watchlist').length, 40);

  for (let i = 0; i < radar.rows.length; i++) {
    const r = radar.rows[i]!;
    assert.equal(r.rank, i + 1);
    assert.ok(r.rank_low >= 1 && r.rank_low <= r.rank && r.rank <= r.rank_high && r.rank_high <= radar.rows.length);
    if (i > 0) {
      assert.ok(radar.rows[i - 1]!.implied_value_usd >= r.implied_value_usd);
    }
    assert.ok(r.implied_low_usd <= r.implied_value_usd && r.implied_value_usd <= r.implied_high_usd);
    assert.ok(r.implied_p10_usd <= r.implied_value_usd && r.implied_value_usd <= r.implied_p90_usd);
  }
});

test('Stage 1 & Stage 2 dual blind OOS ablations and guardrails', () => {
  const pm = radar.calibration.price_model;
  const om = radar.calibration.odds_model;
  assert.ok(pm.ablation.length >= 6);
  assert.ok(pm.wf_miss < pm.flat_wf_miss);
  assert.ok(pm.loo_miss < pm.flat_loo_miss);
  assert.ok(pm.cov50_wf > 0 && pm.cov80_wf > pm.cov50_wf);

  assert.ok(om.ablation.length >= 5);
  assert.equal(om.beta_chains, 0);
  const droppedChain = om.ablation.find((a) => a.step.toLowerCase().includes('chain'));
  assert.ok(droppedChain && droppedChain.status === 'tested_not_kept');
  assert.ok(om.wf_brier < om.base_wf_brier);
});

test('Domain & chain hygiene: sibling cut, underwriting pool, ETH floor, non-EVM zero hallucination', () => {
  const bySlug = new Map(board.map((r) => [r.slug, r]));
  const mezo = bySlug.get('mezo-earn');
  assert.ok(mezo);
  assert.equal(mezo.sibling_symbol, 'MEZO');
  assert.ok(mezo.flags.some((f) => f.includes('Tokenized Sibling')));

  const firelight = bySlug.get('firelight');
  assert.ok(firelight);
  assert.ok(firelight.farm_steps.some((s) => /underwriting|cover pool/i.test(s)));

  for (const r of board) {
    assert.equal(r.farm_steps.length, 8, `${r.slug} must have 8 farm steps`);
    for (const step of r.farm_steps) {
      assert.ok(step.length >= 20 && step.length <= 600, `${r.slug} step length ${step.length}`);
    }
    if (r.farm_econ.chain_family === 'eth_l1') {
      assert.ok(r.farm_econ.deposit_usd >= 5000);
      assert.equal(r.farm_econ.weekly_fee_usd, 0);
    }
    if (!['evm_l2', 'eth_l1', 'btc_l2'].includes(r.farm_econ.chain_family)) {
      const joined = r.farm_steps.join(' ');
      assert.ok(!/\bERC-?20\b|\bUSDC\b/i.test(joined), `${r.slug} non-EVM leak: ${joined}`);
    }
  }
});

test('100% Node <-> browser dashboard/app.js parity across all 185 rows', () => {
  const noopEl = { innerHTML: '', querySelectorAll: () => [], addEventListener: () => {} };
  const ctx: Record<string, unknown> = {
    window: {},
    location: { hash: '', pathname: '/', search: '' },
    history: { replaceState: () => {} },
    document: { getElementById: () => noopEl },
    URLSearchParams,
    addEventListener: () => {},
    scrollTo: () => {},
  };
  ctx.window = ctx;
  vm.runInNewContext(dataScript(radar), ctx);
  vm.runInNewContext(readFileSync(join(repoRoot, 'dashboard/app.js'), 'utf8'), ctx);

  const parity = (ctx.window as {
    __RADAR_PARITY: {
      computeRowValuation: (r: unknown, c: unknown) => { valueIfLaunched: number; launchOdds: number; implied: number; low: number; high: number };
      fnv1aHex: (rows: unknown[]) => string;
      computeFarmEcon: (r: unknown, c: unknown) => {
        verdict: string; net_of_fees_usd: number; net_per_hour: number; break_even_odds: number; steps: string[];
      };
    };
  }).__RADAR_PARITY;

  const boardBySlug = new Map(board.map((r) => [r.slug, r]));
  assert.equal(parity.fnv1aHex(radar.rows), radar.calibration.board_checksum);
  for (const r of radar.rows) {
    const b = boardBySlug.get(r.slug)!;
    const v = parity.computeRowValuation(r, radar.calibration);
    assert.equal(v.valueIfLaunched, r.value_if_launched_usd, r.slug);
    assert.equal(v.launchOdds, r.launch_odds, r.slug);
    assert.equal(v.implied, r.implied_value_usd, r.slug);
    assert.equal(v.low, r.implied_low_usd, r.slug);
    assert.equal(v.high, r.implied_high_usd, r.slug);

    const fe = parity.computeFarmEcon(r, radar.calibration);
    assert.equal(fe.verdict, r.farm_econ.verdict, r.slug);
    assert.equal(fe.net_of_fees_usd, r.farm_econ.net_of_fees_usd, r.slug);
    assert.equal(fe.net_per_hour, r.farm_econ.net_per_hour, r.slug);
    assert.equal(fe.break_even_odds, r.farm_econ.break_even_odds, r.slug);
    assert.deepEqual([...fe.steps], b.farm_steps, r.slug);
  }
});

test('End-to-end 2-run SHA-256 determinism and gate caps (zero URL, zero xmlns, zero truncation)', () => {
  const dash = validateDashboardDir(join(repoRoot, 'dashboard'));
  assert.ok(dash.totalBytes <= 54_000, `dashboard total=${dash.totalBytes}`);
  for (const f of ['index.html', 'app.css', 'app.js']) {
    const txt = readFileSync(join(repoRoot, 'dashboard', f), 'utf8');
    assert.ok(!/https?:\/\//i.test(txt), `external URL in ${f}`);
    assert.ok(!/xmlns\s*=/i.test(txt), `xmlns= in ${f}`);
  }

  const outA = mkdtempSync(join(tmpdir(), 'radar3-a-'));
  const outB = mkdtempSync(join(tmpdir(), 'radar3-b-'));
  try {
    execFileSync(process.execPath, ['main.ts', '--input', snapshotPath, '--output', outA], { cwd: repoRoot });
    execFileSync(process.execPath, ['main.ts', '--input', snapshotPath, '--output', outB], { cwd: repoRoot });
    for (const fn of ['board.json', 'data.js', 'dossier.json']) {
      const a = readFileSync(join(outA, fn));
      const b = readFileSync(join(outB, fn));
      assert.equal(createHash('sha256').update(a).digest('hex'), createHash('sha256').update(b).digest('hex'), fn);
    }
    const dossierBuf = readFileSync(join(outA, 'dossier.json'));
    const info = validateDossierBytes(dossierBuf);
    assert.ok(info.bytes <= 1_250_000);
    assert.ok(statSync(join(repoRoot, 'screenshots/1-board.png')).size > 20_000);
  } finally {
    rmSync(outA, { recursive: true, force: true });
    rmSync(outB, { recursive: true, force: true });
  }
});
