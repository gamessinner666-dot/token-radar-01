'use strict';
(() => {
  const D = window.RADAR;
  const M = window.RADAR_MODEL;
  if (!D || !M) {
    document.getElementById('app').textContent = 'Missing RADAR or RADAR_MODEL';
    return;
  }

  const par = M.verifyBoardParity(D);
  const { rows, ledger: L, calibration: cal, summary: sum } = D;
  const pm = cal.price_model;
  const om = cal.odds_model;

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const r2 = (n) => Math.round(n * 100) / 100;
  const f1 = (x) => x.toFixed(1);
  const f2 = (x) => x.toFixed(2);
  const f3 = (x) => x.toFixed(3);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function usd(n) {
    const a = Math.abs(n);
    const sg = n < 0 ? '-' : '';
    if (a >= 1e9) return `${sg}$${f2(a / 1e9)}B`;
    if (a >= 1e6) return `${sg}$${(a / 1e6).toFixed(a >= 100e6 ? 0 : 1)}M`;
    if (a >= 1e3) return `${sg}$${(a / 1e3).toFixed(a >= 100e3 ? 0 : 1)}k`;
    return `${sg}$${a.toFixed(a < 100 ? 2 : 0)}`;
  }

  const sUsd = (n) => `${n > 0 ? '+' : ''}${usd(n)}`;
  const pct = (p) => (p == null ? '—' : `${p > 0 ? '+' : ''}${f1(p)}%`);
  const ageS = (d) => (d == null ? 'legacy' : d >= 365 ? `${f1(d / 365)}y` : `${d}d`);
  const p0 = (x) => `${(x * 100).toFixed(0)}%`;
  const p1 = (x) => `${f1(x * 100)}%`;

  const el = (t, v, c = '') => `<${t}${c ? ` class="${c}"` : ''}>${v}</${t}>`;
  const tr = (cells, a = '') => `<tr${a}>${cells.join('')}</tr>`;
  const td = (v, c = '') => el('td', v, c);
  const tdN = (v, c = '') => td(v, c ? `num ${c}` : 'num');
  const kpi = (l, v, n, c = '') =>
    `<div class="kpi"><div class="lbl">${l}</div><div class="val ${c}">${v}</div><div class="note">${n}</div></div>`;
  const pill = (ok, t) => `<div class="pill ${ok ? 'ok' : 'warn'}">${ok ? '✓' : '!'} ${t}</div>`;
  const card = (t, r, b) =>
    `<div class="card"><div class="ctitle"><span>${t}</span><span class="mono">${r}</span></div>${b}</div>`;
  const eqRow = (l, r, c = '') => `<div class="eq-line ${c}"><span>${l}</span><span>${r}</span></div>`;
  const ecBox = (l, v, c = '') => `<div class="ec"><div class="l">${l}</div><div class="v ${c}">${v}</div></div>`;
  const opt = (v, lb, sel) => `<option value="${esc(v)}"${sel ? ' selected' : ''}>${lb}</option>`;
  const tbl = (cls, cols, body) =>
    `<table class="${cls}"><thead><tr>${cols.map((h) =>
      h[0] === '#' ? `<th class="num">${h.slice(1)}</th>` : `<th>${h}</th>`).join('')}` +
    `</tr></thead><tbody>${body}</tbody></table>`;

  const bdg = (c, t) => `<span class="bdg ${c}">${t}</span>`;
  const tBdg = (t) => bdg(t === 'watchlist' ? 'bw' : t === 'large-cap' ? 'bl' : 'be',
    t === 'watchlist' ? 'WL' : t === 'large-cap' ? 'LC' : 'E');
  const vBdg = (v) => bdg(v === 'FARM' ? 'bf' : v === 'MARGINAL' ? 'bm' : 'bs',
    v === 'MARGINAL' ? 'MARG' : v);
  const mBdg = (m, d = '') => bdg(m <= 3 ? 'bf' : 'bm', `×${f2(m)}${d ? ` ${d}` : ''}`);
  const stCls = (s) => (s === 'kept' ? 'kept' : s === 'tested_not_kept' ? 'rej' : '');
  const stTxt = (s) => (s === 'tested_not_kept' ? 'drop' : esc(s));

  const DEF = {
    tab: 'board', verdict: 'all', tier: 'all', cat: 'all', chain: 'all', q: '',
    sort: 'rank', dir: 'asc', dep: 0, drop: cal.default_drop_share, wk: cal.default_horizon_weeks,
    exp: null, p: null,
  };
  const S = { ...DEF };

  function readHash() {
    Object.assign(S, DEF);
    const raw = (location.hash || '').replace(/^#/, '');
    if (!raw) return;
    const qp = new URLSearchParams(raw);
    const tab = qp.get('tab');
    if (tab === 'audit' || tab === 'comps' || tab === 'aside') S.tab = tab;
    for (const k of ['verdict', 'tier', 'cat', 'chain', 'q', 'sort', 'exp', 'p']) {
      if (qp.get(k)) S[k] = qp.get(k);
    }
    if (qp.get('dir') === 'desc' || qp.get('dir') === 'asc') S.dir = qp.get('dir');
    if (qp.get('dep')) S.dep = Number(qp.get('dep')) || 0;
    if (qp.get('drop')) S.drop = Number(qp.get('drop')) || cal.default_drop_share;
    if (qp.get('wk')) S.wk = Number(qp.get('wk')) || cal.default_horizon_weeks;
  }

  function writeHash() {
    const qp = new URLSearchParams();
    if (S.p) qp.set('p', S.p);
    else {
      if (S.tab !== 'board') qp.set('tab', S.tab);
      for (const k of ['verdict', 'tier', 'cat', 'chain', 'q', 'exp']) {
        if (S[k] && S[k] !== 'all') qp.set(k, S[k]);
      }
      if (S.sort !== 'rank') qp.set('sort', S.sort);
      if (S.dir !== 'asc') qp.set('dir', S.dir);
    }
    if (S.dep) qp.set('dep', String(S.dep));
    if (Math.abs(S.drop - cal.default_drop_share) > 1e-6) qp.set('drop', String(S.drop));
    if (S.wk !== cal.default_horizon_weeks) qp.set('wk', String(S.wk));
    const h = qp.toString();
    history.replaceState(null, '', h ? `#${h}` : location.pathname + location.search);
  }

  const isDef = () => S.dep === 0 &&
    Math.abs(S.drop - cal.default_drop_share) < 1e-6 && S.wk === cal.default_horizon_weeks;
  const getEcon = (r) => (isDef()
    ? { ...r.farm_econ, items: r.farm_items }
    : M.repriceFarmScenario(r, cal, S.dep > 0 ? S.dep : null, S.drop, S.wk));

  function scatterSvg(hi, h = 185) {
    const w = 520;
    const [L, R, T, B, x0, x1, y0, y1] = [38, 12, 10, 22, 6.7, 10.6, 5.4, 10.7];
    const px = (x) => f1(L + ((clamp(x, x0, x1) - x0) / (x1 - x0)) * (w - L - R));
    const py = (y) => f1(h - B - ((clamp(y, y0, y1) - y0) / (y1 - y0)) * (h - T - B));
    const f10 = (tvl, q = 0) => (Math.log(pm.ref_tvl_usd) + pm.intercept +
      pm.beta_tvl * Math.log(tvl / pm.ref_tvl_usd) + q) / Math.LN10;
    const tA = 10 ** x0;
    const tB = 10 ** x1;
    const poly = [
      `${px(x0)},${py(f10(tA, pm.q75_log))}`, `${px(x1)},${py(f10(tB, pm.q75_log))}`,
      `${px(x1)},${py(f10(tB, pm.q25_log))}`, `${px(x0)},${py(f10(tA, pm.q25_log))}`,
    ].join(' ');
    const cDots = D.live_comparables.map((c) =>
      `<circle cx="${px(Math.log10(c.tvl_usd))}" cy="${py(Math.log10(c.mcap_usd))}" r="2.6"/>`).join('');
    const pDots = rows.slice(0, 90).map((r) =>
      `<circle cx="${px(Math.log10(r.tvl_usd))}" cy="${py(Math.log10(r.value_if_launched_usd))}" r="2"/>`).join('');
    const yG = [[6, '$1M'], [7, '$10M'], [8, '$100M'], [9, '$1B'], [10, '$10B']].map(([v, lb]) =>
      `<line x1="${L}" y1="${py(v)}" x2="${w - R}" y2="${py(v)}" stroke="#1d2a3d"/>` +
      `<text x="${L - 5}" y="${f1(+py(v) + 3)}" text-anchor="end">${lb}</text>`).join('');
    const xT = [[7, '$10M'], [8, '$100M'], [9, '$1B'], [10, '$10B']].map(([v, lb]) =>
      `<text x="${px(v)}" y="${h - 6}" text-anchor="middle">${lb}</text>`).join('');
    const hiC = hi ? `<circle cx="${px(Math.log10(hi.tvl_usd))}" ` +
      `cy="${py(Math.log10(hi.value_if_launched_usd))}" r="5.5" fill="#f59e0b" stroke="#fff" stroke-width="1.5"/>` : '';
    return `<svg class="sc-svg" style="height:${h}px" viewBox="0 0 ${w} ${h}">` +
      `<g fill="#7b90aa" font-size="9" font-family="monospace">${yG}${xT}</g>` +
      `<polygon points="${poly}" fill="#22c55e" fill-opacity=".14"/>` +
      `<line x1="${px(x0)}" y1="${py(f10(tA))}" x2="${px(x1)}" y2="${py(f10(tB))}" stroke="#22c55e" stroke-width="1.8"/>` +
      `<g fill="#38bdf8" fill-opacity=".75">${cDots}</g><g fill="#a78bfa" fill-opacity=".65">${pDots}</g>${hiC}</svg>`;
  }

  const cats = Array.from(new Set(rows.map((r) => r.category || 'Uncategorized'))).sort();
  const cMap = new Map();
  for (const r of rows) cMap.set(r.farm_econ.best_chain, (cMap.get(r.farm_econ.best_chain) || 0) + 1);
  const chains = Array.from(cMap.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([c]) => c);
  const hiMax = Math.max(...rows.map((r) => r.implied_high_usd));
  const loMin = Math.min(...rows.map((r) => r.implied_low_usd));
  const bPct = (v) => clamp(
    ((Math.log10(Math.max(loMin, v)) - Math.log10(loMin)) / (Math.log10(hiMax) - Math.log10(loMin))) * 100,
    0,
    100,
  );

  const SKEYS = {
    rank: (x) => x.r.rank, name: (x) => x.r.name, tvl: (x) => x.r.tvl_usd,
    g7d: (x) => x.r.change_7d ?? -999, age: (x) => x.r.age_days ?? 99999, odds: (x) => x.r.launch_odds,
    val: (x) => x.r.value_if_launched_usd, implied: (x) => x.r.implied_value_usd,
    net: (x) => x.e.net_of_fees_usd, netHr: (x) => x.e.net_per_hour,
  };

  function getFiltered() {
    const list = rows.map((r) => ({ r, e: getEcon(r) }));
    let [farmN, margN, skipN] = [0, 0, 0];
    for (const x of list) {
      if (x.e.verdict === 'FARM') farmN++;
      else if (x.e.verdict === 'MARGINAL') margN++;
      else skipN++;
    }
    const ql = S.q.trim().toLowerCase();
    const out = list.filter(({ r, e }) =>
      (S.verdict === 'all' || e.verdict === S.verdict) &&
      (S.tier === 'all' || r.tier === S.tier) &&
      (S.cat === 'all' || (r.category || 'Uncategorized') === S.cat) &&
      (S.chain === 'all' || r.chains.includes(S.chain) || e.best_chain === S.chain) &&
      (!ql || `${r.name} ${r.slug} ${r.category || ''} ${r.chains.join(' ')}`.toLowerCase().includes(ql)));
    const mul = S.dir === 'asc' ? 1 : -1;
    const fn = SKEYS[S.sort] || SKEYS.rank;
    out.sort((a, b) => {
      const va = fn(a);
      const vb = fn(b);
      return (typeof va === 'string' ? va.localeCompare(vb) : va - vb) * mul || a.r.rank - b.r.rank;
    });
    return { out, farmN, margN, skipN };
  }

  function renderHeader() {
    const tb = (id, lb) => `<button class="btn${S.tab === id ? ' on' : ''}" data-tab="${id}">${lb}</button>`;
    return '<div class="hdr"><div class="brand"><h1>Token Radar</h1>' +
      `<span class="ver">${esc(D.model_version)} · CRC ${esc(cal.board_checksum)}</span>` +
      `<span class="sub">Snapshot ${esc(D.as_of)} · WL >= ${usd(D.floor_usd)} · Early >= $5M · Offline (not advice)` +
      `</span></div><div class="tabs">${tb('board', `Board (${rows.length})`)}${tb('audit', 'Model & Audit')}` +
      `${tb('comps', `Live Comps (${D.live_comparables.length})`)}${tb('aside', `Set Aside (${D.set_aside.length})`)}` +
      '</div></div>';
  }

  const stepsHtml = (items) => `<table class="steps-tbl"><tbody>${items.map((it) => tr([
    td(`<span class="ph">${esc(it.phase)}</span>`), td(esc(it.action)),
    td(`${esc(it.cost_label)}<br/>${esc(it.time_label)}`, 'cost-time'),
  ])).join('')}</tbody></table>`;

  function renderExp(r) {
    const e = getEcon(r);
    const ev = M.evaluateProtocol(r, par.pFit, par.oFit, cal);
    const nodes = [
      `TVL <b>${usd(r.tvl_usd)}</b>`, `Base exp(${f2(pm.intercept)}) <b>×${f2(ev.baseMult)}</b>`,
      `Size (TVL/$100M)^${f2(pm.beta_tvl)} <b>×${f2(ev.sizeMult)}</b>`,
      `Cat (${esc(r.category || 'Uncat')}) <b>×${f2(ev.catMult)}</b>`,
      `If Launched <b>${usd(r.value_if_launched_usd)}</b>`, `Odds <b>${p1(r.launch_odds)}</b>`,
      `Implied (#${r.rank}) <b>${usd(r.implied_value_usd)}</b>`,
    ];
    const eqC = nodes.map((n, i) => `<div class="eq-node${i === nodes.length - 1 ? ' hi' : ''}">${n}</div>`)
      .join('<span class="sub">→</span>');
    return '<tr><td colspan="10" class="exp-cell"><div class="ctitle">' +
      `<span>Equation &amp; ${e.items.length}-Step Plan · ${esc(r.name)} (${esc(e.best_chain)} · ${e.total_minutes}m)</span>` +
      `<span class="mono">${e.verdict}: ${sUsd(e.net_of_fees_usd)} (${usd(e.net_per_hour)}/h vs ${usd(e.tbill_hurdle_usd)} carry)` +
      ` · <button class="exp-btn" data-open="${esc(r.slug)}">Open Dossier →</button></span></div>` +
      `<div class="eq-chain">${eqC}</div>${stepsHtml(e.items)}</td></tr>`;
  }

  const filterToolbar = (title, ph, countTxt) =>
    `<div class="toolbar"><div class="grp"><span class="lbl-s">${title}</span>` +
    `<input id="f-q" type="search" value="${esc(S.q)}" placeholder="${ph}" /></div>` +
    `<span class="sub">${countTxt}</span></div>`;

  function renderBoard() {
    const { out, farmN, margN, skipN } = getFiltered();
    const segs = [
      ['WL', L.watchlist, '#38bdf8'], ['LC', L.large_cap, '#a78bfa'], ['Early', L.early, '#22c55e'],
      ['Comps', L.priced_comps, '#0ea5e9'], ['Tok', L.other_tokenized, '#64748b'],
      ['Bridges', L.excl_bridges, '#475569'], ['LST/BTC', L.excl_lst_btc, '#f59e0b'],
      ['Sib/CEX', L.excl_cex_ver_sib, '#ef4444'],
    ];
    const mece = `<div class="mece-bar">${segs.map(([, n, c]) =>
      `<div style="width:${(n / L.total) * 100}%;background:${c}"></div>`).join('')}</div>` +
      `<div class="mece-leg">${segs.map(([lb, n, c]) =>
        `<span><i class="dot" style="background:${c}"></i>${lb} <b class="mono">${n}</b></span>`).join('')}</div>`;
    const pills = [
      pill(par.refitPriceOk && par.refitOddsOk, 'Huber+Logit Refit = main.ts'),
      pill(par.ablationOk, 'Blind LOO/WF Ablations Exact'),
      pill(par.mismatches === 0, `${rows.length - par.mismatches}/${rows.length} Rows Exact`),
      pill(par.monoOk && par.totalExactOk, `Ranks 1–${rows.length} · ${usd(par.recomputedTotal)}`),
      pill(par.checksumOk, `CRC ${esc(par.checksum)} Exact`),
      pill(par.wlOk && par.ledgerOk, `40/40 WL · ${par.ledgerSum}/758 MECE`),
    ].join('');

    const th = (id, lb, c = '') => `<th data-sort="${id}" class="${c}${S.sort === id ? ' sort' : ''}">` +
      `${lb}${S.sort === id ? (S.dir === 'asc' ? ' ▲' : ' ▼') : ''}</th>`;
    const head = `<tr>${[
      th('rank', '# · Band'), th('name', 'Protocol · Category · Lowest-Gas Route'), th('tvl', 'TVL', 'num'),
      th('g7d', '7d', 'num'), th('age', 'Age', 'num'), th('odds', 'Odds', 'num'), th('val', 'If Launched', 'num'),
      th('implied', 'Implied · P25–P75', 'num'), th('net', 'Verdict · Net $', 'num'), th('netHr', 'Net / Hr', 'num'),
    ].join('')}</tr>`;

    const body = out.map(({ r, e }) => {
      const exp = S.exp === r.slug;
      const lp = f1(bPct(r.implied_low_usd));
      const hp = bPct(r.implied_high_usd);
      const mp = f1(bPct(r.implied_value_usd));
      const wp = f1(Math.max(4, hp - Number(lp)));
      const note = e.verdict === 'MARGINAL' && r.tvl_usd >= 1e9 ? 'capped $25k vs whale TVL'
        : `fee ${usd(e.total_fees_usd)} · ${usd(e.deposit_usd)}`;
      const sib = r.sibling_symbol ? ` ${bdg('bx', `SIB:${esc(r.sibling_symbol)}`)}` : '';
      const g7c = r.change_7d == null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      const hrc = e.net_per_hour >= cal.farm_hourly_hurdle && e.verdict === 'FARM' ? 'pos' : '';
      const row = tr([
        td(`<button class="exp-btn" data-exp="${esc(r.slug)}">${exp ? '−' : '+'}</button> <b>${r.rank}</b>` +
          `<span class="rng">${r.rank_low}–${r.rank_high}</span>`, 'mono'),
        td(`<div class="pname">${esc(r.name)} ${tBdg(r.tier)}${sib}</div>` +
          `<div class="pmeta">${esc(r.category || 'Uncat')} · ${esc(e.best_chain)} (${esc(e.family_label)})</div>`),
        tdN(usd(r.tvl_usd)), tdN(pct(r.change_7d), g7c), tdN(ageS(r.age_days)),
        tdN(`${p1(r.launch_odds)}<div class="pbar"><div class="pfill" style="width:${p1(r.launch_odds)}"></div></div>`),
        tdN(usd(r.value_if_launched_usd)),
        tdN(`<b>${usd(r.implied_value_usd)}</b><span class="rng">${usd(r.implied_low_usd)}–${usd(r.implied_high_usd)}</span>` +
          `<div class="rbar"><div class="rrange" style="left:${lp}%;width:${wp}%"></div><div class="rmark" style="left:${mp}%"></div></div>`),
        tdN(`${vBdg(e.verdict)} <span class="${e.net_of_fees_usd > 0 ? 'pos' : 'neg'}">${sUsd(e.net_of_fees_usd)}</span>` +
          `<span class="rng">${note}</span>`),
        tdN(`<b class="${hrc}">$${f1(e.net_per_hour)}/h</b><span class="rng">${f1(e.total_hours)}h / ${e.horizon_weeks}w</span>`),
      ], ` class="row-main${exp ? ' row-exp' : ''}" data-slug="${esc(r.slug)}"`);
      return exp ? row + renderExp(r) : row;
    }).join('');

    const vb = (v, c, lb) => `<button class="btn ${c}${S.verdict === v ? ' on' : ''}" data-verdict="${v}">${lb}</button>`;
    return [
      '<div class="kpi-row">',
      kpi('Universe Accounted', `${L.total} / ${L.total}`,
        `${sum.board_size} pre-token · ${L.priced_comps} comps · ${D.set_aside.length} set aside`),
      kpi('Board Implied Total', usd(sum.total_implied_usd),
        `${sum.board_size} ranked · ${usd(sum.total_board_tvl_usd)} TVL · 200x bootstrap`),
      kpi('Stage 1 · Value OOS', `×${f2(pm.wf_miss)} WF`,
        `LOO ×${f2(pm.loo_miss)} vs ×${f2(pm.flat_wf_miss)} flat median`),
      kpi('Stage 2 · Odds OOS', `${f3(om.cv10_brier)} Brier`,
        `10F ${p0(om.cv10_acc)} · WF ${p0(om.wf_acc)} (legacy + 6 sectors)`),
      kpi('Farmable ($25/h · 2% Carry)', `${farmN} FARM`,
        `${margN} marg · ${skipN} skip · Model & Audit tab`, 'pos'),
      '</div><div class="trust-row">',
      card(`MECE Universe (${L.total}/${L.total})`, `${sum.board_size} ranked`, mece),
      card('Live Browser Refit, Ablations &amp; Parity',
        isDef() ? '185 rows = board.json' : 'Live Repriced Scenario', `<div class="pills">${pills}</div>`),
      '</div><div class="toolbar"><div class="grp"><span class="lbl-s">Verdict</span>',
      vb('all', '', `All (${rows.length})`) + vb('FARM', 'g', `FARM (${farmN})`) +
        vb('MARGINAL', 'a', `MARG (${margN})`) + vb('SKIP', 'r', `SKIP (${skipN})`),
      `<select id="f-tier">${opt('all', `All Tiers (${rows.length})`, S.tier === 'all')}` +
        opt('watchlist', `WL (${sum.watchlist_size})`, S.tier === 'watchlist') +
        opt('large-cap', `LC (${sum.large_cap_size})`, S.tier === 'large-cap') +
        opt('early', `Early (${sum.early_size})`, S.tier === 'early') + '</select>',
      `<select id="f-cat">${opt('all', `All Cats (${cats.length})`, S.cat === 'all')}` +
        `${cats.map((c) => opt(c, esc(c), S.cat === c)).join('')}</select>`,
      `<select id="f-chain">${opt('all', `All Chains (${chains.length})`, S.chain === 'all')}` +
        `${chains.map((c) => opt(c, esc(c), S.chain === c)).join('')}</select>`,
      `<input id="f-q" type="search" value="${esc(S.q)}" placeholder="Filter protocol..." /></div><div class="grp">`,
      `<select id="s-dep">${opt(0, 'Plan Deposit (0.02%)', S.dep === 0)}` +
        `${[2500, 5000, 10000, 25000, 50000].map((v) => opt(v, usd(v), S.dep === v)).join('')}</select>`,
      `<span class="lbl-s">Drop ${p0(S.drop)}</span>` +
        `<input id="s-drop" type="range" min="3" max="15" step="1" value="${Math.round(S.drop * 100)}" />`,
      `<span class="lbl-s">${S.wk}wk</span>` +
        `<input id="s-wk" type="range" min="4" max="24" step="2" value="${S.wk}" />`,
      '<button class="btn" id="b-rst">Reset</button><button class="btn" id="b-csv">CSV</button>' +
        '<button class="btn" id="b-json">JSON</button></div></div>',
      `<div class="tbl-wrap"><table class="tbl"><thead>${head}</thead><tbody>` +
        `${body || '<tr><td colspan="10" style="padding:18px;text-align:center">No matching protocols.</td></tr>'}` +
        '</tbody></table></div>',
      `<div class="foot-note"><span>Showing ${out.length} ranked · Click [+] for equations + 8 steps, or row for Dossier` +
        `</span><span>Snapshot ${esc(D.as_of)} · Offline</span></div>`,
    ].join('');
  }

  function renderAudit() {
    const s1 = pm.ablation.map((a) => tr([
      td(esc(a.step)), tdN(`×${f2(a.loo_miss)}`), tdN(`×${f2(a.wf_miss)}`),
      tdN(`${p0(a.loo_w3x)} / ${p0(a.wf_w3x)}`), td(stTxt(a.status), stCls(a.status)),
    ])).join('');
    const s2 = om.ablation.map((a) => tr([
      td(esc(a.step)), tdN(f3(a.cv10_brier)), tdN(f3(a.wf_brier)),
      tdN(`${p1(a.cv10_acc)} / ${p1(a.wf_acc)}`), td(stTxt(a.status), stCls(a.status)),
    ])).join('');
    const cov = [
      tr([td('Within ×3 error'), tdN('—'), tdN(p0(pm.within3x_loo)), tdN(p0(pm.within3x_wf))]),
      tr([td('Inside P25–P75'), tdN('50%'), tdN(p0(pm.cov50_loo)), tdN(p0(pm.cov50_wf))]),
      tr([td('Inside P10–P90'), tdN('80%'), tdN(p0(pm.cov80_loo)), tdN(p0(pm.cov80_wf))]),
    ].join('');
    const c6 = D.live_comparables.slice().sort((a, b) => b.tvl_usd - a.tvl_usd).slice(0, 6).map((c) => tr([
      td(`<b>${esc(c.symbol)}</b> ${esc(c.name)}`), td(esc(c.category)),
      tdN(usd(c.tvl_usd)), tdN(usd(c.loo_pred_usd)), tdN(`<b>${usd(c.mcap_usd)}</b>`),
      tdN(mBdg(c.loo_miss, c.loo_dir)),
    ])).join('');
    const a6 = D.set_aside.slice(0, 6).map((x) => tr([
      td(`<b>${esc(x.name)}</b>`), td(esc(x.category)), tdN(usd(x.tvl_usd)), td(bdg('bx', esc(x.reason))),
    ])).join('');

    return [
      '<div class="eq-strip"><span><b>Implied Value</b> = <span class="fn">fitStage1Huber()</span> ' +
        `<span class="mono">$100M×${f3(Math.exp(pm.intercept))}×(TVL/$100M)^${f3(pm.beta_tvl)}` +
        '×e^(cat_k64)</span> × <span class="fn">fitStage2Logistic()</span> ' +
        '<span class="mono">P(Age,Legacy,Sector,TVL,7d)</span></span>' +
        '<span class="grp"><span class="fn">runValueAblation()</span><span class="fn">runOddsAblation()</span>' +
        '<span class="fn">repriceFarmScenario()</span><span class="fn">verifyBoardParity()</span></span></div>',
      '<div class="audit-top">',
      card(`Log-Log Valuation Curve (${pm.n_comps} Live Comps &amp; ${sum.board_size} Board)`,
        '<span style="color:#38bdf8">●</span> Comps <span style="color:#a78bfa">●</span> Board ' +
          '<span style="color:#22c55e">—</span> Huber + P25–75', scatterSvg(null, 185)),
      card(`Conformal Band Honesty &amp; ${cal.n_bootstrap}× Bootstrap s.e.`, 'Out-of-sample verified',
        tbl('mini-tbl', ['Coverage Target', '#Nominal', '#LOO', '#WF'], cov) +
        `<div class="subline"><b>Stage 1 Huber (k=${pm.cat_ridge_k}):</b> α=${f3(pm.intercept)}±${f3(pm.intercept_se)}, ` +
        `β_tvl=${f3(pm.beta_tvl)}±${f3(pm.beta_tvl_se)}, cat [${f3(pm.cat_adj_min)}, +${f3(pm.cat_adj_max)}]</div>` +
        `<div class="subline"><b>Stage 2 Logit (λ=1.5):</b> age +${f3(om.beta_age)}±${f3(om.beta_age_se)}, ` +
        `leg +${f3(om.beta_legacy)}±${f3(om.beta_legacy_se)}, tvl ${f3(om.beta_tvl)}±${f3(om.beta_tvl_se)}, ` +
        `7d ${f3(om.beta_g7d)}±${f3(om.beta_g7d_se)}</div><div class="subline pos"><b>Browser Refit Parity:</b> ` +
        `All ${rows.length}/${rows.length} rows &amp; ablations match main.ts (CRC ${esc(par.checksum)}).</div>`),
      '</div><div class="audit-two">',
      card(`Stage 1 · Value if Launched Ablation (n=${pm.n_comps} Comps)`, `WF >= ${esc(pm.wf_cutoff)}`,
        tbl('mini-tbl', ['Specification', '#LOO Med', '#WF Med', '#LOO / WF <=3x', 'Gate'], s1)),
      card(`Stage 2 · Conditional Launch Odds Ablation (n=${om.n_peers} Peers)`, `WF >= ${esc(om.wf_cutoff)}`,
        tbl('mini-tbl', ['Feature Set', '#10F Brier', '#WF Brier', '#10F / WF Acc', 'Gate'], s2)),
      '</div><div class="audit-two">',
      card(`Top Live Comps by TVL (${D.live_comparables.length} Peers · Blind LOO)`,
        `<button class="exp-btn" data-tab="comps">View All ${D.live_comparables.length} Comps →</button>`,
        tbl('mini-tbl', ['Protocol', 'Category', '#TVL', '#Blind LOO', '#Live MCap', '#Error'], c6)),
      card(`Sample Set-Aside Exclusions (${D.set_aside.length} MECE Non-Candidates)`,
        `<button class="exp-btn" data-tab="aside">View All ${D.set_aside.length} Excluded →</button>`,
        tbl('mini-tbl', ['Protocol', 'Category', '#TVL', 'MECE Exclusion Reason'], a6)),
      '</div>',
    ].join('');
  }

  function renderComps() {
    const ql = S.q.trim().toLowerCase();
    const list = D.live_comparables.filter((c) => !ql || `${c.name} ${c.symbol} ${c.category}`.toLowerCase().includes(ql));
    const body = list.map((c) => tr([
      td(`<b>${esc(c.symbol)}</b>`, 'mono'),
      td(`<div class="pname">${esc(c.name)}</div><div class="pmeta">${esc(c.category)} · ${esc(c.chains.slice(0, 3).join(', '))}</div>`),
      tdN(usd(c.tvl_usd)), tdN(pct(c.change_7d), c.change_7d == null ? '' : c.change_7d >= 0 ? 'pos' : 'neg'),
      tdN(ageS(c.age_days)), tdN(`${f2(c.ratio)}×`), tdN(usd(c.loo_pred_usd)),
      tdN(`<b>${usd(c.mcap_usd)}</b>`), tdN(mBdg(c.loo_miss)), tdN(c.loo_dir),
    ])).join('');
    return filterToolbar('Clean Traded Comps (mcap_usd &gt; 0)', 'Filter comps...', `Showing ${list.length} / ${D.live_comparables.length}`) +
      `<div class="tbl-wrap">${tbl('tbl', ['Symbol', 'Protocol · Category · Chains', '#TVL', '#7d', '#Age',
        '#MCap/TVL', '#Blind LOO', '#Live MCap', '#Miss', '#Dir'], body)}</div>`;
  }

  function renderAside() {
    const ql = S.q.trim().toLowerCase();
    const list = D.set_aside.filter((x) => !ql || `${x.name} ${x.slug} ${x.category} ${x.reason}`.toLowerCase().includes(ql));
    const body = list.map((x) => tr([
      td(esc(x.slug), 'mono'), td(esc(x.name), 'pname'), td(esc(x.category)),
      tdN(usd(x.tvl_usd)), td(bdg('bx', esc(x.reason))),
    ])).join('');
    return filterToolbar('MECE Excluded Tokenless Protocols', 'Filter excluded...', `Showing ${list.length} / ${D.set_aside.length}`) +
      `<div class="tbl-wrap">${tbl('tbl', ['Slug', 'Protocol', 'Category', '#TVL', 'MECE Exclusion Reason'], body)}</div>`;
  }

  function renderDetail(slug) {
    const idx = rows.findIndex((r) => r.slug === slug);
    const r = rows[idx >= 0 ? idx : 0];
    const e = getEcon(r);
    const cat = r.category || 'Uncategorized';
    const ev = M.evaluateProtocol(r, par.pFit, par.oFit, cal);
    const shocks = [
      [`TVL −30% (${usd(r.tvl_usd * 0.7)})`, M.evaluateProtocol({ ...r, tvl_usd: r.tvl_usd * 0.7 }, par.pFit, par.oFit, cal)],
      ['7d Growth Reset to 0%', M.evaluateProtocol({ ...r, change_7d: 0 }, par.pFit, par.oFit, cal)],
      ['+6 Months Older Tokenless', M.evaluateProtocol(
        { ...r, age_days: (r.age_days == null ? om.median_age_years * 365 : r.age_days) + 182 }, par.pFit, par.oFit, cal)],
    ].map(([lb, s]) => tr([
      td(lb), tdN(p1(s.launchOdds)), tdN(usd(s.implied)),
      tdN(pct(((s.implied / r.implied_value_usd) - 1) * 100), s.implied < r.implied_value_usd ? 'neg' : ''),
    ])).join('');

    const peers = D.live_comparables.slice().sort((a, b) =>
      ((a.category || 'Uncat') === cat ? 0 : 1) - ((b.category || 'Uncat') === cat ? 0 : 1) ||
      Math.abs(Math.log(a.tvl_usd / r.tvl_usd)) - Math.abs(Math.log(b.tvl_usd / r.tvl_usd))).slice(0, 6);
    const dCols = [2500, 10000, 25000];
    if (!dCols.includes(e.deposit_usd)) dCols[1] = e.deposit_usd;
    dCols.sort((a, b) => a - b);

    const mxRows = [0.05, 0.10, 0.15].map((ds) => tr([td(`${p0(ds)} drop`), ...dCols.map((dp) => {
      const net = r2(r.implied_value_usd * ds * (dp / (r.tvl_usd + dp)) - e.total_fees_usd);
      const hurdle = r2(dp * cal.tbill_apr * (e.horizon_weeks / 52));
      const cls = net > hurdle && net / Math.max(0.25, e.total_hours) >= cal.farm_hourly_hurdle ? 'pos' : net > 0 ? '' : 'neg';
      return td(sUsd(net), cls);
    })])).join('');
    const wkSens = [4, 8, 12, 24].map((wk) => {
      const a = M.repriceFarmScenario(r, cal, e.deposit_usd, e.drop_share, wk);
      return `<span>${wk}w: <b class="${a.verdict === 'FARM' ? 'pos' : a.net_of_fees_usd > 0 ? '' : 'neg'}">` +
        `${sUsd(a.net_of_fees_usd)}</b> ($${a.net_per_hour.toFixed(0)}/h)</span>`;
    }).join(' · ');
    const pSlug = rows[(idx - 1 + rows.length) % rows.length].slug;
    const nSlug = rows[(idx + 1) % rows.length].slug;

    const eqBox = [
      eqRow(`Base @ $100M TVL (exp(${f3(pm.intercept)}))`, `×${f3(ev.baseMult)}`),
      eqRow(`Size ((TVL/$100M)^${f3(pm.beta_tvl)})`, `×${f3(ev.sizeMult)}`),
      eqRow(`Category (${esc(cat)}, k=${pm.cat_ridge_k})`, `×${f3(ev.catMult)}`),
      eqRow('= Value if launched', usd(r.value_if_launched_usd), 'tot'),
      eqRow(`× Odds (P ${p0(ev.pNow)} → ${p0(ev.pMax)}${r.sibling_symbol ? ' × 0.5' : ''})`, `${f2(r.launch_odds * 100)}%`),
      eqRow(`= Implied Value (rank ${r.rank_low}–${r.rank_high})`, usd(r.implied_value_usd), 'tot'),
    ].join('');
    const pRows = peers.map((p) => tr([
      td(`<b>${esc(p.name)}</b> <span class="pmeta">${esc(p.symbol)}</span>`), td(esc(p.category || '-')),
      tdN(usd(p.tvl_usd)), tdN(usd(p.mcap_usd)), tdN(usd(p.loo_pred_usd)), tdN(mBdg(p.loo_miss, p.loo_dir)),
    ])).join('');
    const vCls = e.verdict === 'FARM' ? '' : e.verdict === 'MARGINAL' ? 'marg' : 'skip';
    const vBan = `<div class="ver-box ${vCls}"><b>${e.verdict}:</b> ${usd(e.deposit_usd)} for ${e.horizon_weeks}wk ` +
      `yields a modelled ${usd(e.modelled_drop_usd)} (${p0(e.drop_share)}) minus ${usd(e.total_fees_usd)} fees ` +
      `&amp; ${f1(e.total_hours)}h = <b>${sUsd(e.net_of_fees_usd)} ($${f1(e.net_per_hour)}/h)</b> ` +
      `vs ${usd(e.tbill_hurdle_usd)} 2% carry.</div>`;
    const ecGrid = `<div class="econ-6">${ecBox('Plan Deposit', usd(e.deposit_usd))}` +
      `${ecBox('Modelled Drop', usd(e.modelled_drop_usd))}${ecBox('Gas &amp; Ops Fees', usd(e.total_fees_usd))}` +
      `${ecBox('Net vs 2% Carry', sUsd(e.net_of_fees_usd), e.net_of_fees_usd > e.tbill_hurdle_usd ? 'pos' : 'neg')}` +
      `${ecBox(`Net / Hr (${f1(e.total_hours)}h)`, `$${f2(e.net_per_hour)}/h`,
        e.net_per_hour >= cal.farm_hourly_hurdle ? 'pos' : '')}` +
      `${ecBox('BE Share / Odds', `${f2(e.break_even_drop_share * 100)}% / ${p1(e.break_even_odds)}`)}</div>`;
    const exBan = `<div class="exit-box"><b>Exit Trigger:</b> Withdraw if TVL drops below ` +
      `<b class="mono">${usd(e.exit_tvl_usd)}</b> (${f1(cal.snapshot_7d_p05)}% P05 stress). ` +
      `Risk: ${esc((r.farm_econ.risk_tags || []).join(' · '))}.</div>`;

    return [
      `<div class="hdr"><div class="brand"><button class="btn" id="b-back">← Board</button>` +
        `<span class="ver">#${r.rank} (${r.rank_low}–${r.rank_high})</span><h1>${esc(r.name)}</h1>` +
        `<span class="sub">${esc(cat)} · ${esc(r.chains.join(', '))} · ${esc(r.farm_econ.epistemic_tier)}</span></div>` +
        `<div class="grp"><span class="bdg ${e.verdict === 'FARM' ? 'bf' : e.verdict === 'MARGINAL' ? 'bm' : 'bs'}" ` +
        `style="font-size:11.5px;padding:4px 9px">${e.verdict} · ${sUsd(e.net_of_fees_usd)} ($${f1(e.net_per_hour)}/h)</span>` +
        `<button class="btn" data-nav="${esc(pSlug)}">◀ Prev</button><button class="btn" data-nav="${esc(nSlug)}">Next ▶</button></div></div>`,
      `<div class="det-top"><div class="hero-val"><div class="ctitle"><span>Implied Valuation · Browser Refit</span>` +
        `<span class="mono">TVL ${usd(r.tvl_usd)} · 7d ${pct(r.change_7d)} · Age ${ageS(r.age_days)}</span></div>` +
        `<div class="hv-flex"><div class="hv-num">${usd(r.implied_value_usd)}</div>` +
        `<div class="mono" style="font-size:11.5px">Launched <b>${usd(r.value_if_launched_usd)}</b> · Odds ` +
        `<b>${p1(r.launch_odds)}</b> · P25–P75 <b>${usd(r.implied_low_usd)}–${usd(r.implied_high_usd)}</b> · ` +
        `P10–P90 <b>${usd(r.implied_p10_usd)}–${usd(r.implied_p90_usd)}</b></div></div>` +
        `<div class="subline pos">✓ Refitted live via fitStage1Huber() + fitStage2Logistic() = board.json ` +
        `(CRC ${esc(par.checksum)}). Not financial advice.</div></div>` +
        `${card('Curve Position vs Comps', `<span style="color:#f59e0b">●</span> ${esc(r.name)}`, scatterSvg(r, 84))}</div>`,
      '<div class="det-grid"><div class="stack">',
      card(`How ${usd(r.implied_value_usd)} Follows From Snapshot`, 'evaluateProtocol()',
        `<div class="eq-box">${eqBox}</div>${tbl('mini-tbl', ['Stress Shock', '#Odds', '#Implied', '#Delta'], shocks)}`),
      card('Nearest 6 Traded Peers (Blind LOO)', esc(cat),
        tbl('mini-tbl', ['Peer', 'Category', '#TVL', '#MCap', '#LOO', '#Miss'], pRows)),
      card('Net Profit ($) Matrix · Deposit × Drop Share', `Fees ${usd(e.total_fees_usd)}`,
        `<table class="mini-tbl mx"><thead><tr><th>Drop</th>${dCols.map((d) => `<th>${usd(d)}</th>`).join('')}` +
        `</tr></thead><tbody>${mxRows}</tbody></table><div class="subline">Horizon: ${wkSens}</div>`),
      '</div><div class="stack">',
      card('Net-of-Fees Farm Verdict &amp; Execution Plan', `${esc(e.best_chain)} · ${esc(e.gas_tier)}`,
        vBan + ecGrid + exBan + `<div class="ctitle" style="margin-top:6px"><span>8 Costed &amp; Timed Steps ` +
        `(${e.total_minutes}m / ${e.horizon_weeks}wk)</span><span class="mono">repriceFarmScenario()</span></div>` +
        stepsHtml(e.items)),
      '</div></div>',
    ].join('');
  }

  function downloadFile(name, mime, text) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: mime }));
    a.download = name;
    a.click();
  }

  const root = document.getElementById('app');
  function renderApp() {
    writeHash();
    const inner = S.p ? renderDetail(S.p)
      : renderHeader() + (S.tab === 'audit' ? renderAudit()
        : S.tab === 'comps' ? renderComps()
        : S.tab === 'aside' ? renderAside() : renderBoard());
    root.innerHTML = `<div class="wrap">${inner}</div>`;
    bindEvents();
  }

  function bindEvents() {
    const onAll = (sel, fn) => root.querySelectorAll(sel).forEach((el) => el.addEventListener('click', (ev) => fn(el, ev)));
    onAll('[data-tab]', (el) => { S.tab = el.dataset.tab; S.exp = null; renderApp(); window.scrollTo(0, 0); });
    onAll('[data-verdict]', (el) => { S.verdict = el.dataset.verdict; renderApp(); });
    onAll('[data-sort]', (el) => {
      const col = el.dataset.sort;
      if (S.sort === col) S.dir = S.dir === 'asc' ? 'desc' : 'asc';
      else { S.sort = col; S.dir = col === 'rank' || col === 'name' || col === 'age' ? 'asc' : 'desc'; }
      renderApp();
    });
    onAll('[data-exp]', (el, ev) => { ev.stopPropagation(); S.exp = S.exp === el.dataset.exp ? null : el.dataset.exp; renderApp(); });
    onAll('[data-open]', (el) => { S.p = el.dataset.open; renderApp(); window.scrollTo(0, 0); });
    onAll('tr[data-slug]', (el) => { S.p = el.dataset.slug; renderApp(); window.scrollTo(0, 0); });
    onAll('[data-nav]', (el) => { S.p = el.dataset.nav; renderApp(); window.scrollTo(0, 0); });

    const byId = (id, ev, fn) => { const el = document.getElementById(id); if (el) el.addEventListener(ev, () => fn(el)); };
    byId('b-back', 'click', () => { S.p = null; renderApp(); });
    byId('b-rst', 'click', () => { Object.assign(S, DEF); renderApp(); });
    byId('b-csv', 'click', () => {
      const hdr = 'rank,slug,name,tier,category,tvl_usd,implied_value_usd,launch_odds,verdict,net_usd,net_hr';
      const lines = getFiltered().out.map(({ r, e }) => [
        r.rank, r.slug, JSON.stringify(r.name), r.tier, JSON.stringify(r.category || ''),
        r.tvl_usd, r.implied_value_usd, r.launch_odds, e.verdict, e.net_of_fees_usd, e.net_per_hour,
      ].join(','));
      downloadFile('token-radar-v6.csv', 'text/csv', [hdr, ...lines].join('\n'));
    });
    byId('b-json', 'click', () => downloadFile('token-radar-v6.json', 'application/json',
      JSON.stringify(getFiltered().out.map(({ r, e }) => ({ ...r, farm_econ: e })), null, 2)));
    for (const [id, ev, fn] of [
      ['f-tier', 'change', (el) => { S.tier = el.value; }], ['f-cat', 'change', (el) => { S.cat = el.value; }],
      ['f-chain', 'change', (el) => { S.chain = el.value; }], ['s-dep', 'change', (el) => { S.dep = Number(el.value) || 0; }],
      ['s-drop', 'input', (el) => { S.drop = Number(el.value) / 100; }], ['s-wk', 'input', (el) => { S.wk = Number(el.value); }],
    ]) byId(id, ev, (el) => { fn(el); renderApp(); });
    byId('f-q', 'input', (el) => {
      S.q = el.value;
      renderApp();
      const nf = document.getElementById('f-q');
      if (nf) { nf.focus(); nf.setSelectionRange(nf.value.length, nf.value.length); }
    });
  }

  window.addEventListener('hashchange', () => { readHash(); renderApp(); });
  readHash();
  renderApp();
})();
