'use strict';
(() => {
const radarData = window.RADAR, radarModel = window.RADAR_MODEL;
if (!radarData || !radarModel) { document.getElementById('app').textContent = 'Missing RADAR'; return; }

const parity = radarModel.verifyBoardParity(radarData);
const { rows, ledger, calibration: cal, summary, live_comparables: comps,
  set_aside: aside, model_version: ver, as_of: asOf, floor_usd: floorUsd } = radarData;
const pm = cal.price_model, om = cal.odds_model, scs = pm.sector_conformal_scales || {};

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v)), r2 = (n) => Math.round(n * 100) / 100;
  const f1 = (x) => x.toFixed(1), f2 = (x) => x.toFixed(2), f3 = (x) => x.toFixed(3);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const usd = (n) => {
    const a = Math.abs(n), s = n < 0 ? '-' : '';
    return a >= 1e9 ? `${s}$${f2(a / 1e9)}B` : a >= 1e6 ? `${s}$${(a / 1e6).toFixed(a >= 100e6 ? 0 : 1)}M`
      : a >= 1e3 ? `${s}$${(a / 1e3).toFixed(a >= 100e3 ? 0 : 1)}k` : `${s}$${a.toFixed(a < 100 ? 2 : 0)}`;
  };
  const sUsd = (n) => `${n > 0 ? '+' : ''}${usd(n)}`, fPct = (p) => (p == null ? '—' : `${p > 0 ? '+' : ''}${f1(p)}%`);
  const fAge = (d) => (d == null ? 'legacy' : d >= 365 ? `${f1(d / 365)}y` : `${d}d`);
  const p0 = (x) => `${(x * 100).toFixed(0)}%`, p1 = (x) => `${f1(x * 100)}%`;
  const el = (t, c, b) => `<${t}${c ? ` class="${c}"` : ''}>${b}</${t}>`;
  const div = (c, b) => el('div', c, b), sp = (c, b) => el('span', c, b);
  const tr = (cs, a = '') => `<tr${a}>${cs.join('')}</tr>`, td = (v, c = '') => el('td', c, v);
  const tdN = (v, c = '') => td(v, c ? `num ${c}` : 'num');
  const card = (t, r, b) => el('section', 'card', div('card-head', `<span>${t}</span>${sp('mono', r)}`) + b);
  const tbl = (c, cols, b) => `<table class="${c}"><thead><tr>${cols.map((x) =>
    (x[0] === '#' ? `<th class="num">${x.slice(1)}</th>` : `<th>${x}</th>`)).join('')}</tr></thead><tbody>${b}</tbody></table>`;
  const bdg = (c, t) => sp(`badge ${c}`, t);
  const tierB = (t) => bdg(t === 'watchlist' ? 'b-wl' : t === 'large-cap' ? 'b-ext' : 'b-early',
    t === 'watchlist' ? 'Watchlist' : t === 'large-cap' ? 'Extended' : 'Early');
  const verdB = (v) => bdg(v === 'FARM' ? 'b-farm' : v === 'MARGINAL' ? 'b-marg' : 'b-skip', v === 'MARGINAL' ? 'MARG' : v);
  const missB = (m, d = '') => bdg(m <= 3 ? 'b-farm' : 'b-marg', `×${f2(m)}${d ? ` ${d}` : ''}`);
  const opt = (v, l, sel) => `<option value="${esc(v)}"${sel ? ' selected' : ''}>${l}</option>`;
  const hdrBar = (l, r) => el('header', 'masthead', div('mast-left', l) + div('grp', r));

  const DEF = { tab: 'board', verdict: 'all', tier: 'all', cat: 'all', chain: 'all', q: '', sort: 'rank', dir: 'asc',
    dep: 0, drop: cal.default_drop_share, wk: cal.default_horizon_weeks, p: null, open: null, proof: false };
  const st = { ...DEF };

  function readHash() {
    Object.assign(st, DEF);
    const raw = (location.hash || '').replace(/^#/, '');
    if (!raw) return;
    const qp = new URLSearchParams(raw), tab = qp.get('tab');
    if (tab === 'comps' || tab === 'aside') st.tab = tab;
    for (const k of ['verdict', 'tier', 'cat', 'chain', 'q', 'sort', 'p', 'open']) if (qp.get(k)) st[k] = qp.get(k);
    if (qp.get('dir') === 'desc' || qp.get('dir') === 'asc') st.dir = qp.get('dir');
    if (qp.get('dep')) st.dep = Number(qp.get('dep')) || 0;
    if (qp.get('drop')) st.drop = Number(qp.get('drop')) || cal.default_drop_share;
    if (qp.get('wk')) st.wk = Number(qp.get('wk')) || cal.default_horizon_weeks;
  }

  function writeHash() {
    const qp = new URLSearchParams();
    if (st.p) qp.set('p', st.p);
    else {
      if (st.tab !== 'board') qp.set('tab', st.tab);
      for (const k of ['verdict', 'tier', 'cat', 'chain', 'q', 'open']) if (st[k] && st[k] !== 'all') qp.set(k, st[k]);
      if (st.sort !== 'rank') qp.set('sort', st.sort);
      if (st.dir !== 'asc') qp.set('dir', st.dir);
    }
    if (st.dep) qp.set('dep', String(st.dep));
    if (Math.abs(st.drop - cal.default_drop_share) > 1e-6) qp.set('drop', String(st.drop));
    if (st.wk !== cal.default_horizon_weeks) qp.set('wk', String(st.wk));
    const h = qp.toString();
    history.replaceState(null, '', h ? `#${h}` : location.pathname + location.search);
  }

  const isDef = () => st.dep === 0 && Math.abs(st.drop - cal.default_drop_share) < 1e-6 && st.wk === cal.default_horizon_weeks;
  const isCover = () => st.verdict === 'all' && st.tier === 'all' && st.cat === 'all' && st.chain === 'all' &&
    !st.q.trim() && !st.open && st.sort === 'rank' && st.dir === 'asc' && isDef();
  const getPlan = (row) => radarModel.farmPlan(row, cal, st.dep > 0 ? st.dep : null, st.drop, st.wk);

function scatterSvg(hiRow, hPx = 156) {
  const [w, L, R, T, B, x0, x1, y0, y1] = [500, 40, 12, 10, 20, 6.7, 10.6, 5.4, 10.7];
  const px = (x) => f1(L + ((clamp(x, x0, x1) - x0) / (x1 - x0)) * (w - L - R));
  const py = (y) => f1(hPx - B - ((clamp(y, y0, y1) - y0) / (y1 - y0)) * (hPx - T - B));
  const f10 = (t, q = 0) => (Math.log(pm.ref_tvl_usd) + pm.intercept + pm.beta_tvl * Math.log(t / pm.ref_tvl_usd) + q) / Math.LN10;
  const tA = 10 ** x0, tB = 10 ** x1;
  const poly = [`${px(x0)},${py(f10(tA, pm.q75_log))}`, `${px(x1)},${py(f10(tB, pm.q75_log))}`,
    `${px(x1)},${py(f10(tB, pm.q25_log))}`, `${px(x0)},${py(f10(tA, pm.q25_log))}`].join(' ');
  const dot = (x, y, rad) => `<circle cx="${px(Math.log10(x))}" cy="${py(Math.log10(y))}" r="${rad}"/>`;
  const cD = comps.map((c) => dot(c.tvl_usd, c.mcap_usd, 2.6)).join('');
  const bD = rows.slice(0, 90).map((r) => dot(r.tvl_usd, r.value_if_launched_usd, 2.0)).join('');
  const yG = [[6, '$1M'], [7, '$10M'], [8, '$100M'], [9, '$1B'], [10, '$10B']].map(([v, l]) =>
    `<line x1="${L}" y1="${py(v)}" x2="${w - R}" y2="${py(v)}" stroke="#162b3e"/>` +
    `<text x="${L - 5}" y="${f1(+py(v) + 3)}" text-anchor="end">${l}</text>`).join('');
  const xT = [[7, '$10M'], [8, '$100M'], [9, '$1B'], [10, '$10B']].map(([v, l]) =>
    `<text x="${px(v)}" y="${hPx - 5}" text-anchor="middle">${l}</text>`).join('');
  const hiC = hiRow ? `<circle cx="${px(Math.log10(hiRow.tvl_usd))}" ` +
    `cy="${py(Math.log10(hiRow.value_if_launched_usd))}" r="5.5" fill="#f59e0b" stroke="#fff" stroke-width="1.8"/>` : '';
  return `<svg class="scatter-svg" style="height:${hPx}px" viewBox="0 0 ${w} ${hPx}"><g>${yG}${xT}</g>` +
    `<polygon points="${poly}" fill="#10b981" fill-opacity=".16"/>` +
    `<line x1="${px(x0)}" y1="${py(f10(tA))}" x2="${px(x1)}" y2="${py(f10(tB))}" stroke="#10b981" stroke-width="2"/>` +
    `<g fill="#22d3ee" fill-opacity=".78">${cD}</g><g fill="#818cf8" fill-opacity=".55">${bD}</g>${hiC}</svg>`;
}
const cats = Array.from(new Set(rows.map((r) => r.category || 'Uncategorized'))).sort(), chF = new Map();
for (const r of rows) chF.set(r.farm_econ.best_chain, (chF.get(r.farm_econ.best_chain) || 0) + 1);
const chains = Array.from(chF.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([c]) => c);
const impMax = Math.max(...rows.map((r) => r.implied_high_usd)), impMin = Math.min(...rows.map((r) => r.implied_low_usd));
const bandPct = (v) => clamp(((Math.log10(Math.max(impMin, v)) - Math.log10(impMin)) /
  (Math.log10(impMax) - Math.log10(impMin))) * 100, 0, 100);
const SKEYS = { rank: (x) => x.row.rank, name: (x) => x.row.name, tvl: (x) => x.row.tvl_usd,
  g7d: (x) => x.row.change_7d ?? -999, age: (x) => x.row.age_days ?? 99999, odds: (x) => x.row.launch_odds,
  val: (x) => x.row.value_if_launched_usd, implied: (x) => x.row.implied_value_usd,
  net: (x) => x.plan.excess_after_carry_usd, netHr: (x) => x.plan.excess_per_hour };
function getFiltered() {
  const all = rows.map((row) => ({ row, plan: getPlan(row) }));
  let farmN = 0, margN = 0, skipN = 0;
  for (const x of all) if (x.plan.verdict === 'FARM') farmN++; else if (x.plan.verdict === 'MARGINAL') margN++; else skipN++;
  const ql = st.q.trim().toLowerCase(), mult = st.dir === 'asc' ? 1 : -1, fn = SKEYS[st.sort] || SKEYS.rank;
  const out = all.filter(({ row, plan }) => (st.verdict === 'all' || plan.verdict === st.verdict) &&
    (st.tier === 'all' || row.tier === st.tier) && (st.cat === 'all' || (row.category || 'Uncategorized') === st.cat) &&
    (st.chain === 'all' || row.chains.includes(st.chain) || plan.best_chain === st.chain) &&
    (!ql || `${row.name} ${row.slug} ${row.category || ''} ${row.chains.join(' ')}`.toLowerCase().includes(ql)));
  out.sort((a, b) => {
    const va = fn(a), vb = fn(b);
    return (typeof va === 'string' ? va.localeCompare(vb) : va - vb) * mult || a.row.rank - b.row.rank;
  });
  return { out, farmN, margN, skipN };
}

function renderStepsTable(plan) {
  const body = plan.items.map((it, i) => tr([
    td(sp('step-num', i + 1) + sp('step-when', esc(it.when || it.phase))),
    td(esc(it.action)), tdN(esc(it.cost_label)), tdN(esc(it.time_label)),
  ])).join('');
  const sg = plan.excess_after_carry_usd >= 0 ? '+' : '', fc = plan.excess_after_carry_usd > 0 ? 'pos' : 'neg';
  const foot = div('all-in-bar',
    `<span>All in: 8 steps / ${plan.horizon_weeks}w on ${usd(plan.deposit_usd)} — ` +
      `$${plan.total_fees_usd.toFixed(2)} fee + $${plan.tbill_hurdle_usd.toFixed(2)} carry vs ` +
      `$${plan.modelled_drop_usd.toFixed(2)} drop = ` +
      `<b class="${fc}">${sg}$${plan.excess_after_carry_usd.toFixed(2)} (${sg}$${plan.excess_per_hour.toFixed(2)}/h)</b></span>` +
      sp('mono', `$${plan.total_fees_usd.toFixed(2)} fees · ${f1(plan.total_hours)}h`));
  return tbl('steps-tbl', ['When', 'Operator Step', '#Cost', '#Time'], body) + foot;
}

function renderHeader() {
  const tb = (id, lb) => `<button class="btn${st.tab === id ? ' active' : ''}" data-tab="${id}">${lb}</button>`;
  return hdrBar(
    `<h1 class="brand">Sonar</h1>${sp('ver-pill', `${esc(ver)} · CRC ${esc(cal.board_checksum)}`)}` +
      sp('subtitle', `${esc(asOf)} · WL >=${usd(floorUsd)} · Browser Refit · Offline`),
    `${tb('board', `Board (${rows.length})`)}${tb('comps', `Comps (${comps.length})`)}${tb('aside', `Aside (${aside.length})`)}`,
  );
}

function renderCoverAudit(farmN, margN, skipN) {
  const rwaSc = f2(scs['RWA, Payments & Insurance'] || 0.7), crSc = f2(scs['Credit & Stablecoins'] || 1.34);
  const kpis = [
    ['Walk-Forward Miss', `×${f2(pm.wf_miss)}`,
      `vs ×${f2(pm.flat_wf_miss)} flat; LOO ×${f2(pm.loo_miss)}, 10F ×${f2(pm.cv10_miss)}`, 'cy'],
    ['Range Honesty', `${p0(pm.cov50_wf)} · ${p0(pm.cov80_wf)}`,
      'held-out caps in P25–P75 & P10–P90', ''],
    ['Token Odds (Brier)', `${f3(om.wf_brier)}`,
      `WF vs ${f3(om.base_wf_brier)} base; 10F ${f3(om.cv10_brier)} (${p1(om.cv10_acc)})`, 'pos'],
    ['Worth Farming ($25/h)', `${farmN} of ${rows.length}`,
      `beats fees+2% carry; ${margN} marg, ${skipN} skip`, 'pos'],
    ['Watchlist & Universe', `${ledger.watchlist} / ${ledger.watchlist}`,
      `plus ${ledger.large_cap + ledger.early} clean pre-token (${ledger.total})`, ''],
    ['Sector Conformal', `${cal.n_bootstrap} refits`,
      `RWA ×${rwaSc} tighter · Credit ×${crSc} wider`, ''],
  ].map(([l, v, n, c]) => div('kpi', div('kpi-lbl', l) + div(`kpi-val ${c}`, v) + div('kpi-note', n))).join('');

  const fn = (t) => sp('fn-tag', t);
  const eqBan = div('eq-strip',
    `<span><b>Implied</b> = <b>Value if launched</b> ` +
      sp('mono', `($100M×${f3(Math.exp(pm.intercept))}×(TVL/$100M)^${f3(pm.beta_tvl)}×cat_k64)`) +
      ` × <b>Odds</b> ${sp('mono', 'P(age,sec,TVL,7d)')}. Refitted &amp; planned in browser.</span>` +
      sp('grp', fn('impliedValue()') + fn('farmPlan()') + fn('ledgerOf()') + fn('verifyBoardParity()')));

  const segs = [
    ['Watchlist', ledger.watchlist, '#22d3ee'], ['Extended', ledger.large_cap, '#c084fc'],
    ['Early', ledger.early, '#10b981'], ['Traded comps', ledger.priced_comps, '#38bdf8'],
    ['Tokenized', ledger.other_tokenized, '#64748b'], ['Bridges', ledger.excl_bridges, '#475569'],
    ['LST / BTC', ledger.excl_lst_btc, '#f59e0b'], ['CEX / Sibling', ledger.excl_cex_ver_sib, '#f43f5e'],
  ];
  const bar = segs.map(([, n, c]) => `<div style="width:${(n / ledger.total) * 100}%;background:${c}"></div>`).join('');
  const leg = segs.map(([l, n, c]) => `<span><i class="dot" style="background:${c}"></i>${l} <b>${n}</b></span>`).join('');
  const pill = (ok, l) => div(`pill ${ok ? 'ok' : 'warn'}`, `${ok ? '✓' : '!'} ${l}`);
  const pills6 = div('pills-6', [
    pill(parity.mismatches === 0 && parity.farmMismatches === 0, `table = board (${rows.length}/${rows.length})`),
    pill(parity.monoOk, `ranks 1–${rows.length} monotonic`),
    pill(parity.totalExactOk, `total: ${usd(parity.recomputedTotal)}`),
    pill(parity.checksumOk, `CRC ${esc(parity.checksum)}`),
    pill(parity.wlOk, 'WL 40 / 40 covered'),
    pill(parity.ledgerOk, `ledger ${parity.ledgerSum}/${ledger.total}`),
  ].join(''));

  const gCls = (s) => (s === 'kept' ? 'g-kept' : s === 'tested_not_kept' ? 'g-drop' : '');
  const gTxt = (s) => (s === 'tested_not_kept' ? 'drop' : esc(s));
  const s1 = pm.ablation.map((a) => tr([td(esc(a.step)), tdN(`×${f2(a.loo_miss)}`), tdN(`×${f2(a.wf_miss)}`),
    tdN(`${p0(a.loo_w3x)}/${p0(a.wf_w3x)}`), td(gTxt(a.status), gCls(a.status))])).join('');
  const s2 = om.ablation.map((a) => tr([td(esc(a.step)), tdN(f3(a.cv10_brier)), tdN(f3(a.wf_brier)),
    tdN(`${p1(a.cv10_acc)}/${p1(a.wf_acc)}`), td(gTxt(a.status), gCls(a.status))])).join('');
  const cov = [
    tr([td('Within ×3'), tdN('—'), tdN(p0(pm.within3x_loo)), tdN(p0(pm.within3x_wf))]),
    tr([td('P25–P75'), tdN('50%'), tdN(p0(pm.cov50_loo)), tdN(p0(pm.cov50_wf))]),
    tr([td('P10–P90'), tdN('80%'), tdN(p0(pm.cov80_loo)), tdN(p0(pm.cov80_wf))]),
  ].join('');
  const chips = Object.entries(scs).map(([sec, sc]) =>
    sp('sec-chip', `${esc(sec.split(/[, ]/)[0])} <b>×${f2(sc)}</b>`)).join('');

  return [
    div('kpi-row', kpis), eqBan,
    card(`Protocol Accounting (${ledger.total} / ${ledger.total} MECE)`,
      `${summary.board_size} ranked · ${comps.length} comps`,
      div('mece-bar', bar) + div('mece-leg', leg) + pills6),
    '<section class="evidence-4">' +
      card(`Stage 1 · Value (n=${pm.n_comps})`, `WF>=${esc(pm.wf_cutoff)}`,
        tbl('mini-tbl', ['Spec', '#LOO', '#WF', '#<=3x', 'Gate'], s1) +
        div('subline', `4-Way: 10F ×${f2(pm.cv10_miss)}·>=$50M ×${f2(pm.size_split_miss)}`)) +
      card(`Stage 2 · Odds (n=${om.n_peers})`, `WF>=${esc(pm.wf_cutoff)}`,
        tbl('mini-tbl', ['Features', '#10F', '#WF', '#Acc', 'Gate'], s2) +
        div('subline', `age +${f3(om.beta_age)}±${f3(om.beta_age_se)}·leg +${f3(om.beta_legacy)}`)) +
      card('Range &amp; Sector Scales', 'LOO/WF',
        tbl('mini-tbl', ['Target', '#Nom', '#LOO', '#WF'], cov) + div('sec-chips', chips) +
        div('subline', `α=${f3(pm.intercept)}±${f3(pm.intercept_se)}, β=${f3(pm.beta_tvl)}±${f3(pm.beta_tvl_se)}`)) +
      card(`Market Cap vs TVL (${pm.n_comps} Comps)`,
        '<span class="cy">●</span>Comps <span class="in">●</span>Board <span class="pos">—</span>Fit',
        scatterSvg(null, 156)) + '</section>',
    div('reading-note',
      '<b>Reading it:</b> Log-TVL &amp; ridge k=64 cut WF ×5.16→×2.67 (4-way OOS; 7d, age &amp; chains fail). Age, ' +
      'sector, TVL &amp; 7d predict odds (0.234 WF Brier). Records no token ≠ none exists; peers, not forecast.'),
  ].join('');
}

function renderFilterStrip(out) {
  const famM = new Map(), exH = out.map((x) => x.plan.excess_per_hour), deps = out.map((x) => x.plan.deposit_usd);
  for (const { plan } of out) {
    if (!famM.has(plan.chain_family)) famM.set(plan.chain_family, []);
    famM.get(plan.chain_family).push(plan.excess_per_hour);
  }
  const chips = [...famM.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 6)
    .map(([f, arr]) => sp('sec-chip', `${esc(f)} <b>${arr.length}</b> (${sUsd(radarModel.median(arr))}/h)`)).join('');
  return div('eq-strip', `<span><b>Filtered:</b> ${out.length}/${rows.length} · Med Excess ` +
    `<b class="pos">${sUsd(radarModel.median(exH))}/h</b> · Med Dep <b>${usd(radarModel.median(deps))}</b></span>` +
    sp('grp', `${chips}<button class="btn btn-sm" id="b-proof">${st.proof ? 'Hide Proof' : 'Show Proof'}</button>`));
}

function renderBoardView() {
  const { out, farmN, margN, skipN } = getFiltered();
  const topBlock = (isCover() || st.proof) ? renderCoverAudit(farmN, margN, skipN) : renderFilterStrip(out);

  const th = (id, l, c = '') => `<th data-sort="${id}" class="${c}${st.sort === id ? ' sort' : ''}">` +
    `${l}${st.sort === id ? (st.dir === 'asc' ? ' ▲' : ' ▼') : ''}</th>`;
  const thead = `<tr>${[
    th('rank', '# · Band'), th('name', 'Protocol · Category · Chain'), th('tvl', 'TVL', 'num'),
    th('g7d', '7d', 'num'), th('age', 'No-Token', 'num'), th('odds', 'Odds', 'num'),
    th('val', 'If Launched', 'num'), th('implied', 'Implied · Sector P25–P75', 'num'),
    th('net', 'Verdict · Excess', 'num'), th('netHr', 'Excess/Hr', 'num'), '<th>Plan</th>',
  ].join('')}</tr>`;

  const tbody = out.map(({ row, plan }) => {
    const lp = f1(bandPct(row.implied_low_usd)), hp = f1(bandPct(row.implied_high_usd));
    const mp = f1(bandPct(row.implied_value_usd)), wp = f1(Math.max(4, Number(hp) - Number(lp)));
    const sc = scs[row.sector] || 1;
    const note = plan.verdict === 'SKIP' && row.tvl_usd >= 500e6
      ? `whale cap · carry ${usd(plan.tbill_hurdle_usd)}`
      : `net ${sUsd(plan.net_of_fees_usd)} · ${usd(plan.deposit_usd)}`;
    const sib = row.sibling_symbol ? ` ${bdg('b-warn', `SIB:${esc(row.sibling_symbol)}`)}` : '';
    const g7c = row.change_7d == null ? '' : row.change_7d >= 0 ? 'pos' : 'neg';
    const exCls = plan.excess_after_carry_usd > 0 ? 'pos' : 'neg';
    const hrCls = plan.excess_per_hour >= cal.farm_hourly_hurdle && plan.verdict === 'FARM' ? 'pos'
      : plan.excess_per_hour <= 0 ? 'neg' : '';
    const isOpen = st.open === row.slug;
    const rHtml = tr([
      td(`<b>${row.rank}</b><small>${row.rank_low}–${row.rank_high}</small>`, 'mono'),
      td(div('pname', `${esc(row.name)} ${tierB(row.tier)}${sib}`) +
        div('pmeta', `${esc(row.category || 'Uncat')} · ${esc(plan.best_chain)} (${esc(plan.family_label)})`)),
      tdN(usd(row.tvl_usd)), tdN(fPct(row.change_7d), g7c), tdN(fAge(row.age_days)),
      tdN(`${p1(row.launch_odds)}${div('pbar', `<div class="pfill" style="width:${p1(row.launch_odds)}"></div>`)}`),
      tdN(usd(row.value_if_launched_usd)),
      tdN(`<b>${usd(row.implied_value_usd)}</b>` +
        `<small>${usd(row.implied_low_usd)}–${usd(row.implied_high_usd)} (×${f2(sc)})</small>` +
        div('rbar', `<div class="rrange" style="left:${lp}%;width:${wp}%"></div><div class="rmark" style="left:${mp}%"></div>`)),
      tdN(`${verdB(plan.verdict)} ${sp(exCls, sUsd(plan.excess_after_carry_usd))}<small>${note}</small>`),
      tdN(`<b class="${hrCls}">${sUsd(plan.excess_per_hour)}/h</b><small>${f1(plan.total_hours)}h/${plan.horizon_weeks}w</small>`),
      td(`<button class="btn btn-sm plan-btn${isOpen ? ' active' : ''}" data-open="${esc(row.slug)}">` +
        `${isOpen ? 'Hide' : '8 steps'}</button>`),
    ], ` class="row-main${isOpen ? ' open-row' : ''}" data-slug="${esc(row.slug)}"`);
    if (!isOpen) return rHtml;
    return rHtml + `<tr class="drawer-row"><td colspan="11" class="drawer-cell">` +
      div('card-head', `<span>${esc(row.name)} · Farm Plan (${esc(plan.best_chain)})</span>` +
        '<span class="mono">farmPlan()</span>') + renderStepsTable(plan) + '</td></tr>';
  }).join('');

  const vBtn = (v, c, l) => `<button class="btn ${c}${st.verdict === v ? ' active' : ''}" data-verdict="${v}">${l}</button>`;
  const sel = (id, allL, items, cur) => `<select id="${id}">${opt('all', allL, cur === 'all')}` +
    items.map((x) => opt(x[0], x[1], cur === x[0])).join('') + '</select>';
  const acts = '<button class="btn" id="b-rst">Reset</button><button class="btn" id="b-csv">CSV</button>' +
    '<button class="btn" id="b-json">JSON</button>';
  return [
    topBlock,
    `<section class="toolbar"><div class="grp"><span class="lbl-s">Verdict</span>` +
      vBtn('all', '', `All (${rows.length})`) + vBtn('FARM', 'green', `FARM (${farmN})`) +
      vBtn('MARGINAL', 'amber', `MARG (${margN})`) + vBtn('SKIP', 'crimson', `SKIP (${skipN})`) +
      sel('f-tier', 'Tier', [['watchlist', `WL (${summary.watchlist_size})`],
        ['large-cap', `EXT (${summary.large_cap_size})`], ['early', `Early (${summary.early_size})`]], st.tier) +
      sel('f-cat', `Cat (${cats.length})`, cats.map((c) => [c, esc(c)]), st.cat) +
      sel('f-chain', `Chain (${chains.length})`, chains.map((c) => [c, esc(c)]), st.chain) +
      `<input id="f-q" type="search" value="${esc(st.q)}" placeholder="Filter..." /></div><div class="grp">` +
      `<select id="s-dep">${opt(0, 'Plan Dep', st.dep === 0)}` +
      `${[2500, 5000, 10000, 25000, 50000].map((v) => opt(v, usd(v), st.dep === v)).join('')}</select>` +
      sp('lbl-s', `Drop ${p0(st.drop)}`) +
      `<input id="s-drop" type="range" min="3" max="15" step="1" value="${Math.round(st.drop * 100)}" />` +
      sp('lbl-s', `${st.wk}w`) + `<input id="s-wk" type="range" min="4" max="24" step="2" value="${st.wk}" />` +
      acts + '</div></section>',
    div('tbl-wrap', `<table class="tbl"><thead>${thead}</thead><tbody>` +
      `${tbody || '<tr><td colspan="11" class="empty">No matching rows.</td></tr>'}</tbody></table>`),
    el('footer', 'foot-note', `<span>${out.length} ranked · Click 8 steps or row</span><span>${esc(asOf)} · Offline</span>`),
  ].join('');
}

const subTbl = (t, ph, n, cols, b) => div('toolbar',
  div('grp', sp('lbl-s', t) + `<input id="f-q" type="search" value="${esc(st.q)}" placeholder="${ph}" />`) +
  sp('subtitle', n)) + div('tbl-wrap', tbl('tbl', cols, b));

function renderCompsView() {
  const ql = st.q.trim().toLowerCase();
  const list = comps.filter((c) => !ql || `${c.name} ${c.symbol} ${c.category}`.toLowerCase().includes(ql));
  const body = list.map((c) => tr([td(`<b>${esc(c.symbol)}</b>`, 'mono'),
    td(div('pname', esc(c.name)) + div('pmeta', `${esc(c.category)} · ${esc(c.chains.slice(0, 3).join(', '))}`)),
    tdN(usd(c.tvl_usd)), tdN(fPct(c.change_7d), c.change_7d == null ? '' : c.change_7d >= 0 ? 'pos' : 'neg'),
    tdN(fAge(c.age_days)), tdN(`${f2(c.ratio)}×`), tdN(usd(c.loo_pred_usd)),
    tdN(`<b>${usd(c.mcap_usd)}</b>`), tdN(missB(c.loo_miss)), tdN(c.loo_dir),
  ])).join('');
  return subTbl('Traded Comps (mcap > 0)', 'Filter...', `${list.length}/${comps.length}`,
    ['Sym', 'Protocol · Cat · Chains', '#TVL', '#7d', '#Age', '#M/T', '#LOO', '#MCap', '#Miss', '#Dir'], body);
}

function renderSetAsideView() {
  const ql = st.q.trim().toLowerCase();
  const list = aside.filter((x) => !ql || `${x.name} ${x.slug} ${x.category} ${x.reason}`.toLowerCase().includes(ql));
  const body = list.map((x) => tr([td(esc(x.slug), 'mono'), td(esc(x.name), 'pname'), td(esc(x.category)),
    tdN(usd(x.tvl_usd)), td(bdg('b-warn', esc(x.reason)))])).join('');
  return subTbl('MECE Excluded', 'Filter...', `${list.length}/${aside.length}`, ['Slug', 'Name', 'Cat', '#TVL', 'Reason'], body);
}

function renderDetailView(slug) {
  const idx = rows.findIndex((r) => r.slug === slug);
  const row = rows[idx >= 0 ? idx : 0], plan = getPlan(row), cat = row.category || 'Uncategorized';
  const ev = radarModel.impliedValue(row, parity.pFit, parity.oFit, cal);
  const shEval = (patch) => radarModel.impliedValue({ ...row, ...patch }, parity.pFit, parity.oFit, cal);
  const shocks = [
    [`TVL −30% (${usd(row.tvl_usd * 0.7)})`, shEval({ tvl_usd: row.tvl_usd * 0.7 })],
    ['7-day TVL growth +25%', shEval({ change_7d: 25 })],
    ['7-day TVL growth −20%', shEval({ change_7d: -20 })],
    ['Still no token +6 months', shEval({ age_days: (row.age_days == null ? om.median_age_years * 365 : row.age_days) + 182 })],
  ].map(([l, sh]) => {
    const d = ((sh.implied / row.implied_value_usd) - 1) * 100;
    const cls = d >= 0.05 ? 'pos' : d <= -0.05 ? 'neg' : '';
    return tr([td(l), tdN(p1(sh.launchOdds)), tdN(usd(sh.implied)), tdN(fPct(d), cls)]);
  }).join('');

  const peers = comps.slice().sort((a, b) =>
    ((a.category || 'Uncat') === cat ? 0 : 1) - ((b.category || 'Uncat') === cat ? 0 : 1) ||
    Math.abs(Math.log(a.tvl_usd / row.tvl_usd)) - Math.abs(Math.log(b.tvl_usd / row.tvl_usd))).slice(0, 6);
  const depCols = [2500, 10000, 25000];
  if (!depCols.includes(plan.deposit_usd)) depCols[1] = plan.deposit_usd;
  depCols.sort((a, b) => a - b);

  const mxRows = [0.05, 0.10, 0.15].map((ds) => tr([td(`${p0(ds)} drop`), ...depCols.map((dp) => {
    const carry = r2(dp * cal.tbill_apr * (plan.horizon_weeks / 52));
    const ex = r2(row.implied_value_usd * ds * (dp / (row.tvl_usd + dp)) - plan.total_fees_usd - carry);
    return td(sUsd(ex), ex > 0 && ex / Math.max(0.25, plan.total_hours) >= cal.farm_hourly_hurdle ? 'pos'
      : ex > 0 ? '' : 'neg');
  })])).join('');
  const wkSens = [4, 8, 12, 24].map((wk) => {
    const alt = radarModel.farmPlan(row, cal, plan.deposit_usd, plan.drop_share, wk);
    const c = alt.verdict === 'FARM' ? 'pos' : alt.excess_after_carry_usd > 0 ? '' : 'neg';
    return `<span>${wk}w: <b class="${c}">${sUsd(alt.excess_after_carry_usd)}</b> (${sUsd(alt.excess_per_hour)}/h)</span>`;
  }).join(' · ');
  const prevS = rows[(idx - 1 + rows.length) % rows.length].slug, nextS = rows[(idx + 1) % rows.length].slug;

  const eqBox = [
    [`Base @ $100M (exp(${f3(pm.intercept)}))`, `×${f3(ev.baseMult)}`, ''],
    [`Size ((TVL/$100M)^${f3(pm.beta_tvl)})`, `×${f3(ev.sizeMult)}`, ''],
    [`Cat: ${esc(cat)} (k=${pm.cat_ridge_k})`, `×${f3(ev.catMult)}`, ''],
    ['= Value if launched', usd(row.value_if_launched_usd), 'tot'],
    [`× Odds (${p0(ev.pNow)}→${p0(ev.pMax)}${row.sibling_symbol ? ' ×.5' : ''})`, `${f2(row.launch_odds * 100)}%`, ''],
    [`= Implied (#${row.rank}, ${row.rank_low}–${row.rank_high}; ×${f2(ev.sc)})`, usd(row.implied_value_usd), 'tot'],
  ].map(([l, r, c]) => div(`eq-line ${c}`, `<span>${l}</span><span>${r}</span>`)).join('');

  const benchRows = [
    tr([td(`Same deposit in 4% T-bill (${plan.horizon_weeks}w)`), tdN(usd(plan.tbill_4pct_usd))]),
    tr([td('2% carry hurdle deducted'), tdN(usd(plan.tbill_hurdle_usd))]),
    tr([td('Drop if launched (100% odds)'), tdN(usd(plan.drop_if_launched_usd))]),
    tr([td('Break-even drop share'), tdN(`${f2(plan.break_even_drop_share * 100)}%`)]),
    tr([td('Break-even token odds'), tdN(p1(plan.break_even_odds))]),
    tr([td(`Exit TVL floor (${f1(cal.snapshot_7d_p05)}% P05)`), tdN(usd(plan.exit_tvl_usd))]),
  ].join('');

  const peersHtml = peers.map((p) => tr([
    td(`<b>${esc(p.name)}</b> ${sp('pmeta', esc(p.symbol))}`), td(esc(p.category || '-')),
    tdN(usd(p.tvl_usd)), tdN(usd(p.mcap_usd)), tdN(usd(p.loo_pred_usd)), tdN(missB(p.loo_miss, p.loo_dir)),
  ])).join('');
  const vCls = plan.verdict === 'FARM' ? '' : plan.verdict === 'MARGINAL' ? 'marg' : 'skip';
  const vBan = div(`ver-box ${vCls}`, `<b>${plan.verdict}:</b> ${usd(plan.deposit_usd)}×${plan.horizon_weeks}w = ` +
    `${usd(plan.modelled_drop_usd)} (${p0(plan.drop_share)}) − ${usd(plan.total_fees_usd)} fee − ` +
    `${usd(plan.tbill_hurdle_usd)} 2% carry = <b>${sUsd(plan.excess_after_carry_usd)} (${sUsd(plan.excess_per_hour)}/h)</b>.`);
  const ecGrid = div('econ-6', [
    ['At Risk', usd(plan.deposit_usd), ''], ['Modelled Drop', usd(plan.modelled_drop_usd), ''],
    ['Fees + Carry', `${usd(plan.total_fees_usd)} + ${usd(plan.tbill_hurdle_usd)}`, ''],
    ['Excess Profit', sUsd(plan.excess_after_carry_usd), plan.excess_after_carry_usd > 0 ? 'pos' : 'neg'],
    [`Excess / Hr (${f1(plan.total_hours)}h)`, `${sUsd(plan.excess_per_hour)}/h`,
      plan.excess_per_hour >= cal.farm_hourly_hurdle ? 'pos' : plan.excess_per_hour <= 0 ? 'neg' : ''],
    ['4% T-Bill / BE', `${usd(plan.tbill_4pct_usd)} · ${f2(plan.break_even_drop_share * 100)}%`, ''],
  ].map(([l, v, c]) => div('ec', div('l', l) + div(`v ${c}`, v))).join(''));
  const exBan = div('exit-box', `<b>Exit:</b> Withdraw if TVL < <b class="mono">${usd(plan.exit_tvl_usd)}</b> ` +
    `(${f1(cal.snapshot_7d_p05)}% P05). Risks: ${esc((row.farm_econ.risk_tags || []).join(' · '))}.`);
  const mxHdr = `<thead><tr><th>Drop \\ Dep</th>${depCols.map((d) => `<th>${usd(d)}</th>`).join('')}</tr></thead>`;

  return [
    hdrBar(
      `<button class="btn" id="b-back">← Board</button>${sp('ver-pill', `#${row.rank} (${row.rank_low}–${row.rank_high})`)}` +
        el('h1', 'brand', esc(row.name)) + tierB(row.tier) +
        sp('subtitle', `${esc(cat)} · ${esc(row.chains.join(', '))} · Records no token`),
      bdg(`pill-lg ${plan.verdict === 'FARM' ? 'b-farm' : plan.verdict === 'MARGINAL' ? 'b-marg' : 'b-skip'}`,
        `${plan.verdict} · ${sUsd(plan.excess_after_carry_usd)} (${sUsd(plan.excess_per_hour)}/h)`) +
        `<button class="btn" data-nav="${esc(prevS)}">◀ Prev</button><button class="btn" data-nav="${esc(nextS)}">Next ▶</button>`,
    ),
    div('det-top', div('hero-val',
      div('card-head', `<span>Implied · ${esc(row.sector)}</span>` +
        sp('mono', `TVL ${usd(row.tvl_usd)} · 7d ${fPct(row.change_7d)} · Age ${fAge(row.age_days)}`)) +
      div('hv-flex', div('hv-num', usd(row.implied_value_usd)) +
        div('mono hv-sub', `Launch <b>${usd(row.value_if_launched_usd)}</b> · Odds <b>${p1(row.launch_odds)}</b> · ` +
          `P25–P75 <b>${usd(row.implied_low_usd)}–${usd(row.implied_high_usd)}</b> · ` +
          `P10–P90 <b>${usd(row.implied_p10_usd)}–${usd(row.implied_p90_usd)}</b>`)) +
      div('subline pos', `✓ Browser refit = board.json (CRC ${esc(parity.checksum)}) · ` +
        'Records no token (not proof none exists); odds reflect peers, not forecast.')) +
      card('Curve vs Comps', `<span class="am">●</span> ${esc(row.name)}`, scatterSvg(row, 84))),
    '<div class="det-grid"><div class="stack">',
    card(`Value Build-Up (${usd(row.implied_value_usd)})`, 'impliedValue()',
      div('eq-box', eqBox) + div('card-head', '<span>Sensitivity Shocks</span><span class="mono">±7d/TVL/Age</span>') +
      tbl('mini-tbl', ['Scenario', '#Odds', '#Implied', '#Delta'], shocks)),
    card('Nearest 6 Comps', esc(cat), tbl('mini-tbl', ['Peer', 'Cat', '#TVL', '#MCap', '#LOO', '#Miss'], peersHtml)),
    '</div><div class="stack">',
    card('Verdict &amp; Benchmarks', `${esc(plan.best_chain)} · ${esc(plan.gas_tier)}`,
      vBan + ecGrid + exBan +
      div('bench-split', `<table class="mini-tbl mx">${mxHdr}<tbody>${mxRows}</tbody></table>` +
        tbl('mini-tbl', ['Benchmark', '#Val'], benchRows)) +
      div('subline', `Horizon: ${wkSens}`)),
    card(`Farm Plan — 8 Steps (${plan.total_minutes}m/${plan.horizon_weeks}w)`, 'farmPlan()', renderStepsTable(plan)),
    '</div></div>',
  ].join('');
}

  const rootEl = document.getElementById('app');
  function renderApp() {
    writeHash();
    rootEl.innerHTML = div('wrap', st.p ? renderDetailView(st.p) : renderHeader() +
      (st.tab === 'comps' ? renderCompsView() : st.tab === 'aside' ? renderSetAsideView() : renderBoardView()));
  }
  const hit = (ev, s) => ev.target.closest && ev.target.closest(s);
  const dl = (fn, m, t) => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([t], { type: m })); a.download = fn; a.click();
  };
  rootEl.addEventListener('click', (ev) => {
    const ob = hit(ev, '[data-open]'), tab = hit(ev, '[data-tab]'), vb = hit(ev, '[data-verdict]'), sth = hit(ev, '[data-sort]');
    if (ob) { ev.stopPropagation(); st.open = st.open === ob.dataset.open ? null : ob.dataset.open; return renderApp(); }
    if (tab) { st.tab = tab.dataset.tab; renderApp(); return window.scrollTo(0, 0); }
    if (vb) { st.verdict = vb.dataset.verdict; return renderApp(); }
    if (sth) {
      const c = sth.dataset.sort;
      st.dir = st.sort === c ? (st.dir === 'asc' ? 'desc' : 'asc') : (c === 'rank' || c === 'name' || c === 'age' ? 'asc' : 'desc');
      st.sort = c; return renderApp();
    }
    const op = hit(ev, '[data-nav]') || hit(ev, 'tr[data-slug]');
    if (op) { st.p = op.dataset.nav || op.dataset.slug; renderApp(); return window.scrollTo(0, 0); }
    if (hit(ev, '#b-proof')) { st.proof = !st.proof; return renderApp(); }
    if (hit(ev, '#b-back')) { st.p = null; return renderApp(); }
    if (hit(ev, '#b-rst')) { Object.assign(st, DEF); return renderApp(); }
    if (hit(ev, '#b-csv')) {
      const h = 'rank,slug,name,tier,cat,tvl,implied,odds,verdict,excess,excess_hr';
      const ls = getFiltered().out.map(({ row: r, plan: pl }) => [r.rank, r.slug, JSON.stringify(r.name),
        r.tier, JSON.stringify(r.category || ''), r.tvl_usd, r.implied_value_usd, r.launch_odds, pl.verdict,
        pl.excess_after_carry_usd, pl.excess_per_hour].join(','));
      return dl('sonar-v2.csv', 'text/csv', [h, ...ls].join('\n'));
    }
    if (hit(ev, '#b-json')) {
      dl('sonar-v2.json', 'application/json',
        JSON.stringify(getFiltered().out.map(({ row, plan }) => ({ ...row, farm_econ: plan })), null, 2));
    }
  });
  rootEl.addEventListener('change', (ev) => {
    const m = { 'f-tier': 'tier', 'f-cat': 'cat', 'f-chain': 'chain', 's-dep': 'dep' }, k = m[ev.target.id];
    if (!k) return;
    st[k] = k === 'dep' ? Number(ev.target.value) || 0 : ev.target.value; renderApp();
  });
  rootEl.addEventListener('input', (ev) => {
    const { id, value } = ev.target;
    if (id === 's-drop') { st.drop = Number(value) / 100; return renderApp(); }
    if (id === 's-wk') { st.wk = Number(value); return renderApp(); }
    if (id === 'f-q') {
      st.q = value; renderApp();
      const nf = document.getElementById('f-q');
      if (nf) { nf.focus(); nf.setSelectionRange(nf.value.length, nf.value.length); }
    }
  });

window.addEventListener('hashchange', () => { readHash(); renderApp(); });
readHash();
renderApp();
})();
