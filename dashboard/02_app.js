'use strict';
(() => {
const rData = window.RADAR, rModel = window.RADAR_MODEL;
if (!rData || !rModel) { document.getElementById('app').textContent = 'Missing RADAR'; return; }
const parity = rModel.verifyBoardParity(rData);
const { rows, ledger: K, calibration: cal, summary: sum, live_comparables: comps,
  set_aside: aside, model_version: ver, as_of: asOf, floor_usd: flUsd } = rData;
const pm = cal.price_model, om = cal.odds_model, scs = pm.sector_conformal_scales || {};

const M = Math, clamp = (v, lo, hi) => M.max(lo, M.min(hi, v)), r2 = (n) => M.round(n * 100) / 100;
const f1 = (x) => x.toFixed(1), f2 = (x) => x.toFixed(2), f3 = (x) => x.toFixed(3);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const usd = (n) => {
  const a = M.abs(n), s = n < 0 ? '-' : '';
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
const mtbl = (cols, b) => tbl('mini-tbl', cols, b), bdg = (c, t) => sp(`badge ${c}`, t);
const btn = (cls, at, l) => `<button class="btn ${cls}" ${at}>${l}</button>`;
const tierB = (t) => bdg(t === 'watchlist' ? 'b-wl' : t === 'large-cap' ? 'b-ext' : 'b-early',
  t === 'watchlist' ? 'Watchlist' : t === 'large-cap' ? 'Extended' : 'Early');
const verdB = (v) => bdg(v === 'FARM' ? 'b-farm' : v === 'MARGINAL' ? 'b-marg' : 'b-skip', v === 'MARGINAL' ? 'MARG' : v);
const missB = (m, d = '') => bdg(m <= 3 ? 'b-farm' : 'b-marg', `×${f2(m)}${d ? ` ${d}` : ''}`);
const opt = (v, l, sel) => `<option value="${esc(v)}"${sel ? ' selected' : ''}>${l}</option>`;
const hdrBar = (l, r) => el('header', 'masthead', div('mast-left', l) + div('grp', r));

const DEF = { tab: 'board', verdict: 'all', tier: 'all', cat: 'all', chain: 'all', q: '', sort: 'rank', dir: 'asc',
  dep: 0, drop: cal.default_drop_share, wk: cal.default_horizon_weeks, carry: cal.tbill_apr, p: null, open: null, proof: false };
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
  if (qp.has('carry')) { const cv = Number(qp.get('carry')); if ([0, 0.02, 0.04].includes(cv)) st.carry = cv; }
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
  if (M.abs(st.drop - cal.default_drop_share) > 1e-6) qp.set('drop', String(st.drop));
  if (st.wk !== cal.default_horizon_weeks) qp.set('wk', String(st.wk));
  if (M.abs(st.carry - cal.tbill_apr) > 1e-6) qp.set('carry', String(st.carry));
  const h = qp.toString();
  history.replaceState(null, '', h ? `#${h}` : location.pathname + location.search);
}

const isDef = () => !st.dep && M.abs(st.drop - cal.default_drop_share) < 1e-6 &&
  st.wk === cal.default_horizon_weeks && M.abs(st.carry - cal.tbill_apr) < 1e-6;
const isCover = () => st.verdict === 'all' && st.tier === 'all' && st.cat === 'all' && st.chain === 'all' &&
  !st.q.trim() && !st.open && st.sort === 'rank' && st.dir === 'asc' && isDef();
const getPlan = (row) => rModel.farmPlan(row, cal, st.dep > 0 ? st.dep : null, st.drop, st.wk, st.carry);
const carryBtns = () => sp('lbl-s', 'Carry') + [0, 0.02, 0.04].map((c) =>
  btn(`btn-sm${M.abs(st.carry - c) < 1e-5 ? ' active' : ''}`, `data-carry="${c}"`, p0(c))).join('');
const pn = (n) => (n > 0 ? 'pos' : 'neg');

function scatterSvg(hi, h = 148) {
  const [w, L, R, T, B, x0, x1, y0, y1] = [500, 40, 12, 10, 20, 6.7, 10.6, 5.4, 10.7];
  const px = (x) => f1(L + ((clamp(x, x0, x1) - x0) / (x1 - x0)) * (w - L - R));
  const py = (y) => f1(h - B - ((clamp(y, y0, y1) - y0) / (y1 - y0)) * (h - T - B));
  const f10 = (t, q = 0) => (M.log(pm.ref_tvl_usd) + pm.intercept + pm.beta_tvl * M.log(t / pm.ref_tvl_usd) + q) / M.LN10;
  const tA = 10 ** x0, tB = 10 ** x1;
  const poly = `${px(x0)},${py(f10(tA, pm.q75_log))} ${px(x1)},${py(f10(tB, pm.q75_log))} ` +
    `${px(x1)},${py(f10(tB, pm.q25_log))} ${px(x0)},${py(f10(tA, pm.q25_log))}`;
  const dot = (x, y, r) => `<circle cx="${px(M.log10(x))}" cy="${py(M.log10(y))}" r="${r}"/>`;
  const cD = comps.map((c) => dot(c.tvl_usd, c.mcap_usd, 2.6)).join('');
  const bD = rows.slice(0, 90).map((r) => dot(r.tvl_usd, r.value_if_launched_usd, 2.0)).join('');
  const yG = [[6, '$1M'], [7, '$10M'], [8, '$100M'], [9, '$1B'], [10, '$10B']].map(([v, l]) =>
    `<line x1="${L}" y1="${py(v)}" x2="${w - R}" y2="${py(v)}" stroke="#162b3e"/>` +
    `<text x="${L - 5}" y="${f1(+py(v) + 3)}" text-anchor="end">${l}</text>`).join('');
  const xT = [[7, '$10M'], [8, '$100M'], [9, '$1B'], [10, '$10B']].map(([v, l]) =>
    `<text x="${px(v)}" y="${h - 5}" text-anchor="middle">${l}</text>`).join('');
  const hiC = hi ? `<circle cx="${px(M.log10(hi.tvl_usd))}" cy="${py(M.log10(hi.value_if_launched_usd))}" ` +
    'r="5.5" fill="#f59e0b" stroke="#fff" stroke-width="1.8"/>' : '';
  return `<svg class="scatter-svg" style="height:${h}px" viewBox="0 0 ${w} ${h}"><g>${yG}${xT}</g>` +
    `<polygon points="${poly}" fill="#10b981" fill-opacity=".16"/><line x1="${px(x0)}" y1="${py(f10(tA))}" ` +
    `x2="${px(x1)}" y2="${py(f10(tB))}" stroke="#10b981" stroke-width="2"/>` +
    `<g fill="#22d3ee" fill-opacity=".78">${cD}</g><g fill="#818cf8" fill-opacity=".55">${bD}</g>${hiC}</svg>`;
}
const cats = Array.from(new Set(rows.map((r) => r.category || 'Uncategorized'))).sort(), chF = new Map();
for (const r of rows) chF.set(r.farm_econ.best_chain, (chF.get(r.farm_econ.best_chain) || 0) + 1);
const chains = Array.from(chF.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([c]) => c);
const impMax = M.max(...rows.map((r) => r.implied_high_usd)), impMin = M.min(...rows.map((r) => r.implied_low_usd));
const bandPct = (v) => clamp(((M.log10(M.max(impMin, v)) - M.log10(impMin)) /
  (M.log10(impMax) - M.log10(impMin))) * 100, 0, 100);
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
  return { out, all, farmN, margN, skipN };
}

function renderStepsTable(pl) {
  const { excess_after_carry_usd: exU, excess_per_hour: exH, total_fees_usd: tf, tbill_hurdle_usd: th,
    modelled_drop_usd: md, deposit_usd: dp, horizon_weeks: wk, carry_apr: ca, min_ticket_usd: mt } = pl;
  const body = pl.items.map((it, i) => tr([td(sp('step-num', i + 1) + sp('step-when', esc(it.when || it.phase))),
    td(esc(it.action)), tdN(esc(it.cost_label)), tdN(esc(it.time_label))])).join('');
  const sg = exU >= 0 ? '+' : '', payS = mt != null ? ` · pays from ${usd(mt)}` : '';
  const foot = div('all-in-bar',
    `<span>All in: 9 steps / ${wk}w on ${usd(dp)} — $${f2(tf)} fees + $${f2(th)} (${p0(ca)} carry) vs $${f2(md)} ` +
      `drop = <b class="${pn(exU)}">${sg}$${f2(exU)} (${sg}$${f2(exH)}/hr${payS})</b></span>` +
      sp('mono', `$${f2(tf)} fees · ${f1(pl.total_hours)}h`));
  return tbl('steps-tbl', ['When', 'Operator Step', '#Cost', '#Time'], body) + foot;
}

function renderHeader() {
  const tb = (id, lb) => btn(st.tab === id ? 'active' : '', `data-tab="${id}"`, lb);
  return hdrBar(`<h1 class="brand">Sonar</h1>${sp('ver-pill', `${esc(ver)} · CRC ${esc(cal.board_checksum)}`)}` +
    sp('subtitle', `${esc(asOf)} · WL >=${usd(flUsd)} · Browser Refit · Offline`),
    `${tb('board', `Board (${rows.length})`)}${tb('comps', `Comps (${comps.length})`)}${tb('aside', `Aside (${aside.length})`)}`);
}

function renderCoverAudit(all, farmN, margN, skipN) {
  const sh = om.sign_holds || {}, shV = Object.values(sh), shMin = shV.length ? M.min(...shV) : 1;
  const rwaSc = f2(scs['RWA, Payments & Insurance'] || 0.7), crSc = f2(scs['Credit & Stablecoins'] || 1.34);
  const top3 = all.filter((x) => x.plan.verdict === 'FARM')
    .sort((a, b) => b.plan.excess_per_hour - a.plan.excess_per_hour).slice(0, 3)
    .map((x) => `<b>${esc(x.row.name)}</b> (${sUsd(x.plan.excess_per_hour)}/h)`).join(', ');
  const { rows: rw } = rData;
  const kpis = [
    ['WF Miss', `×${f2(pm.wf_miss)}`, `vs ×${f2(pm.flat_wf_miss)} flat; LOO ×${f2(pm.loo_miss)}, 10F ×${f2(pm.cv10_miss)}`, 'cy'],
    ['Range Honesty', `${p0(pm.cov50_wf)} · ${p0(pm.cov80_wf)}`, 'held-out P25–P75 & P10–P90', ''],
    ['Odds (WF Brier)', f3(om.wf_brier), `vs ${f3(om.base_wf_brier)} base; 10F ${f3(om.cv10_brier)} (${p1(om.cv10_acc)})`, 'pos'],
    ['Worth Farming ($25/h)', `${farmN} of ${rw.length}`, `net+${p0(st.carry)} carry; ${margN} marg, ${skipN} skip`, 'pos'],
    ['Watchlist & Board', `${K.watchlist} / ${K.watchlist}`, `+${K.large_cap + K.early} clean pre-token (${K.total})`, ''],
    ['Bootstrap Stability', `${cal.n_bootstrap} refits`, `${p0(shMin)} sign holds · RWA ×${rwaSc}..Cr ×${crSc}`, ''],
  ].map(([l, v, n, c]) => div('kpi', div('kpi-lbl', l) + div(`kpi-val ${c}`, v) + div('kpi-note', n))).join('');

  const fn = (t) => sp('fn-tag', t), mMult = f3(M.exp(pm.intercept));
  const eqBan = div('eq-strip', `<div><div><b>Implied</b> = <b>Launch Value</b> ` +
    sp('mono', `($100M×${mMult}×(TVL/$100M)^${f3(pm.beta_tvl)}×cat_k64)`) +
    ` × <b>Odds</b> ${sp('mono', 'P(age,catShare,TVL,7d)')}.</div>` +
    div('subline', `Top excess/hr now (${p0(st.carry)} carry): ${top3}.`) + '</div>' +
    sp('grp', fn('impliedValue()') + fn('farmPlan()') + fn('ledgerOf()') + fn('verifyBoardParity()')));

  const segs = [
    ['Watchlist', K.watchlist, '#22d3ee'], ['Extended', K.large_cap, '#c084fc'],
    ['Early', K.early, '#10b981'], ['Traded comps', K.priced_comps, '#38bdf8'],
    ['Tokenized', K.other_tokenized, '#64748b'], ['Bridges', K.excl_bridges, '#475569'],
    ['LST / BTC', K.excl_lst_btc, '#f59e0b'], ['CEX / Ver', K.excl_cex_ver_sib, '#f43f5e'],
  ];
  const bar = segs.map(([, n, c]) => `<div style="width:${(n / K.total) * 100}%;background:${c}"></div>`).join('');
  const leg = segs.map(([l, n, c]) => `<span><i class="dot" style="background:${c}"></i>${l} <b>${n}</b></span>`).join('');
  const pill = (ok, l) => div(`pill ${ok ? 'ok' : 'warn'}`, `${ok ? '✓' : '!'} ${l}`);
  const pills6 = div('pills-6', [
    pill(!parity.mismatches && !parity.farmMismatches, `table = board (${rows.length}/${rows.length})`),
    pill(parity.monoOk, `ranks 1–${rows.length} monotonic`),
    pill(parity.totalExactOk, `total: ${usd(parity.recomputedTotal)}`),
    pill(parity.checksumOk, `CRC ${esc(parity.checksum)}`),
    pill(parity.wlOk, 'WL 40 / 40 covered'), pill(parity.ledgerOk, `ledger ${parity.ledgerSum}/${K.total}`),
  ].join(''));

  const gC = (s) => (s === 'kept' ? 'g-kept' : s === 'tested_not_kept' ? 'g-drop' : '');
  const gT = (s) => (s === 'tested_not_kept' ? 'drop' : esc(s));
  const s1 = pm.ablation.map((a) => tr([td(esc(a.step)), tdN(`×${f2(a.loo_miss)}`), tdN(`×${f2(a.wf_miss)}`),
    tdN(`${p0(a.loo_w3x)}/${p0(a.wf_w3x)}`), td(gT(a.status), gC(a.status))])).join('');
  const s2 = om.ablation.map((a) => tr([td(esc(a.step)), tdN(f3(a.cv10_brier)), tdN(f3(a.wf_brier)),
    tdN(`${p1(a.cv10_acc)}/${p1(a.wf_acc)}`), td(gT(a.status), gC(a.status))])).join('');
  const ageR = (om.age_buckets || []).map((b) => tr([td(esc(b.label)), tdN(`${b.tokenized}/${b.total}`),
    tdN(p0(b.rate), 'cy')])).join('');
  const chips = Object.entries(scs).map(([sec, sc]) =>
    sp('sec-chip', `${esc(sec.split(/[, ]/)[0])} <b>×${f2(sc)}</b>`)).join('');

  return [
    div('kpi-row', kpis), eqBan,
    card(`Protocol Accounting (${K.total} / ${K.total} MECE)`, `${sum.board_size} ranked · ${comps.length} comps`,
      div('mece-bar', bar) + div('mece-leg', leg) + pills6),
    '<section class="evidence-4">' +
      card(`Stage 1 · Value (n=${pm.n_comps})`, `WF>=${esc(pm.wf_cutoff)}`,
        mtbl(['Spec', '#LOO', '#WF', '#<=3x', 'Gate'], s1) +
        div('subline', `4-Way: 10F ×${f2(pm.cv10_miss)} · >=$50M ×${f2(pm.size_split_miss)}`)) +
      card(`Stage 2 · Odds (n=${om.n_peers})`, `WF>=${esc(om.wf_cutoff)}`,
        mtbl(['Features', '#10F', '#WF', '#Acc', 'Gate'], s2) +
        div('subline', `age +${f3(om.beta_age)}±${f3(om.beta_age_se)} · cat +${f3(om.beta_cat_share)}`)) +
      card('Peer Age Record &amp; Range', `n=${om.n_peers}`,
        mtbl(['Cohort', '#Token/Tot', '#Rate'], ageR) +
        div('subline', `WF Cov: P25–P75 ${p0(pm.cov50_wf)} · P10–P90 ${p0(pm.cov80_wf)}`) +
        div('sec-chips', chips)) +
      card(`Market Cap vs TVL (${pm.n_comps} Comps)`,
        '<span class="cy">●</span>Comps <span class="in">●</span>Board <span class="pos">—</span>Fit',
        scatterSvg(null, 148)) + '</section>',
    div('reading-note',
      '<b>Reading it:</b> Log-TVL &amp; ridge k=64 cut WF miss ×5.16→×2.67; ln(1+age), category token share (k=6), ' +
      'TVL &amp; 7d predict launch odds (0.208 WF Brier, 100% sign hold). Records no token ≠ none exists.'),
  ].join('');
}

function renderFilterStrip(out) {
  const famM = new Map(), exH = out.map((x) => x.plan.excess_per_hour), deps = out.map((x) => x.plan.deposit_usd);
  for (const { plan } of out) {
    if (!famM.has(plan.chain_family)) famM.set(plan.chain_family, []);
    famM.get(plan.chain_family).push(plan.excess_per_hour);
  }
  const chips = [...famM.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 6)
    .map(([f, arr]) => sp('sec-chip', `${esc(f)} <b>${arr.length}</b> (${sUsd(rModel.median(arr))}/h)`)).join('');
  return div('eq-strip', `<span><b>Filtered:</b> ${out.length}/${rows.length} · Med Excess ` +
    `<b class="pos">${sUsd(rModel.median(exH))}/h</b> · Med Dep <b>${usd(rModel.median(deps))}</b></span>` +
    sp('grp', `${chips}${btn('btn-sm', 'id="b-proof"', st.proof ? 'Hide Proof' : 'Show Proof')}`));
}

function renderBoardView() {
  const { out, all, farmN, margN, skipN } = getFiltered();
  const topBlock = (isCover() || st.proof) ? renderCoverAudit(all, farmN, margN, skipN) : renderFilterStrip(out);
  const th = (id, l, c = '') => `<th data-sort="${id}" class="${c}${st.sort === id ? ' sort' : ''}">` +
    `${l}${st.sort === id ? (st.dir === 'asc' ? ' ▲' : ' ▼') : ''}</th>`;
  const thead = `<tr>${[
    th('rank', '# · Band'), th('name', 'Protocol · Category · Chain'), th('tvl', 'TVL', 'num'),
    th('g7d', '7d', 'num'), th('age', 'No-Token', 'num'), th('odds', 'Odds', 'num'),
    th('val', 'If Launched', 'num'), th('implied', 'Implied · Sector P25–P75', 'num'),
    th('net', 'Verdict · Excess', 'num'), th('netHr', 'Excess/Hr', 'num'), '<th>Plan</th>',
  ].join('')}</tr>`;

  const tbody = out.map(({ row: r, plan: pl }) => {
    const { implied_value_usd: iv, implied_low_usd: il, implied_high_usd: ih, launch_odds: lo,
      value_if_launched_usd: vl, slug: sl } = r;
    const { excess_after_carry_usd: exU, excess_per_hour: exH, deposit_usd: dp, min_ticket_usd: mt,
      total_hours: hrs, horizon_weeks: wk, verdict: vd, best_chain: ch, family_label: fLbl } = pl;
    const lp = f1(bandPct(il)), hp = f1(bandPct(ih)), mp = f1(bandPct(iv)), wp = f1(M.max(4, +hp - +lp));
    const sc = scs[r.sector] || 1, minN = mt != null ? `pays from ${usd(mt)}` : `diluted @${p0(pl.carry_apr)}`;
    const sib = r.sibling_symbol ? ` ${bdg('b-warn', `SIB:${esc(r.sibling_symbol)}`)}` : '';
    const g7c = r.change_7d == null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
    const hrCls = exH >= cal.farm_hourly_hurdle && vd === 'FARM' ? 'pos' : exH <= 0 ? 'neg' : '';
    const isOpen = st.open === sl;
    const impCell = `<b>${usd(iv)}</b><small>${usd(il)}–${usd(ih)} (×${f2(sc)})</small>` +
      div('rbar', `<div class="rrange" style="left:${lp}%;width:${wp}%"></div><div class="rmark" style="left:${mp}%"></div>`);
    const rHtml = tr([
      td(`<b>${r.rank}</b><small>${r.rank_low}–${r.rank_high}</small>`, 'mono'),
      td(div('pname', `${esc(r.name)} ${tierB(r.tier)}${sib}`) +
        div('pmeta', `${esc(r.category || 'Uncat')} · ${esc(ch)} (${esc(fLbl)})`)),
      tdN(usd(r.tvl_usd)), tdN(fPct(r.change_7d), g7c), tdN(fAge(r.age_days)),
      tdN(`${p1(lo)}${div('pbar', `<div class="pfill" style="width:${p1(lo)}"></div>`)}`),
      tdN(usd(vl)), tdN(impCell),
      tdN(`${verdB(vd)} ${sp(pn(exU), sUsd(exU))}<small>${minN} · ${usd(dp)}</small>`),
      tdN(`<b class="${hrCls}">${sUsd(exH)}/h</b><small>${f1(hrs)}h/${wk}w</small>`),
      td(btn(`btn-sm plan-btn${isOpen ? ' active' : ''}`, `data-open="${esc(sl)}"`, isOpen ? 'Hide' : '9 steps')),
    ], ` class="row-main${isOpen ? ' open-row' : ''}" data-slug="${esc(sl)}"`);
    if (!isOpen) return rHtml;
    return rHtml + `<tr class="drawer-row"><td colspan="11" class="drawer-cell">` +
      div('card-head', `<span>${esc(r.name)} · Farm Plan (${esc(ch)})</span>` +
        sp('mono', 'farmPlan()')) + renderStepsTable(pl) + '</td></tr>';
  }).join('');

  const vBtn = (v, c, l) => btn(`${c}${st.verdict === v ? ' active' : ''}`, `data-verdict="${v}"`, l);
  const sel = (id, allL, items, cur) => `<select id="${id}">${opt('all', allL, cur === 'all')}` +
    items.map((x) => opt(x[0], x[1], cur === x[0])).join('') + '</select>';
  const acts = btn('', 'id="b-rst"', 'Reset') + btn('', 'id="b-csv"', 'CSV') + btn('', 'id="b-json"', 'JSON');
  return [
    topBlock,
    `<section class="toolbar"><div class="grp">${sp('lbl-s', 'Verdict')}` +
      vBtn('all', '', `All (${rows.length})`) + vBtn('FARM', 'green', `FARM (${farmN})`) +
      vBtn('MARGINAL', 'amber', `MARG (${margN})`) + vBtn('SKIP', 'crimson', `SKIP (${skipN})`) +
      sel('f-tier', 'Tier', [['watchlist', `WL (${sum.watchlist_size})`],
        ['large-cap', `EXT (${sum.large_cap_size})`], ['early', `Early (${sum.early_size})`]], st.tier) +
      sel('f-cat', `Cat (${cats.length})`, cats.map((c) => [c, esc(c)]), st.cat) +
      sel('f-chain', `Chain (${chains.length})`, chains.map((c) => [c, esc(c)]), st.chain) +
      `<input id="f-q" type="search" value="${esc(st.q)}" placeholder="Filter..." /></div><div class="grp">` +
      `<select id="s-dep">${opt(0, 'Plan Dep', st.dep === 0)}` +
      `${[2500, 5000, 10000, 25000, 50000].map((v) => opt(v, usd(v), st.dep === v)).join('')}</select>` +
      sp('lbl-s', `Drop ${p0(st.drop)}`) +
      `<input id="s-drop" type="range" min="3" max="15" step="1" value="${M.round(st.drop * 100)}" />` +
      sp('lbl-s', `${st.wk}w`) + `<input id="s-wk" type="range" min="4" max="24" step="2" value="${st.wk}" />` +
      carryBtns() + acts + '</div></section>',
    div('tbl-wrap', `<table class="tbl"><thead>${thead}</thead><tbody>` +
      `${tbody || '<tr><td colspan="11" class="empty">No matching rows.</td></tr>'}</tbody></table>`),
    el('footer', 'foot-note', `<span>${out.length} ranked · Click 9 steps or row</span><span>${esc(asOf)} · Offline</span>`),
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
  const idx = rows.findIndex((r) => r.slug === slug), row = rows[idx >= 0 ? idx : 0], pl = getPlan(row);
  const cat = row.category || 'Uncategorized', ev = rModel.impliedValue(row, parity.pFit, parity.oFit, cal);
  const shE = (pt) => rModel.impliedValue({ ...row, ...pt }, parity.pFit, parity.oFit, cal);
  const ageV = (row.age_days == null ? om.median_age_years * 365 : row.age_days) + 182;
  const shocks = [
    [`TVL −30% (${usd(row.tvl_usd * 0.7)})`, shE({ tvl_usd: row.tvl_usd * 0.7 })],
    ['7-day TVL +25%', shE({ change_7d: 25 })], ['7-day TVL −20%', shE({ change_7d: -20 })],
    ['No token +6 mo', shE({ age_days: ageV })],
  ].map(([l, sh]) => {
    const d = ((sh.implied / row.implied_value_usd) - 1) * 100, cls = d >= 0.05 ? 'pos' : d <= -0.05 ? 'neg' : '';
    return tr([td(l), tdN(p1(sh.launchOdds)), tdN(usd(sh.implied)), tdN(fPct(d), cls)]);
  }).join('');

  const peers = comps.slice().sort((a, b) =>
    ((a.category || 'Uncat') === cat ? 0 : 1) - ((b.category || 'Uncat') === cat ? 0 : 1) ||
    M.abs(M.log(a.tvl_usd / row.tvl_usd)) - M.abs(M.log(b.tvl_usd / row.tvl_usd))).slice(0, 6);
  const dCols = [2500, 10000, 25000];
  if (!dCols.includes(pl.deposit_usd)) dCols[1] = pl.deposit_usd;
  dCols.sort((a, b) => a - b);

  const mxRows = [0.05, 0.10, 0.15].map((ds) => tr([td(`${p0(ds)} drop`), ...dCols.map((dp) => {
    const cr = r2(dp * st.carry * (pl.horizon_weeks / 52));
    const ex = r2(row.implied_value_usd * ds * (dp / (row.tvl_usd + dp)) - pl.total_fees_usd - cr);
    return td(sUsd(ex), ex > 0 && ex / M.max(0.25, pl.total_hours) >= cal.farm_hourly_hurdle ? 'pos' : ex > 0 ? '' : 'neg');
  })])).join('');
  const wkSens = [4, 8, 12, 24].map((wk) => {
    const al = rModel.farmPlan(row, cal, pl.deposit_usd, pl.drop_share, wk, st.carry);
    return `<span>${wk}w: <b class="${al.verdict === 'FARM' ? 'pos' : al.excess_after_carry_usd > 0 ? '' : 'neg'}">` +
      `${sUsd(al.excess_after_carry_usd)}</b> (${sUsd(al.excess_per_hour)}/h)</span>`;
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

  const mTkt = pl.min_ticket_usd != null ? usd(pl.min_ticket_usd) : `Diluted @${p0(st.carry)}`;
  const bRows = [
    tr([td('Min profitable ticket'), tdN(mTkt, pl.min_ticket_usd != null ? 'pos' : 'neg')]),
    tr([td(`4% T-bill (${pl.horizon_weeks}w)`), tdN(usd(pl.tbill_4pct_usd))]),
    tr([td(`${p0(st.carry)} carry deducted`), tdN(usd(pl.tbill_hurdle_usd))]),
    tr([td('BE drop · odds'), tdN(`${f2(pl.break_even_drop_share * 100)}% · ${p1(pl.break_even_odds)}`)]),
    tr([td(`Exit TVL (${f1(cal.snapshot_7d_p05)}% P05)`), tdN(usd(pl.exit_tvl_usd))]),
  ].join('');

  const pRows = peers.map((p) => tr([
    td(`<b>${esc(p.name)}</b> ${sp('pmeta', esc(p.symbol))}`), td(esc(p.category || '-')),
    tdN(usd(p.tvl_usd)), tdN(usd(p.mcap_usd)), tdN(usd(p.loo_pred_usd)), tdN(missB(p.loo_miss, p.loo_dir)),
  ])).join('');
  const { deposit_usd: dp, modelled_drop_usd: md, total_fees_usd: tf, tbill_hurdle_usd: th,
    tbill_4pct_usd: t4, excess_after_carry_usd: exU, excess_per_hour: exH, total_hours: hrs,
    horizon_weeks: wk, drop_share: dsh, verdict: vd } = pl;
  const vCls = vd === 'FARM' ? '' : vd === 'MARGINAL' ? 'marg' : 'skip';
  const vBan = div(`ver-box ${vCls}`, `<b>${vd}:</b> ${usd(dp)}×${wk}w = $${f2(md)} (${p0(dsh)}) − ` +
    `$${f2(tf)} fees − $${f2(th)} (${p0(st.carry)} carry) = <b>${sUsd(exU)} (${sUsd(exH)}/h)</b>.`);
  const ecGrid = div('econ-6', [
    ['At Risk', usd(dp), ''], ['Modelled Drop', `$${f2(md)}`, ''], ['Fees + Carry', `$${f2(tf)} + $${f2(th)}`, ''],
    ['Excess Profit', sUsd(exU), pn(exU)],
    [`Excess / Hr (${f1(hrs)}h)`, `${sUsd(exH)}/h`, exH >= cal.farm_hourly_hurdle ? 'pos' : exH <= 0 ? 'neg' : ''],
    ['Pays From / 4%', `${mTkt} · ${usd(t4)}`, ''],
  ].map(([l, v, c]) => div('ec', div('l', l) + div(`v ${c}`, v))).join(''));
  const exBan = div('exit-box', `<b>Exit:</b> Withdraw if TVL < <b class="mono">${usd(pl.exit_tvl_usd)}</b> ` +
    `(${f1(cal.snapshot_7d_p05)}% P05). Risks: ${esc((row.farm_econ.risk_tags || []).join(' · '))}.`);
  const mxHdr = `<thead><tr><th>Drop \\ Dep</th>${dCols.map((d) => `<th>${usd(d)}</th>`).join('')}</tr></thead>`;
  const vPC = vd === 'FARM' ? 'b-farm' : vd === 'MARGINAL' ? 'b-marg' : 'b-skip';

  const { implied_value_usd: iv, implied_low_usd: il, implied_high_usd: ih, implied_p10_usd: ip10,
    implied_p90_usd: ip90, value_if_launched_usd: vl, launch_odds: lo, tvl_usd: tvl, name: nm } = row;
  return [
    hdrBar(
      btn('', 'id="b-back"', '← Board') + sp('ver-pill', `#${row.rank} (${row.rank_low}–${row.rank_high})`) +
        el('h1', 'brand', esc(nm)) + tierB(row.tier) +
        sp('subtitle', `${esc(cat)} · ${esc(row.chains.join(', '))} · Records no token`),
      bdg(`pill-lg ${vPC}`, `${vd} · ${sUsd(exU)} (${sUsd(exH)}/h)`) +
        btn('', `data-nav="${esc(prevS)}"`, '◀ Prev') + btn('', `data-nav="${esc(nextS)}"`, 'Next ▶'),
    ),
    div('det-top', div('hero-val',
      div('card-head', `<span>Implied · ${esc(row.sector)}</span>` +
        sp('mono', `TVL ${usd(tvl)} · 7d ${fPct(row.change_7d)} · Age ${fAge(row.age_days)}`)) +
      div('hv-flex', div('hv-num', usd(iv)) +
        div('mono hv-sub', `Launch <b>${usd(vl)}</b> · Odds <b>${p1(lo)}</b> · P25–P75 <b>${usd(il)}–${usd(ih)}</b> · ` +
          `P10–P90 <b>${usd(ip10)}–${usd(ip90)}</b>`)) +
      div('subline pos', `✓ Browser refit = board.json (CRC ${esc(parity.checksum)}) · Records no token; ` +
        'odds reflect peers, not forecast.')) +
      card('Curve vs Comps', `<span class="am">●</span> ${esc(nm)}`, scatterSvg(row, 84))),
    '<div class="det-grid"><div class="stack">',
    card(`Value Build-Up (${usd(iv)})`, 'impliedValue()',
      div('eq-box', eqBox) + div('card-head', '<span>Sensitivity Shocks</span><span class="mono">±7d/TVL/Age</span>') +
      mtbl(['Scenario', '#Odds', '#Implied', '#Delta'], shocks)),
    card('Nearest 6 Comps', esc(cat), mtbl(['Peer', 'Cat', '#TVL', '#MCap', '#LOO', '#Miss'], pRows)),
    card('Deposit × Drop Matrix &amp; Benchmarks', `${p0(st.carry)} carry · ${wk}w`,
      div('bench-split', `<table class="mini-tbl mx">${mxHdr}<tbody>${mxRows}</tbody></table>` +
        mtbl(['Benchmark', '#Val'], bRows)) + div('subline', `Horizon: ${wkSens}`)),
    '</div><div class="stack">',
    card(`Verdict &amp; Economics (${esc(pl.best_chain)})`, sp('grp', carryBtns()), vBan + ecGrid + exBan),
    card(`Farm Plan — 9 Steps (${pl.total_minutes}m / ${wk}w)`, 'farmPlan()', renderStepsTable(pl)),
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
  const ob = hit(ev, '[data-open]'), tb = hit(ev, '[data-tab]'), vb = hit(ev, '[data-verdict]'),
    sth = hit(ev, '[data-sort]'), cb = hit(ev, '[data-carry]');
  if (ob) { ev.stopPropagation(); st.open = st.open === ob.dataset.open ? null : ob.dataset.open; return renderApp(); }
  if (tb) { st.tab = tb.dataset.tab; renderApp(); return window.scrollTo(0, 0); }
  if (vb) { st.verdict = vb.dataset.verdict; return renderApp(); }
  if (cb) { st.carry = Number(cb.dataset.carry) || 0; return renderApp(); }
  if (sth) {
    const c = sth.dataset.sort, ascC = c === 'rank' || c === 'name' || c === 'age';
    st.dir = st.sort === c ? (st.dir === 'asc' ? 'desc' : 'asc') : (ascC ? 'asc' : 'desc');
    st.sort = c; return renderApp();
  }
  const op = hit(ev, '[data-nav]') || hit(ev, 'tr[data-slug]');
  if (op) { st.p = op.dataset.nav || op.dataset.slug; renderApp(); return window.scrollTo(0, 0); }
  if (hit(ev, '#b-proof')) { st.proof = !st.proof; return renderApp(); }
  if (hit(ev, '#b-back')) { st.p = null; return renderApp(); }
  if (hit(ev, '#b-rst')) { Object.assign(st, DEF); return renderApp(); }
  if (hit(ev, '#b-csv')) {
    const h = 'rank,slug,name,tier,cat,tvl,implied,odds,verdict,excess,excess_hr';
    const ls = getFiltered().out.map(({ row: r, plan: pl }) => [r.rank, r.slug, JSON.stringify(r.name), r.tier,
      JSON.stringify(r.category || ''), r.tvl_usd, r.implied_value_usd, r.launch_odds, pl.verdict,
      pl.excess_after_carry_usd, pl.excess_per_hour].join(','));
    return dl('sonar-v3.csv', 'text/csv', [h, ...ls].join('\n'));
  }
  if (hit(ev, '#b-json')) {
    dl('sonar-v3.json', 'application/json',
      JSON.stringify(getFiltered().out.map(({ row, plan }) => ({ ...row, farm_econ: plan })), null, 2));
  }
});
rootEl.addEventListener('change', (ev) => {
  const k = { 'f-tier': 'tier', 'f-cat': 'cat', 'f-chain': 'chain', 's-dep': 'dep' }[ev.target.id];
  if (k) { st[k] = k === 'dep' ? Number(ev.target.value) || 0 : ev.target.value; renderApp(); }
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
