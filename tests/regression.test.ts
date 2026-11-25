import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { buildFarmEconomicsAndPlan } from '../lib/farming.ts';
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

test('radar-7 MECE ledger, set_aside, rank monotonicity, 200-bootstrap bands & s.e., and boardIssue', () => {
  assert.equal(radar.model_version, 'radar-7');
  assert.equal(boardIssue(board, snapshot), null);

  const L = radar.ledger;
  const ledgerSum =
    L.watchlist + L.large_cap + L.early + L.priced_comps + L.other_tokenized + L.excl_bridges + L.excl_lst_btc + L.excl_cex_ver_sib;
  assert.equal(L.total, 758);
  assert.equal(ledgerSum, 758);
  assert.equal(L.watchlist, 40);
  assert.equal(board.length, L.watchlist + L.large_cap + L.early);
  assert.equal(radar.rows.length, board.length);
  assert.equal(radar.set_aside.length, L.excl_bridges + L.excl_lst_btc + L.excl_cex_ver_sib);
  assert.equal(radar.set_aside.length, 157);
  assert.equal(radar.rows.filter((r) => r.tier === 'watchlist').length, 40);
  assert.equal(radar.calibration.n_bootstrap, 200);
  assert.ok(radar.calibration.price_model.intercept_se > 0 && radar.calibration.price_model.beta_tvl_se > 0);
  assert.ok(radar.calibration.odds_model.beta_age_se > 0 && radar.calibration.odds_model.beta_legacy_se > 0 && radar.calibration.odds_model.beta_tvl_se > 0);
  assert.equal(radar.calibration.odds_model.beta_sectors.length, 5);

  for (let i = 0; i < radar.rows.length; i++) {
    const r = radar.rows[i]!;
    assert.equal(r.rank, i + 1);
    assert.ok(r.rank_low >= 1 && r.rank_low <= r.rank && r.rank <= r.rank_high && r.rank_high <= radar.rows.length);
    if (i > 0) assert.ok(radar.rows[i - 1]!.implied_value_usd >= r.implied_value_usd);
    assert.ok(r.implied_p10_usd <= r.implied_low_usd && r.implied_low_usd <= r.implied_value_usd);
    assert.ok(r.implied_value_usd <= r.implied_high_usd && r.implied_high_usd <= r.implied_p90_usd);
  }
});

test('Stage 1 & Stage 2 dual blind OOS ablations and dropped-term guardrails', () => {
  const pm = radar.calibration.price_model;
  const om = radar.calibration.odds_model;
  assert.ok(pm.ablation.length >= 6);
  assert.ok(pm.wf_miss < pm.flat_wf_miss);
  assert.ok(pm.loo_miss < pm.flat_loo_miss);
  assert.ok(pm.cov50_wf > 0 && pm.cov80_wf > pm.cov50_wf);

  assert.ok(om.ablation.length >= 6);
  assert.equal(om.beta_chains, 0);
  assert.ok(om.cv10_brier < 0.20, `10F Brier=${om.cv10_brier}`);
  assert.ok(om.wf_acc >= 0.65, `WF Acc=${om.wf_acc}`);
  const droppedChain = om.ablation.find((a) => a.step.toLowerCase().includes('chain'));
  assert.ok(droppedChain && droppedChain.status === 'tested_not_kept');
  assert.ok(om.wf_brier < om.base_wf_brier);

  const s1Placebo = pm.ablation.find((a) => a.step.includes('20x shuffled 7d'));
  assert.ok(s1Placebo && s1Placebo.status === 'control');
  assert.ok(s1Placebo.loo_miss >= pm.loo_miss && s1Placebo.wf_miss >= pm.wf_miss);

  const s2Placebo = om.ablation.find((a) => a.step.includes('20x shuffled 7d'));
  assert.ok(s2Placebo && s2Placebo.status === 'control');
  assert.ok(s2Placebo.cv10_brier >= om.cv10_brier && s2Placebo.wf_brier >= om.wf_brier);
});

test('Domain & chain hygiene: sibling cut, underwriting pool, ETH floor, non-EVM zero leak, exact step minute sum', () => {
  const bySlug = new Map(board.map((r) => [r.slug, r]));
  const snapBySlug = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const mezo = bySlug.get('mezo-earn');
  assert.ok(mezo);
  assert.equal(mezo.sibling_symbol, 'MEZO');
  assert.ok(mezo.flags.some((f) => f.includes('Tokenized Sibling')));

  const firelight = bySlug.get('firelight');
  assert.ok(firelight);
  assert.ok(firelight.farm_steps.some((s) => /underwriting|cover pool/i.test(s)));

  const tao = bySlug.get('bittensor-dtao');
  assert.ok(tao);
  assert.ok(!tao.farm_steps.some((s) => /dTAO\s+dTAO/i.test(s)), 'no duplicate dTAO wording');

  for (const r of board) {
    assert.equal(r.farm_steps.length, 8, `${r.slug} must have 8 farm steps`);
    for (const step of r.farm_steps) {
      assert.ok(step.length >= 20 && step.length <= 600, `${r.slug} step length ${step.length}`);
    }
    const plan = buildFarmEconomicsAndPlan(
      snapBySlug.get(r.slug)!,
      r.implied_value_usd,
      r.launch_odds,
      r.flags,
      r.sibling_symbol,
      radar.calibration.snapshot_7d_p05,
    );
    const stepSum = plan.items.reduce((acc, it) => acc + it.minutes, 0);
    assert.equal(stepSum, plan.econ.total_minutes, `${r.slug} step minute sum`);
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

test('100% Live Browser Refit, R25 7d Monotonicity & 185-row Parity (01_model.js + 02_app.js)', () => {
  const noopEl = { innerHTML: '', textContent: '', addEventListener: () => {} };
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
  vm.runInNewContext(readFileSync(join(repoRoot, 'dashboard/01_model.js'), 'utf8'), ctx);
  vm.runInNewContext(readFileSync(join(repoRoot, 'dashboard/02_app.js'), 'utf8'), ctx);

  const model = (ctx.window as {
    RADAR_MODEL: {
      verifyBoardParity: (d: unknown) => {
        pFit: unknown;
        oFit: unknown;
        refitPriceOk: boolean;
        refitOddsOk: boolean;
        ablationOk: boolean;
        mismatches: number;
        farmMismatches: number;
        monoOk: boolean;
        totalExactOk: boolean;
        checksum: string;
        checksumOk: boolean;
        wlOk: boolean;
        ledgerOk: boolean;
      };
      evaluateProtocol: (r: unknown, pf: unknown, of: unknown, c: unknown) => {
        valueIfLaunched: number;
        launchOdds: number;
        implied: number;
        low: number;
        high: number;
      };
      buildFarmPlan: (r: unknown, c: unknown, dep?: number | null, ds?: number | null, wk?: number | null) => {
        deposit_usd: number;
        total_fees_usd: number;
        total_minutes: number;
        verdict: string;
        net_of_fees_usd: number;
        net_per_hour: number;
        break_even_odds: number;
        items: { phase: string }[];
      };
    };
  }).RADAR_MODEL;

  const vp = model.verifyBoardParity(radar);
  assert.equal(vp.refitPriceOk, true);
  assert.equal(vp.refitOddsOk, true);
  assert.equal(vp.ablationOk, true);
  assert.equal(vp.mismatches, 0);
  assert.equal(vp.farmMismatches, 0);
  assert.equal(vp.monoOk, true);
  assert.equal(vp.totalExactOk, true);
  assert.equal(vp.checksumOk, true);
  assert.equal(vp.wlOk, true);
  assert.equal(vp.ledgerOk, true);

  const r25 = radar.rows.find((r) => r.slug === 'r25')!;
  assert.ok(r25, 'r25 present');
  const gNeg = model.evaluateProtocol({ ...r25, change_7d: -20 }, vp.pFit, vp.oFit, radar.calibration);
  const gZero = model.evaluateProtocol({ ...r25, change_7d: 0 }, vp.pFit, vp.oFit, radar.calibration);
  const gPos = model.evaluateProtocol({ ...r25, change_7d: 30 }, vp.pFit, vp.oFit, radar.calibration);
  assert.ok(gNeg.launchOdds < gZero.launchOdds && gZero.launchOdds < gPos.launchOdds, 'R25 odds monotonic in 7d growth');
  assert.ok(gNeg.implied < gZero.implied && gZero.implied < gPos.implied, 'R25 implied value monotonic in 7d growth');

  const boardBySlug = new Map(board.map((r) => [r.slug, r]));
  const snapBySlug = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  for (const r of radar.rows) {
    const b = boardBySlug.get(r.slug)!;
    const v = model.evaluateProtocol(r, vp.pFit, vp.oFit, radar.calibration);
    assert.equal(v.valueIfLaunched, r.value_if_launched_usd, r.slug);
    assert.equal(v.launchOdds, r.launch_odds, r.slug);
    assert.equal(v.implied, r.implied_value_usd, r.slug);

    const ft = model.buildFarmPlan(r, radar.calibration);
    assert.equal(ft.deposit_usd, r.farm_econ.deposit_usd, r.slug);
    assert.equal(ft.total_fees_usd, r.farm_econ.total_fees_usd, r.slug);
    assert.equal(ft.total_minutes, r.farm_econ.total_minutes, r.slug);
    assert.equal(ft.verdict, r.farm_econ.verdict, r.slug);
    assert.equal(ft.net_of_fees_usd, r.farm_econ.net_of_fees_usd, r.slug);
    assert.equal(ft.net_per_hour, r.farm_econ.net_per_hour, r.slug);
    assert.equal(ft.break_even_odds, r.farm_econ.break_even_odds, r.slug);
    assert.equal(ft.items.length, 8, r.slug);
    assert.ok(b.farm_steps.every((s, idx) => s.startsWith(`${ft.items[idx]!.phase}:`)), r.slug);

    const custTs = buildFarmEconomicsAndPlan(
      snapBySlug.get(r.slug)!,
      r.implied_value_usd,
      r.launch_odds,
      r.farm_econ.risk_tags,
      r.sibling_symbol,
      radar.calibration.snapshot_7d_p05,
      10000,
      0.08,
      8,
    ).econ;
    const custJs = model.buildFarmPlan(r, radar.calibration, 10000, 0.08, 8);
    assert.ok(Math.abs(custJs.net_of_fees_usd - custTs.net_of_fees_usd) <= 0.011, r.slug);
    assert.ok(Math.abs(custJs.net_per_hour - custTs.net_per_hour) <= 0.011, r.slug);
  }
});

test('End-to-end 2-run SHA-256 determinism and gate caps (zero URL, zero xmlns, maxLine<=160, zero truncation)', () => {
  const dash = validateDashboardDir(join(repoRoot, 'dashboard'));
  assert.ok(dash.totalBytes <= 60_500, `dashboard total=${dash.totalBytes}`);
  const meth = readFileSync(join(repoRoot, 'dashboard/00_methodology.md'), 'utf8');
  assert.ok(!/>=\s*\$1B/i.test(meth), '00_methodology.md must not claim >=$1B threshold for EXT tier');
  for (const f of ['00_methodology.md', '01_model.js', '02_app.js', '03_styles.css', 'index.html']) {
    const txt = readFileSync(join(repoRoot, 'dashboard', f), 'utf8');
    assert.ok(!/https?:\/\//i.test(txt), `external URL in ${f}`);
    assert.ok(!/xmlns\s*=/i.test(txt), `xmlns= in ${f}`);
    const maxLine = txt.split(/\r?\n/).reduce((m, l) => Math.max(m, l.length), 0);
    assert.ok(maxLine <= 160, `${f} maxLine=${maxLine} > 160`);
  }

  const outA = mkdtempSync(join(tmpdir(), 'radar7-a-'));
  const outB = mkdtempSync(join(tmpdir(), 'radar7-b-'));
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
    assert.ok(info.bytes <= 1_250_000, `dossier bytes=${info.bytes}`);
    for (const shot of ['1-board.jpg', '2-detail.jpg', '3-filtered.jpg', '4-audit.jpg']) {
      const sBuf = readFileSync(join(repoRoot, 'screenshots', shot));
      assert.equal(sBuf[0], 0xff);
      assert.equal(sBuf[1], 0xd8);
      assert.ok(statSync(join(repoRoot, 'screenshots', shot)).size <= 524_288);
    }
  } finally {
    rmSync(outA, { recursive: true, force: true });
    rmSync(outB, { recursive: true, force: true });
  }
});
