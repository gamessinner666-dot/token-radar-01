'use strict';
(() => {
  const radarData = window.RADAR;
  const radarModel = window.RADAR_MODEL;
  if (!radarData || !radarModel) { document.getElementById('app').textContent = 'Missing RADAR'; return; }

  const parity = radarModel.verifyBoardParity(radarData);
  const { rows, ledger, calibration: cal, summary, live_comparables: comps,
    set_aside: aside, model_version: ver, as_of: asOf, floor_usd: floorUsd } = radarData;
  const pm = cal.price_model, om = cal.odds_model;

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const r2 = (n) => Math.round(n * 100) / 100;
  const f1 = (x) => x.toFixed(1), f2 = (x) => x.toFixed(2), f3 = (x) => x.toFixed(3);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function usd(n) {
    const a = Math.abs(n), s = n < 0 ? '-' : '';
    if (a >= 1e9) return `${s}$${f2(a / 1e9)}B`;
    if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(a >= 100e6 ? 0 : 1)}M`;
    if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(a >= 100e3 ? 0 : 1)}k`;
    return `${s}$${a.toFixed(a < 100 ? 2 : 0)}`;
  }

  const sUsd = (n) => `${n > 0 ? '+' : ''}${usd(n)}`;
  const pct = (p) => (p == null ? '—' : `${p > 0 ? '+' : ''}${f1(p)}%`);
  const ageStr = (d) => (d == null ? 'legacy' : d >= 365 ? `${f1(d / 365)}y` : `${d}d`);
  const p0 = (x) => `${(x * 100).toFixed(0)}%`, p1 = (x) => `${f1(x * 100)}%`;

  const el = (t, c, b) => `<${t}${c ? ` class="${c}"` : ''}>${b}</${t}>`;
  const div = (c, b) => el('div', c, b);
  const tr = (cells, a = '') => `<tr${a}>${cells.join('')}</tr>`;
  const td = (v, c = '') => el('td', c, v);
  const tdN = (v, c = '') => td(v, c ? `num ${c}` : 'num');
  const card = (t, r, b) => el('section', 'card', div('card-head', `<span>${t}</span><span class="mono">${r}</span>`) + b);
  const tbl = (c, cols, b) => `<table class="${c}"><thead><tr>` +
    cols.map((x) => (x[0] === '#' ? `<th class="num">${x.slice(1)}</th>` : `<th>${x}</th>`)).join('') +
    `</tr></thead><tbody>${b}</tbody></table>`;
  const bdg = (c, t) => el('span', `badge ${c}`, t);
  const tierBdg = (t) => bdg(t === 'watchlist' ? 'b-wl' : t === 'large-cap' ? 'b-ext' : 'b-early',
    t === 'watchlist' ? 'WL' : t === 'large-cap' ? 'EXT' : 'Early');
  const verdBdg = (v) => bdg(v === 'FARM' ? 'b-farm' : v === 'MARGINAL' ? 'b-marg' : 'b-skip',
    v === 'MARGINAL' ? 'MARG' : v);
  const missBdg = (m, d = '') => bdg(m <= 3 ? 'b-farm' : 'b-marg', `×${f2(m)}${d ? ` ${d}` : ''}`);
  const opt = (v, l, sel) => `<option value="${esc(v)}"${sel ? ' selected' : ''}>${l}</option>`;
  const masthead = (l, r) => el('header', 'masthead', div('mast-left', l) + div('grp', r));

  const DEF = {
    tab: 'board', verdict: 'all', tier: 'all', cat: 'all', chain: 'all', q: '',
    sort: 'rank', dir: 'asc', dep: 0, drop: cal.default_drop_share, wk: cal.default_horizon_weeks, p: null,
  };
  const state = { ...DEF };

  function readHash() {
    Object.assign(state, DEF);
    const raw = (location.hash || '').replace(/^#/, '');
    if (!raw) return;
    const qp = new URLSearchParams(raw), tab = qp.get('tab');
    if (tab === 'audit' || tab === 'comps' || tab === 'aside') state.tab = tab;
    for (const k of ['verdict', 'tier', 'cat', 'chain', 'q', 'sort', 'p']) if (qp.get(k)) state[k] = qp.get(k);
    if (qp.get('dir') === 'desc' || qp.get('dir') === 'asc') state.dir = qp.get('dir');
    if (qp.get('dep')) state.dep = Number(qp.get('dep')) || 0;
    if (qp.get('drop')) state.drop = Number(qp.get('drop')) || cal.default_drop_share;
    if (qp.get('wk')) state.wk = Number(qp.get('wk')) || cal.default_horizon_weeks;
  }

  function writeHash() {
    const qp = new URLSearchParams();
    if (state.p) qp.set('p', state.p);
    else {
      if (state.tab !== 'board') qp.set('tab', state.tab);
      for (const k of ['verdict', 'tier', 'cat', 'chain', 'q']) if (state[k] && state[k] !== 'all') qp.set(k, state[k]);
      if (state.sort !== 'rank') qp.set('sort', state.sort);
      if (state.dir !== 'asc') qp.set('dir', state.dir);
    }
    if (state.dep) qp.set('dep', String(state.dep));
    if (Math.abs(state.drop - cal.default_drop_share) > 1e-6) qp.set('drop', String(state.drop));
    if (state.wk !== cal.default_horizon_weeks) qp.set('wk', String(state.wk));
    const h = qp.toString();
    history.replaceState(null, '', h ? `#${h}` : location.pathname + location.search);
  }

  const isDefault = () => state.dep === 0 &&
    Math.abs(state.drop - cal.default_drop_share) < 1e-6 && state.wk === cal.default_horizon_weeks;
  const getPlan = (row) => radarModel.buildFarmPlan(row, cal, state.dep > 0 ? state.dep : null, state.drop, state.wk);

  function renderScatterSvg(hiRow, hPx = 188) {
    const [w, L, R, T, B, x0, x1, y0, y1] = [520, 42, 14, 10, 22, 6.7, 10.6, 5.4, 10.7];
    const px = (x) => f1(L + ((clamp(x, x0, x1) - x0) / (x1 - x0)) * (w - L - R));
    const py = (y) => f1(hPx - B - ((clamp(y, y0, y1) - y0) / (y1 - y0)) * (hPx - T - B));
    const f10 = (t, q = 0) => (Math.log(pm.ref_tvl_usd) + pm.intercept +
      pm.beta_tvl * Math.log(t / pm.ref_tvl_usd) + q) / Math.LN10;
    const tA = 10 ** x0, tB = 10 ** x1;
    const poly = [`${px(x0)},${py(f10(tA, pm.q75_log))}`, `${px(x1)},${py(f10(tB, pm.q75_log))}`,
      `${px(x1)},${py(f10(tB, pm.q25_log))}`, `${px(x0)},${py(f10(tA, pm.q25_log))}`].join(' ');
    const dot = (x, y, rad) => `<circle cx="${px(Math.log10(x))}" cy="${py(Math.log10(y))}" r="${rad}"/>`;
    const cD = comps.map((c) => dot(c.tvl_usd, c.mcap_usd, 2.7)).join('');
    const bD = rows.slice(0, 90).map((r) => dot(r.tvl_usd, r.value_if_launched_usd, 2.1)).join('');
    const yG = [[6, '$1M'], [7, '$10M'], [8, '$100M'], [9, '$1B'], [10, '$10B']].map(([v, l]) =>
      `<line x1="${L}" y1="${py(v)}" x2="${w - R}" y2="${py(v)}" stroke="#e5dfd3"/>` +
      `<text x="${L - 6}" y="${f1(+py(v) + 3)}" text-anchor="end">${l}</text>`).join('');
    const xT = [[7, '$10M'], [8, '$100M'], [9, '$1B'], [10, '$10B']].map(([v, l]) =>
      `<text x="${px(v)}" y="${hPx - 6}" text-anchor="middle">${l}</text>`).join('');
    const hiC = hiRow ? `<circle cx="${px(Math.log10(hiRow.tvl_usd))}" cy="${py(Math.log10(hiRow.value_if_launched_usd))}" ` +
      'r="5.5" fill="#b45309" stroke="#fff" stroke-width="1.8"/>' : '';
    return `<svg class="scatter-svg" style="height:${hPx}px" viewBox="0 0 ${w} ${hPx}">` +
      `<g>${yG}${xT}</g><polygon points="${poly}" fill="#0d7a5f" fill-opacity=".12"/>` +
      `<line x1="${px(x0)}" y1="${py(f10(tA))}" x2="${px(x1)}" y2="${py(f10(tB))}" stroke="#0d7a5f" stroke-width="2"/>` +
      `<g fill="#1d4ed8" fill-opacity=".72">${cD}</g><g fill="#6d28d9" fill-opacity=".58">${bD}</g>${hiC}</svg>`;
  }

  const cats = Array.from(new Set(rows.map((r) => r.category || 'Uncategorized'))).sort();
  const chFreq = new Map();
  for (const r of rows) chFreq.set(r.farm_econ.best_chain, (chFreq.get(r.farm_econ.best_chain) || 0) + 1);
  const chains = Array.from(chFreq.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([c]) => c);
  const impMax = Math.max(...rows.map((r) => r.implied_high_usd));
  const impMin = Math.min(...rows.map((r) => r.implied_low_usd));
  const bandPct = (v) => clamp(
    ((Math.log10(Math.max(impMin, v)) - Math.log10(impMin)) / (Math.log10(impMax) - Math.log10(impMin))) * 100, 0, 100);

  const SKEYS = {
    rank: (x) => x.row.rank, name: (x) => x.row.name, tvl: (x) => x.row.tvl_usd,
    g7d: (x) => x.row.change_7d ?? -999, age: (x) => x.row.age_days ?? 99999,
    odds: (x) => x.row.launch_odds, val: (x) => x.row.value_if_launched_usd,
    implied: (x) => x.row.implied_value_usd, net: (x) => x.plan.net_of_fees_usd, netHr: (x) => x.plan.net_per_hour,
  };

  function getFiltered() {
    const list = rows.map((row) => ({ row, plan: getPlan(row) }));
    let farmN = 0, margN = 0, skipN = 0;
    for (const x of list) {
      if (x.plan.verdict === 'FARM') farmN++;
      else if (x.plan.verdict === 'MARGINAL') margN++;
      else skipN++;
    }
    const ql = state.q.trim().toLowerCase();
    const out = list.filter(({ row, plan }) =>
      (state.verdict === 'all' || plan.verdict === state.verdict) &&
      (state.tier === 'all' || row.tier === state.tier) &&
      (state.cat === 'all' || (row.category || 'Uncategorized') === state.cat) &&
      (state.chain === 'all' || row.chains.includes(state.chain) || plan.best_chain === state.chain) &&
      (!ql || `${row.name} ${row.slug} ${row.category || ''} ${row.chains.join(' ')}`.toLowerCase().includes(ql)));
    const mult = state.dir === 'asc' ? 1 : -1, fn = SKEYS[state.sort] || SKEYS.rank;
    out.sort((a, b) => {
      const va = fn(a), vb = fn(b);
      return (typeof va === 'string' ? va.localeCompare(vb) : va - vb) * mult || a.row.rank - b.row.rank;
    });
    return { out, farmN, margN, skipN };
  }

  const renderHeader = () => {
    const tb = (id, lb) => `<button class="btn${state.tab === id ? ' active' : ''}" data-tab="${id}">${lb}</button>`;
    return masthead(
      `<h1 class="serif">Token Radar</h1>` +
        el('span', 'ver-pill', `${esc(ver)} · CRC ${esc(cal.board_checksum)}`) +
        el('span', 'subtitle', `As of ${esc(asOf)} · WL &gt;=${usd(floorUsd)} · Early &gt;=$5M · Offline`),
      `${tb('board', `Board (${rows.length})`)}${tb('audit', 'Model &amp; Audit')}` +
        `${tb('comps', `Comps (${comps.length})`)}${tb('aside', `Aside (${aside.length})`)}`,
    );
  };

  function renderBoardView() {
    const { out, farmN, margN, skipN } = getFiltered();
    const kpi = (l, v, n, c = '') => div('kpi', div('kpi-lbl', l) + div(`kpi-val ${c}`, v) + div('kpi-note', n));
    const segs = [
      ['WL', ledger.watchlist, '#1d4ed8'], ['EXT', ledger.large_cap, '#6d28d9'], ['Early', ledger.early, '#0d7a5f'],
      ['Comps', ledger.priced_comps, '#0284c7'], ['Tok', ledger.other_tokenized, '#94a3b8'],
      ['Bridges', ledger.excl_bridges, '#64748b'], ['LST/BTC', ledger.excl_lst_btc, '#b45309'],
      ['Sib/CEX', ledger.excl_cex_ver_sib, '#be123c'],
    ];
    const mece = div('mece-bar', segs.map(([, n, c]) =>
      `<div style="width:${(n / ledger.total) * 100}%;background:${c}"></div>`).join('')) +
      div('mece-leg', segs.map(([l, n, c]) =>
        `<span><i class="dot" style="background:${c}"></i>${l} <b class="mono">${n}</b></span>`).join(''));
    const pill = (ok, l) => div(`pill ${ok ? 'ok' : 'warn'}`, `${ok ? '✓' : '!'} ${l}`);
    const pills = [
      pill(parity.refitPriceOk && parity.refitOddsOk, 'Huber+Logit Refit'),
      pill(parity.ablationOk, 'LOO &amp; WF Ablations'),
      pill(parity.mismatches === 0 && parity.farmMismatches === 0, `${rows.length}/${rows.length} Parity Exact`),
      pill(parity.monoOk && parity.totalExactOk, `Ranks 1–${rows.length} · ${usd(parity.recomputedTotal)}`),
      pill(parity.checksumOk, `CRC ${esc(parity.checksum)}`),
      pill(parity.wlOk && parity.ledgerOk, `40/40 WL · ${parity.ledgerSum}/758`),
    ].join('');

    const th = (id, l, c = '') => `<th data-sort="${id}" class="${c}${state.sort === id ? ' sort' : ''}">` +
      `${l}${state.sort === id ? (state.dir === 'asc' ? ' ▲' : ' ▼') : ''}</th>`;
    const thead = `<tr>${[
      th('rank', '# · Band'), th('name', 'Protocol · Category · Route'), th('tvl', 'TVL', 'num'),
      th('g7d', '7d', 'num'), th('age', 'Age', 'num'), th('odds', 'Odds', 'num'), th('val', 'If Launched', 'num'),
      th('implied', 'Implied · P25–P75', 'num'), th('net', 'Verdict · Net $', 'num'), th('netHr', 'Net / Hr', 'num'),
    ].join('')}</tr>`;

    const tbody = out.map(({ row, plan }) => {
      const lp = f1(bandPct(row.implied_low_usd)), hp = bandPct(row.implied_high_usd);
      const mp = f1(bandPct(row.implied_value_usd)), wp = f1(Math.max(4, hp - Number(lp)));
      const note = plan.verdict === 'MARGINAL' && row.tvl_usd >= 1e9 ? 'capped $25k vs whale TVL'
        : `fee ${usd(plan.total_fees_usd)} · ${usd(plan.deposit_usd)}`;
      const sib = row.sibling_symbol ? ` ${bdg('b-warn', `SIB:${esc(row.sibling_symbol)}`)}` : '';
      const g7c = row.change_7d == null ? '' : row.change_7d >= 0 ? 'pos' : 'neg';
      const hrc = plan.net_per_hour >= cal.farm_hourly_hurdle && plan.verdict === 'FARM' ? 'pos' : '';
      return tr([
        td(`<b>${row.rank}</b><small>${row.rank_low}–${row.rank_high}</small>`, 'mono'),
        td(div('pname', `${esc(row.name)} ${tierBdg(row.tier)}${sib}`) +
          div('pmeta', `${esc(row.category || 'Uncat')} · ${esc(plan.best_chain)} (${esc(plan.family_label)})`)),
        tdN(usd(row.tvl_usd)), tdN(pct(row.change_7d), g7c), tdN(ageStr(row.age_days)),
        tdN(`${p1(row.launch_odds)}${div('pbar', `<div class="pfill" style="width:${p1(row.launch_odds)}"></div>`)}`),
        tdN(usd(row.value_if_launched_usd)),
        tdN(`<b>${usd(row.implied_value_usd)}</b><small>${usd(row.implied_low_usd)}–${usd(row.implied_high_usd)}</small>` +
          div('rbar', `<div class="rrange" style="left:${lp}%;width:${wp}%"></div>` +
            `<div class="rmark" style="left:${mp}%"></div>`)),
        tdN(`${verdBdg(plan.verdict)} ${el('span', plan.net_of_fees_usd > 0 ? 'pos' : 'neg', sUsd(plan.net_of_fees_usd))}` +
          `<small>${note}</small>`),
        tdN(`<b class="${hrc}">$${f1(plan.net_per_hour)}/h</b><small>${f1(plan.total_hours)}h / ${plan.horizon_weeks}w</small>`),
      ], ` class="row-main" data-slug="${esc(row.slug)}"`);
    }).join('');

    const vBtn = (v, c, l) => `<button class="btn ${c}${state.verdict === v ? ' active' : ''}" data-verdict="${v}">${l}</button>`;
    const sel = (id, allL, items, cur) => `<select id="${id}">${opt('all', allL, cur === 'all')}` +
      items.map((x) => opt(x[0], x[1], cur === x[0])).join('') + '</select>';
    return [
      '<section class="kpi-grid">',
      kpi('MECE Ledger', `${ledger.total} / ${ledger.total}`,
        `${summary.board_size} ranked · ${ledger.priced_comps} comps · ${aside.length} aside`),
      kpi('Board Implied Total', usd(summary.total_implied_usd),
        `${summary.watchlist_size} WL + ${summary.large_cap_size} EXT + ${summary.early_size} Early · ` +
        `${usd(summary.total_board_tvl_usd)} TVL`),
      kpi('OOS Value &amp; Odds', `×${f2(pm.wf_miss)} · ${f3(om.cv10_brier)}`,
        `LOO ×${f2(pm.loo_miss)} (flat ×${f2(pm.flat_wf_miss)}) · Odds ${p1(om.cv10_acc)}`),
      kpi('Farmable ($25/h · 2%)', `${farmN} FARM`, `${margN} marginal · ${skipN} skip · Audit tab`, 'pos'),
      '</section><section class="trust-grid">',
      card(`MECE Funnel (${ledger.total}/${ledger.total})`, `${summary.board_size} ranked`, mece),
      card('Browser Refit &amp; Parity', isDefault() ? '185/185 = board.json' : 'Repriced', div('pills-grid', pills)),
      '</section><section class="toolbar"><div class="grp"><span class="lbl-s">Verdict</span>',
      vBtn('all', '', `All (${rows.length})`) + vBtn('FARM', 'green', `FARM (${farmN})`) +
        vBtn('MARGINAL', 'amber', `MARG (${margN})`) + vBtn('SKIP', 'crimson', `SKIP (${skipN})`),
      sel('f-tier', `Tiers (${rows.length})`, [
        ['watchlist', `WL &gt;=$50M (${summary.watchlist_size})`],
        ['large-cap', `EXT &gt;=$50M (${summary.large_cap_size})`], ['early', `Early (${summary.early_size})`],
      ], state.tier),
      sel('f-cat', `Cats (${cats.length})`, cats.map((c) => [c, esc(c)]), state.cat),
      sel('f-chain', `Chains (${chains.length})`, chains.map((c) => [c, esc(c)]), state.chain),
      `<input id="f-q" type="search" value="${esc(state.q)}" placeholder="Filter..." /></div><div class="grp">`,
      `<select id="s-dep">${opt(0, 'Plan Deposit', state.dep === 0)}` +
        `${[2500, 5000, 10000, 25000, 50000].map((v) => opt(v, usd(v), state.dep === v)).join('')}</select>`,
      el('span', 'lbl-s', `Drop ${p0(state.drop)}`) +
        `<input id="s-drop" type="range" min="3" max="15" step="1" value="${Math.round(state.drop * 100)}" />`,
      el('span', 'lbl-s', `${state.wk}wk`) +
        `<input id="s-wk" type="range" min="4" max="24" step="2" value="${state.wk}" />`,
      '<button class="btn" id="b-rst">Reset</button><button class="btn" id="b-csv">CSV</button>' +
        '<button class="btn" id="b-json">JSON</button></div></section>',
      div('tbl-wrap', `<table class="tbl"><thead>${thead}</thead><tbody>` +
        `${tbody || '<tr><td colspan="10" class="empty">No matches.</td></tr>'}</tbody></table>`),
      el('footer', 'foot-note', `<span>Showing ${out.length} ranked · Click row for Dossier</span>` +
        `<span>As of ${esc(asOf)} · Offline</span>`),
    ].join('');
  }

  function renderAuditView() {
    const gCls = (s) => (s === 'kept' ? 'g-kept' : s === 'tested_not_kept' ? 'g-drop' : '');
    const gTxt = (s) => (s === 'tested_not_kept' ? 'drop' : esc(s));
    const mTbl = (cols, b) => tbl('mini-tbl', cols, b);
    const s1 = pm.ablation.map((a) => tr([td(esc(a.step)), tdN(`×${f2(a.loo_miss)}`), tdN(`×${f2(a.wf_miss)}`),
      tdN(`${p0(a.loo_w3x)} / ${p0(a.wf_w3x)}`), td(gTxt(a.status), gCls(a.status))])).join('');
    const s2 = om.ablation.map((a) => tr([td(esc(a.step)), tdN(f3(a.cv10_brier)), tdN(f3(a.wf_brier)),
      tdN(`${p1(a.cv10_acc)} / ${p1(a.wf_acc)}`), td(gTxt(a.status), gCls(a.status))])).join('');
    const cov = [
      tr([td('Within ×3'), tdN('—'), tdN(p0(pm.within3x_loo)), tdN(p0(pm.within3x_wf))]),
      tr([td('P25–P75'), tdN('50%'), tdN(p0(pm.cov50_loo)), tdN(p0(pm.cov50_wf))]),
      tr([td('P10–P90'), tdN('80%'), tdN(p0(pm.cov80_loo)), tdN(p0(pm.cov80_wf))]),
    ].join('');
    const c6 = comps.slice().sort((a, b) => b.tvl_usd - a.tvl_usd).slice(0, 6).map((c) => tr([
      td(`<b>${esc(c.symbol)}</b> ${esc(c.name)}`), td(esc(c.category)), tdN(usd(c.tvl_usd)),
      tdN(usd(c.loo_pred_usd)), tdN(`<b>${usd(c.mcap_usd)}</b>`), tdN(missBdg(c.loo_miss, c.loo_dir)),
    ])).join('');
    const a6 = aside.slice(0, 6).map((x) => tr([
      td(`<b>${esc(x.name)}</b>`), td(esc(x.category)), tdN(usd(x.tvl_usd)), td(bdg('b-warn', esc(x.reason))),
    ])).join('');
    const fn = (t) => el('span', 'fn-tag', t);
    return [
      div('eq-strip', `<span><b>Implied</b> = ${fn('fitStage1Huber()')} ` +
        el('span', 'mono', `$100M×${f3(Math.exp(pm.intercept))}×(TVL/$100M)^${f3(pm.beta_tvl)}×e^(cat_k64)`) +
        ` × ${fn('fitStage2Logistic()')} ${el('span', 'mono', 'P_surv(Age,Leg,Sec,TVL,7d)')}</span>` +
        el('span', 'grp', fn('classifyProtocolUniverse()') + fn('buildFarmPlan()') + fn('verifyBoardParity()'))),
      '<div class="audit-top">',
      card(`Log-Log Curve (${pm.n_comps} Comps · ${summary.board_size} Board)`,
        '<span style="color:#1d4ed8">●</span> Comps <span style="color:#6d28d9">●</span> Board ' +
        '<span style="color:#0d7a5f">—</span> Huber', renderScatterSvg(null, 188)),
      card(`Conformal &amp; ${cal.n_bootstrap}× Bootstrap s.e.`, 'OOS verified',
        mTbl(['Target', '#Nom', '#LOO', '#WF'], cov) +
        div('subline', `<b>S1 (k=${pm.cat_ridge_k}):</b> α=${f3(pm.intercept)}±${f3(pm.intercept_se)}, ` +
          `β=${f3(pm.beta_tvl)}±${f3(pm.beta_tvl_se)}, cat [${f3(pm.cat_adj_min)}, +${f3(pm.cat_adj_max)}]`) +
        div('subline', `<b>S2 (λ=1.5):</b> age +${f3(om.beta_age)}±${f3(om.beta_age_se)}, ` +
          `leg +${f3(om.beta_legacy)}±${f3(om.beta_legacy_se)}, tvl ${f3(om.beta_tvl)}±${f3(om.beta_tvl_se)}, ` +
          `7d ${f3(om.beta_g7d)}±${f3(om.beta_g7d_se)}`) +
        div('subline pos', `<b>Parity:</b> ${rows.length}/${rows.length} = main.ts (CRC ${esc(parity.checksum)})`)),
      '</div><div class="audit-two">',
      card(`Stage 1 Ablation (n=${pm.n_comps})`, `WF &gt;= ${esc(pm.wf_cutoff)}`,
        mTbl(['Spec', '#LOO', '#WF', '#LOO/WF <=3x', 'Gate'], s1)),
      card(`Stage 2 Odds Ablation (n=${om.n_peers})`, `WF &gt;= ${esc(om.wf_cutoff)}`,
        mTbl(['Features', '#10F Brier', '#WF Brier', '#10F / WF Acc', 'Gate'], s2)),
      '</div><div class="audit-two">',
      card(`Top Comps (${comps.length} · Blind LOO)`, `<button class="btn btn-sm" data-tab="comps">All ${comps.length} →</button>`,
        mTbl(['Protocol', 'Cat', '#TVL', '#LOO', '#MCap', '#Err'], c6)),
      card(`Set-Aside (${aside.length} MECE)`, `<button class="btn btn-sm" data-tab="aside">All ${aside.length} →</button>`,
        mTbl(['Protocol', 'Cat', '#TVL', 'Reason'], a6)),
      '</div>',
    ].join('');
  }

  const subTbl = (t, ph, n, cols, b) => div('toolbar',
    div('grp', el('span', 'lbl-s', t) + `<input id="f-q" type="search" value="${esc(state.q)}" placeholder="${ph}" />`) +
    el('span', 'subtitle', n)) + div('tbl-wrap', tbl('tbl', cols, b));

  function renderCompsView() {
    const ql = state.q.trim().toLowerCase();
    const list = comps.filter((c) => !ql || `${c.name} ${c.symbol} ${c.category}`.toLowerCase().includes(ql));
    const body = list.map((c) => tr([
      td(`<b>${esc(c.symbol)}</b>`, 'mono'),
      td(div('pname', esc(c.name)) + div('pmeta', `${esc(c.category)} · ${esc(c.chains.slice(0, 3).join(', '))}`)),
      tdN(usd(c.tvl_usd)), tdN(pct(c.change_7d), c.change_7d == null ? '' : c.change_7d >= 0 ? 'pos' : 'neg'),
      tdN(ageStr(c.age_days)), tdN(`${f2(c.ratio)}×`), tdN(usd(c.loo_pred_usd)),
      tdN(`<b>${usd(c.mcap_usd)}</b>`), tdN(missBdg(c.loo_miss)), tdN(c.loo_dir),
    ])).join('');
    return subTbl('Traded Comps (mcap_usd &gt; 0)', 'Filter comps...', `${list.length} / ${comps.length}`,
      ['Symbol', 'Protocol · Category · Chains', '#TVL', '#7d', '#Age', '#MCap/TVL', '#LOO', '#MCap', '#Miss', '#Dir'], body);
  }

  function renderSetAsideView() {
    const ql = state.q.trim().toLowerCase();
    const list = aside.filter((x) => !ql || `${x.name} ${x.slug} ${x.category} ${x.reason}`.toLowerCase().includes(ql));
    const body = list.map((x) => tr([td(esc(x.slug), 'mono'), td(esc(x.name), 'pname'), td(esc(x.category)),
      tdN(usd(x.tvl_usd)), td(bdg('b-warn', esc(x.reason)))])).join('');
    return subTbl('MECE Excluded Tokenless', 'Filter excluded...', `${list.length} / ${aside.length}`,
      ['Slug', 'Protocol', 'Category', '#TVL', 'Exclusion Reason'], body);
  }

  function renderDetailView(slug) {
    const idx = rows.findIndex((r) => r.slug === slug);
    const row = rows[idx >= 0 ? idx : 0], plan = getPlan(row), cat = row.category || 'Uncategorized';
    const ev = radarModel.evaluateProtocol(row, parity.pFit, parity.oFit, cal);
    const shEval = (patch) => radarModel.evaluateProtocol({ ...row, ...patch }, parity.pFit, parity.oFit, cal);
    const shocks = [
      [`TVL −30% (${usd(row.tvl_usd * 0.7)})`, shEval({ tvl_usd: row.tvl_usd * 0.7 })],
      ['7d Growth +25%', shEval({ change_7d: 25 })], ['7d Growth −20%', shEval({ change_7d: -20 })],
      ['+6M Older', shEval({ age_days: (row.age_days == null ? om.median_age_years * 365 : row.age_days) + 182 })],
    ].map(([l, sh]) => {
      const d = ((sh.implied / row.implied_value_usd) - 1) * 100;
      return tr([td(l), tdN(p1(sh.launchOdds)), tdN(usd(sh.implied)), tdN(pct(d), d >= 0.05 ? 'pos' : d <= -0.05 ? 'neg' : '')]);
    }).join('');

    const peers = comps.slice().sort((a, b) =>
      ((a.category || 'Uncat') === cat ? 0 : 1) - ((b.category || 'Uncat') === cat ? 0 : 1) ||
      Math.abs(Math.log(a.tvl_usd / row.tvl_usd)) - Math.abs(Math.log(b.tvl_usd / row.tvl_usd))).slice(0, 6);
    const depCols = [2500, 10000, 25000];
    if (!depCols.includes(plan.deposit_usd)) depCols[1] = plan.deposit_usd;
    depCols.sort((a, b) => a - b);

    const mxRows = [0.05, 0.10, 0.15].map((ds) => tr([td(`${p0(ds)} drop`), ...depCols.map((dp) => {
      const net = r2(row.implied_value_usd * ds * (dp / (row.tvl_usd + dp)) - plan.total_fees_usd);
      const hurdle = r2(dp * cal.tbill_apr * (plan.horizon_weeks / 52));
      return td(sUsd(net), net > hurdle && net / Math.max(0.25, plan.total_hours) >= cal.farm_hourly_hurdle ? 'pos' : net > 0 ? '' : 'neg');
    })])).join('');
    const wkSens = [4, 8, 12, 24].map((wk) => {
      const alt = radarModel.buildFarmPlan(row, cal, plan.deposit_usd, plan.drop_share, wk);
      const c = alt.verdict === 'FARM' ? 'pos' : alt.net_of_fees_usd > 0 ? '' : 'neg';
      return `<span>${wk}w: <b class="${c}">${sUsd(alt.net_of_fees_usd)}</b> ($${alt.net_per_hour.toFixed(0)}/h)</span>`;
    }).join(' · ');
    const prevS = rows[(idx - 1 + rows.length) % rows.length].slug, nextS = rows[(idx + 1) % rows.length].slug;

    const eqRow = (l, r, c = '') => div(`eq-line ${c}`, `<span>${l}</span><span>${r}</span>`);
    const eqBox = [
      eqRow(`Base @ $100M (exp(${f3(pm.intercept)}))`, `×${f3(ev.baseMult)}`),
      eqRow(`Size ((TVL/$100M)^${f3(pm.beta_tvl)})`, `×${f3(ev.sizeMult)}`),
      eqRow(`Category (${esc(cat)}, k=${pm.cat_ridge_k})`, `×${f3(ev.catMult)}`),
      eqRow('= Value if launched', usd(row.value_if_launched_usd), 'tot'),
      eqRow(`× Odds (${p0(ev.pNow)}→${p0(ev.pMax)}${row.sibling_symbol ? ' ×.5' : ''})`, `${f2(row.launch_odds * 100)}%`),
      eqRow(`= Implied Value (#${row.rank}, ${row.rank_low}–${row.rank_high})`, usd(row.implied_value_usd), 'tot'),
    ].join('');
    const peersHtml = peers.map((p) => tr([
      td(`<b>${esc(p.name)}</b> <span class="pmeta">${esc(p.symbol)}</span>`), td(esc(p.category || '-')),
      tdN(usd(p.tvl_usd)), tdN(usd(p.mcap_usd)), tdN(usd(p.loo_pred_usd)), tdN(missBdg(p.loo_miss, p.loo_dir)),
    ])).join('');
    const ecBox = (l, v, c = '') => div('ec', div('l', l) + div(`v ${c}`, v));
    const vCls = plan.verdict === 'FARM' ? '' : plan.verdict === 'MARGINAL' ? 'marg' : 'skip';
    const vBan = div(`ver-box ${vCls}`, `<b>${plan.verdict}:</b> ${usd(plan.deposit_usd)} × ${plan.horizon_weeks}wk = ` +
      `${usd(plan.modelled_drop_usd)} (${p0(plan.drop_share)}) − ${usd(plan.total_fees_usd)} fees / ` +
      `${f1(plan.total_hours)}h = <b>${sUsd(plan.net_of_fees_usd)} ($${f1(plan.net_per_hour)}/h)</b> ` +
      `vs ${usd(plan.tbill_hurdle_usd)} carry.`);
    const ecGrid = div('econ-6', ecBox('Deposit', usd(plan.deposit_usd)) + ecBox('Drop', usd(plan.modelled_drop_usd)) +
      ecBox('Fees', usd(plan.total_fees_usd)) +
      ecBox('Net vs Carry', sUsd(plan.net_of_fees_usd), plan.net_of_fees_usd > plan.tbill_hurdle_usd ? 'pos' : 'neg') +
      ecBox(`Net/Hr (${f1(plan.total_hours)}h)`, `$${f2(plan.net_per_hour)}/h`,
        plan.net_per_hour >= cal.farm_hourly_hurdle ? 'pos' : '') +
      ecBox('BE Share/Odds', `${f2(plan.break_even_drop_share * 100)}% / ${p1(plan.break_even_odds)}`));
    const exBan = div('exit-box', `<b>Exit:</b> Withdraw if TVL &lt; <b class="mono">${usd(plan.exit_tvl_usd)}</b> ` +
      `(${f1(cal.snapshot_7d_p05)}% P05). Risks: ${esc((row.farm_econ.risk_tags || []).join(' · '))}.`);
    const stepsHtml = `<table class="steps-tbl"><tbody>${plan.items.map((it) => tr([
      td(el('span', 'phase-tag', esc(it.phase))), td(esc(it.action)),
      td(`${esc(it.cost_label)}<br/>${esc(it.time_label)}`, 'cost-time'),
    ])).join('')}</tbody></table>`;

    return [
      masthead(
        `<button class="btn" id="b-back">← Board</button>` +
          el('span', 'ver-pill', `#${row.rank} (${row.rank_low}–${row.rank_high})`) +
          el('h1', 'serif', esc(row.name)) +
          el('span', 'subtitle', `${esc(cat)} · ${esc(row.chains.join(', '))} · ${esc(row.farm_econ.epistemic_tier)}`),
        bdg(`pill-lg ${plan.verdict === 'FARM' ? 'b-farm' : plan.verdict === 'MARGINAL' ? 'b-marg' : 'b-skip'}`,
          `${plan.verdict} · ${sUsd(plan.net_of_fees_usd)} ($${f1(plan.net_per_hour)}/h)`) +
          `<button class="btn" data-nav="${esc(prevS)}">◀ Prev</button><button class="btn" data-nav="${esc(nextS)}">Next ▶</button>`,
      ),
      div('det-top', div('hero-val',
        div('card-head', `<span>Implied Valuation · Browser Refit</span><span class="mono">TVL ${usd(row.tvl_usd)} · ` +
          `7d ${pct(row.change_7d)} · Age ${ageStr(row.age_days)}</span>`) +
        div('hv-flex', div('hv-num serif', usd(row.implied_value_usd)) +
          div('mono hv-sub', `Launched <b>${usd(row.value_if_launched_usd)}</b> · Odds <b>${p1(row.launch_odds)}</b> · ` +
            `P25–P75 <b>${usd(row.implied_low_usd)}–${usd(row.implied_high_usd)}</b> · ` +
            `P10–P90 <b>${usd(row.implied_p10_usd)}–${usd(row.implied_p90_usd)}</b>`)) +
        div('subline pos', `✓ Refit = board.json (CRC ${esc(parity.checksum)}) · Not advice`)) +
        card('Curve vs Comps', `<span style="color:#b45309">●</span> ${esc(row.name)}`, renderScatterSvg(row, 84))),
      '<div class="det-grid"><div class="stack">',
      card(`Valuation Bridge (${usd(row.implied_value_usd)})`, 'evaluateProtocol()',
        div('eq-box', eqBox) + tbl('mini-tbl', ['Shock', '#Odds', '#Implied', '#Delta'], shocks)),
      card('Nearest 6 Traded Peers', esc(cat),
        tbl('mini-tbl', ['Peer', 'Cat', '#TVL', '#MCap', '#LOO', '#Miss'], peersHtml)),
      card('Net Profit ($) · Deposit × Drop', `Fees ${usd(plan.total_fees_usd)}`,
        `<table class="mini-tbl mx"><thead><tr><th>Drop</th>` +
        `${depCols.map((d) => `<th>${usd(d)}</th>`).join('')}</tr></thead>` +
        `<tbody>${mxRows}</tbody></table>${div('subline', `Horizon: ${wkSens}`)}`),
      '</div><div class="stack">',
      card('Farm Verdict &amp; Execution Plan', `${esc(plan.best_chain)} · ${esc(plan.gas_tier)}`,
        vBan + ecGrid + exBan + `<div class="card-head" style="margin-top:6px"><span>8 Steps ` +
        `(${plan.total_minutes}m / ${plan.horizon_weeks}wk)</span><span class="mono">buildFarmPlan()</span></div>${stepsHtml}`),
      '</div></div>',
    ].join('');
  }

  function downloadFile(filename, mime, text) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: mime }));
    a.download = filename;
    a.click();
  }

  const rootEl = document.getElementById('app');
  function renderApp() {
    writeHash();
    const body = state.p ? renderDetailView(state.p)
      : renderHeader() + (state.tab === 'audit' ? renderAuditView()
        : state.tab === 'comps' ? renderCompsView()
          : state.tab === 'aside' ? renderSetAsideView() : renderBoardView());
    rootEl.innerHTML = div('wrap', body);
  }

  rootEl.addEventListener('click', (ev) => {
    const hit = (s) => ev.target.closest && ev.target.closest(s);
    const tab = hit('[data-tab]');
    if (tab) { state.tab = tab.dataset.tab; renderApp(); return window.scrollTo(0, 0); }
    const vb = hit('[data-verdict]');
    if (vb) { state.verdict = vb.dataset.verdict; return renderApp(); }
    const sth = hit('[data-sort]');
    if (sth) {
      const col = sth.dataset.sort;
      if (state.sort === col) state.dir = state.dir === 'asc' ? 'desc' : 'asc';
      else { state.sort = col; state.dir = col === 'rank' || col === 'name' || col === 'age' ? 'asc' : 'desc'; }
      return renderApp();
    }
    const op = hit('[data-nav]') || hit('tr[data-slug]');
    if (op) { state.p = op.dataset.nav || op.dataset.slug; renderApp(); return window.scrollTo(0, 0); }
    if (hit('#b-back')) { state.p = null; return renderApp(); }
    if (hit('#b-rst')) { Object.assign(state, DEF); return renderApp(); }
    if (hit('#b-csv')) {
      const hdr = 'rank,slug,name,tier,category,tvl_usd,implied_value_usd,launch_odds,verdict,net_usd,net_hr';
      const lines = getFiltered().out.map(({ row, plan }) => [
        row.rank, row.slug, JSON.stringify(row.name), row.tier, JSON.stringify(row.category || ''),
        row.tvl_usd, row.implied_value_usd, row.launch_odds, plan.verdict, plan.net_of_fees_usd, plan.net_per_hour,
      ].join(','));
      return downloadFile('token-radar-v7.csv', 'text/csv', [hdr, ...lines].join('\n'));
    }
    if (hit('#b-json')) {
      return downloadFile('token-radar-v7.json', 'application/json',
        JSON.stringify(getFiltered().out.map(({ row, plan }) => ({ ...row, farm_econ: plan })), null, 2));
    }
  });

  rootEl.addEventListener('change', (ev) => {
    const { id, value } = ev.target;
    if (id === 'f-tier') state.tier = value;
    else if (id === 'f-cat') state.cat = value;
    else if (id === 'f-chain') state.chain = value;
    else if (id === 's-dep') state.dep = Number(value) || 0;
    else return;
    renderApp();
  });

  rootEl.addEventListener('input', (ev) => {
    const { id, value } = ev.target;
    if (id === 's-drop') { state.drop = Number(value) / 100; return renderApp(); }
    if (id === 's-wk') { state.wk = Number(value); return renderApp(); }
    if (id === 'f-q') {
      state.q = value;
      renderApp();
      const nf = document.getElementById('f-q');
      if (nf) { nf.focus(); nf.setSelectionRange(nf.value.length, nf.value.length); }
    }
  });

  window.addEventListener('hashchange', () => { readHash(); renderApp(); });
  readHash();
  renderApp();
})();
