'use strict';
(() => {
  const D = window.RADAR, M = window.RADAR_MODEL;
  if (!D || !M) { document.getElementById('app').textContent = 'Missing RADAR/RADAR_MODEL'; return; }
  const V = M.verifyBoardParity(D), rows = D.rows, L = D.ledger, C = D.calibration, S = D.summary;
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x)), round2 = (n) => Math.round(n * 100) / 100;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtU = (n) => {
    const a = Math.abs(n), s = n < 0 ? '-' : '';
    return a >= 1e9 ? `${s}$${(a / 1e9).toFixed(2)}B` : a >= 1e6 ? `${s}$${(a / 1e6).toFixed(a >= 100e6 ? 0 : 1)}M` : a >= 1e3 ? `${s}$${(a / 1e3).toFixed(a >= 100e3 ? 0 : 1)}k` : `${s}$${a.toFixed(a < 100 ? 2 : 0)}`;
  };
  const fmtS = (n) => `${n > 0 ? '+' : ''}${fmtU(n)}`, fmtP = (p) => (p == null ? '—' : `${p > 0 ? '+' : ''}${p.toFixed(1)}%`), fmtA = (d) => (d == null ? 'legacy' : d >= 365 ? `${(d / 365).toFixed(1)}y` : `${d}d`);
  const p0 = (n) => `${(n * 100).toFixed(0)}%`, p1 = (n) => `${(n * 100).toFixed(1)}%`, d2 = (n) => n.toFixed(2), d1 = (n) => n.toFixed(1);
  const kpi = (l, v, n, c = '') => `<div class="kpi"><div class="lbl">${l}</div><div class="val ${c}">${v}</div><div class="note">${n}</div></div>`;
  const pill = (ok, t) => `<div class="pill ${ok ? 'ok' : 'warn'}">${ok ? '✓' : '!'} ${t}</div>`;
  const card = (t, r, b) => `<div class="card"><div class="ctitle"><span>${t}</span><span class="mono">${r}</span></div>${b}</div>`;
  const eqLn = (l, r, c = '') => `<div class="eq-line ${c}"><span>${l}</span><span>${r}</span></div>`;
  const ecBox = (l, v, c = '') => `<div class="ec"><div class="l">${l}</div><div class="v ${c}">${v}</div></div>`;
  const bdg = (c, t) => `<span class="bdg ${c}">${t}</span>`;
  const tBdg = (t) => bdg(t === 'watchlist' ? 'b-wl' : t === 'large-cap' ? 'b-lc' : 'b-e', t === 'watchlist' ? 'WL' : t === 'large-cap' ? 'LC' : 'E');
  const vBdg = (v) => bdg(v === 'FARM' ? 'b-farm' : v === 'MARGINAL' ? 'b-marg' : 'b-skip', v === 'MARGINAL' ? 'MARG' : v);
  const tdN = (v, c = '') => `<td class="num${c ? ` ${c}` : ''}">${v}</td>`;
  const rng = (t) => `<span class="rng">${t}</span>`;
  const thR = (cols) => `<tr>${cols.map((c) => (c[0] === '#' ? `<th class="num">${c.slice(1)}</th>` : `<th>${c}</th>`)).join('')}</tr>`;
  const tbl = (cls, ths, body) => `<table class="${cls}"><thead>${thR(ths)}</thead><tbody>${body}</tbody></table>`;
  const DEF = { tab: 'board', verdict: 'all', tier: 'all', cat: 'all', chain: 'all', q: '', sort: 'rank', dir: 'asc', dep: 0, drop: C.default_drop_share, wk: C.default_horizon_weeks, exp: null, p: null };
  const st = { ...DEF };

  function readHash() {
    Object.assign(st, DEF);
    const raw = (location.hash || '').replace(/^#/, '');
    if (!raw) return;
    const sp = new URLSearchParams(raw);
    if (sp.get('tab') === 'comps' || sp.get('tab') === 'aside') st.tab = sp.get('tab');
    for (const k of ['verdict', 'tier', 'cat', 'chain', 'q', 'sort', 'exp', 'p']) if (sp.get(k)) st[k] = sp.get(k);
    if (sp.get('dir') === 'desc' || sp.get('dir') === 'asc') st.dir = sp.get('dir');
    if (sp.get('dep')) st.dep = Number(sp.get('dep')) || 0;
    if (sp.get('drop')) st.drop = Number(sp.get('drop')) || C.default_drop_share;
    if (sp.get('wk')) st.wk = Number(sp.get('wk')) || C.default_horizon_weeks;
  }

  function writeHash() {
    const sp = new URLSearchParams();
    if (st.p) sp.set('p', st.p);
    else {
      if (st.tab !== 'board') sp.set('tab', st.tab);
      for (const k of ['verdict', 'tier', 'cat', 'chain', 'q', 'exp']) if (st[k] && st[k] !== 'all') sp.set(k, st[k]);
      if (st.sort !== 'rank') sp.set('sort', st.sort);
      if (st.dir !== 'asc') sp.set('dir', st.dir);
    }
    if (st.dep) sp.set('dep', String(st.dep));
    if (Math.abs(st.drop - C.default_drop_share) > 1e-6) sp.set('drop', String(st.drop));
    if (st.wk !== C.default_horizon_weeks) sp.set('wk', String(st.wk));
    const h = sp.toString();
    history.replaceState(null, '', h ? `#${h}` : location.pathname + location.search);
  }

  const isDef = () => st.dep === 0 && Math.abs(st.drop - C.default_drop_share) < 1e-6 && st.wk === C.default_horizon_weeks;
  const getEcon = (r) => (isDef() ? r.farm_econ : M.buildFarmTicket(r, C, st.dep > 0 ? st.dep : null, st.drop, st.wk));

  function scatterSvg(hiRow, hPx = 110) {
    const W = 430, H = hPx, l = 34, r = 10, t = 8, b = 18, x0 = 6.7, x1 = 10.6, y0 = 5.4, y1 = 10.7, pm = C.price_model;
    const px = (x) => (l + ((clamp(x, x0, x1) - x0) / (x1 - x0)) * (W - l - r)).toFixed(1);
    const py = (y) => (H - b - ((clamp(y, y0, y1) - y0) / (y1 - y0)) * (H - t - b)).toFixed(1);
    const f10 = (tvl, q = 0) => (Math.log(pm.ref_tvl_usd) + pm.intercept + pm.beta_tvl * Math.log(tvl / pm.ref_tvl_usd) + q) / Math.LN10;
    const tA = 10 ** x0, tB = 10 ** x1;
    const poly = `${px(x0)},${py(f10(tA, pm.q75_log))} ${px(x1)},${py(f10(tB, pm.q75_log))} ${px(x1)},${py(f10(tB, pm.q25_log))} ${px(x0)},${py(f10(tA, pm.q25_log))}`;
    const cD = D.live_comparables.map((c) => `<circle cx="${px(Math.log10(c.tvl_usd))}" cy="${py(Math.log10(c.mcap_usd))}" r="2.1" fill="#38bdf8" fill-opacity=".72"/>`).join('');
    const pD = rows.slice(0, 65).map((u) => `<circle cx="${px(Math.log10(u.tvl_usd))}" cy="${py(Math.log10(u.value_if_launched_usd))}" r="1.7" fill="#a78bfa" fill-opacity=".65"/>`).join('');
    const yT = [[6, '1M'], [7, '10M'], [8, '100M'], [9, '1B'], [10, '10B']].map(([v, lb]) =>
      `<line x1="${l}" y1="${py(v)}" x2="${W - r}" y2="${py(v)}" stroke="#1f2c3e"/>` +
      `<text x="${l - 4}" y="${(+py(v) + 3).toFixed(1)}" text-anchor="end" fill="#7f93ad" font-size="8.2">${lb}</text>`,
    ).join('');
    const xT = [[7, '10M'], [8, '100M'], [9, '1B'], [10, '10B']].map(([v, lb]) =>
      `<text x="${px(v)}" y="${H - 5}" text-anchor="middle" fill="#7f93ad" font-size="8.2">${lb}</text>`,
    ).join('');
    const hi = hiRow ? `<circle cx="${px(Math.log10(hiRow.tvl_usd))}" cy="${py(Math.log10(hiRow.value_if_launched_usd))}" r="5" fill="#f59e0b" stroke="#fff" stroke-width="1.4"/>` : '';
    return [
      `<svg class="sc-svg" style="height:${hPx}px" viewBox="0 0 ${W} ${H}">${yT}${xT}<polygon points="${poly}" fill="#22c55e" fill-opacity=".14"/>`,
      `<line x1="${px(x0)}" y1="${py(f10(tA))}" x2="${px(x1)}" y2="${py(f10(tB))}" stroke="#22c55e" stroke-width="1.5"/>${cD}${pD}${hi}</svg>`,
    ].join('');
  }

  const cats = Array.from(new Set(rows.map((r) => r.category || 'Uncategorized'))).sort();
  const cMap = new Map();
  for (const r of rows) cMap.set(r.farm_econ.best_chain, (cMap.get(r.farm_econ.best_chain) || 0) + 1);
  const topCh = Array.from(cMap.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([c]) => c);
  const maxI = Math.max(...rows.map((r) => r.implied_high_usd)), minI = Math.min(...rows.map((r) => r.implied_low_usd));
  const logP = (x) => clamp(((Math.log10(Math.max(minI, x)) - Math.log10(minI)) / (Math.log10(maxI) - Math.log10(minI))) * 100, 0, 100);

  const SK = { rank: (a) => a.r.rank, name: (a) => a.r.name, tvl: (a) => a.r.tvl_usd, g7d: (a) => a.r.change_7d ?? -999, age: (a) => a.r.age_days ?? 99999, odds: (a) => a.r.launch_odds, val: (a) => a.r.value_if_launched_usd, implied: (a) => a.r.implied_value_usd, net: (a) => a.e.net_of_fees_usd, netHr: (a) => a.e.net_per_hour };

  function getFiltered() {
    const econs = rows.map((r) => ({ r, e: getEcon(r) }));
    let fN = 0, mN = 0, sN = 0;
    for (const x of econs) x.e.verdict === 'FARM' ? fN++ : x.e.verdict === 'MARGINAL' ? mN++ : sN++;
    const ql = st.q.trim().toLowerCase();
    const flt = econs.filter(({ r, e }) =>
      (st.verdict === 'all' || e.verdict === st.verdict) && (st.tier === 'all' || r.tier === st.tier) &&
      (st.cat === 'all' || (r.category || 'Uncategorized') === st.cat) &&
      (st.chain === 'all' || r.chains.includes(st.chain) || e.best_chain === st.chain) &&
      (!ql || `${r.name} ${r.slug} ${r.category || ''} ${r.chains.join(' ')}`.toLowerCase().includes(ql)),
    );
    const m = st.dir === 'asc' ? 1 : -1, fn = SK[st.sort] || SK.netHr;
    flt.sort((a, b) => {
      const va = fn(a), vb = fn(b);
      return (typeof va === 'string' ? va.localeCompare(vb) : va - vb) * m || a.r.rank - b.r.rank;
    });
    return { flt, fN, mN, sN };
  }

  function renderInline(r) {
    const tk = M.buildFarmTicket(r, C, st.dep > 0 ? st.dep : null, st.drop, st.wk), ev = M.evaluateProtocol(r, V.pFit, V.oFit, C);
    const nodes = [
      `TVL <b>${fmtU(r.tvl_usd)}</b>`, `Base exp(${d2(C.price_model.intercept)}) <b>×${d2(ev.baseMult)}</b>`,
      `Size (TVL/$100M)^${d2(C.price_model.beta_tvl)} <b>×${d2(ev.sizeMult)}</b>`,
      `Cat (${esc(r.category || 'Uncat')}) <b>×${d2(ev.catMult)}</b>`, `If Launched <b>${fmtU(r.value_if_launched_usd)}</b>`,
      `Odds <b>${p1(r.launch_odds)}</b>`, `Implied (#${r.rank}) <b>${fmtU(r.implied_value_usd)}</b>`,
    ];
    const ch = nodes.map((s, i) => `<div class="eq-node${i === nodes.length - 1 ? ' hi' : ''}">${s}</div>`).join('<span class="mu">→</span>');
    const sr = tk.items.map((it) => `<tr><td><span class="ph">${esc(it.phase)}</span></td><td>${esc(it.action)}</td><td class="ct">${esc(it.cost_label)} · ${esc(it.time_label)}</td></tr>`).join('');
    return [
      '<tr><td colspan="10" class="exp-cell"><div class="ctitle mt4">',
      `<span>Eq &amp; ${tk.items.length}-Step Plan · ${esc(r.name)} (${esc(tk.best_chain)} · ${tk.total_minutes}m)</span>`,
      `<span class="mono">${tk.verdict}:${fmtS(tk.net_of_fees_usd)} (${fmtU(tk.net_per_hour)}/h vs ${fmtU(tk.tbill_hurdle_usd)}) · <button class="eb" data-open="${esc(r.slug)}">Dossier →</button></span>`,
      `</div><div class="eq-chain">${ch}</div><table class="xt"><tbody>${sr}</tbody></table></td></tr>`,
    ].join('');
  }

  function renderCover() {
    const pm = C.price_model, om = C.odds_model, { flt, fN, mN, sN } = getFiltered(), ql = st.q.trim().toLowerCase();
    const segs = [
      ['WL', L.watchlist, '#38bdf8'], ['LC', L.large_cap, '#a78bfa'], ['Early', L.early, '#22c55e'], ['Comps', L.priced_comps, '#0ea5e9'],
      ['Tok', L.other_tokenized, '#64748b'], ['Brg', L.excl_bridges, '#475569'], ['LST', L.excl_lst_btc, '#f59e0b'], ['Sib', L.excl_cex_ver_sib, '#ef4444'],
    ];
    const th = (id, lb, c = '') => `<th data-sort="${id}" class="${c}${st.sort === id ? ' sort' : ''}">${lb}${st.sort === id ? (st.dir === 'asc' ? ' ▲' : ' ▼') : ''}</th>`;
    let hH = '', bH = '';
    if (st.tab === 'board') {
      hH = `<tr>${[th('rank', '# · Band'), th('name', 'Protocol · Category · Route'), th('tvl', 'TVL', 'num'), th('g7d', '7d', 'num'), th('age', 'Age', 'num'), th('odds', 'Odds', 'num'), th('val', 'If Launched', 'num'), th('implied', 'Implied · P25–75', 'num'), th('net', 'Verdict · Net $', 'num'), th('netHr', 'Net / Hr', 'num')].join('')}</tr>`;
      bH = flt.map(({ r, e }) => {
        const exp = st.exp === r.slug, lP = logP(r.implied_low_usd), hP = logP(r.implied_high_usd), mP = logP(r.implied_value_usd);
        const tr = [
          `<tr class="rm ${exp ? 'rx' : ''}" data-slug="${esc(r.slug)}">`,
          `<td class="mono"><button class="eb" data-exp="${esc(r.slug)}">${exp ? '−' : '+'}</button> <b>${r.rank}</b>${rng(`${r.rank_low}–${r.rank_high}`)}</td>`,
          `<td><div class="pname">${esc(r.name)} ${tBdg(r.tier)}${r.sibling_symbol ? ` ${bdg('b-warn', `SIB:${esc(r.sibling_symbol)}`)}` : ''}</div>`,
          `<div class="pmeta">${esc(r.category || 'Uncat')} · ${esc(e.best_chain)} (${esc(e.family_label)})</div></td>`,
          tdN(fmtU(r.tvl_usd)), tdN(fmtP(r.change_7d), r.change_7d == null ? '' : r.change_7d >= 0 ? 'pos' : 'neg'), tdN(fmtA(r.age_days)),
          tdN(`${p1(r.launch_odds)}<div class="pb"><div class="pf" style="width:${p1(r.launch_odds)}"></div></div>`), tdN(fmtU(r.value_if_launched_usd)),
          tdN(`<b>${fmtU(r.implied_value_usd)}</b>${rng(`${fmtU(r.implied_low_usd)}–${fmtU(r.implied_high_usd)}`)}<div class="rb"><div class="rr" style="left:${d1(lP)}%;width:${d1(Math.max(4, hP - lP))}%"></div><div class="rk" style="left:${d1(mP)}%"></div></div>`),
          tdN(`${vBdg(e.verdict)} <span class="${e.net_of_fees_usd > 0 ? 'pos' : 'neg'}">${fmtS(e.net_of_fees_usd)}</span>${rng(`fee ${fmtU(e.total_fees_usd)} · ${fmtU(e.deposit_usd)}`)}`),
          tdN(`<b class="${e.net_per_hour >= C.farm_hourly_hurdle && e.verdict === 'FARM' ? 'pos' : ''}">$${d1(e.net_per_hour)}/h</b>${rng(`${d1(e.total_hours)}h/${e.horizon_weeks}w`)}`), '</tr>',
        ].join('');
        return exp ? tr + renderInline(r) : tr;
      }).join('');
    } else if (st.tab === 'comps') {
      hH = thR(['Sym', 'Comparable · Category · Chains', '#TVL', '#7d', '#Age', '#MC/TVL', '#LOO', '#MCap', '#Miss', '#Dir']);
      bH = D.live_comparables.filter((c) => !ql || `${c.name} ${c.symbol} ${c.category || ''}`.toLowerCase().includes(ql)).map((c) => [
        `<tr><td class="mono"><b>${esc(c.symbol)}</b></td>`,
        `<td><div class="pname">${esc(c.name)}</div><div class="pmeta">${esc(c.category || 'Uncat')} · ${esc(c.chains.slice(0, 3).join(', '))}</div></td>`,
        tdN(fmtU(c.tvl_usd)), tdN(fmtP(c.change_7d), c.change_7d == null ? '' : c.change_7d >= 0 ? 'pos' : 'neg'), tdN(fmtA(c.age_days)),
        tdN(`${c.ratio.toFixed(2)}×`), tdN(fmtU(c.loo_pred_usd)), tdN(`<b>${fmtU(c.mcap_usd)}</b>`),
        tdN(bdg(c.loo_miss <= 3 ? 'b-farm' : 'b-marg', `×${c.loo_miss.toFixed(2)}`)), tdN(c.loo_dir), '</tr>',
      ].join('')).join('');
    } else {
      hH = thR(['Slug', 'Set-Aside Protocol', 'Category', '#TVL', 'MECE Exclusion Reason']);
      bH = D.set_aside.filter((x) => !ql || `${x.name} ${x.slug} ${x.category} ${x.reason}`.toLowerCase().includes(ql)).map((x) =>
        `<tr><td class="mono">${esc(x.slug)}</td><td class="pname">${esc(x.name)}</td><td>${esc(x.category)}</td>${tdN(fmtU(x.tvl_usd))}<td>${bdg('b-warn', esc(x.reason))}</td></tr>`,
      ).join('');
    }

    const stC = (s) => (s === 'kept' ? 'kept' : s === 'tested_not_kept' ? 'rej' : ''), stL = (s) => (s === 'tested_not_kept' ? 'drop' : esc(s));
    const abl1 = pm.ablation.map((a) => `<tr><td>${esc(a.step)}</td>${tdN(`×${d2(a.loo_miss)}`)}${tdN(`×${d2(a.wf_miss)}`)}${tdN(`${p0(a.loo_w3x)}/${p0(a.wf_w3x)}`)}<td class="${stC(a.status)}">${stL(a.status)}</td></tr>`).join('');
    const abl2 = om.ablation.map((a) => `<tr><td>${esc(a.step)}</td>${tdN(a.cv10_brier.toFixed(3))}${tdN(a.wf_brier.toFixed(3))}${tdN(p0(a.wf_acc))}<td class="${stC(a.status)}">${stL(a.status)}</td></tr>`).join('');
    const nShown = st.tab === 'board' ? flt.length : st.tab === 'comps' ? D.live_comparables.length : D.set_aside.length;
    const pillsH = [
      pill(V.refitPriceOk && V.refitOddsOk, 'Huber+Logit=main.ts'), pill(V.ablationOk, 'LOO/WF Abl Exact'),
      pill(V.mismatches === 0, `${rows.length - V.mismatches}/${rows.length} Exact`),
      pill(V.monoOk && V.totalExactOk, `1..${rows.length} & ${fmtU(V.recomputedTotal)}`),
      pill(V.checksumOk, `CRC ${esc(V.checksum)}`), pill(V.wlOk && V.ledgerOk, `40/40 WL · ${V.ledgerSum}/758`),
    ].join('');
    const covR = [
      `<tr><td>≤×3</td>${tdN('—')}${tdN(p0(pm.within3x_loo))}${tdN(p0(pm.within3x_wf))}</tr>`,
      `<tr><td>50%</td>${tdN('50%')}${tdN(p0(pm.cov50_loo))}${tdN(p0(pm.cov50_wf))}</tr>`,
      `<tr><td>80%</td>${tdN('80%')}${tdN(p0(pm.cov80_loo))}${tdN(p0(pm.cov80_wf))}</tr>`,
    ].join('');
    const seL = [
      `<div class="subline"><b>Price:</b> α=${d2(pm.intercept)}±${d2(pm.intercept_se)}, β=${d2(pm.beta_tvl)}±${d2(pm.beta_tvl_se)}</div>`,
      `<div class="subline"><b>Odds:</b> age +${d2(om.beta_age)}±${d2(om.beta_age_se)}, leg +${d2(om.beta_legacy)}±${d2(om.beta_legacy_se)}</div>`,
    ].join('');
    const bt = (cls, attr, lb) => `<button class="btn${cls ? ` ${cls}` : ''}" ${attr}>${lb}</button>`;
    const vb = (v, cls, lb) => bt(`${cls}${st.verdict === v ? ' on' : ''}`.trim(), `data-verdict="${v}"`, lb);
    const tb = (id, lb) => bt(st.tab === id ? 'on' : '', `data-tab="${id}"`, lb);
    const fnTag = (f) => `<span class="fn">${f}()</span>`;
    const sel = (id, all, arr, cur) => `<select id="${id}"><option value="all">${all}</option>${arr.map((c) => `<option${cur === c ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select>`;
    const meceB = `<div class="mece-bar">${segs.map(([, n, col]) => `<div style="width:${(n / L.total) * 100}%;background:${col}"></div>`).join('')}</div>`;
    const meceL = `<div class="mece-leg">${segs.map(([lb, n, col]) => `<span><i class="dot" style="background:${col}"></i>${lb} <b class="mono">${n}</b></span>`).join('')}</div>`;
    const subTxt = `${esc(D.as_of)} · WL ≥ ${fmtU(D.floor_usd)} · Early ≥ $5M · Refitted in browser (not advice)`;
    const scLeg = '<span style="color:#38bdf8">●</span> Live <span style="color:#a78bfa">●</span> Board <span style="color:#22c55e">—</span> Fit';

    return [
      '<div class="wrap"><div class="hdr"><div class="brand"><h1>Token Radar</h1>',
      `<span class="ver">${esc(D.model_version)} · ${esc(C.board_checksum)}</span><span class="sub">${subTxt}</span></div>`,
      `<div class="tabs">${tb('board', `Board (${rows.length})`)}${tb('comps', `Comps (${D.live_comparables.length})`)}${tb('aside', `Aside (${D.set_aside.length})`)}</div></div>`,
      '<div class="hero-top"><div class="kpis">',
      kpi('Universe', `${L.total}/${L.total}`, `${S.board_size} pre · ${L.priced_comps} comps · ${D.set_aside.length} aside`),
      kpi('Implied Total', fmtU(S.total_implied_usd), `${S.board_size} ranked · ${fmtU(S.total_board_tvl_usd)} TVL`),
      kpi('Stage 1 OOS', `×${d2(pm.wf_miss)} WF`, `LOO ×${d2(pm.loo_miss)} vs ×${d2(pm.flat_wf_miss)} flat`),
      kpi('Stage 2 OOS', `${om.cv10_brier.toFixed(3)} Brier`, `10F ${p0(om.cv10_acc)} · WF ${p0(om.wf_acc)}`),
      kpi('Farm ($25/h)', `${fN} FARM`, `${mN} marg · ${sN} skip (2% carry)`, 'pos'),
      kpi('Bootstrap', `${C.n_bootstrap}x`, `${S.watchlist_size}/${S.watchlist_size} WL · med ${fmtU(S.median_implied_usd)}`),
      `</div>${card(`Value vs TVL (${pm.n_comps} Comps)`, scLeg, scatterSvg(null, 110))}</div>`,
      `<div class="eq-strip"><span><b>Implied</b> = ${fnTag('fitStage1Huber')} <span class="mono">$100M×${Math.exp(pm.intercept).toFixed(3)}×(TVL/$100M)^${pm.beta_tvl.toFixed(3)}×e^(cat)</span>`,
      ` × ${fnTag('fitStage2Logistic')} <span class="mono">P(Age,Leg,Sec,TVL,7d)</span></span>`,
      `<span class="grp">${fnTag('runValueAblation')}${fnTag('runOddsAblation')}${fnTag('buildFarmTicket')}</span></div>`,
      `<div class="bar-row">${card(`MECE (${L.total}/${L.total})`, `${S.board_size} ranked`, meceB + meceL)}${card('Browser Refit, Ablations & Parity', isDef() ? '185 rows = board.json' : `${st.dep ? fmtU(st.dep) : 'Plan'} · ${p0(st.drop)} · ${st.wk}w`, `<div class="pills">${pillsH}</div>`)}</div>`,
      '<div class="ev-grid">',
      card('Stage 1 · Value', `WF ≥ ${esc(pm.wf_cutoff)}`, tbl('mt', ['Spec', '#LOO', '#WF', '#≤3×', 'Gate'], abl1)),
      card('Stage 2 · Odds', `WF ≥ ${esc(om.wf_cutoff)}`, tbl('mt', ['Spec', '#10F', '#WF', '#Acc', 'Gate'], abl2)),
      card(`Bands & s.e. (${C.n_bootstrap}x)`, 'P25–75 / P10–90', tbl('mt', ['Cov', '#Nom', '#LOO', '#WF'], covR) + seL),
      '</div><div class="toolbar"><div class="grp"><span class="lbl-s">Verdict</span>',
      vb('all', '', `All (${rows.length})`) + vb('FARM', 'g', `FARM (${fN})`) + vb('MARGINAL', 'a', `MARG (${mN})`) + vb('SKIP', 'r', `SKIP (${sN})`),
      `<select id="f-tier"><option value="all">Tiers (${rows.length})</option><option value="watchlist"${st.tier === 'watchlist' ? ' selected' : ''}>WL (${S.watchlist_size})</option><option value="large-cap"${st.tier === 'large-cap' ? ' selected' : ''}>LC (${S.large_cap_size})</option><option value="early"${st.tier === 'early' ? ' selected' : ''}>Early (${S.early_size})</option></select>`,
      sel('f-cat', `Cats (${cats.length})`, cats, st.cat) + sel('f-chain', `Chains (${topCh.length})`, topCh, st.chain),
      `<input id="f-q" type="search" value="${esc(st.q)}" placeholder="Filter..." /></div><div class="grp">`,
      `<select id="s-dep"><option value="0"${st.dep === 0 ? ' selected' : ''}>Plan</option>${[2500, 5000, 10000, 25000, 50000].map((v) => `<option value="${v}"${st.dep === v ? ' selected' : ''}>${fmtU(v)}</option>`).join('')}</select>`,
      `<span class="lbl-s">Drop ${p0(st.drop)}</span><input id="s-drop" type="range" min="3" max="15" step="1" value="${Math.round(st.drop * 100)}" />`,
      `<span class="lbl-s">${st.wk}w</span><input id="s-wk" type="range" min="4" max="24" step="2" value="${st.wk}" />`,
      `${bt('', 'id="b-rst"', 'Reset')}${bt('', 'id="b-csv"', 'CSV')}${bt('', 'id="b-json"', 'JSON')}</div></div>`,
      `<div class="tbl-wrap"><table class="tbl"><thead>${hH}</thead><tbody>${bH || '<tr><td colspan="10" style="padding:16px;text-align:center">No matches.</td></tr>'}</tbody></table></div>`,
      `<div class="fn-note"><span>Showing ${nShown} rows · [+] inline eq + steps · row for dossier</span><span>${esc(D.as_of)} · Offline</span></div></div>`,
    ].join('');
  }

  function renderDetail(slug) {
    const idx = rows.findIndex((r) => r.slug === slug), r = rows[idx >= 0 ? idx : 0];
    const e = M.buildFarmTicket(r, C, st.dep > 0 ? st.dep : null, st.drop, st.wk), pm = C.price_model, om = C.odds_model;
    const cat = r.category || 'Uncategorized', ev = M.evaluateProtocol(r, V.pFit, V.oFit, C);
    const shocks = [
      [`TVL −30% (${fmtU(r.tvl_usd * 0.7)})`, M.evaluateProtocol({ ...r, tvl_usd: r.tvl_usd * 0.7 }, V.pFit, V.oFit, C)],
      ['7d Growth Reset to 0%', M.evaluateProtocol({ ...r, change_7d: 0 }, V.pFit, V.oFit, C)],
      ['+6 Months Older Tokenless', M.evaluateProtocol({ ...r, age_days: (r.age_days == null ? om.median_age_years * 365 : r.age_days) + 182 }, V.pFit, V.oFit, C)],
    ].map(([lb, s]) => `<tr><td>${lb}</td>${tdN(p1(s.launchOdds))}${tdN(fmtU(s.implied))}${tdN(fmtP(((s.implied / r.implied_value_usd) - 1) * 100), s.implied < r.implied_value_usd ? 'neg' : '')}</tr>`).join('');
    const peers = D.live_comparables.slice().sort((a, b) =>
      ((a.category || 'Uncat') === cat ? 0 : 1) - ((b.category || 'Uncat') === cat ? 0 : 1) ||
      Math.abs(Math.log(a.tvl_usd / r.tvl_usd)) - Math.abs(Math.log(b.tvl_usd / r.tvl_usd)),
    ).slice(0, 6);
    const deps = [2500, 10000, 25000];
    if (!deps.includes(e.deposit_usd)) deps[1] = e.deposit_usd;
    deps.sort((a, b) => a - b);
    const mxHtml = [0.05, 0.1, 0.15].map((ds) => `<tr><td>${p0(ds)}</td>${deps.map((dp) => {
      const net = round2(r.implied_value_usd * ds * (dp / (r.tvl_usd + dp)) - e.total_fees_usd);
      const h = round2(dp * C.tbill_apr * (e.horizon_weeks / 52));
      return `<td class="${net > h && net / Math.max(0.25, e.total_hours) >= C.farm_hourly_hurdle ? 'pos' : net > 0 ? '' : 'neg'}">${fmtS(net)}</td>`;
    }).join('')}</tr>`).join('');
    const wkS = [4, 8, 12, 24].map((w) => {
      const t = M.buildFarmTicket(r, C, e.deposit_usd, e.drop_share, w);
      return `<span>${w}w:<b class="${t.verdict === 'FARM' ? 'pos' : t.net_of_fees_usd > 0 ? '' : 'neg'}">${fmtS(t.net_of_fees_usd)}</b> ($${t.net_per_hour.toFixed(0)}/h)</span>`;
    }).join(' · ');
    const prevS = rows[(idx - 1 + rows.length) % rows.length].slug, nextS = rows[(idx + 1) % rows.length].slug;
    const eqBox = [
      eqLn(`Base @ $100M (exp(${pm.intercept.toFixed(3)}))`, `×${ev.baseMult.toFixed(3)}`),
      eqLn(`Size ((TVL/$100M)^${pm.beta_tvl.toFixed(3)})`, `×${ev.sizeMult.toFixed(3)}`),
      eqLn(`Category (${esc(cat)}, k=${pm.cat_ridge_k})`, `×${ev.catMult.toFixed(3)}`),
      eqLn('= If launched', fmtU(r.value_if_launched_usd), 'tot'),
      eqLn(`× Odds (P ${p0(ev.pNow)}→${p0(ev.pMax)}${r.sibling_symbol ? ' ×0.5' : ''})`, `${d2(r.launch_odds * 100)}%`),
      eqLn(`= Implied (#${r.rank} ${r.rank_low}–${r.rank_high})`, fmtU(r.implied_value_usd), 'tot'),
    ].join('');
    const pRows = peers.map((p) =>
      `<tr><td><b>${esc(p.name)}</b> <span class="pmeta">${esc(p.symbol)}</span></td><td>${esc(p.category || '-')}</td>` +
      `${tdN(fmtU(p.tvl_usd))}${tdN(fmtU(p.mcap_usd))}${tdN(fmtU(p.loo_pred_usd))}${tdN(bdg(p.loo_miss <= 3 ? 'b-farm' : 'b-marg', `×${d2(p.loo_miss)} ${p.loo_dir}`))}</tr>`,
    ).join('');
    const verCls = e.verdict === 'FARM' ? '' : e.verdict === 'MARGINAL' ? 'marg' : 'skip';
    const verBox = `<div class="ver-box ${verCls}"><b>${e.verdict}:</b> ${fmtU(e.deposit_usd)} / ${e.horizon_weeks}w yields ${fmtU(e.modelled_drop_usd)} (${p0(e.drop_share)}) minus ${fmtU(e.total_fees_usd)} fees &amp; ${d1(e.total_hours)}h = <b>${fmtS(e.net_of_fees_usd)} ($${d1(e.net_per_hour)}/h)</b> vs ${fmtU(e.tbill_hurdle_usd)} 2% carry.</div>`;
    const ecGrid = [
      '<div class="econ-6">',
      ecBox('Deposit', fmtU(e.deposit_usd)), ecBox('Drop', fmtU(e.modelled_drop_usd)), ecBox('Fees', fmtU(e.total_fees_usd)),
      ecBox('Net vs 2%', fmtS(e.net_of_fees_usd), e.net_of_fees_usd > e.tbill_hurdle_usd ? 'pos' : 'neg'),
      ecBox(`Net/Hr (${d1(e.total_hours)}h)`, `$${d2(e.net_per_hour)}/h`, e.net_per_hour >= C.farm_hourly_hurdle ? 'pos' : ''),
      ecBox('BE Share/Odds', `${d2(e.break_even_drop_share * 100)}% / ${p1(e.break_even_odds)}`),
      '</div>',
    ].join('');
    const exBox = `<div class="exit-box"><b>Exit:</b> Withdraw if TVL &lt; <b class="mono">${fmtU(e.exit_tvl_usd)}</b> (${d1(C.snapshot_7d_p05)}% P05). Risk: ${esc((r.farm_econ.risk_tags || []).join(' · '))}.</div>`;
    const stRows = e.items.map((it) => `<tr><td><span class="ph">${esc(it.phase)}</span></td><td>${esc(it.action)}</td><td class="ct">${esc(it.cost_label)}<br/>${esc(it.time_label)}</td></tr>`).join('');
    const stTbl = `<div class="ctitle mt4"><span>8 Steps (${e.total_minutes}m / ${e.horizon_weeks}w)</span><span class="mono">buildFarmTicket()</span></div><table class="st"><tbody>${stRows}</tbody></table>`;

    return [
      `<div class="wrap"><div class="hdr"><div class="brand"><button class="btn" id="b-back">← Board</button><span class="ver">#${r.rank} (${r.rank_low}–${r.rank_high})</span><h1>${esc(r.name)}</h1>`,
      `<span class="sub">${esc(cat)} · ${esc(r.chains.join(', '))} · ${esc(r.farm_econ.epistemic_tier)}</span>${r.sibling_symbol ? bdg('b-warn', `SIB ${esc(r.sibling_symbol)} 0.5×`) : ''}</div>`,
      `<div class="grp">${bdg(`${e.verdict === 'FARM' ? 'b-farm' : e.verdict === 'MARGINAL' ? 'b-marg' : 'b-skip'} hvb`, `${e.verdict} · ${fmtS(e.net_of_fees_usd)} ($${d1(e.net_per_hour)}/h)`)}<button class="btn" data-nav="${esc(prevS)}">◀ Prev</button><button class="btn" data-nav="${esc(nextS)}">Next ▶</button></div></div>`,
      `<div class="det-top"><div class="hero-val"><div class="ctitle"><span>Implied Value · Browser Refit</span><span class="mono">TVL ${fmtU(r.tvl_usd)} · 7d ${fmtP(r.change_7d)} · Age ${fmtA(r.age_days)}</span></div>`,
      `<div class="hv-flex"><div class="hv-num">${fmtU(r.implied_value_usd)}</div><div class="mono" style="font-size:11px">Launched <b>${fmtU(r.value_if_launched_usd)}</b> · Odds <b>${p1(r.launch_odds)}</b> · P25–75 <b>${fmtU(r.implied_low_usd)}–${fmtU(r.implied_high_usd)}</b> · P10–90 <b>${fmtU(r.implied_p10_usd)}–${fmtU(r.implied_p90_usd)}</b></div></div>`,
      `<div class="subline pos">✓ Refitted fitStage1Huber() + fitStage2Logistic() = board.json (CRC ${esc(V.checksum)}). Not financial advice.</div></div>`,
      `${card('Curve vs Comps', `<span style="color:#f59e0b">●</span> ${esc(r.name)}`, scatterSvg(r, 76))}</div>`,
      '<div class="det-grid"><div class="stack">',
      card(`How ${fmtU(r.implied_value_usd)} Follows`, 'evaluateProtocol()', `<div class="eq-box">${eqBox}</div><table class="mt mt5"><thead>${thR(['Stress Shock', '#Odds', '#Implied', '#Delta'])}</thead><tbody>${shocks}</tbody></table>`),
      card('Nearest 6 Peers (LOO)', esc(cat), tbl('mt', ['Peer', 'Category', '#TVL', '#MCap', '#LOO', '#Miss'], pRows)),
      card('Net Profit ($) · Deposit × Share', `Fees ${fmtU(e.total_fees_usd)}`, `<table class="mt mx"><thead><tr><th>Drop</th>${deps.map((d) => `<th>${fmtU(d)}</th>`).join('')}</tr></thead><tbody>${mxHtml}</tbody></table><div class="subline">Horizon: ${wkS}</div>`),
      `</div><div class="stack">${card('Net-of-Fees Farm Verdict', `${esc(e.best_chain)} · ${esc(e.gas_tier)}`, verBox + ecGrid + exBox + stTbl)}</div></div></div>`,
    ].join('');
  }

  function dl(name, mime, text) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: mime })); a.download = name; a.click(); }
  const root = document.getElementById('app');
  function renderApp() { writeHash(); root.innerHTML = st.p ? renderDetail(st.p) : renderCover(); bindEvents(); }

  function bindEvents() {
    const ba = (s, fn) => root.querySelectorAll(s).forEach((el) => el.addEventListener('click', (ev) => fn(el, ev)));
    ba('[data-tab]', (el) => { st.tab = el.dataset.tab; st.exp = null; renderApp(); });
    ba('[data-verdict]', (el) => { st.verdict = el.dataset.verdict; renderApp(); });
    ba('[data-sort]', (el) => {
      const k = el.dataset.sort;
      if (st.sort === k) st.dir = st.dir === 'asc' ? 'desc' : 'asc';
      else { st.sort = k; st.dir = k === 'rank' || k === 'name' || k === 'age' ? 'asc' : 'desc'; }
      renderApp();
    });
    ba('[data-exp]', (el, ev) => { ev.stopPropagation(); st.exp = st.exp === el.dataset.exp ? null : el.dataset.exp; renderApp(); });
    ba('[data-open]', (el) => { st.p = el.dataset.open; renderApp(); window.scrollTo(0, 0); });
    ba('tr[data-slug]', (el) => { st.p = el.dataset.slug; renderApp(); window.scrollTo(0, 0); });
    ba('[data-nav]', (el) => { st.p = el.dataset.nav; renderApp(); window.scrollTo(0, 0); });
    const on = (id, ev, fn) => { const el = document.getElementById(id); if (el) el.addEventListener(ev, () => fn(el)); };
    on('b-back', 'click', () => { st.p = null; renderApp(); });
    on('b-rst', 'click', () => { Object.assign(st, DEF); renderApp(); });
    on('b-csv', 'click', () => {
      const hdr = 'rank,slug,name,tier,category,tvl_usd,implied_value_usd,launch_odds,verdict,net_usd,net_hr';
      const lines = getFiltered().flt.map(({ r, e }) => [r.rank, r.slug, JSON.stringify(r.name), r.tier, JSON.stringify(r.category || ''), r.tvl_usd, r.implied_value_usd, r.launch_odds, e.verdict, e.net_of_fees_usd, e.net_per_hour].join(','));
      dl('token-radar-v5.csv', 'text/csv', [hdr, ...lines].join('\n'));
    });
    on('b-json', 'click', () => dl('token-radar-v5.json', 'application/json', JSON.stringify(getFiltered().flt.map(({ r, e }) => ({ ...r, farm_econ: e })), null, 2)));
    for (const [id, ev, fn] of [
      ['f-tier', 'change', (el) => { st.tier = el.value; }], ['f-cat', 'change', (el) => { st.cat = el.value; }],
      ['f-chain', 'change', (el) => { st.chain = el.value; }], ['s-dep', 'change', (el) => { st.dep = Number(el.value) || 0; }],
      ['s-drop', 'input', (el) => { st.drop = Number(el.value) / 100; }], ['s-wk', 'input', (el) => { st.wk = Number(el.value); }],
    ]) on(id, ev, (el) => { fn(el); renderApp(); });
    on('f-q', 'input', (el) => { st.q = el.value; renderApp(); const nf = document.getElementById('f-q'); if (nf) { nf.focus(); nf.setSelectionRange(nf.value.length, nf.value.length); } });
  }

  window.addEventListener('hashchange', () => { readHash(); renderApp(); });
  readHash();
  renderApp();
})();
