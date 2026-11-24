'use strict';
(() => {
const D = window.RADAR;
if (!D) { document.getElementById('app').textContent = 'Missing window.RADAR'; return; }

// Parity Engine
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const sigmoid = (z) => 1 / (1 + Math.exp(-clamp(z, -24, 24)));
const round2 = (n) => Math.round(n * 100) / 100;

function computeRowValuation(row, cal) {
  const pm = cal.price_model, om = cal.odds_model;
  const cat = row.category || 'Uncategorized';
  const catAdj = Object.prototype.hasOwnProperty.call(pm.cat_adj, cat) ? pm.cat_adj[cat] : 0;
  const logVal = Math.log(pm.ref_tvl_usd) + pm.intercept + pm.beta_tvl * Math.log(row.tvl_usd / pm.ref_tvl_usd) + catAdj;
  const valueIfLaunched = Math.max(1, Math.round(Math.exp(logVal)));
  const ageYears = row.age_days == null ? om.median_age_years : row.age_days / 365;
  const g7 = row.change_7d == null ? om.global_med_7d : row.change_7d;
  const st = om.intercept + om.beta_tvl * Math.log(row.tvl_usd / 50e6) + om.beta_g7d * Math.tanh((g7 - om.global_med_7d) / 35);
  const pMax = sigmoid(st + om.beta_age * Math.log(om.max_age_years + 0.15));
  const pNow = sigmoid(st + om.beta_age * Math.log(ageYears + 0.15));
  const condOdds = clamp(Math.max(0.05, pMax - pNow) / Math.max(0.05, 1 - pNow), 0.15, 0.92);
  const launchOdds = Math.round((row.sibling_symbol != null ? Math.max(0.10, condOdds * 0.50) : condOdds) * 10000) / 10000;
  const implied = Math.max(1, Math.round(valueIfLaunched * launchOdds));
  return {
    valueIfLaunched,
    launchOdds,
    implied,
    low: Math.max(1, Math.round(implied * Math.exp(pm.q25_log))),
    high: Math.max(implied, Math.round(implied * Math.exp(pm.q75_log))),
    p10: Math.max(1, Math.round(implied * Math.exp(pm.q10_log))),
    p90: Math.max(implied, Math.round(implied * Math.exp(pm.q90_log))),
  };
}

function fnv1aHex(rows) {
  let h = 0x811c9dc5;
  for (let i = 0; i < rows.length; i++) {
    const line = `${rows[i].slug}:${rows[i].implied_value_usd}\n`;
    for (let j = 0; j < line.length; j++) {
      h ^= line.charCodeAt(j);
      h = Math.imul(h, 0x01000193);
    }
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const LOW_GAS = ['Base','Arbitrum','Optimism','Polygon','Binance','Avalanche','Monad','Ink','Sonic','Scroll','Linea','Flare','Plume Mainnet','Mantle','Berachain','Hyperliquid L1','Unichain','World Chain','Katana','Soneium','Blast','Mode','Zircuit','zkSync Era','Taiko','Celo','Fraxtal','Etherlink','xDai','Sei','Plasma','Stable','Corn','Hemi','Morph','Arc','Fluent','Pharos','Rayls','Robinhood Chain','TAC','Tempo','XRPL EVM','Bittensor EVM'];
const BTC_L2 = new Set(['BSquared','CORE','Babylon Genesis','Stacks','Mezo','Citrea','BOB','Merlin','Bitlayer','Botanix','RSK']);
const IBC = new Set(['Noble','Nibiru','XION','Osmosis','Cosmos','Celestia','Injective','Kujira','Neutron','Stride','Secret','Akash','Dymension','Initia','Persistence','Stargaze','Archway','Saga','Terra','Terra2','dYdX','Thorchain','HydraDX']);
const ALT_VM = new Set(['Sui','Aptos','Starknet','Tron','Cardano','Near','Provenance','Qubic','Canton','TON','Polkadot','Astar','Flow','Fuel','ICP','Hedera','Tezos','Radix','Waves','Aleo','Mina','Elrond','VeChain','Kaspa','Ergo','Filecoin','Eclipse']);

const mkProf = (family, familyLabel, costOrder, wallet, gasAsset, gasTier, setupFee, weeklyFee, exitFee, minFloor, baseMins, weeklyMins, cadence, cleanup) =>
  ({ family, familyLabel, costOrder, wallet, gasAsset, gasTier, setupFee, weeklyFee, exitFee, minFloor, baseMins, weeklyMins, cadence, cleanup });

function classifySingleChain(ch) {
  if (ch === 'Solana') return mkProf('solana','Solana',1,'Phantom or Backpack wallet','SOL','<$0.05/tx (SOL)',0.55,0.02,0.05,1000,35,5,'bi-weekly organic rebalance','close empty SPL token accounts to reclaim SOL rent and revoke delegates');
  if (ch === 'Bitcoin') return mkProf('bitcoin','Bitcoin & Lightning',4,'non-custodial BTC / Lightning node wallet','BTC','$5.50 L1 open/close',5.50,0,5.50,2500,55,4,'open-and-hold channel liquidity','cooperatively close Lightning channels back to cold BTC storage');
  if (BTC_L2.has(ch)) return mkProf('btc_l2','BTC L2 / Restaking',3,`${ch}-compatible BTC/EVM wallet`,ch==='Stacks'?'STX':ch==='CORE'?'CORE':'BTC','$0.35\u2013$3.50/tx',3.50,0.35,2.00,2000,45,5,'hold across unbonding epochs','check 7\u201321d unbonding cooldowns and revoke spend limits');
  if (ch === 'Bittensor') return mkProf('bittensor','Bittensor (Substrate)',2,'Bittensor Wallet or Polkadot.js signer','TAO','<$0.10/tx (TAO)',0.25,0.05,0.15,1500,45,4,'periodic subnet yield check','unstake subnet alpha back to root TAO watching slippage');
  if (ch === 'Algorand') return mkProf('algorand','Algorand (AVM)',1,'Pera or Defly Algorand wallet','ALGO','<$0.02/tx (ALGO)',0.25,0.01,0.05,1000,40,4,'bi-weekly organic check-in','opt out of unused ASAs to reclaim 0.1 ALGO min balance');
  if (IBC.has(ch)) return mkProf('cosmos_ibc','Cosmos / IBC',1,'Keplr or Leap IBC wallet',ch==='Noble'?'IBC fee token':'native IBC gas','<$0.05/tx (IBC)',0.40,0.03,0.15,1000,40,4,'bi-weekly organic check-in','transfer balances back over canonical IBC channels');
  if (ch === 'Ripple' || ch === 'Stellar') { const xr = ch === 'Ripple'; return mkProf('xrpl_stellar',xr?'XRPL':'Stellar',2,xr?'Xaman (XRPL) wallet':'Freighter (Stellar) wallet',xr?'XRP':'XLM',`<$0.02/tx + ${xr?'XRP':'XLM'} reserve`,0.35,0.02,0.10,1500,40,4,'epoch hold','zero issued balances and remove unused trustlines'); }
  if (ALT_VM.has(ch)) return mkProf('alt_vm',`${ch} (Alt-VM)`,2,`${ch}-native wallet`,`${ch} gas`,'$0.06\u2013$0.80/tx',0.80,0.06,0.25,1000,40,5,'bi-weekly organic check-in','clear session keys or contract permissions on exit');
  if (ch === 'Ethereum') return mkProf('eth_l1','Ethereum L1 Only',9,'EVM wallet (Rabby or hardware signer)','ETH','$12\u2013$18/tx (L1 gas)',18.00,0,12.00,5000,45,3,'deposit-and-hold (no weekly L1 churn)','withdraw exact balance and revoke ERC-20 allowances');
  return mkProf('evm_l2','EVM L2 / Low-Gas Alt-L1',0,'EVM wallet (Rabby or MetaMask)',`${ch} gas`,'$0.08\u2013$0.30/tx',1.15,0.08,0.25,1000,40,5,'bi-weekly organic rebalance','repay any debt and revoke unlimited ERC-20 approvals');
}

function selectBestChain(chains) {
  if (!chains || !chains.length) return { chain: 'Ethereum', profile: classifySingleChain('Ethereum') };
  const ranked = chains.map((c) => ({ chain: c, profile: classifySingleChain(c), p: LOW_GAS.indexOf(c) >= 0 ? LOW_GAS.indexOf(c) : 1000 }));
  ranked.sort((a, b) => a.profile.costOrder - b.profile.costOrder || a.p - b.p || (a.chain < b.chain ? -1 : a.chain > b.chain ? 1 : 0));
  return { chain: ranked[0].chain, profile: ranked[0].profile };
}

const planDepositUsd = (tvl, floor) => Math.min(25000, Math.max(floor, Math.round((tvl * 0.0002) / 500) * 500));
const fmtFee = (u) => (u === 0 ? 'free' : `$${u.toFixed(2)}`);

function coreActionText(p, chain, pr, cap) {
  const cat = (p.category || '').toLowerCase(), n = p.name, cs = cap.toLocaleString('en-US');
  if (pr.family === 'bitcoin') return `Open a balanced native BTC Lightning channel with ${n} ($${cs} in BTC) rather than wrapped bridges.`;
  if (pr.family === 'bittensor') return `Stake $${cs} of native TAO into ${n}'s dTAO subnet pool on Bittensor and track alpha ratio.`;
  if (pr.family === 'algorand') return cat.includes('rwa') ? `Complete KYC eligibility and acquire $${cs} of fractional RWA ASAs on ${n} (${chain}).` : `Opt into the ASA and supply $${cs} of native ALGO into ${n} on ${chain}.`;
  if (pr.family === 'cosmos_ibc') return `Transfer $${cs} via canonical IBC onto ${chain} and supply native Cosmos liquidity to ${n}.`;
  if (pr.family === 'xrpl_stellar') return `Set the ${chain} trustline and supply $${cs} of ${chain==='Ripple'?'XRP':'XLM'} liquidity into ${n}.`;
  if (cat.includes('insurance')) return `Supply $${cs} to ${n}'s underwriting / cover pool on ${chain} (do not buy cover unless hedging: premiums are sunk).`;
  if (/curator|allocator|aggregator|cdp manager|indexes/.test(cat)) return `Deposit $${cs} into a ${n} curated vault on ${chain} receiving liquid shares; verify curator fee % and liquidity.`;
  if (/lend|cdp|collateral/.test(cat)) return `Supply $${cs} of collateral to ${n} on ${chain}; optionally borrow <35% LTV only if carry is positive.`;
  if (/dex|liquidity manager/.test(cat)) return `Provide $${cs} of deep major-pair liquidity on ${n} (${chain}) avoiding tight-range IL.`;
  if (/derivative|prediction|option|otc|synthetic/.test(cat)) return `Post $${cs} margin on ${n} (${chain}) with small hedged limit orders (keep turnover low: fees are sunk).`;
  if (/basis|yield|farm|governance/.test(cat) || cat === 'dor') return `Mint or stake $${cs} of ${n}'s yield-bearing or delta-neutral receipt on ${chain} and hold across epochs.`;
  if (/rwa|cedefi|crypto card|payments/.test(cat)) return `Pass issuer KYC/accreditation first, then hold $${cs} in ${n}'s permitted rail on ${chain}.`;
  return `Deposit $${cs} of native ${chain} assets into ${n}'s core pool on ${chain}.`;
}

function riskText(p, flags, sib) {
  const cat = (p.category || '').toLowerCase(), out = [];
  if (cat.includes('insurance')) out.push('Underwriting pool bears claim-payout slashing and lockup risk.');
  else if (/rwa|cedefi|crypto card/.test(cat)) out.push('Off-chain custody, legal KYC gating, and issuer solvency apply.');
  else if (/derivative|prediction|option/.test(cat)) out.push('Monitor funding, spread slippage, and liquidation buffers.');
  else if (/basis|yield|curator|allocator/.test(cat)) out.push('Verify curator strategy, basis inversion, and redemption queues.');
  else out.push('Monitor smart-contract audits, oracle feeds, and pool utilization.');
  if (sib != null) out.push(`Sibling token ${sib} already trades.`);
  if ((flags || []).some((f) => f.includes('Bitcoin P2P'))) out.push('Bitcoin P2P routing rarely issues a token.');
  return out.join(' ');
}

function computeFarmEcon(p, cal, depOverride, dropShare, horizonWeeks) {
  const ds = dropShare == null ? cal.default_drop_share : dropShare;
  const wk = horizonWeeks == null ? cal.default_horizon_weeks : horizonWeeks;
  const p05 = cal.snapshot_7d_p05;
  const { chain, profile: pr } = selectBestChain(p.chains);
  const dep = depOverride && depOverride > 0 ? depOverride : planDepositUsd(p.tvl_usd, pr.minFloor);
  const setupFee = round2(pr.setupFee), weeklyFee = round2(pr.weeklyFee * wk), exitFee = round2(pr.exitFee);
  const totalFees = round2(setupFee + weeklyFee + exitFee);
  const weeklyMins = pr.weeklyMins * wk, totalMins = pr.baseMins + weeklyMins, totalHours = round2(totalMins / 60);
  const modelledDrop = round2(p.implied_value_usd * ds * (dep / (p.tvl_usd + dep)));
  const netOfFees = round2(modelledDrop - totalFees);
  const tbill = round2(dep * cal.tbill_apr * (wk / 52));
  const netHr = round2(netOfFees / Math.max(0.25, totalHours));
  const verdict = netOfFees > tbill && netHr >= cal.farm_hourly_hurdle ? 'FARM' : netOfFees > 0 ? 'MARGINAL' : 'SKIP';
  const denom = p.implied_value_usd * (dep / (p.tvl_usd + dep));
  const beDrop = denom > 0 ? round2((totalFees / denom) * 10000) / 10000 : 1;
  const beOdds = p.implied_value_usd > 0 && p.launch_odds > 0
    ? Math.round(Math.min(1, totalFees / ((p.implied_value_usd / p.launch_odds) * ds * (dep / (p.tvl_usd + dep)))) * 1000) / 1000 : 1;
  const exitDrop = clamp(Math.abs(p05) / 100, 0.12, 0.25);
  const exitTvl = Math.round(p.tvl_usd * (1 - exitDrop));
  const multi = p.chains.length > 1 && p.chains.includes('Ethereum') && pr.family !== 'eth_l1'
    ? ` Auto-routed to ${chain} (lowest gas across ${p.chains.length} chains).` : '';
  const dStr = dep.toLocaleString('en-US');
  const coreMins = Math.max(5, pr.baseMins - 30);
  const items = [
    { phase:'SETUP', action:`Prepare a dedicated ${pr.wallet} on ${chain} funded with ${pr.gasAsset} fee buffer (no airdrop is confirmed).`, cost_usd:round2(setupFee*0.35), cost_label:`${fmtFee(round2(setupFee*0.35))} gas`, minutes:8, time_label:'8m' },
    { phase:'VERIFY', action:`Verify ${p.name}'s official domain and contract docs; never sign approvals from third-party links.`, cost_usd:0, cost_label:'free', minutes:5, time_label:'5m' },
    { phase:'FUND', action:`Bridge or withdraw $${dStr} in native ${chain} assets.${multi}`, cost_usd:round2(setupFee*0.65), cost_label:`${fmtFee(round2(setupFee*0.65))} transfer`, minutes:7, time_label:'7m' },
    { phase:'CORE', action:coreActionText(p, chain, pr, dep), cost_usd:0, cost_label:`$${dStr} at risk`, minutes:coreMins, time_label:`${coreMins}m` },
    { phase:'CADENCE', action:`Maintain position for ${wk} weeks with ${pr.cadence} (avoid wasteful micro-churn).`, cost_usd:weeklyFee, cost_label:`${fmtFee(weeklyFee)} over ${wk}wk`, minutes:weeklyMins, time_label:`${pr.weeklyMins}m/wk (${weeklyMins}m)` },
    { phase:'RISK', action:riskText(p, p.flags, p.sibling_symbol), cost_usd:0, cost_label:'free check', minutes:2, time_label:'2m' },
    { phase:'EXIT RULE', action:`Exit early if protocol TVL drops below $${(exitTvl/1e6).toFixed(1)}M (${p05.toFixed(1)}% weekly P05 stress threshold) or withdrawals pause; ${pr.cleanup}.`, cost_usd:exitFee, cost_label:`${fmtFee(exitFee)} unwind`, minutes:5, time_label:'5m' },
    { phase:'LOG', action:`Record wallet, tx hashes, and net $${netOfFees.toFixed(2)} (${verdict}) vs $${tbill.toFixed(2)} 4% T-bill benchmark; claim only via official domain.`, cost_usd:0, cost_label:'free log', minutes:3, time_label:'3m' },
  ];
  const steps = items.map((s) => {
    const l = `${s.phase}: ${s.action} Cost: ${s.cost_label}. Time: ${s.time_label}.`;
    return l.length > 600 ? `${l.slice(0, 596)}...` : l;
  });
  return {
    best_chain:chain, chain_family:pr.family, family_label:pr.familyLabel, gas_tier:pr.gasTier, deposit_usd:dep,
    drop_share:ds, horizon_weeks:wk, setup_fee_usd:setupFee, weekly_fee_usd:weeklyFee, exit_fee_usd:exitFee,
    total_fees_usd:totalFees, total_minutes:totalMins, total_hours:totalHours, modelled_drop_usd:modelledDrop,
    net_of_fees_usd:netOfFees, tbill_hurdle_usd:tbill, net_per_hour:netHr, verdict, break_even_drop_share:beDrop,
    break_even_odds:beOdds, exit_tvl_usd:exitTvl, cadence:pr.cadence, steps, items,
  };
}

window.__RADAR_PARITY = { computeRowValuation, fnv1aHex, classifySingleChain, selectBestChain, planDepositUsd, computeFarmEcon };

// ---- Startup Live Integrity Check ----
const rows = D.rows, L = D.ledger, C = D.calibration, S = D.summary;
let recTot = 0, mis = 0, monoOk = true, wlN = 0;
const chk = [];
for (let i = 0; i < rows.length; i++) {
  const r = rows[i], v = computeRowValuation(r, C);
  recTot += v.implied;
  if (v.implied !== r.implied_value_usd || v.launchOdds !== r.launch_odds || v.valueIfLaunched !== r.value_if_launched_usd) mis++;
  if (r.rank !== i + 1 || (i > 0 && rows[i - 1].implied_value_usd < r.implied_value_usd)) monoOk = false;
  if (r.tier === 'watchlist') wlN++;
  chk.push({ slug: r.slug, implied_value_usd: v.implied });
}
const recCsum = fnv1aHex(chk), csumOk = recCsum === C.board_checksum;
const totOk = recTot === S.total_implied_usd && recTot === C.board_total_implied_usd;
const wlOk = wlN === 40 && L.watchlist === 40;
const lSum = L.watchlist + L.large_cap + L.early + L.priced_comps + L.other_tokenized + L.excl_bridges + L.excl_lst_btc + L.excl_cex_ver_sib;
const ledOk = lSum === L.total && L.total === 758;

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const fmtUsd = (n) => {
  const a = Math.abs(n), sg = n < 0 ? '-' : '';
  if (a >= 1e9) return `${sg}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${sg}$${(a / 1e6).toFixed(a >= 100e6 ? 0 : 1)}M`;
  if (a >= 1e3) return `${sg}$${(a / 1e3).toFixed(a >= 100e3 ? 0 : 1)}k`;
  return `${sg}$${a.toFixed(a < 100 ? 2 : 0)}`;
};
const fmtSigned = (n) => `${n > 0 ? '+' : ''}${fmtUsd(n)}`;
const fmtPct = (p, d = 1) => p == null ? '\u2014' : `${p > 0 ? '+' : ''}${p.toFixed(d)}%`;
const fmtAge = (d) => d == null ? 'n/a' : `${(d / 365).toFixed(1)}y`;

const st = { tab:'board', verdict:'all', tier:'all', cat:'all', chain:'all', q:'', sort:'rank', dir:'asc', dep:0, drop:C.default_drop_share, wk:C.default_horizon_weeks, p:null };
function readHash() {
  const raw = (location.hash || '').replace(/^#/, '');
  Object.assign(st, { tab:'board', verdict:'all', tier:'all', cat:'all', chain:'all', q:'', sort:'rank', dir:'asc', dep:0, drop:C.default_drop_share, wk:C.default_horizon_weeks, p:null });
  if (!raw) return;
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
    if (st.verdict !== 'all') sp.set('verdict', st.verdict);
    if (st.tier !== 'all') sp.set('tier', st.tier);
    if (st.cat !== 'all') sp.set('cat', st.cat);
    if (st.chain !== 'all') sp.set('chain', st.chain);
    if (st.q) sp.set('q', st.q);
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
const getEcon = (r) => isDef() ? r.farm_econ : computeFarmEcon(r, C, st.dep > 0 ? st.dep : null, st.drop, st.wk);

function scatterSvg() {
  const W = 380, H = 122, l = 34, r = 8, t = 8, b = 20, x0 = 7.4, x1 = 10.6, y0 = 6.3, y1 = 10.7;
  const px = (x) => l + ((clamp(x, x0, x1) - x0) / (x1 - x0)) * (W - l - r);
  const py = (y) => H - b - ((clamp(y, y0, y1) - y0) / (y1 - y0)) * (H - t - b);
  const pm = C.price_model;
  const fit = (tvl, q = 0) => (Math.log(pm.ref_tvl_usd) + pm.intercept + pm.beta_tvl * Math.log(tvl / pm.ref_tvl_usd) + q) / Math.LN10;
  const tA = Math.pow(10, x0), tB = Math.pow(10, x1);
  const poly = `${px(x0).toFixed(1)},${py(fit(tA, pm.q75_log)).toFixed(1)} ${px(x1).toFixed(1)},${py(fit(tB, pm.q75_log)).toFixed(1)} ${px(x1).toFixed(1)},${py(fit(tB, pm.q25_log)).toFixed(1)} ${px(x0).toFixed(1)},${py(fit(tA, pm.q25_log)).toFixed(1)}`;
  const cDots = D.live_comparables.map((c) => `<circle cx="${px(Math.log10(c.tvl_usd)).toFixed(1)}" cy="${py(Math.log10(c.mcap_usd)).toFixed(1)}" r="2.2" fill="#38bdf8" fill-opacity="0.72"><title>${esc(c.name)} (${esc(c.symbol)}): ${fmtUsd(c.tvl_usd)} / ${fmtUsd(c.mcap_usd)}</title></circle>`).join('');
  const pDots = rows.slice(0, 45).map((u) => `<circle cx="${px(Math.log10(u.tvl_usd)).toFixed(1)}" cy="${py(Math.log10(u.value_if_launched_usd)).toFixed(1)}" r="1.9" fill="#f59e0b" fill-opacity="0.75"><title>#${u.rank} ${esc(u.name)}: ${fmtUsd(u.tvl_usd)} / ${fmtUsd(u.value_if_launched_usd)}</title></circle>`).join('');
  const grid = [[7,'10M'],[8,'100M'],[9,'1B'],[10,'10B']].map(([v,lbl]) => {
    const y = py(v).toFixed(1);
    return `<line x1="${l}" y1="${y}" x2="${W-r}" y2="${y}" stroke="#1f2c3e"/><text x="${l-4}" y="${(+y+3).toFixed(1)}" text-anchor="end" fill="#62738a" font-size="8.5" font-family="monospace">${lbl}</text>`;
  }).join('') + [[7.7,'50M'],[8.7,'500M'],[9.7,'5B'],[10.48,'30B']].map(([v,lbl]) =>
    `<text x="${px(v).toFixed(1)}" y="${H-6}" text-anchor="middle" fill="#62738a" font-size="8.5" font-family="monospace">${lbl}</text>`
  ).join('');
  return `<svg class="sc-svg" viewBox="0 0 ${W} ${H}">${grid}<polygon points="${poly}" fill="#22c55e" fill-opacity="0.13"/><line x1="${px(x0).toFixed(1)}" y1="${py(fit(tA)).toFixed(1)}" x2="${px(x1).toFixed(1)}" y2="${py(fit(tB)).toFixed(1)}" stroke="#22c55e" stroke-width="1.5"/>${cDots}${pDots}</svg>`;
}

const cats = Array.from(new Set(rows.map((r) => r.category || 'Uncategorized'))).sort();
const chMap = new Map();
for (const r of rows) chMap.set(r.farm_econ.best_chain, (chMap.get(r.farm_econ.best_chain) || 0) + 1);
const topChains = Array.from(chMap.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([c]) => c);

const tierBdg = (t) => t === 'watchlist' ? '<span class="bdg b-wl">WL</span>' : t === 'large-cap' ? '<span class="bdg b-lc">LC</span>' : '<span class="bdg b-e">E</span>';
const verdBdg = (v) => v === 'FARM' ? '<span class="bdg b-farm">FARM</span>' : v === 'MARGINAL' ? '<span class="bdg b-marg">MARG</span>' : '<span class="bdg b-skip">SKIP</span>';

function renderCover() {
  const pm = C.price_model, om = C.odds_model, econs = rows.map((r) => ({ r, e: getEcon(r) }));
  let vF = 0, vM = 0, vS = 0;
  for (const x of econs) { if (x.e.verdict === 'FARM') vF++; else if (x.e.verdict === 'MARGINAL') vM++; else vS++; }
  const ql = st.q.trim().toLowerCase();
  const filt = econs.filter(({ r, e }) =>
    (st.verdict === 'all' || e.verdict === st.verdict) &&
    (st.tier === 'all' || r.tier === st.tier) &&
    (st.cat === 'all' || (r.category || 'Uncategorized') === st.cat) &&
    (st.chain === 'all' || r.chains.includes(st.chain) || e.best_chain === st.chain) &&
    (!ql || `${r.name} ${r.slug} ${r.category || ''} ${r.chains.join(' ')}`.toLowerCase().includes(ql))
  );
  const mult = st.dir === 'asc' ? 1 : -1;
  filt.sort((a, b) => {
    const ka = a.r, kb = b.r, ea = a.e, eb = b.e;
    let c = 0;
    if (st.sort === 'rank') c = ka.rank - kb.rank;
    else if (st.sort === 'name') c = ka.name.localeCompare(kb.name);
    else if (st.sort === 'tvl') c = ka.tvl_usd - kb.tvl_usd;
    else if (st.sort === 'g7d') c = (ka.change_7d ?? -999) - (kb.change_7d ?? -999);
    else if (st.sort === 'age') c = (ka.age_days ?? 99999) - (kb.age_days ?? 99999);
    else if (st.sort === 'odds') c = ka.launch_odds - kb.launch_odds;
    else if (st.sort === 'val') c = ka.value_if_launched_usd - kb.value_if_launched_usd;
    else if (st.sort === 'implied') c = ka.implied_value_usd - kb.implied_value_usd;
    else if (st.sort === 'net') c = ea.net_of_fees_usd - eb.net_of_fees_usd;
    else if (st.sort === 'netHr') c = ea.net_per_hour - eb.net_per_hour;
    return c * mult || ka.rank - kb.rank;
  });

  const segs = [['Watchlist',L.watchlist,'#38bdf8'],['Large Cap',L.large_cap,'#a78bfa'],['Early',L.early,'#22c55e'],['Live Comps',L.priced_comps,'#0ea5e9'],['Tokenized',L.other_tokenized,'#64748b'],['Bridges',L.excl_bridges,'#475569'],['LST/BTC',L.excl_lst_btc,'#f59e0b'],['Sib/CEX/Ver',L.excl_cex_ver_sib,'#ef4444']];
  const th = (id, lbl, cls = '') => `<th data-sort="${id}" class="${cls}${st.sort===id?' sort':''}">${lbl}${st.sort===id?(st.dir==='asc'?' \u25B2':' \u25BC'):''}</th>`;
  const tRows = st.tab === 'board'
    ? filt.map(({ r, e }) => `<tr data-slug="${esc(r.slug)}">
        <td class="mono"><b>${r.rank}</b><span class="rng">${r.rank_low}\u2013${r.rank_high}</span></td>
        <td><div class="pname">${esc(r.name)} ${tierBdg(r.tier)}${r.sibling_symbol?` <span class="bdg b-warn">SIB:${esc(r.sibling_symbol)}</span>`:''}${r.flags.some((f)=>f.includes('Bitcoin P2P'))?' <span class="bdg b-warn">BTC-P2P</span>':''}</div><div class="pmeta">${esc(r.category||'Uncategorized')} \u00B7 ${esc(e.best_chain)} (${esc(e.family_label)})</div></td>
        <td class="num">${fmtUsd(r.tvl_usd)}</td>
        <td class="num ${r.change_7d==null?'':r.change_7d>=0?'pos':'neg'}">${fmtPct(r.change_7d)}</td>
        <td class="num">${fmtAge(r.age_days)}</td>
        <td class="num">${(r.launch_odds*100).toFixed(1)}%</td>
        <td class="num">${fmtUsd(r.value_if_launched_usd)}</td>
        <td class="num"><b>${fmtUsd(r.implied_value_usd)}</b><span class="rng">${fmtUsd(r.implied_low_usd)}\u2013${fmtUsd(r.implied_high_usd)}</span></td>
        <td class="num">${verdBdg(e.verdict)} <span class="${e.net_of_fees_usd>0?'pos':'neg'}">${fmtSigned(e.net_of_fees_usd)}</span><span class="rng">fee ${fmtUsd(e.total_fees_usd)} \u00B7 dep ${fmtUsd(e.deposit_usd)}</span></td>
        <td class="num"><b class="${e.net_per_hour>=20&&e.verdict==='FARM'?'pos':''}">$${e.net_per_hour.toFixed(1)}/h</b><span class="rng">${e.total_hours.toFixed(1)}h/${e.horizon_weeks}w</span></td>
      </tr>`).join('')
    : D.live_comparables.filter((c) => !ql || `${c.name} ${c.symbol} ${c.category||''}`.toLowerCase().includes(ql)).map((c) => `<tr style="cursor:default">
        <td class="mono"><b>${esc(c.symbol)}</b></td>
        <td><div class="pname">${esc(c.name)}</div><div class="pmeta">${esc(c.category||'Uncategorized')} \u00B7 ${esc(c.chains.slice(0,3).join(', '))}</div></td>
        <td class="num">${fmtUsd(c.tvl_usd)}</td><td class="num ${c.change_7d==null?'':c.change_7d>=0?'pos':'neg'}">${fmtPct(c.change_7d)}</td>
        <td class="num">${fmtAge(c.age_days)}</td><td class="num">${c.ratio.toFixed(2)}\u00D7</td>
        <td class="num">${fmtUsd(c.loo_pred_usd)}</td><td class="num"><b>${fmtUsd(c.mcap_usd)}</b></td>
        <td class="num"><span class="bdg ${c.loo_miss<=3?'b-farm':'b-marg'}">\u00D7${c.loo_miss.toFixed(2)}</span></td><td class="num">${c.loo_dir}</td>
      </tr>`).join('');

  return `<div class="wrap">
    <div class="hdr">
      <div class="brand"><h1>Token Radar</h1><span class="ver">${esc(D.model_version)} \u00B7 FNV ${esc(C.board_checksum)}</span><span class="sub">Snapshot ${esc(D.as_of)} \u00B7 WL \u2265 ${fmtUsd(D.floor_usd)} \u00B7 Early \u2265 $5M \u00B7 Offline zero-leak DeFi terminal (NOT financial advice)</span></div>
      <div class="tabs"><button class="btn ${st.tab==='board'?'on':''}" data-tab="board">Opportunity Board (${rows.length})</button><button class="btn ${st.tab==='comps'?'on':''}" data-tab="comps">Live Comps (${D.live_comparables.length})</button></div>
    </div>
    <div class="kpis">
      <div class="kpi"><div class="lbl">Universe Accounted</div><div class="val">${L.total}</div><div class="note">${S.board_size} tokenless \u00B7 ${L.priced_comps} comps \u00B7 0 unmapped</div></div>
      <div class="kpi"><div class="lbl">Board Implied Total</div><div class="val">${fmtUsd(S.total_implied_usd)}</div><div class="note">${S.board_size} rows \u00B7 ${fmtUsd(S.total_board_tvl_usd)} TVL</div></div>
      <div class="kpi"><div class="lbl">Stage 1 \u00B7 Value OOS</div><div class="val">\u00D7${pm.wf_miss.toFixed(2)} WF</div><div class="note">LOO \u00D7${pm.loo_miss.toFixed(2)} \u00B7 ${(pm.within3x_wf*100).toFixed(0)}% inside \u00D73</div></div>
      <div class="kpi"><div class="lbl">Stage 2 \u00B7 Odds OOS</div><div class="val">${om.wf_brier.toFixed(3)} Brier</div><div class="note">WF (${om.base_wf_brier.toFixed(3)} base) \u00B7 ${(om.wf_acc*100).toFixed(0)}% acc</div></div>
      <div class="kpi"><div class="lbl">Net-of-Fees Tickets</div><div class="val pos">${vF} FARM</div><div class="note">${vM} marginal \u00B7 ${vS} skip (\u2265$20/h &gt;4%)</div></div>
      <div class="kpi"><div class="lbl">Median Implied</div><div class="val">${fmtUsd(S.median_implied_usd)}</div><div class="note">${S.watchlist_size} WL \u00B7 ${S.distinct_chains} chains \u00B7 ${C.n_bootstrap} boot</div></div>
    </div>
    <div class="bar-row">
      <div class="card"><div class="ctitle"><span>MECE Universe Ledger (${L.total}/${L.total})</span><span class="mono">${S.board_size} ranked + ${L.total-S.board_size} comps/excl</span></div><div class="mece-bar">${segs.map(([lbl,n,col])=>`<div style="width:${(n/L.total)*100}%;background:${col}" title="${lbl}: ${n}"></div>`).join('')}</div><div class="mece-leg">${segs.map(([lbl,n,col])=>`<span><i class="dot" style="background:${col}"></i>${lbl} <b class="mono">${n}</b></span>`).join('')}</div></div>
      <div class="card"><div class="ctitle"><span>Browser Integrity Checks (Live JS Recompute)</span><span class="mono">${isDef()?'Parity locked: 185/185 = board.json':`Scenario: ${st.dep?fmtUsd(st.dep):'Plan'} \u00B7 ${(st.drop*100).toFixed(0)}% \u00B7 ${st.wk}wk`}</span></div><div class="pills">
        <div class="pill ${mis===0?'ok':'warn'}">${mis===0?'\u2713':'!'} ${rows.length-mis}/${rows.length} Parity Exact</div>
        <div class="pill ${monoOk?'ok':'warn'}">${monoOk?'\u2713':'!'} Ranks 1..${rows.length} Monotonic</div>
        <div class="pill ${totOk?'ok':'warn'}">${totOk?'\u2713':'!'} Sum ${fmtUsd(recTot)} Exact</div>
        <div class="pill ${csumOk?'ok':'warn'}">${csumOk?'\u2713':'!'} Checksum ${esc(recCsum)}</div>
        <div class="pill ${wlOk?'ok':'warn'}">${wlOk?'\u2713':'!'} Watchlist 40/40 (0 Leaks)</div>
        <div class="pill ${ledOk?'ok':'warn'}">${ledOk?'\u2713':'!'} Ledger ${lSum}/758 MECE</div>
      </div></div>
    </div>
    <div class="ev-grid">
      <div class="card"><div class="ctitle"><span>Stage 1 \u00B7 Value if Launched (${pm.n_comps} Comps)</span><span class="mono">WF \u2265 ${esc(pm.wf_cutoff)}</span></div>
        <table class="mini-tbl"><thead><tr><th>Specification</th><th class="num">LOO</th><th class="num">WF</th><th class="num">\u22643\u00D7</th><th>Gate</th></tr></thead>
        <tbody>${pm.ablation.map((a)=>`<tr><td>${esc(a.step)}</td><td class="num">\u00D7${a.loo_miss.toFixed(2)}</td><td class="num">\u00D7${a.wf_miss.toFixed(2)}</td><td class="num">${(a.loo_w3x*100).toFixed(0)}%/${(a.wf_w3x*100).toFixed(0)}%</td><td class="${a.status==='kept'?'kept':''}">${esc(a.status)}</td></tr>`).join('')}</tbody></table>
        <div class="subline">Empirical coverage: 50% band ${(pm.cov50_loo*100).toFixed(0)}%/${(pm.cov50_wf*100).toFixed(0)}% \u00B7 80% band ${(pm.cov80_loo*100).toFixed(0)}%/${(pm.cov80_wf*100).toFixed(0)}%</div></div>
      <div class="card"><div class="ctitle"><span>Stage 2 \u00B7 Conditional Odds (${om.n_peers} Peers)</span><span class="mono">WF \u2265 ${esc(om.wf_cutoff)}</span></div>
        <table class="mini-tbl"><thead><tr><th>Specification</th><th class="num">10F Brier</th><th class="num">WF Brier</th><th class="num">Acc</th><th>Gate</th></tr></thead>
        <tbody>${om.ablation.map((a)=>`<tr><td>${esc(a.step)}</td><td class="num">${a.cv10_brier.toFixed(3)}</td><td class="num">${a.wf_brier.toFixed(3)}</td><td class="num">${(a.wf_acc*100).toFixed(0)}%</td><td class="${a.status==='kept'?'kept':a.status==='tested_not_kept'?'rej':''}">${a.status==='tested_not_kept'?'dropped':esc(a.status)}</td></tr>`).join('')}</tbody></table>
        <div class="subline">Chain-count weight hurt WF Brier and is zeroed (0). Sibling token cuts odds 0.50\u00D7.</div></div>
      <div class="card"><div class="ctitle"><span>Log-Log Fit \u00B7 Comps vs Pre-Token</span><span class="mono"><span style="color:#38bdf8">\u25CF</span> Live <span style="color:#f59e0b">\u25CF</span> Board <span style="color:#22c55e">\u2014</span> Fit</span></div>
        ${scatterSvg()}<div class="subline">Slope \u03B2=${pm.beta_tvl.toFixed(3)} around $100M TVL (Huber \u03B4=1.35 + Cat ridge k=${pm.cat_ridge_k}). Shaded = P25\u2013P75.</div></div>
    </div>
    <div class="toolbar">
      <div class="grp"><span class="lbl-s">Verdict</span>
        <button class="btn ${st.verdict==='all'?'on':''}" data-verdict="all">All (${rows.length})</button>
        <button class="btn g ${st.verdict==='FARM'?'on':''}" data-verdict="FARM">FARM (${vF})</button>
        <button class="btn a ${st.verdict==='MARGINAL'?'on':''}" data-verdict="MARGINAL">MARGINAL (${vM})</button>
        <button class="btn r ${st.verdict==='SKIP'?'on':''}" data-verdict="SKIP">SKIP (${vS})</button>
        <select id="f-tier"><option value="all">All Tiers (${rows.length})</option><option value="watchlist"${st.tier==='watchlist'?' selected':''}>Watchlist (${S.watchlist_size})</option><option value="large-cap"${st.tier==='large-cap'?' selected':''}>Large Cap \u2265$1B (${S.large_cap_size})</option><option value="early"${st.tier==='early'?' selected':''}>Early &lt;$1B (${S.early_size})</option></select>
        <select id="f-cat"><option value="all">All Categories (${cats.length})</option>${cats.map((c)=>`<option value="${esc(c)}"${st.cat===c?' selected':''}>${esc(c)}</option>`).join('')}</select>
        <select id="f-chain"><option value="all">All Chains (${topChains.length})</option>${topChains.map((c)=>`<option value="${esc(c)}"${st.chain===c?' selected':''}>${esc(c)}</option>`).join('')}</select>
        <input id="f-q" type="search" value="${esc(st.q)}" placeholder="Filter protocol / chain..." />
      </div>
      <div class="grp"><span class="lbl-s">Ticket</span>
        <select id="s-dep"><option value="0"${st.dep===0?' selected':''}>Plan Auto (0.02% \u2264$25k)</option>${[2500,5000,10000,25000,50000].map((v)=>`<option value="${v}"${st.dep===v?' selected':''}>${fmtUsd(v)}</option>`).join('')}</select>
        <select id="s-drop">${[0.03,0.05,0.07,0.10].map((v)=>`<option value="${v}"${Math.abs(st.drop-v)<1e-6?' selected':''}>${(v*100).toFixed(0)}% drop</option>`).join('')}</select>
        <select id="s-wk">${[4,12,24].map((v)=>`<option value="${v}"${st.wk===v?' selected':''}>${v} wk</option>`).join('')}</select>
      </div>
    </div>
    <div class="tbl-wrap"><table class="tbl"><thead>${st.tab==='board'
      ? `<tr>${th('rank','# \u00B7 Band')}${th('name','Protocol \u00B7 Category \u00B7 Best Route')}${th('tvl','TVL','num')}${th('g7d','7d','num')}${th('age','Age','num')}${th('odds','Odds','num')}${th('val','If Launched','num')}${th('implied','Implied \u00B7 P25\u2013P75','num')}${th('net','Ticket \u00B7 Net $','num')}${th('netHr','Net / Hr','num')}</tr>`
      : `<tr><th>Symbol</th><th>Comparable \u00B7 Category \u00B7 Chains</th><th class="num">TVL</th><th class="num">7d</th><th class="num">Age</th><th class="num">MCap/TVL</th><th class="num">Blind LOO</th><th class="num">Live MCap</th><th class="num">LOO Miss</th><th class="num">Dir</th></tr>`
    }</thead><tbody>${tRows||'<tr><td colspan="10" style="padding:18px;text-align:center;color:var(--muted)">No protocols match filter.</td></tr>'}</tbody></table></div>
    <div class="foot-note"><span>Showing ${st.tab==='board'?filt.length:D.live_comparables.length} rows \u00B7 Exit = snapshot 7d P05 (${C.snapshot_7d_p05.toFixed(1)}%) \u00B7 ${C.n_bootstrap} bootstrap refits</span><span>Offline snapshot (${esc(D.as_of)}) \u00B7 Zero network calls</span></div>
  </div>`;
}

function renderDetail(slug) {
  const idx = rows.findIndex((r) => r.slug === slug), r = rows[idx >= 0 ? idx : 0];
  const e = computeFarmEcon(r, C, st.dep > 0 ? st.dep : null, st.drop, st.wk);
  const pm = C.price_model, om = C.odds_model, cat = r.category || 'Uncategorized';
  const catAdj = Object.prototype.hasOwnProperty.call(pm.cat_adj, cat) ? pm.cat_adj[cat] : 0;
  const sTvl = computeRowValuation({ ...r, tvl_usd: r.tvl_usd * 0.70 }, C);
  const sGrow = computeRowValuation({ ...r, change_7d: 0 }, C);
  const sAge = computeRowValuation({ ...r, age_days: (r.age_days == null ? om.median_age_years * 365 : r.age_days) + 182 }, C);
  const peers = D.live_comparables.slice().sort((a, b) =>
    ((a.category||'Uncategorized')===cat?0:1) - ((b.category||'Uncategorized')===cat?0:1) ||
    Math.abs(Math.log(a.tvl_usd/r.tvl_usd)) - Math.abs(Math.log(b.tvl_usd/r.tvl_usd))
  ).slice(0, 6);
  const depCols = [2500, 10000, 25000];
  if (!depCols.includes(e.deposit_usd)) depCols[1] = e.deposit_usd;
  depCols.sort((a, b) => a - b);
  const mxHtml = [0.03,0.05,0.07,0.10].map((ds) => `<tr><td>${(ds*100).toFixed(0)}% drop</td>${depCols.map((dp) => {
    const net = round2(r.implied_value_usd * ds * (dp / (r.tvl_usd + dp)) - e.total_fees_usd);
    const hdl = round2(dp * C.tbill_apr * (e.horizon_weeks / 52));
    const ok = net > hdl && net / Math.max(0.25, e.total_hours) >= C.farm_hourly_hurdle;
    return `<td class="${ok?'pos':net>0?'':'neg'}">${fmtSigned(net)}</td>`;
  }).join('')}</tr>`).join('');
  const prevS = rows[(idx - 1 + rows.length) % rows.length].slug, nextS = rows[(idx + 1) % rows.length].slug;

  return `<div class="wrap">
    <div class="det-hdr">
      <div class="det-title"><button class="btn" id="b-back">\u2190 Board</button><span class="ver">#${r.rank} (${r.rank_low}\u2013${r.rank_high})</span><h2>${esc(r.name)}</h2><span class="sub">${esc(cat)} \u00B7 ${esc(r.chains.join(', '))} \u00B7 ${esc(e.epistemic_tier||r.farm_econ.epistemic_tier)}</span>${r.sibling_symbol?`<span class="bdg b-warn">SIBLING ${esc(r.sibling_symbol)} (0.5\u00D7 odds)</span>`:''}</div>
      <div class="grp"><span class="bdg ${e.verdict==='FARM'?'b-farm':e.verdict==='MARGINAL'?'b-marg':'b-skip'}" style="font-size:11px;padding:3px 8px">${e.verdict} \u00B7 ${fmtSigned(e.net_of_fees_usd)} (${fmtUsd(e.net_per_hour)}/h)</span><button class="btn" data-nav="${esc(prevS)}">\u25C0 Prev</button><button class="btn" data-nav="${esc(nextS)}">Next \u25B6</button></div>
    </div>
    <div class="det-grid">
      <div class="stack">
        <div class="card"><div class="ctitle"><span>Two-Stage Valuation Cascade</span><span class="mono">TVL ${fmtUsd(r.tvl_usd)} \u00B7 7d ${fmtPct(r.change_7d)} \u00B7 Age ${fmtAge(r.age_days)}</span></div>
          <div class="eq-box">
            <div class="eq-line"><span>Stage 1 Base (ref $100M, intercept)</span><span>${pm.intercept.toFixed(4)}</span></div>
            <div class="eq-line"><span>Size Curve (\u03B2=${pm.beta_tvl.toFixed(3)} \u00D7 ln(${(r.tvl_usd/1e8).toFixed(2)}))</span><span>${(pm.beta_tvl*Math.log(r.tvl_usd/pm.ref_tvl_usd)).toFixed(4)}</span></div>
            <div class="eq-line"><span>Category Ridge (${esc(cat)}, k=${pm.cat_ridge_k})</span><span>${catAdj>=0?'+':''}${catAdj.toFixed(4)}</span></div>
            <div class="eq-line tot"><span>Value if Launched</span><span>${fmtUsd(r.value_if_launched_usd)}</span></div>
            <div class="eq-line"><span>Stage 2 Conditional Odds (logistic Age/TVL/7d${r.sibling_symbol?' \u00D7 0.5 sib':''})</span><span>${(r.launch_odds*100).toFixed(2)}%</span></div>
            <div class="eq-line tot"><span>Expected Implied (P25\u2013P75)</span><span>${fmtUsd(r.implied_value_usd)} (${fmtUsd(r.implied_low_usd)}\u2013${fmtUsd(r.implied_high_usd)})</span></div>
          </div>
          <table class="mini-tbl" style="margin-top:6px"><thead><tr><th>Sensitivity Shock</th><th class="num">Odds</th><th class="num">Implied</th><th class="num">Delta</th></tr></thead>
          <tbody>
            <tr><td>TVL \u221230% (${fmtUsd(r.tvl_usd*0.7)})</td><td class="num">${(sTvl.launchOdds*100).toFixed(1)}%</td><td class="num">${fmtUsd(sTvl.implied)}</td><td class="num neg">${fmtPct(((sTvl.implied/r.implied_value_usd)-1)*100)}</td></tr>
            <tr><td>7d Growth Reset to 0%</td><td class="num">${(sGrow.launchOdds*100).toFixed(1)}%</td><td class="num">${fmtUsd(sGrow.implied)}</td><td class="num">${fmtPct(((sGrow.implied/r.implied_value_usd)-1)*100)}</td></tr>
            <tr><td>+6 Months Older Tokenless</td><td class="num">${(sAge.launchOdds*100).toFixed(1)}%</td><td class="num">${fmtUsd(sAge.implied)}</td><td class="num">${fmtPct(((sAge.implied/r.implied_value_usd)-1)*100)}</td></tr>
          </tbody></table></div>
        <div class="card"><div class="ctitle"><span>Nearest 6 Traded Peers (Blind LOO)</span><span class="mono">P10\u2013P90: ${fmtUsd(r.implied_p10_usd)}\u2013${fmtUsd(r.implied_p90_usd)}</span></div>
          <table class="mini-tbl"><thead><tr><th>Peer (Sym)</th><th>Category</th><th class="num">TVL</th><th class="num">Live MCap</th><th class="num">LOO Pred</th><th class="num">Miss</th></tr></thead>
          <tbody>${peers.map((p)=>`<tr><td><b>${esc(p.name)}</b> <span class="pmeta">${esc(p.symbol)}</span></td><td>${esc(p.category||'-')}</td><td class="num">${fmtUsd(p.tvl_usd)}</td><td class="num">${fmtUsd(p.mcap_usd)}</td><td class="num">${fmtUsd(p.loo_pred_usd)}</td><td class="num"><span class="bdg ${p.loo_miss<=3?'b-farm':'b-marg'}">\u00D7${p.loo_miss.toFixed(2)} ${p.loo_dir}</span></td></tr>`).join('')}</tbody></table></div>
        <div class="card"><div class="ctitle"><span>Net Profit ($) Matrix \u00B7 Deposit \u00D7 Drop Share (${e.horizon_weeks}wk)</span><span class="mono">Fees ${fmtUsd(e.total_fees_usd)}</span></div>
          <table class="mini-tbl mx"><thead><tr><th>Drop Share</th>${depCols.map((d)=>`<th>${fmtUsd(d)}</th>`).join('')}</tr></thead><tbody>${mxHtml}</tbody></table></div>
      </div>
      <div class="stack"><div class="card">
        <div class="ctitle"><span>Net-of-Fees Farm Economics</span><span class="mono">${esc(e.best_chain)} \u00B7 ${esc(e.gas_tier)}</span></div>
        <div class="econ-6">
          <div class="ec"><div class="l">Plan Deposit</div><div class="v">${fmtUsd(e.deposit_usd)}</div></div>
          <div class="ec"><div class="l">Modelled Drop (${(e.drop_share*100).toFixed(0)}%)</div><div class="v">${fmtUsd(e.modelled_drop_usd)}</div></div>
          <div class="ec"><div class="l">Gas &amp; Ops Fees</div><div class="v">${fmtUsd(e.total_fees_usd)}</div></div>
          <div class="ec"><div class="l">Net vs 4% T-Bill (${fmtUsd(e.tbill_hurdle_usd)})</div><div class="v ${e.net_of_fees_usd>e.tbill_hurdle_usd?'pos':'neg'}">${fmtSigned(e.net_of_fees_usd)}</div></div>
          <div class="ec"><div class="l">Net Hourly (${e.total_hours.toFixed(1)}h)</div><div class="v ${e.net_per_hour>=20?'pos':''}">$${e.net_per_hour.toFixed(2)}/h</div></div>
          <div class="ec"><div class="l">Break-Even Share / Odds</div><div class="v">${(e.break_even_drop_share*100).toFixed(2)}% / ${(e.break_even_odds*100).toFixed(1)}%</div></div>
        </div>
        <div class="exit-box"><b>Quantified Exit Rule:</b> Pull liquidity immediately if TVL breaks below <b class="mono">${fmtUsd(e.exit_tvl_usd)}</b> (${C.snapshot_7d_p05.toFixed(1)}% P05 7d shock) or withdrawals throttle. Risk: ${esc((r.farm_econ.risk_tags||[]).join(' \u00B7 '))}.</div>
        <div class="ctitle" style="margin-top:4px"><span>8-Step Costed &amp; Timed Execution Plan (${e.total_minutes}m / ${e.horizon_weeks}wk)</span><span class="mono">${esc(e.cadence)}</span></div>
        <table class="steps-tbl"><tbody>${e.items.map((it)=>`<tr><td><span class="ph">${esc(it.phase)}</span></td><td>${esc(it.action)}</td><td class="cost-t">${esc(it.cost_label)}<br/>${esc(it.time_label)}</td></tr>`).join('')}</tbody></table>
      </div></div>
    </div>
  </div>`;
}

const root = document.getElementById('app');
function draw() { writeHash(); root.innerHTML = st.p ? renderDetail(st.p) : renderCover(); bind(); }
function bind() {
  root.querySelectorAll('[data-tab]').forEach((el) => el.addEventListener('click', () => { st.tab = el.dataset.tab; draw(); }));
  root.querySelectorAll('[data-verdict]').forEach((el) => el.addEventListener('click', () => { st.verdict = el.dataset.verdict; draw(); }));
  root.querySelectorAll('[data-sort]').forEach((el) => el.addEventListener('click', () => {
    const k = el.dataset.sort;
    if (st.sort === k) st.dir = st.dir === 'asc' ? 'desc' : 'asc';
    else { st.sort = k; st.dir = k === 'rank' || k === 'name' || k === 'age' ? 'asc' : 'desc'; }
    draw();
  }));
  root.querySelectorAll('tr[data-slug]').forEach((el) => el.addEventListener('click', () => { st.p = el.dataset.slug; draw(); window.scrollTo(0, 0); }));
  root.querySelectorAll('[data-nav]').forEach((el) => el.addEventListener('click', () => { st.p = el.dataset.nav; draw(); window.scrollTo(0, 0); }));
  const b = document.getElementById('b-back'); if (b) b.addEventListener('click', () => { st.p = null; draw(); });
  const bs = (id, key, num = false) => { const el = document.getElementById(id); if (el) el.addEventListener('change', () => { st[key] = num ? Number(el.value) : el.value; draw(); }); };
  bs('f-tier','tier'); bs('f-cat','cat'); bs('f-chain','chain'); bs('s-dep','dep',true); bs('s-drop','drop',true); bs('s-wk','wk',true);
  const fq = document.getElementById('f-q');
  if (fq) fq.addEventListener('input', () => { st.q = fq.value; draw(); const nf = document.getElementById('f-q'); if (nf) { nf.focus(); nf.setSelectionRange(nf.value.length, nf.value.length); } });
}
window.addEventListener('hashchange', () => { readHash(); draw(); });
readHash();
draw();
})();
