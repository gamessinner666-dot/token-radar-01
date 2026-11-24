// Quantitative Net-of-Fees 10-Family Chain-Architecture x Category-Action Farming Engine.
// Computes plan deposit size, itemized gas fees, hands-on time, 4% T-bill opportunity hurdle,
// FARM/MARGINAL/SKIP verdict, break-even thresholds, quantified TVL exit triggers, and 8 steps.

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
      setupFee: 0.55, weeklyFee: 0.02, exitFee: 0.05, minFloor: 1000, baseMins: 35, weeklyMins: 5,
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
      setupFee: 3.50, weeklyFee: 0.35, exitFee: 2.00, minFloor: 2000, baseMins: 45, weeklyMins: 5,
      cadence: 'hold across unbonding epochs',
      cleanup: 'check 7–21d unbonding cooldowns and revoke spend limits',
    };
  }
  if (chain === 'Bittensor') {
    return {
      family: 'bittensor', familyLabel: 'Bittensor (Substrate)', costOrder: 2,
      wallet: 'Bittensor Wallet or Polkadot.js signer', gasAsset: 'TAO', gasTier: '<$0.10/tx (TAO)',
      setupFee: 0.25, weeklyFee: 0.05, exitFee: 0.15, minFloor: 1500, baseMins: 45, weeklyMins: 4,
      cadence: 'periodic subnet yield check',
      cleanup: 'unstake subnet alpha back to root TAO watching slippage',
    };
  }
  if (chain === 'Algorand') {
    return {
      family: 'algorand', familyLabel: 'Algorand (AVM)', costOrder: 1,
      wallet: 'Pera or Defly Algorand wallet', gasAsset: 'ALGO', gasTier: '<$0.02/tx (ALGO)',
      setupFee: 0.25, weeklyFee: 0.01, exitFee: 0.05, minFloor: 1000, baseMins: 40, weeklyMins: 4,
      cadence: 'bi-weekly organic check-in',
      cleanup: 'opt out of unused ASAs to reclaim 0.1 ALGO min balance',
    };
  }
  if (COSMOS_IBC_CHAINS.has(chain)) {
    return {
      family: 'cosmos_ibc', familyLabel: 'Cosmos / IBC', costOrder: 1,
      wallet: 'Keplr or Leap IBC wallet', gasAsset: chain === 'Noble' ? 'IBC fee token' : 'native IBC gas',
      gasTier: '<$0.05/tx (IBC)',
      setupFee: 0.40, weeklyFee: 0.03, exitFee: 0.15, minFloor: 1000, baseMins: 40, weeklyMins: 4,
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
      setupFee: 0.35, weeklyFee: 0.02, exitFee: 0.10, minFloor: 1500, baseMins: 40, weeklyMins: 4,
      cadence: 'epoch hold',
      cleanup: 'zero issued balances and remove unused trustlines',
    };
  }
  if (ALT_VM_CHAINS.has(chain)) {
    return {
      family: 'alt_vm', familyLabel: `${chain} (Alt-VM)`, costOrder: 2,
      wallet: `${chain}-native wallet`, gasAsset: `${chain} gas`, gasTier: '$0.06–$0.80/tx',
      setupFee: 0.80, weeklyFee: 0.06, exitFee: 0.25, minFloor: 1000, baseMins: 40, weeklyMins: 5,
      cadence: 'bi-weekly organic check-in',
      cleanup: 'clear session keys or contract permissions on exit',
    };
  }
  if (chain === 'Ethereum') {
    return {
      family: 'eth_l1', familyLabel: 'Ethereum L1 Only', costOrder: 9,
      wallet: 'EVM wallet (Rabby or hardware signer)', gasAsset: 'ETH', gasTier: '$12–$18/tx (L1 gas)',
      setupFee: 18.00, weeklyFee: 0.0, exitFee: 12.00, minFloor: 5000, baseMins: 45, weeklyMins: 3,
      cadence: 'deposit-and-hold (no weekly L1 churn)',
      cleanup: 'withdraw exact balance and revoke ERC-20 allowances',
    };
  }
  return {
    family: 'evm_l2', familyLabel: 'EVM L2 / Low-Gas Alt-L1', costOrder: 0,
    wallet: 'EVM wallet (Rabby or MetaMask)', gasAsset: `${chain} gas`, gasTier: '$0.08–$0.30/tx',
    setupFee: 1.15, weeklyFee: 0.08, exitFee: 0.25, minFloor: 1000, baseMins: 40, weeklyMins: 5,
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

function coreActionText(p: SnapshotProtocol, chain: string, profile: ChainProfile, cap: number): string {
  const cat = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (profile.family === 'bitcoin') {
    return `Open a balanced native BTC Lightning channel with ${name} ($${cap.toLocaleString('en-US')} in BTC) rather than wrapped bridges.`;
  }
  if (profile.family === 'bittensor') {
    return `Stake $${cap.toLocaleString('en-US')} of native TAO into ${name}'s dTAO subnet pool on Bittensor and track alpha ratio.`;
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
    return `Supply $${cap.toLocaleString('en-US')} to ${name}'s underwriting / cover pool on ${chain} (do not buy cover unless hedging: premiums are sunk).`;
  }
  if (cat.includes('curator') || cat.includes('allocator') || cat.includes('aggregator') || cat.includes('cdp manager') || cat.includes('indexes')) {
    return `Deposit $${cap.toLocaleString('en-US')} into a ${name} curated vault on ${chain} receiving liquid shares; verify curator fee % and liquidity.`;
  }
  if (cat.includes('lend') || cat.includes('cdp') || cat.includes('collateral')) {
    return `Supply $${cap.toLocaleString('en-US')} of collateral to ${name} on ${chain}; optionally borrow <35% LTV only if carry is positive.`;
  }
  if (cat.includes('dex') || cat.includes('liquidity manager')) {
    return `Provide $${cap.toLocaleString('en-US')} of deep major-pair liquidity on ${name} (${chain}) avoiding tight-range IL.`;
  }
  if (cat.includes('derivative') || cat.includes('prediction') || cat.includes('option') || cat.includes('otc') || cat.includes('synthetic')) {
    return `Post $${cap.toLocaleString('en-US')} margin on ${name} (${chain}) with small hedged limit orders (keep turnover low: fees are sunk).`;
  }
  if (cat.includes('basis') || cat.includes('yield') || cat.includes('farm') || cat.includes('governance') || cat === 'dor') {
    return `Mint or stake $${cap.toLocaleString('en-US')} of ${name}'s yield-bearing or delta-neutral receipt on ${chain} and hold across epochs.`;
  }
  if (cat.includes('rwa') || cat.includes('cedefi') || cat.includes('crypto card') || cat.includes('payments')) {
    return `Pass issuer KYC/accreditation first, then hold $${cap.toLocaleString('en-US')} in ${name}'s permitted rail on ${chain}.`;
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
  if (line.length < 20) line = `${line} Verify official docs.`;
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

  const modelledDrop = round2(impliedValueUsd * dropShare * (deposit / (p.tvl_usd + deposit)));
  const netOfFees = round2(modelledDrop - totalFees);
  const tbillHurdle = round2(deposit * 0.02 * (horizonWeeks / 52));
  const netPerHour = round2(netOfFees / Math.max(0.25, totalHours));

  let verdict: FarmVerdict = 'SKIP';
  if (netOfFees > tbillHurdle && netPerHour >= 25) verdict = 'FARM';
  else if (netOfFees > 0) verdict = 'MARGINAL';

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

  const coreMins = Math.max(5, profile.baseMins - 30);
  const settleNote =
    profile.family === 'bitcoin'
      ? 'allow 10–60m on-chain settlement'
      : profile.family === 'eth_l1'
        ? 'withdraw direct to skip bridge gas'
        : 'allow 2–15m finality';
  const secondaryChain = p.chains.find((c) => c !== chain && classifySingleChain(c).costOrder <= 2);
  const secondaryNote = secondaryChain
    ? ` Optional: mirror 1 light organic tx on ${secondaryChain} if points weight multi-chain.`
    : '';

  const items: FarmStepItem[] = [
    {
      phase: 'SETUP',
      action: `Prepare a dedicated ${profile.wallet} on ${chain} with ${profile.gasAsset} fee buffer (~2 setup txs @ ${profile.gasTier}; no airdrop is confirmed).`,
      cost_usd: round2(setupFee * 0.35),
      cost_label: `${fmtStepFee(round2(setupFee * 0.35))} gas`,
      minutes: 8,
      time_label: '8m',
    },
    {
      phase: 'VERIFY',
      action: `Open ${p.name} via its DefiLlama entry or official docs, bookmark the URL, and check contracts (never sign approvals from third-party links).`,
      cost_usd: 0,
      cost_label: 'free',
      minutes: 5,
      time_label: '5m',
    },
    {
      phase: 'FUND',
      action: `Move $${deposit.toLocaleString('en-US')} in native ${chain} assets onto ${chain} (${settleNote}).${multiNote}`,
      cost_usd: round2(setupFee * 0.65),
      cost_label: `${fmtStepFee(round2(setupFee * 0.65))} transfer`,
      minutes: 7,
      time_label: '7m',
    },
    {
      phase: 'CORE',
      action: `Start with a $100 test tx, confirm tracking, then scale to full $${deposit.toLocaleString('en-US')}: ${coreActionText(p, chain, profile, deposit)}`,
      cost_usd: 0,
      cost_label: `$${deposit.toLocaleString('en-US')} at risk`,
      minutes: coreMins,
      time_label: `${coreMins}m`,
    },
    {
      phase: 'CADENCE',
      action: `Hold ${horizonWeeks} weeks using ${profile.cadence} (~${profile.weeklyMins}m/wk; avoid wasteful churn).${secondaryNote}`,
      cost_usd: weeklyOpsCost,
      cost_label: `${fmtStepFee(weeklyOpsCost)} over ${horizonWeeks}wk`,
      minutes: weeklyTotalMins,
      time_label: `${profile.weeklyMins}m/wk (${weeklyTotalMins}m)`,
    },
    {
      phase: 'RISK',
      action: riskText(p, flags, siblingSymbol),
      cost_usd: 0,
      cost_label: 'free check',
      minutes: 2,
      time_label: '2m',
    },
    {
      phase: 'EXIT RULE',
      action: `Check TVL weekly and withdraw immediately if TVL breaks below ${exitTvlM} (${p05DropPct.toFixed(1)}% P05 stress threshold) or withdrawals pause; ${profile.cleanup}.`,
      cost_usd: exitFee,
      cost_label: `${fmtStepFee(exitFee)} unwind`,
      minutes: 5,
      time_label: '5m',
    },
    {
      phase: 'BUDGET',
      action: `Log tx hashes; $${totalFees.toFixed(2)} fees + $${tbillHurdle.toFixed(2)} 2% carry spread vs $${modelledDrop.toFixed(2)} drop = net ${netOfFees >= 0 ? '+' : ''}$${netOfFees.toFixed(2)} ($${netPerHour.toFixed(2)}/h -> ${verdict}).`,
      cost_usd: 0,
      cost_label: 'free log',
      minutes: 3,
      time_label: '3m',
    },
  ];

  return {
    econ: {
      best_chain: chain,
      chain_family: profile.family,
      family_label: profile.familyLabel,
      gas_tier: profile.gasTier,
      deposit_usd: deposit,
      drop_share: dropShare,
      horizon_weeks: horizonWeeks,
      setup_fee_usd: setupFee,
      weekly_fee_usd: weeklyOpsCost,
      exit_fee_usd: exitFee,
      total_fees_usd: totalFees,
      total_minutes: totalMins,
      total_hours: totalHours,
      modelled_drop_usd: modelledDrop,
      net_of_fees_usd: netOfFees,
      tbill_hurdle_usd: tbillHurdle,
      net_per_hour: netPerHour,
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
