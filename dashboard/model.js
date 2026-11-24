'use strict';
(() => {
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const sigmoid = (z) => 1 / (1 + Math.exp(-clamp(z, -20, 20)));
const r2 = (n) => Math.round(n * 100) / 100;
const r4 = (n) => Math.round(n * 10000) / 10000;
const byCode = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function median(vals) {
  if (!vals.length) return 0;
  const s = vals.slice().sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function solveLinear(A, b) {
  const n = b.length, M = A.map((row, i) => [...row, b[i]]);
  for (let i = 0; i < n; i++) {
    let best = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[best][i])) best = r;
    if (best !== i) { const t = M[i]; M[i] = M[best]; M[best] = t; }
    const piv = Math.abs(M[i][i]) < 1e-12 ? 1e-12 : M[i][i];
    for (let j = i; j <= n; j++) M[i][j] /= piv;
    for (let r = 0; r < n; r++) if (r !== i) { const f = M[r][i]; for (let j = i; j <= n; j++) M[r][j] -= f * M[i][j]; }
  }
  return M.map((r) => r[n]);
}

function fitStage1Huber(rawComps, refTvl, catK) {
  const ref = refTvl || 1e8, k = catK || 64, delta = 1.35;
  const X = rawComps.map((c) => [1, Math.log(c.tvl_usd / ref)]), Y = rawComps.map((c) => Math.log(c.mcap_usd / ref));
  const w = new Array(rawComps.length).fill(1);
  let coef = [0, 0];
  for (let it = 0; it < 25; it++) {
    const A = [[0, 0], [0, 1e-4]], B = [0, 0];
    for (let i = 0; i < rawComps.length; i++) {
      const xi = X[i], yi = Y[i], wi = w[i];
      for (let j = 0; j < 2; j++) { B[j] += wi * xi[j] * yi; for (let m = 0; m < 2; m++) A[j][m] += wi * xi[j] * xi[m]; }
    }
    coef = solveLinear(A, B);
    for (let i = 0; i < rawComps.length; i++) { const ar = Math.abs(Y[i] - (coef[0] + coef[1] * X[i][1])); w[i] = ar <= delta ? 1 : delta / ar; }
  }
  const byC = new Map();
  for (let i = 0; i < rawComps.length; i++) {
    const c = rawComps[i], cat = c.category || 'Uncategorized', arr = byC.get(cat) || [];
    arr.push(Y[i] - (coef[0] + coef[1] * X[i][1]));
    byC.set(cat, arr);
  }
  const cat_adj = {};
  for (const [cat, arr] of [...byC.entries()].sort((a, b) => byCode(a[0], b[0]))) {
    cat_adj[cat] = r4((arr.reduce((a, b) => a + b, 0)) / (arr.length + k));
  }
  return { ref_tvl_usd: ref, intercept: r4(coef[0]), beta_tvl: r4(coef[1]), cat_adj };
}

function fitStage2Logistic(rawPeers, om) {
  const mA = om.median_age_years, mG = om.global_med_7d, lam = 1.5, d = 4;
  const X = rawPeers.map((p) => [1, Math.log((p.age_days == null ? mA : p.age_days / 365) + 0.15), Math.log(p.tvl_usd / 5e7), Math.tanh(((p.change_7d == null ? mG : p.change_7d) - mG) / 35)]);
  const coef = [0, 0, 0, 0];
  for (let it = 0; it < 20; it++) {
    const H = Array.from({ length: d }, (_, i) => Array.from({ length: d }, (_, j) => (i === j && i > 0 ? lam : 0))), g = [0, 0, 0, 0];
    for (let i = 0; i < rawPeers.length; i++) {
      const xi = X[i]; let z = 0; for (let j = 0; j < d; j++) z += coef[j] * xi[j];
      const pr = sigmoid(z), wi = Math.max(1e-6, pr * (1 - pr)), diff = rawPeers[i].y - pr;
      for (let j = 0; j < d; j++) { g[j] += diff * xi[j]; for (let k = 0; k < d; k++) H[j][k] += wi * xi[j] * xi[k]; }
    }
    for (let j = 1; j < d; j++) g[j] -= lam * coef[j];
    const step = solveLinear(H, g);
    for (let j = 0; j < d; j++) coef[j] += step[j];
  }
  return { intercept: r4(coef[0]), beta_age: r4(coef[1]), beta_tvl: r4(coef[2]), beta_g7d: r4(coef[3]) };
}

function evaluateProtocol(row, pFit, oFit, cal) {
  const pm = cal.price_model, om = cal.odds_model, cat = row.category || 'Uncategorized';
  const catAdj = Object.prototype.hasOwnProperty.call(pFit.cat_adj, cat) ? pFit.cat_adj[cat] : 0;
  const baseMult = Math.exp(pFit.intercept), sizeMult = Math.exp(pFit.beta_tvl * Math.log(row.tvl_usd / pFit.ref_tvl_usd)), catMult = Math.exp(catAdj);
  const valIf = Math.max(1, Math.round(Math.exp(Math.log(pFit.ref_tvl_usd) + pFit.intercept + pFit.beta_tvl * Math.log(row.tvl_usd / pFit.ref_tvl_usd) + catAdj)));
  const ay = row.age_days == null ? om.median_age_years : row.age_days / 365, g7 = row.change_7d == null ? om.global_med_7d : row.change_7d;
  const st = oFit.intercept + oFit.beta_tvl * Math.log(row.tvl_usd / 5e7) + oFit.beta_g7d * Math.tanh((g7 - om.global_med_7d) / 35);
  const pMax = sigmoid(st + oFit.beta_age * Math.log(om.max_age_years + 0.15)), pNow = sigmoid(st + oFit.beta_age * Math.log(ay + 0.15));
  const cond = clamp(Math.max(0.05, pMax - pNow) / Math.max(0.05, 1 - pNow), 0.15, 0.92);
  const odds = r4(row.sibling_symbol != null ? Math.max(0.10, cond * 0.50) : cond);
  const imp = Math.max(1, Math.round(valIf * odds));
  return {
    valueIfLaunched: valIf, launchOdds: odds, implied: imp, baseMult, sizeMult, catMult, catAdj, pNow, pMax,
    low: Math.max(1, Math.round(imp * Math.exp(pm.q25_log))), high: Math.max(imp, Math.round(imp * Math.exp(pm.q75_log))),
    p10: Math.max(1, Math.round(imp * Math.exp(pm.q10_log))), p90: Math.max(imp, Math.round(imp * Math.exp(pm.q90_log))),
  };
}

function fnv1aHex(rows) {
  let h = 0x811c9dc5;
  for (let i = 0; i < rows.length; i++) {
    const line = `${rows[i].slug}:${rows[i].implied_value_usd}\n`;
    for (let j = 0; j < line.length; j++) { h ^= line.charCodeAt(j); h = Math.imul(h, 0x01000193); }
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const LOW_GAS='Base,Arbitrum,Optimism,Polygon,Binance,Avalanche,Monad,Ink,Sonic,Scroll,Linea,Flare,Plume Mainnet,Mantle,Berachain,Hyperliquid L1,Unichain,World Chain,Katana,Soneium,Blast,Mode,Zircuit,zkSync Era,Taiko,Celo,Fraxtal,Etherlink,xDai,Sei,Plasma,Stable,Corn,Hemi,Morph,Arc,Fluent,Pharos,Rayls,Robinhood Chain,TAC,Tempo,XRPL EVM,Bittensor EVM'.split(',');
const BTC_L2=new Set('BSquared,CORE,Babylon Genesis,Stacks,Mezo,Citrea,BOB,Merlin,Bitlayer,Botanix,RSK'.split(','));
const IBC=new Set('Noble,Nibiru,XION,Osmosis,Cosmos,Celestia,Injective,Kujira,Neutron,Stride,Secret,Akash,Dymension,Initia,Persistence,Stargaze,Archway,Saga,Terra,Terra2,dYdX,Thorchain,HydraDX'.split(','));
const ALT_VM=new Set('Sui,Aptos,Starknet,Tron,Cardano,Near,Provenance,Qubic,Canton,TON,Polkadot,Astar,Flow,Fuel,ICP,Hedera,Tezos,Radix,Waves,Aleo,Mina,Elrond,VeChain,Kaspa,Ergo,Filecoin,Eclipse'.split(','));
const mkP = (f, fl, co, w, ga, gt, sf, wf, ef, mf, bm, wm, cad, cln) => ({ family:f, familyLabel:fl, costOrder:co, wallet:w, gasAsset:ga, gasTier:gt, setupFee:sf, weeklyFee:wf, exitFee:ef, minFloor:mf, baseMins:bm, weeklyMins:wm, cadence:cad, cleanup:cln });

function classifySingleChain(ch) {
  if (ch==='Solana') return mkP('solana','Solana',1,'Phantom or Backpack wallet','SOL','<$0.05/tx (SOL)',0.55,0.02,0.05,1000,35,5,'bi-weekly organic rebalance','close empty SPL token accounts to reclaim SOL rent and revoke delegates');
  if (ch==='Bitcoin') return mkP('bitcoin','Bitcoin & Lightning',4,'non-custodial BTC / Lightning node wallet','BTC','$5.50 L1 open/close',5.50,0,5.50,2500,55,4,'open-and-hold channel liquidity','cooperatively close Lightning channels back to cold BTC storage');
  if (BTC_L2.has(ch)) return mkP('btc_l2','BTC L2 / Restaking',3,`${ch}-compatible BTC/EVM wallet`,ch==='Stacks'?'STX':ch==='CORE'?'CORE':'BTC','$0.35\u2013$3.50/tx',3.50,0.35,2.00,2000,45,5,'hold across unbonding epochs','check 7\u201321d unbonding cooldowns and revoke spend limits');
  if (ch==='Bittensor') return mkP('bittensor','Bittensor (Substrate)',2,'Bittensor Wallet or Polkadot.js signer','TAO','<$0.10/tx (TAO)',0.25,0.05,0.15,1500,45,4,'periodic subnet yield check','unstake subnet alpha back to root TAO watching slippage');
  if (ch==='Algorand') return mkP('algorand','Algorand (AVM)',1,'Pera or Defly Algorand wallet','ALGO','<$0.02/tx (ALGO)',0.25,0.01,0.05,1000,40,4,'bi-weekly organic check-in','opt out of unused ASAs to reclaim 0.1 ALGO min balance');
  if (IBC.has(ch)) return mkP('cosmos_ibc','Cosmos / IBC',1,'Keplr or Leap IBC wallet',ch==='Noble'?'IBC fee token':'native IBC gas','<$0.05/tx (IBC)',0.40,0.03,0.15,1000,40,4,'bi-weekly organic check-in','transfer balances back over canonical IBC channels');
  if (ch==='Ripple'||ch==='Stellar') { const xr=ch==='Ripple'; return mkP('xrpl_stellar',xr?'XRPL':'Stellar',2,xr?'Xaman (XRPL) wallet':'Freighter (Stellar) wallet',xr?'XRP':'XLM',`<$0.02/tx + ${xr?'XRP':'XLM'} reserve`,0.35,0.02,0.10,1500,40,4,'epoch hold','zero issued balances and remove unused trustlines'); }
  if (ALT_VM.has(ch)) return mkP('alt_vm',`${ch} (Alt-VM)`,2,`${ch}-native wallet`,`${ch} gas`,'$0.06\u2013$0.80/tx',0.80,0.06,0.25,1000,40,5,'bi-weekly organic check-in','clear session keys or contract permissions on exit');
  if (ch==='Ethereum') return mkP('eth_l1','Ethereum L1 Only',9,'EVM wallet (Rabby or hardware signer)','ETH','$12\u2013$18/tx (L1 gas)',18.00,0,12.00,5000,45,3,'deposit-and-hold (no weekly L1 churn)','withdraw exact balance and revoke ERC-20 allowances');
  return mkP('evm_l2','EVM L2 / Low-Gas Alt-L1',0,'EVM wallet (Rabby or MetaMask)',`${ch} gas`,'$0.08\u2013$0.30/tx',1.15,0.08,0.25,1000,40,5,'bi-weekly organic rebalance','repay any debt and revoke unlimited ERC-20 approvals');
}

function selectBestChain(chains) {
  if (!chains||!chains.length) return { chain:'Ethereum', profile:classifySingleChain('Ethereum') };
  const ranked=chains.map((c)=>({ chain:c, profile:classifySingleChain(c), p:LOW_GAS.indexOf(c)>=0?LOW_GAS.indexOf(c):1000 }));
  ranked.sort((a,b)=>a.profile.costOrder-b.profile.costOrder||a.p-b.p||byCode(a.chain,b.chain));
  return { chain:ranked[0].chain, profile:ranked[0].profile };
}

const planDepositUsd = (tvl, fl) => Math.min(25000, Math.max(fl, Math.round((tvl * 0.0002) / 500) * 500));
const fmtFee = (u) => (u === 0 ? 'free' : `$${u.toFixed(2)}`);

function coreTxt(p, ch, pr, cap) {
  const cat = (p.category || '').toLowerCase(), n = p.name, cs = cap.toLocaleString('en-US');
  if (pr.family === 'bitcoin') return `Open a balanced native BTC Lightning channel with ${n} ($${cs} in BTC) rather than wrapped bridges.`;
  if (pr.family === 'bittensor') return `Stake $${cs} of native TAO into ${n}'s dTAO subnet pool on Bittensor and track alpha ratio.`;
  if (pr.family === 'algorand') return cat.includes('rwa') ? `Complete KYC eligibility and acquire $${cs} of fractional RWA ASAs on ${n} (${ch}).` : `Opt into the ASA and supply $${cs} of native ALGO into ${n} on ${ch}.`;
  if (pr.family === 'cosmos_ibc') return `Transfer $${cs} via canonical IBC onto ${ch} and supply native Cosmos liquidity to ${n}.`;
  if (pr.family === 'xrpl_stellar') return `Set the ${ch} trustline and supply $${cs} of ${ch==='Ripple'?'XRP':'XLM'} liquidity into ${n}.`;
  if (cat.includes('insurance')) return `Supply $${cs} to ${n}'s underwriting / cover pool on ${ch} (do not buy cover unless hedging: premiums are sunk).`;
  if (/curator|allocator|aggregator|cdp manager|indexes/.test(cat)) return `Deposit $${cs} into a ${n} curated vault on ${ch} receiving liquid shares; verify curator fee % and liquidity.`;
  if (/lend|cdp|collateral/.test(cat)) return `Supply $${cs} of collateral to ${n} on ${ch}; optionally borrow <35% LTV only if carry is positive.`;
  if (/dex|liquidity manager/.test(cat)) return `Provide $${cs} of deep major-pair liquidity on ${n} (${ch}) avoiding tight-range IL.`;
  if (/derivative|prediction|option|otc|synthetic/.test(cat)) return `Post $${cs} margin on ${n} (${ch}) with small hedged limit orders (keep turnover low: fees are sunk).`;
  if (/basis|yield|farm|governance/.test(cat) || cat === 'dor') return `Mint or stake $${cs} of ${n}'s yield-bearing or delta-neutral receipt on ${ch} and hold across epochs.`;
  if (/rwa|cedefi|crypto card|payments/.test(cat)) return `Pass issuer KYC/accreditation first, then hold $${cs} in ${n}'s permitted rail on ${ch}.`;
  return `Deposit $${cs} of native ${ch} assets into ${n}'s core pool on ${ch}.`;
}

function riskTxt(p, flags, sib) {
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

const item=(ph,ac,cu,cl,mi,tl)=>({phase:ph,action:ac,cost_usd:cu,cost_label:cl,minutes:mi,time_label:tl});
function buildFarmTicket(p,cal,depOvr,dsOvr,wkOvr){
  const ds=dsOvr==null?cal.default_drop_share:dsOvr,wk=wkOvr==null?cal.default_horizon_weeks:wkOvr,p05=cal.snapshot_7d_p05;
  const{chain:ch,profile:pr}=selectBestChain(p.chains),dep=depOvr&&depOvr>0?depOvr:planDepositUsd(p.tvl_usd,pr.minFloor);
  const sF=r2(pr.setupFee),wF=r2(pr.weeklyFee*wk),eF=r2(pr.exitFee),tF=r2(sF+wF+eF),wM=pr.weeklyMins*wk,tM=pr.baseMins+wM,tH=r2(tM/60);
  const dil=dep/(p.tvl_usd+dep),mDrop=r2(p.implied_value_usd*ds*dil),net=r2(mDrop-tF),tbill=r2(dep*cal.tbill_apr*(wk/52)),netHr=r2(net/Math.max(0.25,tH));
  const verdict=net>tbill&&netHr>=cal.farm_hourly_hurdle?'FARM':net>0?'MARGINAL':'SKIP',den=p.implied_value_usd*dil;
  const beDrop=den>0?r2((tF/den)*10000)/10000:1,beOdds=p.implied_value_usd>0&&p.launch_odds>0?Math.round(Math.min(1,tF/((p.implied_value_usd/p.launch_odds)*ds*dil))*1000)/1000:1;
  const exitTvl=Math.round(p.tvl_usd*(1-clamp(Math.abs(p05)/100,0.12,0.25))),cM=Math.max(5,pr.baseMins-30),dS=dep.toLocaleString('en-US');
  const multi=p.chains.length>1&&p.chains.includes('Ethereum')&&pr.family!=='eth_l1'?` Auto-routed to ${ch} (lowest gas across ${p.chains.length} chains).`:'';
  const settle=pr.family==='bitcoin'?'allow 10\u201360m on-chain settlement':pr.family==='eth_l1'?'withdraw direct to skip bridge gas':'allow 2\u201315m finality';
  const secCh=p.chains.find((c)=>c!==ch&&classifySingleChain(c).costOrder<=2),secN=secCh?` Optional: mirror 1 light organic tx on ${secCh} if points weight multi-chain.`:'';
  const items=[
    item('SETUP',`Prepare a dedicated ${pr.wallet} on ${ch} with ${pr.gasAsset} fee buffer (~2 setup txs @ ${pr.gasTier}; no airdrop is confirmed).`,r2(sF*0.35),`${fmtFee(r2(sF*0.35))} gas`,8,'8m'),
    item('VERIFY',`Open ${p.name} via its DefiLlama entry or official docs, bookmark the URL, and check contracts (never sign approvals from third-party links).`,0,'free',5,'5m'),
    item('FUND',`Move $${dS} in native ${ch} assets onto ${ch} (${settle}).${multi}`,r2(sF*0.65),`${fmtFee(r2(sF*0.65))} transfer`,7,'7m'),
    item('CORE',`Start with a $100 test tx, confirm tracking, then scale to full $${dS}: ${coreTxt(p,ch,pr,dep)}`,0,`$${dS} at risk`,cM,`${cM}m`),
    item('CADENCE',`Hold ${wk} weeks using ${pr.cadence} (~${pr.weeklyMins}m/wk; avoid wasteful churn).${secN}`,wF,`${fmtFee(wF)} over ${wk}wk`,wM,`${pr.weeklyMins}m/wk (${wM}m)`),
    item('RISK',riskTxt(p,p.flags,p.sibling_symbol),0,'free check',2,'2m'),
    item('EXIT RULE',`Check TVL weekly and withdraw immediately if TVL breaks below $${(exitTvl/1e6).toFixed(1)}M (${p05.toFixed(1)}% P05 stress threshold) or withdrawals pause; ${pr.cleanup}.`,eF,`${fmtFee(eF)} unwind`,5,'5m'),
    item('BUDGET',`Log tx hashes; $${tF.toFixed(2)} fees + $${tbill.toFixed(2)} 4% capital charge vs $${mDrop.toFixed(2)} drop = net ${net>=0?'+':''}$${net.toFixed(2)} ($${netHr.toFixed(2)}/h -> ${verdict}).`,0,'free log',3,'3m'),
  ];
  return{best_chain:ch,chain_family:pr.family,family_label:pr.familyLabel,gas_tier:pr.gasTier,deposit_usd:dep,drop_share:ds,horizon_weeks:wk,setup_fee_usd:sF,weekly_fee_usd:wF,exit_fee_usd:eF,total_fees_usd:tF,total_minutes:tM,total_hours:tH,modelled_drop_usd:mDrop,net_of_fees_usd:net,tbill_hurdle_usd:tbill,net_per_hour:netHr,verdict,break_even_drop_share:beDrop,break_even_odds:beOdds,exit_tvl_usd:exitTvl,cadence:pr.cadence,steps:items.map((s)=>`${s.phase}: ${s.action} Cost: ${s.cost_label}. Time: ${s.time_label}.`.slice(0,600)),items};
}

function verifyBoardParity(radar) {
  const C = radar.calibration, pm = C.price_model, om = C.odds_model;
  const pFit = fitStage1Huber(radar.raw_comps, pm.ref_tvl_usd, pm.cat_ridge_k), oFit = fitStage2Logistic(radar.raw_peers, om);
  const refitPriceOk = Math.abs(pFit.intercept - pm.intercept) <= 1e-4 && Math.abs(pFit.beta_tvl - pm.beta_tvl) <= 1e-4;
  const refitOddsOk = Math.abs(oFit.intercept - om.intercept) <= 1e-4 && Math.abs(oFit.beta_age - om.beta_age) <= 1e-4 && Math.abs(oFit.beta_tvl - om.beta_tvl) <= 1e-4 && Math.abs(oFit.beta_g7d - om.beta_g7d) <= 1e-4;
  let recTot = 0, mis = 0, monoOk = true, wlN = 0; const chk = [];
  for (let i = 0; i < radar.rows.length; i++) {
    const r = radar.rows[i], v = evaluateProtocol(r, pFit, oFit, C); recTot += v.implied;
    if (v.implied !== r.implied_value_usd || v.launchOdds !== r.launch_odds || v.valueIfLaunched !== r.value_if_launched_usd) mis++;
    if (r.rank !== i + 1 || (i > 0 && radar.rows[i - 1].implied_value_usd < r.implied_value_usd)) monoOk = false;
    if (r.tier === 'watchlist') wlN++;
    chk.push({ slug: r.slug, implied_value_usd: v.implied });
  }
  const csum = fnv1aHex(chk), L = radar.ledger, lSum = L.watchlist + L.large_cap + L.early + L.priced_comps + L.other_tokenized + L.excl_bridges + L.excl_lst_btc + L.excl_cex_ver_sib;
  return { pFit, oFit, refitPriceOk, refitOddsOk, mismatches: mis, monoOk, totalExactOk: recTot === radar.summary.total_implied_usd && recTot === C.board_total_implied_usd, recomputedTotal: recTot, checksum: csum, checksumOk: csum === C.board_checksum, wlOk: wlN === 40 && L.watchlist === 40, ledgerSum: lSum, ledgerOk: lSum === L.total && L.total === 758 };
}

window.RADAR_MODEL = { median, fitStage1Huber, fitStage2Logistic, evaluateProtocol, fnv1aHex, classifySingleChain, selectBestChain, planDepositUsd, buildFarmTicket, verifyBoardParity };
window.__RADAR_PARITY = window.RADAR_MODEL;
})();
