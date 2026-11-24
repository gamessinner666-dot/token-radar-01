// Token Radar 01 (radar-2) — Browser Terminal, Live Parity Engine & Chain-Aware Farm Planner
(function () {
  'use strict';

  var R = window.RADAR, root = document.getElementById('app'), drawer = document.getElementById('detail-drawer');
  if (!R || !root) { if (root) root.innerHTML = '<div class="empty-state">Missing window.RADAR (data.js).</div>'; return; }

  var CAL = R.calibration;
  var SECTORS = [
    'Trading & Derivatives', 'Yield, Basis & Farming', 'RWA, Payments & Insurance',
    'Credit & Stablecoins', 'Staking, Restaking & Infra', 'Asset Mgmt & Curators',
  ];
  var state = {
    tab: 'radar', tier: 'all', cat: 'all', chain: 'all', conf: 'all', q: '',
    sortBy: 'rank', sortDir: 'asc', liveSector: 'all', liveCoreOnly: false,
    selectedSlug: null, beta: CAL.beta_huber, growthWeight: CAL.growth_weight, maturityRange: CAL.maturity_range,
  };

  var clamp = function (v, lo, hi) { return Math.min(hi, Math.max(lo, v)); };
  var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var dv = function (c, x) { return '<div class="' + c + '">' + x + '</div>'; };
  var bdg = function (c, t) { return '<span class="badge badge-' + c + '">' + esc(t) + '</span>'; };
  var fmtUsd = function (n) {
    if (!Number.isFinite(n)) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(n >= 100e6 ? 1 : 2) + 'M';
    return n >= 1e3 ? '$' + (n / 1e3).toFixed(0) + 'K' : '$' + Math.round(n);
  };
  var fmtPct = function (v) { return v === null || v === undefined || !Number.isFinite(v) ? '—' : (v >= 0 ? '+' : '') + v.toFixed(1) + '%'; };
  var fmtAge = function (d) { return d === null || d === undefined ? 'n/a' : d >= 365 ? (d / 365).toFixed(1) + 'y' : d + 'd'; };

  // 1. Live radar-2 Valuation Parity Engine (matches lib/model.ts 1:1)
  function computeImpliedValue(row, cal, ov) {
    ov = ov || {};
    var beta = Number.isFinite(ov.beta) ? ov.beta : cal.beta_huber;
    var gw = Number.isFinite(ov.growthWeight) ? ov.growthWeight : cal.growth_weight;
    var mr = Number.isFinite(ov.maturityRange) ? ov.maturityRange : cal.maturity_range;
    var secStat = cal.sector_stats[row.sector], catStat = cal.category_stats[row.category || 'Uncategorized'];
    var scaleTvl = cal.ref_tvl_usd * Math.pow(row.tvl_usd / cal.ref_tvl_usd, beta);
    var peerSource = catStat && catStat.n >= cal.min_cat_peers ? 'category' : 'sector';
    var peerMult = Math.exp(catStat ? catStat.log_k : secStat.log_k);
    var peerN = peerSource === 'category' ? catStat.n : secStat.n;
    var peerMed7d = catStat ? catStat.med_7d : secStat.med_7d;
    var excess7d = row.change_7d === null ? 0 : row.change_7d - peerMed7d;
    var growthMult = 1 + gw * Math.tanh(excess7d / cal.growth_scale);
    var maturityMult = row.age_days === null ? 1.0 : cal.maturity_floor + mr * Math.sqrt(Math.min(row.age_days, cal.maturity_days) / cal.maturity_days);
    var implied = Math.max(1, Math.round(scaleTvl * peerMult * growthMult * maturityMult));
    var poolIqr = catStat && catStat.n >= 5 ? catStat.iqr_log : secStat.n >= 5 ? secStat.iqr_log : cal.global_iqr_log;
    var halfIqr = clamp(poolIqr / 2, 0.35, 1.10);
    return {
      implied: implied, low: Math.max(1, Math.round(implied * Math.exp(-halfIqr))), high: Math.max(implied, Math.round(implied * Math.exp(halfIqr))),
      scaleTvl: Math.round(scaleTvl), peerMult: peerMult, peerSource: peerSource, peerN: peerN,
      peerMed7d: peerMed7d, excess7d: excess7d, growthMult: growthMult, maturityMult: maturityMult, halfIqr: halfIqr,
    };
  }

  // 2. Live 10-Family Chain-Aware Farm Planner (matches lib/farming.ts 1:1)
  var toSet = function (s) { var o = {}; s.split(',').forEach(function (k) { o[k] = 1; }); return o; };
  var L2_LIST = 'Base,Arbitrum,Optimism,Polygon,Binance,Avalanche,Monad,Ink,Sonic,Scroll,Linea,Flare,Plume Mainnet,Mantle,Berachain,Hyperliquid L1,Unichain,World Chain,Katana,Soneium,Blast,Mode,Zircuit,zkSync Era,Taiko,Celo,Fraxtal,Etherlink,xDai,Sei,Plasma,Stable,Corn,Hemi,Morph,Arc,Fluent,Pharos,Rayls,Robinhood Chain,TAC,Tempo,XRPL EVM,Bittensor EVM'.split(',');
  var BTC_L2 = toSet('BSquared,CORE,Babylon Genesis,Stacks,Mezo,Citrea,BOB,Merlin,Bitlayer,Botanix,RSK');
  var COSMOS = toSet('Noble,Nibiru,XION,Osmosis,Cosmos,Celestia,Injective,Kujira,Neutron,Stride,Secret,Akash,Dymension,Initia,Persistence,Stargaze,Archway,Saga,Terra,Terra2,dYdX,Thorchain,HydraDX');
  var ALT_VM = toSet('Sui,Aptos,Starknet,Tron,Cardano,Near,Provenance,Qubic,Canton,TON,Polkadot,Astar,Flow,Fuel,ICP,Hedera,Tezos,Radix,Waves,Aleo,Mina,Elrond,VeChain,Kaspa,Ergo,Filecoin,Eclipse');
  var mkPr = function (f, l, co, w, g, sg, ag, mc, cd, cl) { return { family: f, label: l, costOrder: co, wallet: w, gasAsset: g, setupGas: sg, actionGas: ag, minCap: mc, cadence: cd, cleanup: cl }; };
  var C_PROFILES = {
    Solana: ['solana', 'Solana', 1, 'Phantom or Backpack wallet', 'SOL', 'under $0.05 in SOL plus ~$0.30 refundable rent', 'under $0.02 per Solana tx', 150, 'bi-weekly organic rebalance', 'close empty SPL token accounts to reclaim SOL rent and revoke delegates'],
    Bitcoin: ['bitcoin', 'Bitcoin & Lightning', 4, 'non-custodial BTC / Lightning node wallet', 'BTC', '$1–$8 on-chain BTC fee (sats/vB)', 'routing sats only (zero EVM gas)', 250, 'open-and-hold channel liquidity', 'cooperatively close Lightning channels back to cold BTC storage'],
    Bittensor: ['bittensor', 'Bittensor (Substrate)', 2, 'Bittensor Wallet or Polkadot.js Substrate signer', 'TAO', 'under $0.10 in native TAO', 'under $0.05 in TAO per subnet stake', 150, 'periodic subnet yield check (no churn)', 'unstake subnet alpha back to root TAO watching pool slippage'],
    Algorand: ['algorand', 'Algorand (AVM)', 1, 'Pera or Defly Algorand wallet', 'ALGO', '0.001 ALGO/tx plus 0.1 ALGO ASA opt-in reserve', '0.001 ALGO per transaction', 100, 'bi-weekly organic check-in', 'opt out of unused ASAs to reclaim 0.1 ALGO minimum balance locks'],
    Ethereum: ['eth_l1', 'Ethereum L1 Only', 9, 'EVM wallet (Rabby or hardware signer)', 'ETH', '$8–$25 in ETH L1 gas (batch during <15 gwei)', 'no weekly churn; hold to keep gas < 2% of capital', 500, 'deposit-and-hold (no weekly L1 churn)', 'execute exact-amount withdrawals and revoke ERC-20 allowances on exit'],
  };

  function classifyChain(ch) {
    if (C_PROFILES[ch]) return mkPr.apply(null, C_PROFILES[ch]);
    if (BTC_L2[ch]) return mkPr('btc_l2', 'BTC L2 / Restaking', 3, ch + '-compatible BTC/EVM wallet', ch === 'Stacks' ? 'STX' : ch === 'CORE' ? 'CORE' : 'BTC', '$0.30–$3.00 in native chain gas', '$0.20–$1.50 per action', 200, 'deposit-and-hold across unbonding epochs', 'verify 7–21 day bridge/unbonding cooldowns and revoke spend limits');
    if (COSMOS[ch]) return mkPr('cosmos_ibc', 'Cosmos / IBC', 1, 'Keplr or Leap IBC wallet', ch === 'Noble' ? 'native IBC fee token' : 'native chain gas token', 'under $0.05 in native IBC gas', 'under $0.03 per IBC tx', 150, 'bi-weekly organic position review', 'send assets back over canonical IBC channels (no token approvals to revoke)');
    if (ch === 'Ripple' || ch === 'Stellar') { var x = ch === 'Ripple'; return mkPr('xrpl_stellar', x ? 'XRPL' : 'Stellar', 2, x ? 'Xaman (XRPL) wallet' : 'Freighter (Stellar) wallet', x ? 'XRP' : 'XLM', 'fractions of 1 ' + (x ? 'XRP' : 'XLM') + ' plus trustline reserve', 'under $0.02 per ledger operation', 150, 'deposit-and-hold across epochs', 'zero out issued balances and remove unused trustlines to free base reserve'); }
    if (ALT_VM[ch]) return mkPr('alt_vm', ch + ' (Alt-VM)', 2, ch + '-native wallet', ch + ' native gas', '$0.05–$1.00 in native chain gas/energy', '$0.02–$0.50 per native call', 150, 'bi-weekly organic check-in', 'clear active session keys or contract permissions after unwinding');
    return mkPr('evm_l2', 'EVM L2 / Low-Gas Alt-L1', 0, 'EVM wallet (Rabby or MetaMask)', ch + ' native gas', '$0.05–$0.50 in native L2/alt-L1 gas', 'under $0.25 per organic action', 150, 'bi-weekly organic rebalance', 'verify zero open debt and revoke unlimited ERC-20 token approvals on exit');
  }

  function pickBestChain(chains) {
    if (!chains || !chains.length) return { chain: 'Ethereum', profile: classifyChain('Ethereum') };
    var rk = chains.map(function (c) { var i = L2_LIST.indexOf(c); return { chain: c, profile: classifyChain(c), p: i >= 0 ? i : 1000 }; });
    rk.sort(function (a, b) { return a.profile.costOrder - b.profile.costOrder || a.p - b.p || (a.chain < b.chain ? -1 : a.chain > b.chain ? 1 : 0); });
    return rk[0];
  }

  function buildFarmPlan(row) {
    var best = pickBestChain(row.chains), ch = best.chain, pr = best.profile, nm = row.name;
    var cap = Math.max(pr.minCap, row.tvl_usd >= 1e9 ? 250 : row.tvl_usd >= 200e6 ? 200 : row.tvl_usd >= 50e6 ? 150 : 100);
    var hold = pr.family === 'eth_l1' ? 60 : row.age_days === null ? 45 : row.age_days < 180 ? 60 : row.age_days < 365 ? 45 : 30;
    var cat = (row.category || '').toLowerCase(), fl = row.flags || [], has = function (ks) { return ks.split(',').some(function (k) { return cat.indexOf(k) >= 0; }); };
    var multi = row.chains.length > 1 && row.chains.indexOf('Ethereum') >= 0 && pr.family !== 'eth_l1'
      ? ' Auto-routed to ' + ch + ' (lowest-gas among ' + row.chains.length + ' chains); watch bridge risk if transferring from Ethereum.' : '';

    var core = pr.family === 'bitcoin' ? 'Open a balanced native BTC Lightning channel or liquidity node peer with ' + nm + ' ($' + cap + '+ in BTC) instead of bridged wrappers.'
      : pr.family === 'bittensor' ? 'Stake $' + cap + '+ of native TAO into ' + nm + "'s dTAO subnet liquidity pool on Bittensor and monitor alpha exchange ratio."
      : pr.family === 'algorand' ? (has('rwa') ? 'Complete issuer KYC/eligibility verification and acquire $' + cap + '+ of fractional RWA tokens on ' + nm + ' (' + ch + ') using ALGO/native ASA rails.' : 'Opt into the protocol ASA and delegate or deposit $' + cap + '+ in native ALGO through ' + nm + ' on ' + ch + '.')
      : pr.family === 'cosmos_ibc' ? 'Transfer $' + cap + '+ via canonical IBC onto ' + ch + " and supply native Cosmos liquidity into " + nm + "'s core pool."
      : pr.family === 'xrpl_stellar' ? 'Set the required trustline on ' + ch + ' and supply $' + cap + '+ of ' + (ch === 'Ripple' ? 'XRP' : 'XLM') + ' or native ledger liquidity into ' + nm + '.'
      : has('insurance') ? 'Supply $' + cap + '+ of capital to ' + nm + "'s underwriting / cover pool on " + ch + ' (avoid buying cover unless hedging, as premiums are sunk costs).'
      : has('curator,allocator,aggregator,cdp manager,indexes') ? 'Deposit $' + cap + '+ into a ' + nm + ' curated vault on ' + ch + ' receiving liquid vault shares; compare curator fee % and utilization.'
      : has('lend,cdp,collateral') ? 'Supply $' + cap + '+ of collateral to ' + nm + ' on ' + ch + '; optionally borrow conservatively (<40% LTV) only if positive net carry justifies risk.'
      : has('dex,liquidity manager') ? 'Provide $' + cap + '+ of balanced liquidity in a deep major pair on ' + nm + ' (' + ch + ') to earn organic swap fees without excessive narrow-range IL.'
      : has('derivative,prediction,option,otc,synthetic') ? 'Deposit $' + cap + '+ of margin on ' + nm + ' (' + ch + ') and place small hedged limit orders; keep turnover modest because fees/funding are sunk costs.'
      : has('basis,yield,farm,governance') || cat === 'dor' ? 'Mint or stake $' + cap + '+ of ' + nm + "'s yield-bearing or delta-neutral receipt position on " + ch + ' and track epoch accrual.'
      : has('rwa,cedefi,crypto card,payments') ? 'Verify KYC/accreditation eligibility first, then hold $' + cap + '+ in ' + nm + "'s permitted yield or payment rail on " + ch + '.'
      : has('restak,staking,chain,privacy') ? 'Delegate or stake $' + cap + '+ of native ' + ch + ' assets through ' + nm + ' and track validator commission and unbonding terms.'
      : 'Deploy $' + cap + '+ of native ' + ch + " assets into " + nm + "'s primary liquidity module on " + ch + '.';

    var rp = [
      has('insurance') ? 'Underwriting capital faces claim-payout slashing and lockup queues.'
      : has('rwa,cedefi,crypto card') ? 'Assess off-chain issuer custody, legal/KYC gating, and counterparty solvency.'
      : has('derivative,prediction,option') ? 'Monitor funding rates, spread slippage, and liquidation buffers (fees are non-recoverable).'
      : has('basis,yield,curator,allocator') ? 'Check curator strategy exposure, basis-hedge inversion, and withdrawal queue cooldowns.'
      : has('restak,staking') ? 'Verify validator slashing conditions and 7–21 day unbonding periods.'
      : 'Monitor smart-contract audit status, oracle dependencies, and pool utilization.',
    ];
    if (row.sibling_symbol) rp.push('Note tokenized sibling ' + row.sibling_symbol + ' already trades.');
    if (fl.some(function (f) { return f.indexOf('Bitcoin P2P') >= 0; })) rp.push('Bitcoin base P2P routing is utility infra unlikely to issue a token.');
    if (fl.some(function (f) { return f.indexOf('Missing listed_at') >= 0; })) rp.push('DefiLlama lacks listed_at; verify domain history independently.');

    return [
      { action: 'Prepare a dedicated ' + pr.wallet + ' on ' + ch + ' and verify ' + nm + "'s official domain and docs (no airdrop is confirmed).", cost: pr.setupGas, time: '10 minutes' },
      { action: 'Fund at least $' + cap + ' in native ' + ch + ' assets with a small ' + pr.gasAsset + ' fee buffer.' + multi, cost: '$' + cap + '+ principal + ' + pr.setupGas, time: '10 minutes' },
      { action: core, cost: '$' + cap + ' deployed + ' + pr.setupGas, time: '15 minutes' },
      { action: 'Hold across ' + hold + ' days with ' + pr.cadence + '; avoid pointless micro-churn that destroys net yield.', cost: pr.actionGas, time: hold + ' days' },
      { action: rp.join(' '), cost: 'zero extra fee for monitoring', time: '5 minutes weekly' },
      { action: 'Before exiting, check withdrawal queues, ' + pr.cleanup + ', and log tx hashes (verify any points page only via official channels).', cost: pr.family === 'eth_l1' ? '$4–$12 L1 exit gas' : pr.actionGas, time: '10 minutes' },
    ];
  }

  // 3. URL Hash Sync & Scoring
  function readHash() {
    var raw = (window.location.hash || '').replace(/^#/, '');
    if (!raw) return;
    raw.split('&').forEach(function (kv) {
      var eq = kv.indexOf('='); if (eq <= 0) return;
      var k = decodeURIComponent(kv.slice(0, eq)), v = decodeURIComponent(kv.slice(eq + 1));
      if (k === 'tab' && /^(radar|live|method)$/.test(v)) state.tab = v;
      else if (k === 'tier' && /^(all|watchlist|large-cap|early)$/.test(v)) state.tier = v;
      else if (k === 'cat' || k === 'chain' || k === 'conf' || k === 'q') state[k] = v;
      else if (k === 'p') state.selectedSlug = v || null;
    });
  }

  function writeHash() {
    var kv = [];
    [['tab','radar'],['tier','all'],['cat','all'],['chain','all'],['conf','all']].forEach(function (p) { if (state[p[0]] !== p[1]) kv.push(p[0] + '=' + encodeURIComponent(state[p[0]])); });
    if (state.q) kv.push('q=' + encodeURIComponent(state.q));
    if (state.selectedSlug) kv.push('p=' + encodeURIComponent(state.selectedSlug));
    var next = kv.length ? '#' + kv.join('&') : '';
    if (window.location.hash !== next) history.replaceState(null, '', next || window.location.pathname + window.location.search);
  }

  var isDefaultCal = function () {
    return Math.abs(state.beta - CAL.beta_huber) < 1e-4 && Math.abs(state.growthWeight - CAL.growth_weight) < 1e-4 && Math.abs(state.maturityRange - CAL.maturity_range) < 1e-4;
  };

  function scoredBoard() {
    var def = isDefaultCal(), ov = { beta: state.beta, growthWeight: state.growthWeight, maturityRange: state.maturityRange };
    var arr = R.rows.map(function (row) {
      var d = def ? { implied: row.implied_value_usd, low: row.implied_low_usd, high: row.implied_high_usd } : computeImpliedValue(row, CAL, ov);
      return { row: row, implied: d.implied, low: d.low, high: d.high, rank: row.rank };
    });
    if (!def) { arr.sort(function (a, b) { return b.implied - a.implied || b.row.tvl_usd - a.row.tvl_usd; }); arr.forEach(function (x, i) { x.rank = i + 1; }); }
    return arr;
  }

  function filterRows(all) {
    var q = state.q.trim().toLowerCase(), dir = state.sortDir === 'asc' ? 1 : -1;
    var out = all.filter(function (it) {
      var r = it.row;
      if (state.tier !== 'all' && r.tier !== state.tier) return false;
      if (state.cat !== 'all' && (r.category || 'Uncategorized') !== state.cat) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) < 0) return false;
      if (state.conf === 'hi' && r.confidence_score < 75) return false;
      if (state.conf === 'flagged' && !r.flags.length) return false;
      if (state.conf === 'l2' && !(r.chains.length > 1 && r.chains.indexOf('Ethereum') >= 0 && r.farm_meta.chain_family !== 'eth_l1')) return false;
      return !q || (r.name + ' ' + r.slug + ' ' + (r.category || '') + ' ' + r.sector + ' ' + r.chains.join(' ')).toLowerCase().indexOf(q) >= 0;
    });
    out.sort(function (a, b) {
      var ra = a.row, rb = b.row;
      if (state.sortBy === 'tvl') return (ra.tvl_usd - rb.tvl_usd) * dir;
      if (state.sortBy === 'g7d') return ((ra.change_7d === null ? -9999 : ra.change_7d) - (rb.change_7d === null ? -9999 : rb.change_7d)) * dir;
      if (state.sortBy === 'age') return ((ra.age_days === null ? -1 : ra.age_days) - (rb.age_days === null ? -1 : rb.age_days)) * dir;
      if (state.sortBy === 'implied') return (a.implied - b.implied) * dir;
      if (state.sortBy === 'conf') return (ra.confidence_score - rb.confidence_score) * dir;
      if (state.sortBy === 'name') return ra.name.localeCompare(rb.name) * dir;
      return (a.rank - b.rank) * dir;
    });
    return out;
  }

  // 4. Inline HTML5 SVG Visuals (no xmlns)
  function funnelSvg() {
    var s = R.summary, tot = s.total_protocols, w = 360, x = 0;
    var segs = [['Watchlist', s.watchlist_size, '#1d4ed8'], ['Large-Cap >=$50M', s.large_cap_size, '#0a6c50'], ['Early <$50M', s.early_size, '#475569'], ['Live Comps', s.comparables_total, '#0ea5e9'], ['Excluded/Other', tot - s.board_size - s.comparables_total, '#cbd5e1']];
    var rects = segs.map(function (g) { var sw = Math.max(2, (g[1] / tot) * w), r = '<rect x="' + x.toFixed(1) + '" y="4" width="' + sw.toFixed(1) + '" height="18" fill="' + g[2] + '"></rect>'; x += sw; return r; }).join('');
    return '<svg class="svg-wrap" viewBox="0 0 ' + w + ' 26" height="26" role="img" aria-label="Protocol funnel">' + rects + '</svg>' +
      dv('funnel-legend', segs.map(function (g) { return '<span><i class="dot" style="background:' + g[2] + '"></i>' + esc(g[0]) + ' <strong>' + g[1] + '</strong></span>'; }).join(''));
  }

  function sectorBarsSvg() {
    var h = SECTORS.length * 18 + 4;
    var bars = SECTORS.map(function (sec, idx) {
      var st = CAL.sector_stats[sec], m = Math.exp(st.log_k), y = idx * 18 + 2, bw = Math.min(180, (m / 0.65) * 175), col = m >= 0.4 ? '#1d4ed8' : m >= 0.18 ? '#0a6c50' : '#64748b';
      return '<text x="0" y="' + (y + 11) + '" font-size="10.5" fill="#334155">' + esc(sec.split('&')[0].trim()) + '</text><rect x="132" y="' + (y + 2) + '" width="' + bw.toFixed(1) + '" height="11" rx="2" fill="' + col + '"></rect><text x="' + (137 + bw).toFixed(1) + '" y="' + (y + 11) + '" font-size="10.5" font-family="monospace" fill="#0f1923">' + m.toFixed(2) + 'x (n=' + st.n + ')</text>';
    }).join('');
    return '<svg class="svg-wrap" viewBox="0 0 410 ' + h + '" height="' + h + '" role="img" aria-label="6-sector multiples">' + bars + '</svg>';
  }

  // 5. Render Workspace & Drawer
  function render() {
    var filtered = filterRows(scoredBoard()), sliceTvl = 0, sliceImp = 0, maxHigh = 1;
    filtered.forEach(function (x) { sliceTvl += x.row.tvl_usd; sliceImp += x.implied; if (x.high > maxHigh) maxHigh = x.high; });
    var sImp = filtered.map(function (x) { return x.implied; }).sort(function (a, b) { return a - b; });
    var sliceMed = sImp.length ? sImp[Math.floor(sImp.length / 2)] : 0;
    var cats = {}, chs = {};
    R.rows.forEach(function (r) { cats[r.category || 'Uncategorized'] = 1; r.chains.forEach(function (c) { chs[c] = 1; }); });
    var allCats = Object.keys(cats).sort(), allChains = Object.keys(chs).sort(), L = CAL.loocv, S = R.summary;
    var opts = function (arr, cur) { return arr.map(function (v) { return '<option value="' + esc(v) + '"' + (cur === v ? ' selected' : '') + '>' + esc(v) + '</option>'; }).join(''); };

    var html = '<header class="masthead">' + dv('brand-block', dv('brand-mark', 'TR1') + '<div><h1 class="brand-title">TOKEN RADAR // 01 ' + bdg('lc', R.model_version) + '</h1>' +
      dv('brand-sub', 'Institutional Pre-Token Valuation &amp; Chain-Aware Farming Terminal &middot; DefiLlama Snapshot ' + esc(R.as_of)) + '</div>') +
      dv('telemetry-strip', '<span class="tele-pill"><strong>' + S.total_protocols + '</strong> Scanned</span><span class="tele-pill accent"><strong>' + S.watchlist_size + '/' + S.watchlist_size + '</strong> Watchlist</span><span class="tele-pill"><strong>' + S.board_size + '</strong> Pre-Token Ranked</span><span class="tele-pill"><strong>' + S.comparables_total + '</strong> Live Comps</span><span class="tele-pill"><strong>&beta;=' + state.beta.toFixed(3) + '</strong> &middot; ' + S.distinct_chains + ' Chains</span>') + '</header>';

    html += '<section class="intel-grid" aria-label="Snapshot Intelligence">' +
      dv('intel-card', dv('card-head', '<span class="card-title">758-Protocol Eligibility Funnel</span><span class="card-meta">' + S.raw_pre_token + ' no token &middot; ' + S.board_size + ' clean</span>') + funnelSvg()) +
      dv('intel-card', dv('card-head', '<span class="card-title">6-Sector Empirical-Bayes Multiples</span><span class="card-meta">At $50M ScaleTVL &middot; k=5,5</span>') + sectorBarsSvg()) +
      dv('intel-card', dv('card-head', '<span class="card-title">Active Slice &amp; LOOCV Edge</span><span class="card-meta">' + filtered.length + ' of ' + R.rows.length + ' shown</span>') +
      dv('kpi-row', dv('kpi-box', dv('kpi-label', 'Slice TVL') + dv('kpi-val', fmtUsd(sliceTvl)) + dv('kpi-sub', 'Total implied ' + fmtUsd(sliceImp))) + dv('kpi-box', dv('kpi-label', 'Median Implied') + dv('kpi-val', fmtUsd(sliceMed)) + dv('kpi-sub', 'Min ' + (filtered.length ? fmtUsd(sImp[0]) : '—')))) +
      dv('loocv-bar', '<span>LOOCV (n=' + L.n + '): <strong>' + L.med_mult_err.toFixed(2) + 'x</strong> med err (vs ' + L.starter_med_mult_err.toFixed(2) + 'x)</span><span><strong>' + Math.round(L.within_3x * 100) + '%</strong> &le;3x</span>')) + '</section>';

    html += '<section class="toolbar" aria-label="Tabs and Filters">' + dv('toolbar-top', '<div class="tabs" role="tablist">' +
      [['radar','Pre-Token Radar (' + S.board_size + ')'], ['live','Live Comparables (' + S.comparables_total + ')'], ['method','Risk &amp; Methodology']].map(function (t) {
        return '<button type="button" class="tab-btn' + (state.tab === t[0] ? ' active' : '') + '" data-tab="' + t[0] + '">' + t[1] + '</button>';
      }).join('') + '</div>' +
      (state.tab === 'radar' ? dv('tier-pills', [['all','All ' + S.board_size], ['watchlist','Watchlist ' + S.watchlist_size], ['large-cap','Large-Cap &ge;$50M (' + S.large_cap_size + ')'], ['early','Early &lt;$50M (' + S.early_size + ')']].map(function (p) {
        return '<button type="button" class="tier-pill' + (state.tier === p[0] ? ' active' : '') + '" data-tier="' + p[0] + '">' + p[1] + '</button>';
      }).join('')) : ''));

    if (state.tab === 'radar') {
      html += dv('filter-row', '<input id="q-input" class="input" type="search" placeholder="Search protocol, slug, category, or chain..." value="' + esc(state.q) + '">' +
        '<select id="cat-sel" class="select"><option value="all">All Categories (' + allCats.length + ')</option>' + opts(allCats, state.cat) + '</select>' +
        '<select id="chain-sel" class="select"><option value="all">All Chains (' + allChains.length + ')</option>' + opts(allChains, state.chain) + '</select>' +
        '<select id="conf-sel" class="select">' + [['all','All Confidence &amp; Flags'],['hi','High Confidence (&ge;75)'],['flagged','Flagged / Caveats Only'],['l2','Multi-Chain L2 Routed']].map(function (o) { return '<option value="' + o[0] + '"' + (state.conf === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
        '<button type="button" id="reset-filters" class="btn-reset">Reset Filters</button>');
    }
    html += '</section><main id="main-content">' + (state.tab === 'radar' ? renderRadarTable(filtered, maxHigh) + renderLab() : state.tab === 'live' ? renderLive() : renderMethod()) +
      '</main><footer class="foot-note"><span>Records no token in DefiLlama snapshot (' + esc(R.as_of) + ') &ne; proof no token exists. Research only — no airdrop is promised.</span><span class="mono">' + esc(R.source) + '</span></footer>';

    root.innerHTML = html;
    bindEvents();
    if (state.selectedSlug) openDrawer(state.selectedSlug);
  }

  function sortIcon(c) { return state.sortBy !== c ? '' : state.sortDir === 'asc' ? ' &#9650;' : ' &#9660;'; }

  function renderRadarTable(filtered, maxHigh) {
    if (!filtered.length) return dv('table-card', dv('empty-state', 'No protocols match the active filter combination.'));
    var logMax = Math.log10(Math.max(10, maxHigh)), logMin = Math.log10(500000), span = Math.max(1, logMax - logMin);
    var rows = filtered.map(function (it) {
      var r = it.row, ch = r.chains.slice(0, 3).join(', ') + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '');
      var tb = r.tier === 'watchlist' ? bdg('wl', 'WL') : r.tier === 'large-cap' ? '<span class="badge badge-lc">&ge;$50M</span>' : bdg('early', 'EARLY');
      var sb = r.sibling_symbol ? ' ' + bdg('sib', 'SIB:' + r.sibling_symbol) : '', ab = r.age_days === null ? ' ' + bdg('warn', 'NO AGE') : '';
      var gc = r.change_7d === null ? 'delta-flat' : r.change_7d >= 0 ? 'delta-pos' : 'delta-neg';
      var pL = clamp(((Math.log10(Math.max(500000, it.low)) - logMin) / span) * 100, 0, 96);
      var pH = clamp(((Math.log10(Math.max(500000, it.high)) - logMin) / span) * 100, pL + 4, 100);
      var pB = clamp(((Math.log10(Math.max(500000, it.implied)) - logMin) / span) * 100, pL, pH);
      var cc = r.confidence_score >= 75 ? 'conf-hi' : r.confidence_score >= 60 ? 'conf-mid' : 'conf-lo';
      return '<tr tabindex="0" data-slug="' + esc(r.slug) + '"' + (state.selectedSlug === r.slug ? ' class="selected"' : '') + '>' +
        '<td class="rank-cell">' + it.rank + '</td><td>' + dv('proto-main', '<span class="proto-name">' + esc(r.name) + '</span>' + tb + sb + ab) + dv('proto-sub', esc(r.category || 'Uncategorized') + ' &middot; ' + esc(ch)) + '</td>' +
        '<td class="num mono">' + fmtUsd(r.tvl_usd) + '</td><td class="num">' + dv('mono ' + gc, fmtPct(r.change_7d)) + dv('proto-sub mono', r.change_7d === null ? 'peer n/a' : 'vs ' + fmtPct(r.model.peer_med_7d)) + '</td>' +
        '<td class="num mono">' + fmtAge(r.age_days) + '</td><td class="num">' + dv('implied-wrap', '<span class="implied-main">' + fmtUsd(it.implied) + '</span><div class="band-track" aria-hidden="true"><div class="band-fill" style="left:' + pL.toFixed(1) + '%;width:' + (pH - pL).toFixed(1) + '%"></div><div class="band-dot" style="left:' + pB.toFixed(1) + '%"></div></div><span class="implied-band">' + fmtUsd(it.low) + '–' + fmtUsd(it.high) + '</span>') + '</td>' +
        '<td class="num"><span class="conf-pill ' + cc + '">' + r.confidence_score + '</span></td><td>' + dv('farm-pill', '<strong>' + esc(r.farm_meta.best_chain) + '</strong> &middot; $' + r.farm_meta.min_capital_usd + '+') + dv('proto-sub', esc(r.farm_meta.cadence.split('(')[0].trim())) + '</td></tr>';
    }).join('');
    var th = function (k, l, num) { return '<th class="' + (num ? 'num ' : '') + 'sortable" data-sort="' + k + '">' + l + sortIcon(k) + '</th>'; };
    return dv('table-card', dv('table-scroll', '<table class="board"><thead><tr>' +
      th('rank', '# ') + th('name', 'Protocol &amp; Discovery Tier') + th('tvl', 'TVL', 1) + th('g7d', '7d (vs Peer)', 1) + th('age', 'Age', 1) + th('implied', 'Implied Value &amp; IQR Band', 1) + th('conf', 'Conf', 1) + '<th>Optimal Farm Route</th></tr></thead><tbody>' + rows + '</tbody></table>'));
  }

  function renderLab() {
    var secRows = SECTORS.map(function (sec) { var st = CAL.sector_stats[sec]; return '<tr><td>' + esc(sec) + '</td><td class="num">' + st.n + '</td><td class="num">' + Math.exp(st.log_k).toFixed(3) + 'x</td><td class="num">' + st.med_ratio.toFixed(3) + 'x</td><td class="num">' + fmtPct(st.med_7d) + '</td></tr>'; }).join('');
    var sl = function (id, lbl, v, max, stp, val) { return dv('slider-item', '<label for="' + id + '"><span>' + lbl + '</span><span class="mono">' + v + '</span></label><input id="' + id + '" type="range" min="' + (id === 'sl-beta' ? '0.65' : '0.00') + '" max="' + max + '" step="' + stp + '" value="' + val + '">'); };
    return '<section class="lab-card" aria-label="Calibration Lab">' + dv('card-head', '<span class="card-title">Interactive Valuation Calibration Lab (radar-2 Live Sensitivity)</span><button type="button" id="reset-cal" class="btn-reset">Reset to Calibrated (radar-2)</button>') +
      dv('lab-grid', '<div>' + dv('slider-list', sl('sl-beta', 'TVL Scale Elasticity (&beta; Huber-FE)', state.beta.toFixed(4), '1.00', '0.005', state.beta) + sl('sl-gw', 'Category-Relative 7d Growth Weight', state.growthWeight.toFixed(2), '0.40', '0.02', state.growthWeight) + sl('sl-mr', 'Concave Lindy Maturity Range', state.maturityRange.toFixed(2), '0.40', '0.02', state.maturityRange)) + dv('formula-box', 'Implied = $50M &times; (TVL/$50M)<sup>&beta;</sup> &times; PeerMult<sub>EB(k=5,5)</sub> &times; (1 + w<sub>g</sub>&middot;tanh(&Delta;7d<sub>peer</sub>/35)) &times; (0.85 + r<sub>m</sub>&middot;&radic;(min(age,1095)/1095))') + '</div><div><table class="sector-mini"><thead><tr><th>Economic Sector</th><th class="num">Core n</th><th class="num">EB Mult</th><th class="num">Med mcap/TVL</th><th class="num">Peer 7d</th></tr></thead><tbody>' + secRows + '</tbody></table></div>') + '</section>';
  }

  function renderLive() {
    var comps = R.live_comparables.filter(function (c) { return (state.liveSector === 'all' || c.sector === state.liveSector) && (!state.liveCoreOnly || c.is_core); });
    var rows = comps.map(function (c, i) {
      return '<tr><td class="rank-cell">' + (i + 1) + '</td><td>' + dv('proto-main', '<span class="proto-name">' + esc(c.name) + '</span>' + bdg('early', c.symbol) + (c.n_siblings > 1 ? bdg('lc', c.n_siblings + ' siblings agg') : '') + (!c.is_core ? bdg('warn', 'Outlier trimmed') : '')) + dv('proto-sub', esc(c.category) + ' &middot; ' + esc(c.sector)) + '</td>' +
        '<td class="num mono">' + fmtUsd(c.mcap_usd) + '</td><td class="num mono">' + fmtUsd(c.tvl_usd) + (c.n_siblings > 1 ? dv('proto-sub', 'raw ' + fmtUsd(c.raw_tvl_usd)) : '') + '</td>' +
        '<td class="num mono"><strong>' + c.ratio.toFixed(3) + 'x</strong></td><td class="num mono ' + (c.change_7d !== null && c.change_7d >= 0 ? 'delta-pos' : 'delta-neg') + '">' + fmtPct(c.change_7d) + '</td></tr>';
    }).join('');
    return dv('table-card', '<div class="toolbar-top" style="padding:8px 12px;border-bottom:1px solid var(--border)"><strong>Separated Live-Token Comparables (' + comps.length + ' of ' + R.live_comparables.length + ' clean peers, mcap &gt; 0)</strong><div style="display:flex;gap:8px;align-items:center"><select id="live-sec-sel" class="select" style="width:220px"><option value="all">All 6 Sectors</option>' +
      SECTORS.map(function (s) { return '<option value="' + esc(s) + '"' + (state.liveSector === s ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('') +
      '</select><label style="font-size:12px;display:flex;gap:4px;align-items:center"><input type="checkbox" id="live-core-chk"' + (state.liveCoreOnly ? ' checked' : '') + '> Core [0.005x–10x] only</label></div></div>' +
      dv('table-scroll', '<table class="board"><thead><tr><th>#</th><th>Live Token Entity</th><th class="num">Market Cap</th><th class="num">Brand-Aggregated TVL</th><th class="num">Observed mcap/TVL</th><th class="num">7d TVL</th></tr></thead><tbody>' + rows + '</tbody></table>'));
  }

  function renderMethod() {
    var L = CAL.loocv;
    return dv('meth-grid',
      dv('meth-card', '<h3>radar-2 Econometric Model &amp; LOOCV</h3><p>Snapshot-calibrated valuation at $50M TVL:</p><ul>' +
        '<li><strong>Huber FE (&beta;=' + CAL.beta_huber.toFixed(4) + '):</strong> Within-category log-log elasticity (25 steps, &delta;=1.0).</li>' +
        '<li><strong>6-Sector EB (k=5,5):</strong> Sectors hold n &ge; 11 core peers; sparse categories (n &lt; 3) inherit sector priors.</li>' +
        '<li><strong>Growth &amp; Lindy:</strong> Cat-rel 7d excess + tanh; null listed_at gets neutral 1.00 (-10 conf).</li>' +
        '<li><strong>LOOCV (n=' + L.n + '):</strong> RMSLE <strong>' + L.rmsle + '</strong> (vs ' + L.starter_rmsle + '), med err <strong>' + L.med_mult_err + 'x</strong> (vs ' + L.starter_med_mult_err + 'x), &le;3x <strong>' + Math.round(L.within_3x * 100) + '%</strong>.</li></ul>') +
      dv('meth-card', '<h3>Discovery Hygiene, Farming &amp; Disclosures</h3><ul>' +
        '<li><strong>Clean Funnel (' + R.summary.board_size + '):</strong> 40 WL + 17 Large-Cap (&ge;$50M) + 128 Early (&lt;$50M); drops Bridges, LSTs, CEX, Wrapped, CommunityV3, 6 sibling stems.</li>' +
        '<li><strong>Clean Peers (' + R.summary.comparables_total + '):</strong> Drops mcap &le; 0 (autofinance -1); aggregates brand+sector siblings while isolating PUMP/SWAP/MET/UP.</li>' +
        '<li><strong>10-Family Farming:</strong> Routes to lowest-gas chain, $500+ ETH L1 hold, native BTC/TAO/ALGO/IBC/XRPL, flags Insurance underwriting.</li>' +
        '<li><strong>Disclosures:</strong> Records no token &ne; proof no token exists; mcap_usd &ne; FDV; no airdrop is guaranteed.</li></ul>'));
  }

  function openDrawer(slug) {
    var row = R.rows.find(function (x) { return x.slug === slug; });
    if (!row) return;
    var calVal = computeImpliedValue(row, CAL, null);
    var actVal = isDefaultCal() ? calVal : computeImpliedValue(row, CAL, { beta: state.beta, growthWeight: state.growthWeight, maturityRange: state.maturityRange });
    var catStat = CAL.category_stats[row.category || 'Uncategorized'];
    var peers = (catStat ? catStat.top_peers : CAL.sector_stats[row.sector].top_peers).slice(0, 4);
    var steps = buildFarmPlan(row), best = pickBestChain(row.chains);
    var tierLbl = row.tier === 'watchlist' ? 'Watchlist' : row.tier === 'large-cap' ? 'Large-Cap Expansion' : 'Early Discovery';
    var flagHtml = (row.flags || []).map(function (f) { return bdg(f.indexOf('Sibling') >= 0 ? 'sib' : 'warn', f); }).join('');
    var chainsHtml = row.chains.slice(0, 6).map(function (c) { return c === best.chain ? '<strong>' + esc(c) + ' (Best)</strong>' : esc(c); }).join(', ') + (row.chains.length > 6 ? ' +' + (row.chains.length - 6) + ' more' : '');
    var cell = function (k, v, s) { return dv('audit-cell', dv('audit-k', k) + dv('audit-v', v) + dv('proto-sub', s)); };
    var chHead = function (t, m) { return '<div class="card-head" style="margin-bottom:2px"><span class="card-title">' + t + '</span><span class="card-meta">' + m + '</span></div>'; };

    drawer.innerHTML = dv('drawer-inner',
      dv('drawer-head', '<div><h2 id="drawer-title" class="drawer-title">#' + row.rank + ' ' + esc(row.name) + ' ' + bdg('lc', tierLbl) + '</h2>' + dv('drawer-sub', esc(row.category || 'Uncategorized') + ' &rarr; ' + esc(row.sector) + ' &middot; Chains: ' + chainsHtml) + '</div><button type="button" id="close-drawer" class="btn-close">Close (Esc)</button>') +
      dv('drawer-flags', flagHtml + bdg('early', 'Records no token in DefiLlama') + (!flagHtml ? bdg('wl', 'Clean Peer Hygiene') : '')) +
      '<section class="audit-box">' + dv('audit-top', '<div><strong>Implied Value: <span class="mono" style="color:var(--emerald);font-size:15px">' + fmtUsd(actVal.implied) + '</span></strong> <span class="mono" style="font-size:11px;color:var(--muted)">[' + fmtUsd(actVal.low) + ' – ' + fmtUsd(actVal.high) + '] &middot; Conf ' + row.confidence_score + '/100</span></div><span class="parity-pill">' + (calVal.implied === row.implied_value_usd ? '100% PARITY VERIFIED (' + fmtUsd(calVal.implied) + ')' : 'Parity Drift') + '</span>') +
      dv('audit-grid', cell('ScaleTVL (&beta;=' + state.beta.toFixed(3) + ')', fmtUsd(actVal.scaleTvl), 'Raw ' + fmtUsd(row.tvl_usd)) + cell('EB Peer Mult', actVal.peerMult.toFixed(4) + 'x', esc(actVal.peerSource) + ' (n=' + actVal.peerN + ')') + cell('Cat-Rel 7d Mult', actVal.growthMult.toFixed(4) + 'x', 'ex ' + fmtPct(actVal.excess7d)) + cell('Lindy Maturity', actVal.maturityMult.toFixed(4) + 'x', fmtAge(row.age_days) + ' listed')) + '</section>' +
      '<section class="peers-strip">' + chHead('Live-Token Peer Comparables (' + esc(actVal.peerSource === 'category' ? (row.category || '') : row.sector) + ')', 'Observed mcap / TVL') +
      dv('peers-list', peers.map(function (p) { return dv('peer-item', '<span><strong>' + esc(p.name) + '</strong> (' + fmtUsd(p.tvl_usd) + ')</span><span class="mono">' + fmtUsd(p.mcap_usd) + ' &middot; <strong>' + p.ratio.toFixed(3) + 'x</strong></span>'); }).join('')) + '</section>' +
      '<section class="farm-box">' + chHead('6-Step Chain-Aware Farm Plan', esc(row.farm_meta.epistemic_tier)) +
      dv('farm-meta-bar', bdg('wl', 'Route: ' + row.farm_meta.best_chain) + bdg('early', row.farm_meta.family_label) + bdg('lc', 'Min Cap: $' + row.farm_meta.min_capital_usd + '+') + bdg('early', 'Gas: ' + row.farm_meta.gas_tier)) +
      '<ol class="farm-steps-list">' + steps.map(function (st) { return '<li>' + esc(st.action) + '<span class="step-meta">Cost: ' + esc(st.cost) + '</span><span class="step-meta">Time: ' + esc(st.time) + '</span></li>'; }).join('') + '</ol></section>' +
      dv('drawer-foot', 'Live JS recomputation matches board.json 1:1. Frozen snapshot contains no live points feed; verify official channels before depositing.'));

    if (!drawer.open) drawer.showModal();
    var cb = document.getElementById('close-drawer');
    if (cb) cb.onclick = function () { drawer.close(); };
  }

  function bindEvents() {
    var byId = function (id) { return document.getElementById(id); };
    var on = function (id, ev, fn) { var e = byId(id); if (e) e.addEventListener(ev, fn); };
    root.querySelectorAll('[data-tab]').forEach(function (el) { el.onclick = function () { state.tab = this.getAttribute('data-tab'); writeHash(); render(); }; });
    root.querySelectorAll('[data-tier]').forEach(function (el) { el.onclick = function () { state.tier = this.getAttribute('data-tier'); writeHash(); render(); }; });
    on('q-input', 'input', function () { state.q = this.value; writeHash(); render(); var e = byId('q-input'); if (e) { e.focus(); e.setSelectionRange(e.value.length, e.value.length); } });
    [['cat-sel', 'cat'], ['chain-sel', 'chain'], ['conf-sel', 'conf']].forEach(function (p) { on(p[0], 'change', function () { state[p[1]] = this.value; writeHash(); render(); }); });
    on('reset-filters', 'click', function () { state.tier = state.cat = state.chain = state.conf = 'all'; state.q = ''; writeHash(); render(); });
    root.querySelectorAll('th[data-sort]').forEach(function (th) {
      th.onclick = function () {
        var c = this.getAttribute('data-sort');
        if (state.sortBy === c) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        else { state.sortBy = c; state.sortDir = c === 'rank' || c === 'name' ? 'asc' : 'desc'; }
        render();
      };
    });
    root.querySelectorAll('tr[data-slug]').forEach(function (tr) {
      var op = function () { state.selectedSlug = tr.getAttribute('data-slug'); writeHash(); openDrawer(state.selectedSlug); };
      tr.onclick = op;
      tr.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); op(); } };
    });
    [['sl-beta', 'beta'], ['sl-gw', 'growthWeight'], ['sl-mr', 'maturityRange']].forEach(function (p) { on(p[0], 'input', function () { state[p[1]] = parseFloat(this.value); render(); }); });
    on('reset-cal', 'click', function () { state.beta = CAL.beta_huber; state.growthWeight = CAL.growth_weight; state.maturityRange = CAL.maturity_range; render(); });
    on('live-sec-sel', 'change', function () { state.liveSector = this.value; render(); });
    on('live-core-chk', 'change', function () { state.liveCoreOnly = this.checked; render(); });
  }

  drawer.addEventListener('close', function () {
    state.selectedSlug = null; writeHash();
    var sel = root.querySelector('tr.selected'); if (sel) sel.classList.remove('selected');
  });
  drawer.addEventListener('click', function (e) { if (e.target === drawer) drawer.close(); });

  window.__RADAR_PARITY = { computeImpliedValue: computeImpliedValue, buildFarmPlan: buildFarmPlan };
  readHash();
  render();
})();
