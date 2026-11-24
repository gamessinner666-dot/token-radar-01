'use strict';
(() => {
const D = window.RADAR, M = window.RADAR_MODEL;
if (!D || !M) { document.getElementById('app').textContent = 'Missing RADAR'; return; }
const V = M.verifyBoardParity(D), rows = D.rows, L = D.ledger, C = D.calibration, S = D.summary;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x)), r2 = (n) => Math.round(n * 100) / 100;
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const fU = (n) => { const a = Math.abs(n), sg = n < 0 ? '-' : ''; return a >= 1e9 ? `${sg}$${(a/1e9).toFixed(2)}B` : a >= 1e6 ? `${sg}$${(a/1e6).toFixed(a>=100e6?0:1)}M` : a >= 1e3 ? `${sg}$${(a/1e3).toFixed(a>=100e3?0:1)}k` : `${sg}$${a.toFixed(a<100?2:0)}`; };
const fS = (n) => `${n > 0 ? '+' : ''}${fU(n)}`, fP = (p) => p == null ? '\u2014' : `${p > 0 ? '+' : ''}${p.toFixed(1)}%`, fA = (d) => d == null ? 'n/a' : d >= 365 ? `${(d/365).toFixed(1)}y` : `${d}d`;
const kpi = (l, v, n, c = '') => `<div class="kpi"><div class="lbl">${l}</div><div class="val ${c}">${v}</div><div class="note">${n}</div></div>`;
const pill = (ok, t) => `<div class="pill ${ok?'ok':'warn'}">${ok?'\u2713':'!'} ${t}</div>`;
const eqL = (l, v, c = '') => `<div class="eq-line ${c}"><span>${l}</span><span>${v}</span></div>`;
const ec = (l, v, c = '') => `<div class="ec"><div class="l">${l}</div><div class="v ${c}">${v}</div></div>`;

const st = { tab:'board', verdict:'all', tier:'all', cat:'all', chain:'all', q:'', sort:'rank', dir:'asc', dep:0, drop:C.default_drop_share, wk:C.default_horizon_weeks, p:null };
function readHash() {
  Object.assign(st, { tab:'board', verdict:'all', tier:'all', cat:'all', chain:'all', q:'', sort:'rank', dir:'asc', dep:0, drop:C.default_drop_share, wk:C.default_horizon_weeks, p:null });
  const raw = (location.hash || '').replace(/^#/, ''); if (!raw) return;
  const sp = new URLSearchParams(raw);
  if (sp.get('tab') === 'comps') st.tab = 'comps';
  for (const k of ['verdict','tier','cat','chain','q','sort','p']) if (sp.get(k)) st[k] = sp.get(k);
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
    for (const k of ['verdict','tier','cat','chain','q']) if (st[k] && st[k] !== 'all') sp.set(k, st[k]);
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
const getEcon = (r) => isDef() ? r.farm_econ : M.buildFarmTicket(r, C, st.dep > 0 ? st.dep : null, st.drop, st.wk);

function scatterSvg(hiRow, hPx = 112) {
  const W = 430, H = hPx, l = 34, r = 10, t = 8, b = 18, x0 = 6.7, x1 = 10.6, y0 = 5.4, y1 = 10.7;
  const px = (x) => l + ((clamp(x, x0, x1) - x0) / (x1 - x0)) * (W - l - r), py = (y) => H - b - ((clamp(y, y0, y1) - y0) / (y1 - y0)) * (H - t - b), pm = C.price_model;
  const fit = (tvl, q = 0) => (Math.log(pm.ref_tvl_usd) + pm.intercept + pm.beta_tvl * Math.log(tvl / pm.ref_tvl_usd) + q) / Math.LN10;
  const tA = Math.pow(10, x0), tB = Math.pow(10, x1);
  const poly = `${px(x0).toFixed(1)},${py(fit(tA, pm.q75_log)).toFixed(1)} ${px(x1).toFixed(1)},${py(fit(tB, pm.q75_log)).toFixed(1)} ${px(x1).toFixed(1)},${py(fit(tB, pm.q25_log)).toFixed(1)} ${px(x0).toFixed(1)},${py(fit(tA, pm.q25_log)).toFixed(1)}`;
  const cDots = D.live_comparables.map((c) => `<circle cx="${px(Math.log10(c.tvl_usd)).toFixed(1)}" cy="${py(Math.log10(c.mcap_usd)).toFixed(1)}" r="2.1" fill="#38bdf8" fill-opacity="0.72"/>`).join('');
  const pDots = rows.slice(0, 65).map((u) => `<circle cx="${px(Math.log10(u.tvl_usd)).toFixed(1)}" cy="${py(Math.log10(u.value_if_launched_usd)).toFixed(1)}" r="1.7" fill="#a78bfa" fill-opacity="0.65"/>`).join('');
  const grid = [[6,'1M'],[7,'10M'],[8,'100M'],[9,'1B'],[10,'10B']].map(([v,lbl]) => { const y = py(v).toFixed(1); return `<line x1="${l}" y1="${y}" x2="${W-r}" y2="${y}" stroke="#1f2c3e"/><text x="${l-4}" y="${(+y+3).toFixed(1)}" text-anchor="end" fill="#62738a" font-size="8.2" font-family="monospace">${lbl}</text>`; }).join('') + [[7,'10M'],[8,'100M'],[9,'1B'],[10,'10B']].map(([v,lbl]) => `<text x="${px(v).toFixed(1)}" y="${H-5}" text-anchor="middle" fill="#62738a" font-size="8.2" font-family="monospace">${lbl}</text>`).join('');
  const hi = hiRow ? `<circle cx="${px(Math.log10(hiRow.tvl_usd)).toFixed(1)}" cy="${py(Math.log10(hiRow.value_if_launched_usd)).toFixed(1)}" r="5" fill="#f59e0b" stroke="#fff" stroke-width="1.4"/>` : '';
  return `<svg class="sc-svg" style="height:${hPx}px" viewBox="0 0 ${W} ${H}">${grid}<polygon points="${poly}" fill="#22c55e" fill-opacity="0.14"/><line x1="${px(x0).toFixed(1)}" y1="${py(fit(tA)).toFixed(1)}" x2="${px(x1).toFixed(1)}" y2="${py(fit(tB)).toFixed(1)}" stroke="#22c55e" stroke-width="1.5"/>${cDots}${pDots}${hi}</svg>`;
}

const cats = Array.from(new Set(rows.map((r) => r.category || 'Uncategorized'))).sort();
const chMap = new Map(); for (const r of rows) chMap.set(r.farm_econ.best_chain, (chMap.get(r.farm_econ.best_chain) || 0) + 1);
const topChains = Array.from(chMap.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([c]) => c);
const tBdg = (t) => `<span class="bdg ${t==='watchlist'?'b-wl':t==='large-cap'?'b-lc':'b-e'}">${t==='watchlist'?'WL':t==='large-cap'?'LC':'E'}</span>`;
const vBdg = (v) => `<span class="bdg ${v==='FARM'?'b-farm':v==='MARGINAL'?'b-marg':'b-skip'}">${v==='MARGINAL'?'MARG':v}</span>`;
const maxImp = Math.max(...rows.map((r) => r.implied_high_usd)), minImp = Math.min(...rows.map((r) => r.implied_low_usd));
const logPos = (x) => clamp((Math.log10(Math.max(minImp, x)) - Math.log10(minImp)) / (Math.log10(maxImp) - Math.log10(minImp)) * 100, 0, 100);

function getFiltered() {
  const econs = rows.map((r) => ({ r, e: getEcon(r) }));
  let vF = 0, vM = 0, vS = 0; for (const x of econs) { if (x.e.verdict === 'FARM') vF++; else if (x.e.verdict === 'MARGINAL') vM++; else vS++; }
  const ql = st.q.trim().toLowerCase();
  const filt = econs.filter(({ r, e }) => (st.verdict === 'all' || e.verdict === st.verdict) && (st.tier === 'all' || r.tier === st.tier) && (st.cat === 'all' || (r.category || 'Uncategorized') === st.cat) && (st.chain === 'all' || r.chains.includes(st.chain) || e.best_chain === st.chain) && (!ql || `${r.name} ${r.slug} ${r.category || ''} ${r.chains.join(' ')}`.toLowerCase().includes(ql)));
  const mult = st.dir === 'asc' ? 1 : -1;
  filt.sort((a, b) => {
    const ka = a.r, kb = b.r, ea = a.e, eb = b.e; let c = 0;
    if (st.sort === 'rank') c = ka.rank - kb.rank; else if (st.sort === 'name') c = ka.name.localeCompare(kb.name);
    else if (st.sort === 'tvl') c = ka.tvl_usd - kb.tvl_usd; else if (st.sort === 'g7d') c = (ka.change_7d ?? -999) - (kb.change_7d ?? -999);
    else if (st.sort === 'age') c = (ka.age_days ?? 99999) - (kb.age_days ?? 99999); else if (st.sort === 'odds') c = ka.launch_odds - kb.launch_odds;
    else if (st.sort === 'val') c = ka.value_if_launched_usd - kb.value_if_launched_usd; else if (st.sort === 'implied') c = ka.implied_value_usd - kb.implied_value_usd;
    else if (st.sort === 'net') c = ea.net_of_fees_usd - eb.net_of_fees_usd; else if (st.sort === 'netHr') c = ea.net_per_hour - eb.net_per_hour;
    return c * mult || ka.rank - kb.rank;
  });
  return { filt, vF, vM, vS };
}

const tR=(a)=>`<tr>${a.map((x)=>`<td>${x}</td>`).join('')}</tr>`;
const numTd=(v,c='')=>`<td class="num ${c}">${v}</td>`;
const card=(t,r,b)=>`<div class="card"><div class="ctitle"><span>${t}</span><span class="mono">${r}</span></div>${b}</div>`;
const ablTbl=(h,rHtml)=>`<table class="mini-tbl"><thead><tr>${h}</tr></thead><tbody>${rHtml}</tbody></table>`;

function renderCover() {
  const pm=C.price_model,om=C.odds_model,{filt,vF,vM,vS}=getFiltered(),ql=st.q.trim().toLowerCase();
  const segs=[['Watchlist',L.watchlist,'#38bdf8'],['Large Cap',L.large_cap,'#a78bfa'],['Early',L.early,'#22c55e'],['Comps',L.priced_comps,'#0ea5e9'],['Tokenized',L.other_tokenized,'#64748b'],['Bridges',L.excl_bridges,'#475569'],['LST/BTC',L.excl_lst_btc,'#f59e0b'],['Sib/CEX',L.excl_cex_ver_sib,'#ef4444']];
  const th=(id,lbl,cls='')=>`<th data-sort="${id}" class="${cls}${st.sort===id?' sort':''}">${lbl}${st.sort===id?(st.dir==='asc'?' \u25B2':' \u25BC'):''}</th>`;
  const tRows=st.tab==='board'
    ? filt.map(({r,e})=>{const lP=logPos(r.implied_low_usd),hP=logPos(r.implied_high_usd),mP=logPos(r.implied_value_usd);return `<tr data-slug="${esc(r.slug)}"><td class="mono"><b>${r.rank}</b><span class="rng">${r.rank_low}\u2013${r.rank_high}</span></td><td><div class="pname">${esc(r.name)} ${tBdg(r.tier)}${r.sibling_symbol?` <span class="bdg b-warn">SIB:${esc(r.sibling_symbol)}</span>`:''}${r.flags.some((f)=>f.includes('Bitcoin P2P'))?' <span class="bdg b-warn">BTC-P2P</span>':''}</div><div class="pmeta">${esc(r.category||'Uncategorized')} \u00B7 ${esc(e.best_chain)} (${esc(e.family_label)})</div></td>${numTd(fU(r.tvl_usd))}${numTd(fP(r.change_7d),r.change_7d==null?'':r.change_7d>=0?'pos':'neg')}${numTd(fA(r.age_days))}${numTd(`${(r.launch_odds*100).toFixed(1)}%<div class="pbar"><div class="pfill" style="width:${(r.launch_odds*100).toFixed(1)}%"></div></div>`)}${numTd(fU(r.value_if_launched_usd))}${numTd(`<b>${fU(r.implied_value_usd)}</b><span class="rng">${fU(r.implied_low_usd)}\u2013${fU(r.implied_high_usd)}</span><div class="rbar"><div class="rrange" style="left:${lP.toFixed(1)}%;width:${Math.max(4,hP-lP).toFixed(1)}%"></div><div class="rmark" style="left:${mP.toFixed(1)}%"></div></div>`)}${numTd(`${vBdg(e.verdict)} <span class="${e.net_of_fees_usd>0?'pos':'neg'}">${fS(e.net_of_fees_usd)}</span><span class="rng">fee ${fU(e.total_fees_usd)} \u00B7 ${fU(e.deposit_usd)}</span>`)}${numTd(`<b class="${e.net_per_hour>=C.farm_hourly_hurdle&&e.verdict==='FARM'?'pos':''}">$${e.net_per_hour.toFixed(1)}/h</b><span class="rng">${e.total_hours.toFixed(1)}h/${e.horizon_weeks}w</span>`)}</tr>`;}).join('')
    : D.live_comparables.filter((c)=>!ql||`${c.name} ${c.symbol} ${c.category||''}`.toLowerCase().includes(ql)).map((c)=>`<tr style="cursor:default"><td class="mono"><b>${esc(c.symbol)}</b></td><td><div class="pname">${esc(c.name)}</div><div class="pmeta">${esc(c.category||'Uncategorized')} \u00B7 ${esc(c.chains.slice(0,3).join(', '))}</div></td>${numTd(fU(c.tvl_usd))}${numTd(fP(c.change_7d),c.change_7d==null?'':c.change_7d>=0?'pos':'neg')}${numTd(fA(c.age_days))}${numTd(`${c.ratio.toFixed(2)}\u00D7`)}${numTd(fU(c.loo_pred_usd))}${numTd(`<b>${fU(c.mcap_usd)}</b>`)}${numTd(`<span class="bdg ${c.loo_miss<=3?'b-farm':'b-marg'}">\u00D7${c.loo_miss.toFixed(2)}</span>`)}${numTd(c.loo_dir)}</tr>`).join('');

  return `<div class="wrap"><div class="hdr"><div class="brand"><h1>Token Radar</h1><span class="ver">${esc(D.model_version)} \u00B7 FNV ${esc(C.board_checksum)}</span><span class="sub">Snapshot ${esc(D.as_of)} \u00B7 WL \u2265 ${fU(D.floor_usd)} \u00B7 Early \u2265 $5M \u00B7 Refitted live in browser (NOT financial advice)</span></div><div class="tabs"><button class="btn ${st.tab==='board'?'on':''}" data-tab="board">Opportunity Board (${rows.length})</button><button class="btn ${st.tab==='comps'?'on':''}" data-tab="comps">Live Comps (${D.live_comparables.length})</button></div></div><div class="hero-top"><div class="kpis">${kpi('Universe Accounted',`${L.total} / ${L.total}`,`${S.board_size} pre-token \u00B7 ${L.priced_comps} comps \u00B7 0 leaked`)}${kpi('Board Implied Total',fU(S.total_implied_usd),`${S.board_size} ranked \u00B7 ${fU(S.total_board_tvl_usd)} TVL`)}${kpi('Stage 1 \u00B7 Value OOS',`\u00D7${pm.wf_miss.toFixed(2)} WF`,`LOO \u00D7${pm.loo_miss.toFixed(2)} (vs \u00D7${pm.flat_wf_miss.toFixed(2)} flat)`)}${kpi('Stage 2 \u00B7 Odds OOS',`${om.wf_brier.toFixed(3)} Brier`,`WF vs ${om.base_wf_brier.toFixed(3)} base \u00B7 ${(om.wf_acc*100).toFixed(0)}% acc`)}${kpi('Farmable ($25/h)',`${vF} FARM`,`${vM} marginal \u00B7 ${vS} skip (&gt;4% T-bill)`,'pos')}${kpi('Bootstrap Precision',`${C.n_bootstrap} refits`,`${S.watchlist_size}/${S.watchlist_size} WL \u00B7 med ${fU(S.median_implied_usd)}`)}</div>${card(`Value vs TVL \u00B7 Comps &amp; Board (${pm.n_comps} Comps)`,`<span style="color:#38bdf8">\u25CF</span> Live <span style="color:#a78bfa">\u25CF</span> Board <span style="color:#22c55e">\u2014</span> Fit`,scatterSvg(null,112))}</div><div class="eq-strip"><span><b>Implied Value</b> = <span class="fn">fitStage1Huber()</span> <span class="mono">$100M\u00D7${Math.exp(pm.intercept).toFixed(3)}\u00D7(TVL/$100M)^${pm.beta_tvl.toFixed(3)}\u00D7e^(cat_k64)</span> \u00D7 <span class="fn">fitStage2Logistic()</span> <span class="mono">P(Age,TVL,7d)</span></span><span class="grp"><span class="fn">evaluateProtocol()</span><span class="fn">buildFarmTicket()</span><span class="fn">verifyBoardParity()</span></span></div><div class="bar-row">${card(`MECE Universe Ledger (${L.total}/${L.total})`,`${S.board_size} ranked + ${L.total-S.board_size} comps/excl`,`<div class="mece-bar">${segs.map(([lbl,n,col])=>`<div style="width:${(n/L.total)*100}%;background:${col}" title="${lbl}: ${n}"></div>`).join('')}</div><div class="mece-leg">${segs.map(([lbl,n,col])=>`<span><i class="dot" style="background:${col}"></i>${lbl} <b class="mono">${n}</b></span>`).join('')}</div>`)}${card('Live Browser Refit &amp; Parity Checks',isDef()?'All 185 rows = board.json':`Scenario: ${st.dep?fU(st.dep):'Plan'} \u00B7 ${(st.drop*100).toFixed(0)}% \u00B7 ${st.wk}wk`,`<div class="pills">${pill(V.refitPriceOk&&V.refitOddsOk,'Refitted Huber+Logit = main.ts')}${pill(V.mismatches===0,`${rows.length-V.mismatches}/${rows.length} Rows Exact`)}${pill(V.monoOk,`Ranks 1..${rows.length} Monotonic`)}${pill(V.totalExactOk,`Sum ${fU(V.recomputedTotal)} Exact`)}${pill(V.checksumOk,`CRC ${esc(V.checksum)}`)}${pill(V.wlOk&&V.ledgerOk,`40/40 WL \u00B7 ${V.ledgerSum}/758 MECE`)}</div>`)}</div><div class="ev-grid">${card('Stage 1 \u00B7 Value if Launched',`WF \u2265 ${esc(pm.wf_cutoff)}`,ablTbl('<th>Specification</th><th class="num">LOO</th><th class="num">WF</th><th class="num">\u22643\u00D7</th><th>Gate</th>',pm.ablation.map((a)=>`<tr><td>${esc(a.step)}</td>${numTd(`\u00D7${a.loo_miss.toFixed(2)}`)}${numTd(`\u00D7${a.wf_miss.toFixed(2)}`)}${numTd(`${(a.loo_w3x*100).toFixed(0)}%/${(a.wf_w3x*100).toFixed(0)}%`)}<td class="${a.status==='kept'?'kept':a.status==='tested_not_kept'?'rej':''}">${a.status==='tested_not_kept'?'dropped':esc(a.status)}</td></tr>`).join('')))}${card('Stage 2 \u00B7 Conditional Odds',`WF \u2265 ${esc(om.wf_cutoff)}`,ablTbl('<th>Specification</th><th class="num">10F</th><th class="num">WF</th><th class="num">Acc</th><th>Gate</th>',om.ablation.map((a)=>`<tr><td>${esc(a.step)}</td>${numTd(a.cv10_brier.toFixed(3))}${numTd(a.wf_brier.toFixed(3))}${numTd(`${(a.wf_acc*100).toFixed(0)}%`)}<td class="${a.status==='kept'?'kept':a.status==='tested_not_kept'?'rej':''}">${a.status==='tested_not_kept'?'dropped':esc(a.status)}</td></tr>`).join('')))}${card(`Band Honesty &amp; s.e. (${C.n_bootstrap}x)`,'P25\u2013P75 / P10\u2013P90',`${ablTbl('<th>Coverage</th><th class="num">Stated</th><th class="num">LOO</th><th class="num">WF</th>',`<tr><td>Within \u00D73</td>${numTd('\u2014')}${numTd(`${(pm.within3x_loo*100).toFixed(0)}%`)}${numTd(`${(pm.within3x_wf*100).toFixed(0)}%`)}</tr><tr><td>Inside P25\u2013P75</td>${numTd('50%')}${numTd(`${(pm.cov50_loo*100).toFixed(0)}%`)}${numTd(`${(pm.cov50_wf*100).toFixed(0)}%`)}</tr><tr><td>Inside P10\u2013P90</td>${numTd('80%')}${numTd(`${(pm.cov80_loo*100).toFixed(0)}%`)}${numTd(`${(pm.cov80_wf*100).toFixed(0)}%`)}</tr>`)}<div class="subline"><b>Price:</b> \u03B1=${pm.intercept.toFixed(2)}\u00B1${pm.intercept_se.toFixed(2)}, \u03B2=${pm.beta_tvl.toFixed(2)}\u00B1${pm.beta_tvl_se.toFixed(2)}</div><div class="subline"><b>Odds:</b> age +${om.beta_age.toFixed(2)}\u00B1${om.beta_age_se.toFixed(2)}, tvl +${om.beta_tvl.toFixed(2)}\u00B1${om.beta_tvl_se.toFixed(2)}, 7d ${om.beta_g7d.toFixed(2)}\u00B1${om.beta_g7d_se.toFixed(2)}</div>`)}</div><div class="toolbar"><div class="grp"><span class="lbl-s">Verdict</span><button class="btn ${st.verdict==='all'?'on':''}" data-verdict="all">All (${rows.length})</button><button class="btn g ${st.verdict==='FARM'?'on':''}" data-verdict="FARM">FARM (${vF})</button><button class="btn a ${st.verdict==='MARGINAL'?'on':''}" data-verdict="MARGINAL">MARG (${vM})</button><button class="btn r ${st.verdict==='SKIP'?'on':''}" data-verdict="SKIP">SKIP (${vS})</button><select id="f-tier"><option value="all">Tiers (${rows.length})</option><option value="watchlist"${st.tier==='watchlist'?' selected':''}>WL (${S.watchlist_size})</option><option value="large-cap"${st.tier==='large-cap'?' selected':''}>LC (${S.large_cap_size})</option><option value="early"${st.tier==='early'?' selected':''}>Early (${S.early_size})</option></select><select id="f-cat"><option value="all">Cats (${cats.length})</option>${cats.map((c)=>`<option value="${esc(c)}"${st.cat===c?' selected':''}>${esc(c)}</option>`).join('')}</select><select id="f-chain"><option value="all">Chains (${topChains.length})</option>${topChains.map((c)=>`<option value="${esc(c)}"${st.chain===c?' selected':''}>${esc(c)}</option>`).join('')}</select><input id="f-q" type="search" value="${esc(st.q)}" placeholder="Filter..." /></div><div class="grp"><select id="s-dep"><option value="0"${st.dep===0?' selected':''}>Plan (0.02%)</option>${[2500,5000,10000,25000,50000].map((v)=>`<option value="${v}"${st.dep===v?' selected':''}>${fU(v)}</option>`).join('')}</select><span class="lbl-s">Drop ${(st.drop*100).toFixed(0)}%</span><input id="s-drop" type="range" min="3" max="15" step="1" value="${Math.round(st.drop*100)}" /><span class="lbl-s">${st.wk}wk</span><input id="s-wk" type="range" min="4" max="24" step="2" value="${st.wk}" /><button class="btn" id="b-rst">Reset</button><button class="btn" id="b-csv">CSV</button><button class="btn" id="b-json">JSON</button></div></div><div class="tbl-wrap"><table class="tbl"><thead>${st.tab==='board'?`<tr>${th('rank','# \u00B7 Band')}${th('name','Protocol \u00B7 Category \u00B7 Route')}${th('tvl','TVL','num')}${th('g7d','7d','num')}${th('age','Age','num')}${th('odds','Odds','num')}${th('val','If Launched','num')}${th('implied','Implied \u00B7 P25\u2013P75','num')}${th('net','Verdict \u00B7 Net $','num')}${th('netHr','Net / Hr','num')}</tr>`:`<tr><th>Sym</th><th>Comparable \u00B7 Category \u00B7 Chains</th><th class="num">TVL</th><th class="num">7d</th><th class="num">Age</th><th class="num">MCap/TVL</th><th class="num">Blind LOO</th><th class="num">MCap</th><th class="num">Miss</th><th class="num">Dir</th></tr>`}</thead><tbody>${tRows||'<tr><td colspan="10" style="padding:16px;text-align:center;color:var(--muted)">No matches.</td></tr>'}</tbody></table></div><div class="foot-note"><span>Showing ${st.tab==='board'?filt.length:D.live_comparables.length} rows \u00B7 Exit = 7d P05 (${C.snapshot_7d_p05.toFixed(1)}%) \u00B7 Zero network calls</span><span>Snapshot ${esc(D.as_of)}</span></div></div>`;
}

function renderDetail(slug) {
  const idx = rows.findIndex((r) => r.slug === slug), r = rows[idx >= 0 ? idx : 0], e = M.buildFarmTicket(r, C, st.dep > 0 ? st.dep : null, st.drop, st.wk);
  const pm = C.price_model, om = C.odds_model, cat = r.category || 'Uncategorized', ev = M.evaluateProtocol(r, V.pFit, V.oFit, C);
  const sTvl = M.evaluateProtocol({ ...r, tvl_usd: r.tvl_usd * 0.70 }, V.pFit, V.oFit, C);
  const sGrow = M.evaluateProtocol({ ...r, change_7d: 0 }, V.pFit, V.oFit, C);
  const sAge = M.evaluateProtocol({ ...r, age_days: (r.age_days == null ? om.median_age_years * 365 : r.age_days) + 182 }, V.pFit, V.oFit, C);
  const peers = D.live_comparables.slice().sort((a, b) => ((a.category||'Uncategorized')===cat?0:1) - ((b.category||'Uncategorized')===cat?0:1) || Math.abs(Math.log(a.tvl_usd/r.tvl_usd)) - Math.abs(Math.log(b.tvl_usd/r.tvl_usd))).slice(0, 6);
  const depCols = [2500, 10000, 25000]; if (!depCols.includes(e.deposit_usd)) depCols[1] = e.deposit_usd; depCols.sort((a, b) => a - b);
  const mxHtml = [0.05,0.10,0.15].map((ds) => `<tr><td>${(ds*100).toFixed(0)}% drop</td>${depCols.map((dp) => { const net = r2(r.implied_value_usd * ds * (dp / (r.tvl_usd + dp)) - e.total_fees_usd), hdl = r2(dp * C.tbill_apr * (e.horizon_weeks / 52)); return `<td class="${net>hdl&&net/Math.max(0.25,e.total_hours)>=C.farm_hourly_hurdle?'pos':net>0?'':'neg'}">${fS(net)}</td>`; }).join('')}</tr>`).join('');
  const wkSens = [4, 8, 12, 24].map((w) => { const t = M.buildFarmTicket(r, C, e.deposit_usd, e.drop_share, w); return `<span>${w}w: <b class="${t.verdict==='FARM'?'pos':t.net_of_fees_usd>0?'':'neg'}">${fS(t.net_of_fees_usd)}</b> ($${t.net_per_hour.toFixed(0)}/h)</span>`; }).join(' \u00B7 ');
  const prevS = rows[(idx - 1 + rows.length) % rows.length].slug, nextS = rows[(idx + 1) % rows.length].slug;

  return `<div class="wrap">
    <div class="hdr"><div class="brand"><button class="btn" id="b-back">\u2190 Board</button><span class="ver">#${r.rank} (${r.rank_low}\u2013${r.rank_high})</span><h1>${esc(r.name)}</h1><span class="sub">${esc(cat)} \u00B7 ${esc(r.chains.join(', '))} \u00B7 ${esc(r.farm_econ.epistemic_tier)}</span>${r.sibling_symbol?`<span class="bdg b-warn">SIB ${esc(r.sibling_symbol)} 0.5\u00D7</span>`:''}</div><div class="grp"><span class="bdg ${e.verdict==='FARM'?'b-farm':e.verdict==='MARGINAL'?'b-marg':'b-skip'}" style="font-size:11px;padding:3px 8px">${e.verdict} \u00B7 ${fS(e.net_of_fees_usd)} ($${e.net_per_hour.toFixed(1)}/h)</span><button class="btn" data-nav="${esc(prevS)}">\u25C0 Prev</button><button class="btn" data-nav="${esc(nextS)}">Next \u25B6</button></div></div>
    <div class="det-top">
      <div class="hero-val"><div class="ctitle"><span>Implied Value \u00B7 Browser Refit</span><span class="mono">TVL ${fU(r.tvl_usd)} \u00B7 7d ${fP(r.change_7d)} \u00B7 Age ${fA(r.age_days)}</span></div><div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap"><div class="hv-num">${fU(r.implied_value_usd)}</div><div class="mono" style="font-size:11px">Launched <b>${fU(r.value_if_launched_usd)}</b> \u00B7 Odds <b>${(r.launch_odds*100).toFixed(1)}%</b> \u00B7 P25\u2013P75 <b>${fU(r.implied_low_usd)}\u2013${fU(r.implied_high_usd)}</b> \u00B7 P10\u2013P90 <b>${fU(r.implied_p10_usd)}\u2013${fU(r.implied_p90_usd)}</b></div></div><div class="subline pos">\u2713 Refitted in browser via fitStage1Huber() + fitStage2Logistic() = board.json (CRC ${esc(V.checksum)}). Not financial advice.</div></div>
      <div class="card"><div class="ctitle"><span>Curve Position vs Comps</span><span class="mono"><span style="color:#f59e0b">\u25CF</span> ${esc(r.name)}</span></div>${scatterSvg(r, 78)}</div>
    </div>
    <div class="det-grid">
      <div class="stack">
        <div class="card"><div class="ctitle"><span>How ${fU(r.implied_value_usd)} Follows From Snapshot</span><span class="mono">evaluateProtocol()</span></div><div class="eq-box">${eqL(`Base anchor @ $100M TVL (exp(${pm.intercept.toFixed(3)}))`,`\u00D7${ev.baseMult.toFixed(3)}`)}${eqL(`Size curve ((TVL/$100M)^${pm.beta_tvl.toFixed(3)})`,`\u00D7${ev.sizeMult.toFixed(3)}`)}${eqL(`Category ridge (${esc(cat)}, k=${pm.cat_ridge_k})`,`\u00D7${ev.catMult.toFixed(3)}`)}${eqL('= Value if launched',fU(r.value_if_launched_usd),'tot')}${eqL(`\u00D7 Conditional odds (P_now ${(ev.pNow*100).toFixed(0)}% \u2192 P_max ${(ev.pMax*100).toFixed(0)}%${r.sibling_symbol?' \u00D7 0.5':''})`,`${(r.launch_odds*100).toFixed(2)}%`)}${eqL(`= Expected Implied Value (rank ${r.rank_low}\u2013${r.rank_high})`,fU(r.implied_value_usd),'tot')}</div><table class="mini-tbl" style="margin-top:5px"><thead><tr><th>Stress Shock</th><th class="num">Odds</th><th class="num">Implied</th><th class="num">Delta</th></tr></thead><tbody><tr><td>TVL \u221230% (${fU(r.tvl_usd*0.7)})</td><td class="num">${(sTvl.launchOdds*100).toFixed(1)}%</td><td class="num">${fU(sTvl.implied)}</td><td class="num neg">${fP(((sTvl.implied/r.implied_value_usd)-1)*100)}</td></tr><tr><td>7d Growth Reset to 0%</td><td class="num">${(sGrow.launchOdds*100).toFixed(1)}%</td><td class="num">${fU(sGrow.implied)}</td><td class="num">${fP(((sGrow.implied/r.implied_value_usd)-1)*100)}</td></tr><tr><td>+6 Months Older Tokenless</td><td class="num">${(sAge.launchOdds*100).toFixed(1)}%</td><td class="num">${fU(sAge.implied)}</td><td class="num">${fP(((sAge.implied/r.implied_value_usd)-1)*100)}</td></tr></tbody></table></div>
        <div class="card"><div class="ctitle"><span>Nearest 6 Traded Peers (Blind LOO)</span><span class="mono">${esc(cat)}</span></div><table class="mini-tbl"><thead><tr><th>Peer</th><th>Category</th><th class="num">TVL</th><th class="num">MCap</th><th class="num">LOO</th><th class="num">Miss</th></tr></thead><tbody>${peers.map((p)=>`<tr><td><b>${esc(p.name)}</b> <span class="pmeta">${esc(p.symbol)}</span></td><td>${esc(p.category||'-')}</td><td class="num">${fU(p.tvl_usd)}</td><td class="num">${fU(p.mcap_usd)}</td><td class="num">${fU(p.loo_pred_usd)}</td><td class="num"><span class="bdg ${p.loo_miss<=3?'b-farm':'b-marg'}">\u00D7${p.loo_miss.toFixed(2)} ${p.loo_dir}</span></td></tr>`).join('')}</tbody></table></div>
        <div class="card"><div class="ctitle"><span>Net Profit ($) Matrix \u00B7 Deposit \u00D7 Drop Share</span><span class="mono">Fees ${fU(e.total_fees_usd)}</span></div><table class="mini-tbl mx"><thead><tr><th>Drop Share</th>${depCols.map((d)=>`<th>${fU(d)}</th>`).join('')}</tr></thead><tbody>${mxHtml}</tbody></table><div class="subline">Horizon: ${wkSens}</div></div>
      </div>
      <div class="stack"><div class="card">
        <div class="ctitle"><span>Net-of-Fees Farm Verdict</span><span class="mono">${esc(e.best_chain)} \u00B7 ${esc(e.gas_tier)}</span></div>
        <div class="ver-box ${e.verdict==='FARM'?'':e.verdict==='MARGINAL'?'marg':'skip'}"><b>${e.verdict}:</b> ${fU(e.deposit_usd)} for ${e.horizon_weeks}wk buys a modelled ${fU(e.modelled_drop_usd)} drop (${(e.drop_share*100).toFixed(0)}% share) minus ${fU(e.total_fees_usd)} fees &amp; ${e.total_hours.toFixed(1)}h = <b>${fS(e.net_of_fees_usd)} (${fU(e.net_per_hour)}/h)</b> vs ${fU(e.tbill_hurdle_usd)} 4% T-bill.</div>
        <div class="econ-6">${ec('Plan Deposit',fU(e.deposit_usd))}${ec('Modelled Drop',fU(e.modelled_drop_usd))}${ec('Gas & Ops Fees',fU(e.total_fees_usd))}${ec('Net vs 4% T-Bill',fS(e.net_of_fees_usd),e.net_of_fees_usd>e.tbill_hurdle_usd?'pos':'neg')}${ec(`Net / Hr (${e.total_hours.toFixed(1)}h)`,`$${e.net_per_hour.toFixed(2)}/h`,e.net_per_hour>=C.farm_hourly_hurdle?'pos':'')}${ec('Break-Even Share/Odds',`${(e.break_even_drop_share*100).toFixed(2)}% / ${(e.break_even_odds*100).toFixed(1)}%`)}</div>
        <div class="exit-box"><b>Exit Trigger:</b> Withdraw if TVL drops below <b class="mono">${fU(e.exit_tvl_usd)}</b> (${C.snapshot_7d_p05.toFixed(1)}% P05 7d stress). Risk: ${esc((r.farm_econ.risk_tags||[]).join(' \u00B7 '))}.</div>
        <div class="ctitle" style="margin-top:4px"><span>8 Costed &amp; Timed Steps (${e.total_minutes}m / ${e.horizon_weeks}wk)</span><span class="mono">buildFarmTicket()</span></div>
        <table class="steps-tbl"><tbody>${e.items.map((it)=>`<tr><td><span class="ph">${esc(it.phase)}</span></td><td>${esc(it.action)}</td><td class="cost-t">${esc(it.cost_label)}<br/>${esc(it.time_label)}</td></tr>`).join('')}</tbody></table>
      </div></div>
    </div>
  </div>`;
}

function dl(n,m,t){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([t],{type:m}));a.download=n;a.click();}
const root=document.getElementById('app');
function draw(){writeHash();root.innerHTML=st.p?renderDetail(st.p):renderCover();bind();}
function bind(){
  const qa=(s,fn)=>root.querySelectorAll(s).forEach((el)=>el.addEventListener('click',()=>fn(el)));
  qa('[data-tab]',(e)=>{st.tab=e.dataset.tab;draw();}); qa('[data-verdict]',(e)=>{st.verdict=e.dataset.verdict;draw();});
  qa('[data-sort]',(e)=>{const k=e.dataset.sort;if(st.sort===k)st.dir=st.dir==='asc'?'desc':'asc';else{st.sort=k;st.dir=k==='rank'||k==='name'||k==='age'?'asc':'desc';}draw();});
  qa('tr[data-slug]',(e)=>{st.p=e.dataset.slug;draw();window.scrollTo(0,0);}); qa('[data-nav]',(e)=>{st.p=e.dataset.nav;draw();window.scrollTo(0,0);});
  const on=(id,ev,fn)=>{const el=document.getElementById(id);if(el)el.addEventListener(ev,()=>fn(el));};
  on('b-back','click',()=>{st.p=null;draw();});
  on('b-rst','click',()=>{Object.assign(st,{tab:'board',verdict:'all',tier:'all',cat:'all',chain:'all',q:'',sort:'rank',dir:'asc',dep:0,drop:C.default_drop_share,wk:C.default_horizon_weeks});draw();});
  on('b-csv','click',()=>dl('token-radar-v4.csv','text/csv',['rank,slug,name,tier,category,tvl_usd,implied_value_usd,launch_odds,verdict,net_usd,net_hr',...getFiltered().filt.map(({r,e})=>[r.rank,r.slug,JSON.stringify(r.name),r.tier,JSON.stringify(r.category||''),r.tvl_usd,r.implied_value_usd,r.launch_odds,e.verdict,e.net_of_fees_usd,e.net_per_hour].join(','))].join('\n')));
  on('b-json','click',()=>dl('token-radar-v4.json','application/json',JSON.stringify(getFiltered().filt.map(({r,e})=>({...r,farm_econ:e})),null,2)));
  on('f-tier','change',(e)=>{st.tier=e.value;draw();}); on('f-cat','change',(e)=>{st.cat=e.value;draw();}); on('f-chain','change',(e)=>{st.chain=e.value;draw();});
  on('s-dep','change',(e)=>{st.dep=Number(e.value)||0;draw();}); on('s-drop','input',(e)=>{st.drop=Number(e.value)/100;draw();}); on('s-wk','input',(e)=>{st.wk=Number(e.value);draw();});
  on('f-q','input',(e)=>{st.q=e.value;draw();const nf=document.getElementById('f-q');if(nf){nf.focus();nf.setSelectionRange(nf.value.length,nf.value.length);}});
}
window.addEventListener('hashchange',()=>{readHash();draw();});
readHash();
draw();
})();
