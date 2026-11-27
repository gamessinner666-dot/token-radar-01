// Quantitative Net-of-Fees 10-Family Chain-Architecture x Category-Action Farming Engine.
// Computes plan deposit size, exact minimum profitable ticket (Pays from $X), itemized fees,
// hands-on minutes, configurable carry hurdle, FARM/MARGINAL/SKIP verdict, and 9 operator steps.

import { clamp } from './comparables.ts';
import type { ChainFamily, FarmEconomics, FarmStepItem, FarmVerdict, SnapshotProtocol } from './types.ts';

export interface ChainProfile {
  family: ChainFamily;
  familyLabel: string;
  costOrder: number;
  wallet: string;
  gasAsset: string;
  gasTier: string;
  setupFee: number;
  weeklyFee: number;
  exitFee: number;
  minFloor: number;
  baseMins: number;
  weeklyMins: number;
  cadence: string;
  cleanup: string;
}

const LOW_GAS_EVM_ORDER: readonly string[] = [
  'Base', 'Arbitrum', 'Optimism', 'Polygon', 'Binance', 'Avalanche', 'Monad', 'Ink',
  'Sonic', 'Scroll', 'Linea', 'Flare', 'Plume Mainnet', 'Mantle', 'Berachain',
  'Hyperliquid L1', 'Unichain', 'World Chain', 'Katana', 'Soneium', 'Blast', 'Mode',
  'Zircuit', 'zkSync Era', 'Taiko', 'Celo', 'Fraxtal', 'Etherlink', 'xDai', 'Sei',
  'Plasma', 'Stable', 'Corn', 'Hemi', 'Morph', 'Arc', 'Fluent', 'Pharos', 'Rayls',
  'Robinhood Chain', 'TAC', 'Tempo', 'XRPL EVM', 'Bittensor EVM',
];

const BTC_L2_CHAINS = new Set<string>([
  'BSquared', 'CORE', 'Babylon Genesis', 'Stacks', 'Mezo', 'Citrea', 'BOB', 'Merlin', 'Bitlayer', 'Botanix', 'RSK',
]);
const COSMOS_IBC_CHAINS = new Set<string>([
  'Noble', 'Nibiru', 'XION', 'Osmosis', 'Cosmos', 'Celestia', 'Injective', 'Kujira', 'Neutron', 'Stride',
  'Secret', 'Akash', 'Dymension', 'Initia', 'Persistence', 'Stargaze', 'Archway', 'Saga', 'Terra', 'Terra2',
  'dYdX', 'Thorchain', 'HydraDX',
]);
const ALT_VM_CHAINS = new Set<string>([
  'Sui', 'Aptos', 'Starknet', 'Tron', 'Cardano', 'Near', 'Provenance', 'Qubic', 'Canton', 'TON',
  'Polkadot', 'Astar', 'Flow', 'Fuel', 'ICP', 'Hedera', 'Tezos', 'Radix', 'Waves', 'Aleo', 'Mina',
  'Elrond', 'VeChain', 'Kaspa', 'Ergo', 'Filecoin', 'Eclipse',
]);

export function classifySingleChain(chain: string): ChainProfile {
  if (chain === 'Solana') {
    return {
      family: 'solana', familyLabel: 'Solana', costOrder: 1,
      wallet: 'Phantom or Backpack wallet', gasAsset: 'SOL', gasTier: '<$0.05/tx (SOL)',
      setupFee: 0.55, weeklyFee: 0.02, exitFee: 0.05, minFloor: 1000, baseMins: 45, weeklyMins: 5,
      cadence: 'bi-weekly organic rebalance',
      cleanup: 'close empty SPL token accounts to reclaim SOL rent and revoke delegates',
    };
  }
  if (chain === 'Bitcoin') {
    return {
      family: 'bitcoin', familyLabel: 'Bitcoin & Lightning', costOrder: 4,
      wallet: 'non-custodial BTC / Lightning node wallet', gasAsset: 'BTC', gasTier: '$5.50 L1 open/close',
      setupFee: 5.50, weeklyFee: 0.0, exitFee: 5.50, minFloor: 2500, baseMins: 55, weeklyMins: 4,
      cadence: 'open-and-hold channel liquidity',
      cleanup: 'cooperatively close Lightning channels back to cold BTC storage',
    };
  }
  if (BTC_L2_CHAINS.has(chain)) {
    return {
      family: 'btc_l2', familyLabel: 'BTC L2 / Restaking', costOrder: 3,
      wallet: `${chain}-compatible BTC/EVM wallet`,
      gasAsset: chain === 'Stacks' ? 'STX' : chain === 'CORE' ? 'CORE' : 'BTC',
      gasTier: '$0.35–$3.50/tx',
      setupFee: 3.50, weeklyFee: 0.35, exitFee: 2.00, minFloor: 2000, baseMins: 50, weeklyMins: 5,
      cadence: 'hold across unbonding epochs',
      cleanup: 'check 7–21 day unbonding cooldowns and revoke spend limits',
    };
  }
  if (chain === 'Bittensor') {
    return {
      family: 'bittensor', familyLabel: 'Bittensor (Substrate)', costOrder: 2,
      wallet: 'Bittensor Wallet or Polkadot.js signer', gasAsset: 'TAO', gasTier: '<$0.10/tx (TAO)',
      setupFee: 0.25, weeklyFee: 0.05, exitFee: 0.15, minFloor: 1500, baseMins: 50, weeklyMins: 4,
      cadence: 'periodic subnet yield check',
      cleanup: 'unstake subnet alpha back to root TAO watching slippage',
    };
  }
  if (chain === 'Algorand') {
    return {
      family: 'algorand', familyLabel: 'Algorand (AVM)', costOrder: 1,
      wallet: 'Pera or Defly Algorand wallet', gasAsset: 'ALGO', gasTier: '<$0.02/tx (ALGO)',
      setupFee: 0.25, weeklyFee: 0.01, exitFee: 0.05, minFloor: 1000, baseMins: 45, weeklyMins: 4,
      cadence: 'bi-weekly organic check-in',
      cleanup: 'opt out of unused ASAs to reclaim 0.1 ALGO min balance',
    };
  }
  if (COSMOS_IBC_CHAINS.has(chain)) {
    return {
      family: 'cosmos_ibc', familyLabel: 'Cosmos / IBC', costOrder: 1,
      wallet: 'Keplr or Leap IBC wallet', gasAsset: chain === 'Noble' ? 'IBC fee token' : 'native IBC gas',
      gasTier: '<$0.05/tx (IBC)',
      setupFee: 0.40, weeklyFee: 0.03, exitFee: 0.15, minFloor: 1000, baseMins: 45, weeklyMins: 4,
      cadence: 'bi-weekly organic check-in',
      cleanup: 'transfer balances back over canonical IBC channels',
    };
  }
  if (chain === 'Ripple' || chain === 'Stellar') {
    const xr = chain === 'Ripple';
    return {
      family: 'xrpl_stellar', familyLabel: xr ? 'XRPL' : 'Stellar', costOrder: 2,
      wallet: xr ? 'Xaman (XRPL) wallet' : 'Freighter (Stellar) wallet',
      gasAsset: xr ? 'XRP' : 'XLM', gasTier: `<$0.02/tx + ${xr ? 'XRP' : 'XLM'} reserve`,
      setupFee: 0.35, weeklyFee: 0.02, exitFee: 0.10, minFloor: 1500, baseMins: 45, weeklyMins: 4,
      cadence: 'epoch hold',
      cleanup: 'zero issued balances and remove unused trustlines',
    };
  }
  if (ALT_VM_CHAINS.has(chain)) {
    return {
      family: 'alt_vm', familyLabel: `${chain} (Alt-VM)`, costOrder: 2,
      wallet: `${chain}-native wallet`, gasAsset: `${chain} gas`, gasTier: '$0.06–$0.80/tx',
      setupFee: 0.80, weeklyFee: 0.06, exitFee: 0.25, minFloor: 1000, baseMins: 45, weeklyMins: 5,
      cadence: 'bi-weekly organic check-in',
      cleanup: 'clear session keys or contract permissions on exit',
    };
  }
  if (chain === 'Ethereum') {
    return {
      family: 'eth_l1', familyLabel: 'Ethereum L1 Only', costOrder: 9,
      wallet: 'EVM wallet (Rabby or hardware signer)', gasAsset: 'ETH', gasTier: '$12–$18/tx (L1 gas)',
      setupFee: 18.00, weeklyFee: 0.0, exitFee: 12.00, minFloor: 5000, baseMins: 50, weeklyMins: 3,
      cadence: 'deposit-and-hold (no weekly L1 churn)',
      cleanup: 'withdraw exact balance and revoke ERC-20 allowances',
    };
  }
  return {
    family: 'evm_l2', familyLabel: 'EVM L2 / Low-Gas Alt-L1', costOrder: 0,
    wallet: 'EVM wallet (Rabby or MetaMask)', gasAsset: `${chain} gas`, gasTier: '$0.08–$0.30/tx',
    setupFee: 1.15, weeklyFee: 0.08, exitFee: 0.25, minFloor: 1000, baseMins: 45, weeklyMins: 5,
    cadence: 'bi-weekly organic rebalance',
    cleanup: 'repay any debt and revoke unlimited ERC-20 approvals',
  };
}

export function selectBestChain(chains: readonly string[]): { chain: string; profile: ChainProfile } {
  if (chains.length === 0) return { chain: 'Ethereum', profile: classifySingleChain('Ethereum') };
  const ranked = chains.map((chain) => {
    const profile = classifySingleChain(chain);
    const l2Idx = LOW_GAS_EVM_ORDER.indexOf(chain);
    return { chain, profile, p: l2Idx >= 0 ? l2Idx : 1000 };
  });
  ranked.sort(
    (a, b) =>
      a.profile.costOrder - b.profile.costOrder ||
      a.p - b.p ||
      (a.chain < b.chain ? -1 : a.chain > b.chain ? 1 : 0),
  );
  return { chain: ranked[0]!.chain, profile: ranked[0]!.profile };
}

export function planDepositUsd(tvlUsd: number, minFloor: number): number {
  const raw = Math.round((tvlUsd * 0.0002) / 500) * 500;
  return Math.min(25_000, Math.max(minFloor, raw));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Exact minimum deposit (rounded up to nearest $100) where modelled drop beats fees + carry. */
export function calcMinTicketUsd(
  impliedValueUsd: number,
  dropShare: number,
  tvlUsd: number,
  totalFees: number,
  carryRate: number,
): number | null {
  const V = impliedValueUsd * dropShare;
  if (!(V > totalFees && V > 0 && tvlUsd > 0)) return null;
  let dMin: number;
  if (carryRate <= 0) {
    dMin = totalFees === 0 ? 100 : (totalFees * tvlUsd) / (V - totalFees);
  } else {
    const b = carryRate * tvlUsd + totalFees - V;
    if (b >= 0) return null;
    const disc = b * b - 4 * carryRate * totalFees * tvlUsd;
    if (disc <= 0) return null;
    dMin = (-b - Math.sqrt(disc)) / (2 * carryRate);
  }
  const cand = Math.max(100, Math.ceil(dMin / 100) * 100);
  const netCheck = (V * cand) / (tvlUsd + cand) - totalFees - carryRate * cand;
  return netCheck > 0 ? cand : null;
}

function coreActionText(p: SnapshotProtocol, chain: string, profile: ChainProfile, cap: number): string {
  const cat = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (profile.family === 'bitcoin') {
    return `Open a balanced native BTC Lightning channel with ${name} ($${cap.toLocaleString('en-US')} in BTC) rather than wrapped bridges.`;
  }
  if (profile.family === 'bittensor') {
    const poolLabel = /dtao/i.test(name) ? `${name} subnet pool` : `${name}'s dTAO subnet pool`;
    return `Stake $${cap.toLocaleString('en-US')} of native TAO into ${poolLabel} on Bittensor and track alpha ratio.`;
  }
  if (profile.family === 'algorand') {
    return cat.includes('rwa')
      ? `Complete KYC eligibility and acquire $${cap.toLocaleString('en-US')} of fractional RWA ASAs on ${name} (${chain}).`
      : `Opt into the ASA and supply $${cap.toLocaleString('en-US')} of native ALGO into ${name} on ${chain}.`;
  }
  if (profile.family === 'cosmos_ibc') {
    return `Transfer $${cap.toLocaleString('en-US')} via canonical IBC onto ${chain} and supply native Cosmos liquidity to ${name}.`;
  }
  if (profile.family === 'xrpl_stellar') {
    const asset = chain === 'Ripple' ? 'XRP' : 'XLM';
    return `Set the ${chain} trustline and supply $${cap.toLocaleString('en-US')} of ${asset} liquidity into ${name}.`;
  }
  if (cat.includes('insurance')) {
    return `Supply $${cap.toLocaleString('en-US')} to ${name}'s underwriting cover pool on ${chain} (avoid buying cover unless hedging: premiums are sunk).`;
  }
  if (cat.includes('curator') || cat.includes('allocator') || cat.includes('aggregator') || cat.includes('cdp manager') || cat.includes('indexes')) {
    return `Deposit $${cap.toLocaleString('en-US')} into a ${name} curated vault on ${chain} receiving liquid shares; verify curator fee percentage and exit liquidity.`;
  }
  if (cat.includes('lend') || cat.includes('cdp') || cat.includes('collateral Markets'.toLowerCase()) || cat.includes('collateral')) {
    return `Supply $${cap.toLocaleString('en-US')} of collateral to ${name} on ${chain}; optionally borrow below 35% LTV only if carry is positive.`;
  }
  if (cat.includes('dex') || cat.includes('liquidity manager')) {
    return `Provide $${cap.toLocaleString('en-US')} of deep major-pair liquidity on ${name} (${chain}), avoiding tight-range impermanent loss.`;
  }
  if (cat.includes('derivative') || cat.includes('prediction') || cat.includes('option') || cat.includes('otc') || cat.includes('synthetic')) {
    return `Post $${cap.toLocaleString('en-US')} margin on ${name} (${chain}) with small hedged limit orders so trading fees stay minimal.`;
  }
  if (cat.includes('basis') || cat.includes('yield') || cat.includes('farm') || cat.includes('governance') || cat === 'dor') {
    return `Mint or stake $${cap.toLocaleString('en-US')} of ${name}'s yield-bearing or delta-neutral receipt on ${chain} and hold across epochs.`;
  }
  if (cat.includes('rwa') || cat.includes('cedefi') || cat.includes('crypto card') || cat.includes('payments')) {
    return `Pass issuer KYC and eligibility first, then hold $${cap.toLocaleString('en-US')} in ${name}'s permitted rail on ${chain}.`;
  }
  return `Deposit $${cap.toLocaleString('en-US')} of native ${chain} assets into ${name}'s core pool on ${chain}.`;
}

function riskText(p: SnapshotProtocol, flags: readonly string[], siblingSymbol: string | null): string {
  const cat = (p.category ?? '').toLowerCase();
  const parts: string[] = [];
  if (cat.includes('insurance')) parts.push('Underwriting pool bears claim-payout slashing and lockup risk.');
  else if (cat.includes('rwa') || cat.includes('cedefi') || cat.includes('crypto card')) parts.push('Off-chain custody, legal KYC gating, and issuer solvency apply.');
  else if (cat.includes('derivative') || cat.includes('prediction') || cat.includes('option')) parts.push('Monitor funding, spread slippage, and liquidation buffers.');
  else if (cat.includes('basis') || cat.includes('yield') || cat.includes('curator') || cat.includes('allocator')) parts.push('Verify curator strategy, basis inversion, and redemption queues.');
  else parts.push('Monitor smart-contract audits, oracle feeds, and pool utilization.');

  if (siblingSymbol !== null) parts.push(`Sibling token ${siblingSymbol} already trades.`);
  if (flags.some((f) => f.includes('Bitcoin P2P'))) parts.push('Bitcoin P2P routing rarely issues a token.');
  return parts.join(' ');
}

function fmtStepFee(usd: number): string {
  return usd === 0 ? 'free' : `$${usd.toFixed(2)}`;
}

function formatStepLine(s: FarmStepItem): string {
  let line = `${s.phase}: ${s.action} Cost: ${s.cost_label}. Time: ${s.time_label}.`;
  if (line.length > 600) line = `${line.slice(0, 596)}...`;
  if (line.length < 20) line = `${line} Verify official documentation.`;
  return line;
}

export interface FarmPlanResult {
  econ: FarmEconomics;
  steps: string[];
  items: FarmStepItem[];
}

export function buildFarmEconomicsAndPlan(
  p: SnapshotProtocol,
  impliedValueUsd: number,
  launchOdds: number,
  flags: readonly string[],
  siblingSymbol: string | null,
  p05DropPct: number,
  depositOverride?: number,
  dropShare = 0.10,
  horizonWeeks = 12,
  carryApr = 0.02,
): FarmPlanResult {
  const { chain, profile } = selectBestChain(p.chains);
  const deposit = depositOverride ?? planDepositUsd(p.tvl_usd, profile.minFloor);
  const cat = (p.category ?? '').toLowerCase();

  const setupFee = round2(profile.setupFee);
  const weeklyOpsCost = round2(profile.weeklyFee * horizonWeeks);
  const exitFee = round2(profile.exitFee);
  const totalFees = round2(setupFee + weeklyOpsCost + exitFee);

  const weeklyTotalMins = profile.weeklyMins * horizonWeeks;
  const totalMins = profile.baseMins + weeklyTotalMins;
  const totalHours = round2(totalMins / 60);

  const carryRate = carryApr * (horizonWeeks / 52);
  const modelledDrop = round2(impliedValueUsd * dropShare * (deposit / (p.tvl_usd + deposit)));
  const netOfFees = round2(modelledDrop - totalFees);
  const tbillHurdle = round2(deposit * carryRate);
  const netPerHour = round2(netOfFees / Math.max(0.25, totalHours));
  const excessAfterCarry = round2(netOfFees - tbillHurdle);
  const excessPerHour = round2(excessAfterCarry / Math.max(0.25, totalHours));
  const minTicketUsd = calcMinTicketUsd(impliedValueUsd, dropShare, p.tvl_usd, totalFees, carryRate);

  let verdict: FarmVerdict = 'SKIP';
  if (excessAfterCarry > 0 && excessPerHour >= 25) verdict = 'FARM';
  else if (excessAfterCarry > 0) verdict = 'MARGINAL';

  const shareDenom = impliedValueUsd * (deposit / (p.tvl_usd + deposit));
  const breakEvenDrop = shareDenom > 0 ? round2((totalFees / shareDenom) * 10000) / 10000 : 1;
  const breakEvenOdds =
    impliedValueUsd > 0 && launchOdds > 0
      ? Math.round(Math.min(1, totalFees / ((impliedValueUsd / launchOdds) * dropShare * (deposit / (p.tvl_usd + deposit)))) * 1000) / 1000
      : 1;

  const exitDropFraction = clamp(Math.abs(p05DropPct) / 100, 0.12, 0.25);
  const exitTvlUsd = Math.round(p.tvl_usd * (1 - exitDropFraction));
  const exitTvlM = `$${(exitTvlUsd / 1e6).toFixed(1)}M`;

  const multiNote =
    p.chains.length > 1 && p.chains.includes('Ethereum') && profile.family !== 'eth_l1'
      ? ` Auto-routed to ${chain} (lowest gas across ${p.chains.length} chains).`
      : '';

  const epistemicTier = flags.some((f) => f.includes('Bitcoin P2P') || f.includes('Tokenized Sibling'))
    ? 'Organic Utility (Low Token Probability)'
    : 'Potential Pre-Token Participation (Unconfirmed)';

  const riskTags: string[] = [];
  if (profile.family === 'eth_l1') riskTags.push('High L1 Gas');
  if (cat.includes('insurance')) riskTags.push('Underwriting Slashing');
  if (cat.includes('cedefi') || cat.includes('rwa') || cat.includes('crypto card')) riskTags.push('Custody / KYC');
  if (cat.includes('derivative') || cat.includes('prediction') || cat.includes('option')) riskTags.push('Sunk Trading Fees');
  if (siblingSymbol !== null) riskTags.push(`Sibling ${siblingSymbol}`);
  if (riskTags.length === 0) riskTags.push('Smart-Contract Risk');

  const coreMins = Math.max(5, profile.baseMins - 35);
  const settleNote =
    profile.family === 'bitcoin'
      ? 'allow 10–60 min on-chain settlement'
      : profile.family === 'eth_l1'
        ? 'withdraw direct to skip bridge gas'
        : 'allow 2–15 min finality';
  const secondaryChain = p.chains.find((c) => c !== chain && classifySingleChain(c).costOrder <= 2);
  const secondaryNote = secondaryChain
    ? ` Optional: execute one light organic transaction on ${secondaryChain} if points weight multi-chain activity.`
    : '';
  const payFloorTxt = minTicketUsd !== null
    ? `pays from $${minTicketUsd.toLocaleString('en-US')}`
    : `diluted at ${(carryApr * 100).toFixed(0)}% carry`;

  const items: FarmStepItem[] = [
    {
      phase: 'SETUP',
      when: 'Day 0',
      action: `Configure a dedicated ${profile.wallet} on ${chain} holding ${profile.gasAsset} for gas (${profile.gasTier}; no airdrop is confirmed).`,
      cost_usd: round2(setupFee * 0.35),
      cost_label: `${fmtStepFee(round2(setupFee * 0.35))} gas`,
      minutes: 8,
      time_label: '8 min',
    },
    {
      phase: 'VERIFY',
      when: 'Day 0',
      action: `Open ${p.name} through its DefiLlama entry or official documentation, bookmark the domain, and verify contract addresses before signing.`,
      cost_usd: 0,
      cost_label: 'free',
      minutes: 5,
      time_label: '5 min',
    },
    {
      phase: 'FUND',
      when: 'Day 0',
      action: `Bridge or transfer $${deposit.toLocaleString('en-US')} in native ${chain} assets onto ${chain} (${settleNote}).${multiNote}`,
      cost_usd: round2(setupFee * 0.65),
      cost_label: `${fmtStepFee(round2(setupFee * 0.65))} bridge`,
      minutes: 7,
      time_label: '7 min',
    },
    {
      phase: 'ENTER',
      when: 'Day 1',
      action: `Send a $100 test transaction first, verify dashboard tracking updates, then scale to $${deposit.toLocaleString('en-US')}: ${coreActionText(p, chain, profile, deposit)}`,
      cost_usd: 0,
      cost_label: `$${deposit.toLocaleString('en-US')} capital`,
      minutes: coreMins,
      time_label: `${coreMins} min`,
    },
    {
      phase: 'CADENCE',
      when: `Weeks 1–${horizonWeeks}`,
      action: `Hold the position across ${horizonWeeks} weeks with ${profile.cadence} (~${profile.weeklyMins} min/wk; avoid wasteful churn).${secondaryNote}`,
      cost_usd: weeklyOpsCost,
      cost_label: `${fmtStepFee(weeklyOpsCost)} over ${horizonWeeks}w`,
      minutes: weeklyTotalMins,
      time_label: `${profile.weeklyMins} min/wk`,
    },
    {
      phase: 'RISK',
      when: 'Ongoing',
      action: riskText(p, flags, siblingSymbol),
      cost_usd: 0,
      cost_label: 'free check',
      minutes: 2,
      time_label: '2 min',
    },
    {
      phase: 'STOP RULE',
      when: 'Any day',
      action: `Check TVL weekly and withdraw immediately if TVL breaks below ${exitTvlM} (${p05DropPct.toFixed(1)}% P05 stress threshold) or withdrawals pause; ${profile.cleanup}.`,
      cost_usd: exitFee,
      cost_label: `${fmtStepFee(exitFee)} unwind`,
      minutes: 5,
      time_label: '5 min',
    },
    {
      phase: 'CLAIM',
      when: 'At launch',
      action: `Monitor ${p.name}'s official announcements for any TGE eligibility checker, inspect the claim contract carefully, and archive receipts.`,
      cost_usd: 0,
      cost_label: 'free check',
      minutes: 5,
      time_label: '5 min',
    },
    {
      phase: 'BUDGET',
      when: 'Summary',
      action: `Total $${totalFees.toFixed(2)} fees plus $${tbillHurdle.toFixed(2)} (${(carryApr * 100).toFixed(0)}% carry) vs $${modelledDrop.toFixed(2)} drop equals ${excessAfterCarry >= 0 ? '+' : ''}$${excessAfterCarry.toFixed(2)} excess ($${excessPerHour.toFixed(2)}/hr; ${payFloorTxt}) -> ${verdict}.`,
      cost_usd: 0,
      cost_label: 'review',
      minutes: 3,
      time_label: '3 min',
    },
  ];

  return {
    econ: {
      best_chain: chain,
      chain_family: profile.family,
      family_label: profile.familyLabel,
      gas_tier: profile.gasTier,
      deposit_usd: deposit,
      min_ticket_usd: minTicketUsd,
      drop_share: dropShare,
      horizon_weeks: horizonWeeks,
      carry_apr: carryApr,
      setup_fee_usd: setupFee,
      weekly_fee_per_week_usd: profile.weeklyFee,
      weekly_fee_usd: weeklyOpsCost,
      exit_fee_usd: exitFee,
      total_fees_usd: totalFees,
      base_minutes: profile.baseMins,
      weekly_minutes_per_week: profile.weeklyMins,
      total_minutes: totalMins,
      total_hours: totalHours,
      modelled_drop_usd: modelledDrop,
      net_of_fees_usd: netOfFees,
      tbill_hurdle_usd: tbillHurdle,
      net_per_hour: netPerHour,
      excess_after_carry_usd: excessAfterCarry,
      excess_per_hour: excessPerHour,
      verdict,
      break_even_drop_share: breakEvenDrop,
      break_even_odds: breakEvenOdds,
      exit_tvl_usd: exitTvlUsd,
      cadence: profile.cadence,
      risk_tags: riskTags,
      epistemic_tier: epistemicTier,
    },
    steps: items.map(formatStepLine),
    items,
  };
}
