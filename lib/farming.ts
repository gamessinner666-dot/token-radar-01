// 10-Family Chain-Architecture x Category-Action Farming Intelligence Engine.
// Covers all 115 snapshot chains with automatic lowest-gas routing, positive-EV ETH L1 thresholds,
// non-EVM native assets/wallets, Insurance/CeDeFi/RWA risk disclosures, and zero airdrop promises.

import type { ChainFamily, FarmMeta, FarmStep, SnapshotProtocol } from './types.ts';

interface ChainProfile {
  family: ChainFamily;
  familyLabel: string;
  costOrder: number;
  wallet: string;
  gasAsset: string;
  gasTier: string;
  setupGas: string;
  actionGas: string;
  minCap: number;
  cadence: string;
  cleanup: string;
}

const LOW_GAS_EVM_ORDER: readonly string[] = [
  'Base',
  'Arbitrum',
  'Optimism',
  'Polygon',
  'Binance',
  'Avalanche',
  'Monad',
  'Ink',
  'Sonic',
  'Scroll',
  'Linea',
  'Flare',
  'Plume Mainnet',
  'Mantle',
  'Berachain',
  'Hyperliquid L1',
  'Unichain',
  'World Chain',
  'Katana',
  'Soneium',
  'Blast',
  'Mode',
  'Zircuit',
  'zkSync Era',
  'Taiko',
  'Celo',
  'Fraxtal',
  'Etherlink',
  'xDai',
  'Sei',
  'Plasma',
  'Stable',
  'Corn',
  'Hemi',
  'Morph',
  'Arc',
  'Fluent',
  'Pharos',
  'Rayls',
  'Robinhood Chain',
  'TAC',
  'Tempo',
  'XRPL EVM',
  'Bittensor EVM',
];

const BTC_L2_CHAINS = new Set<string>([
  'BSquared',
  'CORE',
  'Babylon Genesis',
  'Stacks',
  'Mezo',
  'Citrea',
  'BOB',
  'Merlin',
  'Bitlayer',
  'Botanix',
  'RSK',
]);

const COSMOS_IBC_CHAINS = new Set<string>([
  'Noble',
  'Nibiru',
  'XION',
  'Osmosis',
  'Cosmos',
  'Celestia',
  'Injective',
  'Kujira',
  'Neutron',
  'Stride',
  'Secret',
  'Akash',
  'Dymension',
  'Initia',
  'Persistence',
  'Stargaze',
  'Archway',
  'Saga',
  'Terra',
  'Terra2',
  'dYdX',
  'Thorchain',
  'HydraDX',
]);

const XRPL_STELLAR_CHAINS = new Set<string>(['Ripple', 'Stellar']);

const ALT_VM_CHAINS = new Set<string>([
  'Sui',
  'Aptos',
  'Starknet',
  'Tron',
  'Cardano',
  'Near',
  'Provenance',
  'Qubic',
  'Canton',
  'TON',
  'Polkadot',
  'Astar',
  'Flow',
  'Fuel',
  'ICP',
  'Hedera',
  'Tezos',
  'Radix',
  'Waves',
  'Aleo',
  'Mina',
  'Elrond',
  'VeChain',
  'Kaspa',
  'Ergo',
  'Filecoin',
  'Eclipse',
]);

export function classifySingleChain(chain: string): ChainProfile {
  if (chain === 'Solana') {
    return {
      family: 'solana',
      familyLabel: 'Solana',
      costOrder: 1,
      wallet: 'Phantom or Backpack wallet',
      gasAsset: 'SOL',
      gasTier: '<$0.05/tx (SOL + ~0.002 SOL rent)',
      setupGas: 'under $0.05 in SOL plus ~$0.30 refundable rent',
      actionGas: 'under $0.02 per Solana tx',
      minCap: 150,
      cadence: 'bi-weekly organic rebalance',
      cleanup: 'close empty SPL token accounts to reclaim SOL rent and revoke delegates',
    };
  }
  if (chain === 'Bitcoin') {
    return {
      family: 'bitcoin',
      familyLabel: 'Bitcoin & Lightning',
      costOrder: 4,
      wallet: 'non-custodial BTC / Lightning node wallet',
      gasAsset: 'BTC',
      gasTier: '$1–$8 L1 open/close (sats/vB)',
      setupGas: '$1–$8 on-chain BTC fee (sats/vB)',
      actionGas: 'routing sats only (zero EVM gas)',
      minCap: 250,
      cadence: 'open-and-hold channel liquidity',
      cleanup: 'cooperatively close Lightning channels back to cold BTC storage',
    };
  }
  if (BTC_L2_CHAINS.has(chain)) {
    return {
      family: 'btc_l2',
      familyLabel: 'BTC L2 / Restaking',
      costOrder: 3,
      wallet: `${chain}-compatible BTC/EVM wallet`,
      gasAsset: chain === 'Stacks' ? 'STX' : chain === 'CORE' ? 'CORE' : 'BTC',
      gasTier: '$0.20–$3.00/tx',
      setupGas: '$0.30–$3.00 in native chain gas',
      actionGas: '$0.20–$1.50 per action',
      minCap: 200,
      cadence: 'deposit-and-hold across unbonding epochs',
      cleanup: 'verify 7–21 day bridge/unbonding cooldowns and revoke spend limits',
    };
  }
  if (chain === 'Bittensor') {
    return {
      family: 'bittensor',
      familyLabel: 'Bittensor (Substrate)',
      costOrder: 2,
      wallet: 'Bittensor Wallet or Polkadot.js Substrate signer',
      gasAsset: 'TAO',
      gasTier: '<$0.10/tx (TAO)',
      setupGas: 'under $0.10 in native TAO',
      actionGas: 'under $0.05 in TAO per subnet stake',
      minCap: 150,
      cadence: 'periodic subnet yield check (no churn)',
      cleanup: 'unstake subnet alpha back to root TAO watching pool slippage',
    };
  }
  if (chain === 'Algorand') {
    return {
      family: 'algorand',
      familyLabel: 'Algorand (AVM)',
      costOrder: 1,
      wallet: 'Pera or Defly Algorand wallet',
      gasAsset: 'ALGO',
      gasTier: '<$0.01/tx (0.001 ALGO)',
      setupGas: '0.001 ALGO/tx plus 0.1 ALGO ASA opt-in reserve',
      actionGas: '0.001 ALGO per transaction',
      minCap: 100,
      cadence: 'bi-weekly organic check-in',
      cleanup: 'opt out of unused ASAs to reclaim 0.1 ALGO minimum balance locks',
    };
  }
  if (COSMOS_IBC_CHAINS.has(chain)) {
    return {
      family: 'cosmos_ibc',
      familyLabel: 'Cosmos / IBC',
      costOrder: 1,
      wallet: 'Keplr or Leap IBC wallet',
      gasAsset: chain === 'Noble' ? 'native IBC fee token' : 'native chain gas token',
      gasTier: '<$0.05/tx (IBC)',
      setupGas: 'under $0.05 in native IBC gas',
      actionGas: 'under $0.03 per IBC tx',
      minCap: 150,
      cadence: 'bi-weekly organic position review',
      cleanup: 'send assets back over canonical IBC channels (no token approvals to revoke)',
    };
  }
  if (XRPL_STELLAR_CHAINS.has(chain)) {
    const isXrpl = chain === 'Ripple';
    return {
      family: 'xrpl_stellar',
      familyLabel: isXrpl ? 'XRPL' : 'Stellar',
      costOrder: 2,
      wallet: isXrpl ? 'Xaman (XRPL) wallet' : 'Freighter (Stellar) wallet',
      gasAsset: isXrpl ? 'XRP' : 'XLM',
      gasTier: isXrpl ? '<$0.02/tx + XRP reserve' : '<$0.02/tx + XLM reserve',
      setupGas: isXrpl ? 'fractions of 1 XRP plus trustline reserve' : 'fractions of 1 XLM plus trustline reserve',
      actionGas: 'under $0.02 per ledger operation',
      minCap: 150,
      cadence: 'deposit-and-hold across epochs',
      cleanup: 'zero out issued balances and remove unused trustlines to free base reserve',
    };
  }
  if (ALT_VM_CHAINS.has(chain)) {
    return {
      family: 'alt_vm',
      familyLabel: `${chain} (Alt-VM)`,
      costOrder: 2,
      wallet: `${chain}-native wallet`,
      gasAsset: `${chain} native gas`,
      gasTier: '$0.02–$1.00/tx',
      setupGas: '$0.05–$1.00 in native chain gas/energy',
      actionGas: '$0.02–$0.50 per native call',
      minCap: 150,
      cadence: 'bi-weekly organic check-in',
      cleanup: 'clear active session keys or contract permissions after unwinding',
    };
  }
  if (chain === 'Ethereum') {
    return {
      family: 'eth_l1',
      familyLabel: 'Ethereum L1 Only',
      costOrder: 9,
      wallet: 'EVM wallet (Rabby or hardware signer)',
      gasAsset: 'ETH',
      gasTier: '$4–$15/tx (L1 gas)',
      setupGas: '$8–$25 in ETH L1 gas (batch during <15 gwei)',
      actionGas: 'no weekly churn; hold to keep gas < 2% of capital',
      minCap: 500,
      cadence: 'deposit-and-hold (no weekly L1 churn)',
      cleanup: 'execute exact-amount withdrawals and revoke ERC-20 allowances on exit',
    };
  }
  return {
    family: 'evm_l2',
    familyLabel: 'EVM L2 / Low-Gas Alt-L1',
    costOrder: 0,
    wallet: 'EVM wallet (Rabby or MetaMask)',
    gasAsset: `${chain} native gas`,
    gasTier: '$0.02–$0.25/tx',
    setupGas: '$0.05–$0.50 in native L2/alt-L1 gas',
    actionGas: 'under $0.25 per organic action',
    minCap: 150,
    cadence: 'bi-weekly organic rebalance',
    cleanup: 'verify zero open debt and revoke unlimited ERC-20 token approvals on exit',
  };
}

/** Select the lowest-cost deterministic execution chain across `chains`. */
export function selectBestChain(chains: readonly string[]): { chain: string; profile: ChainProfile } {
  if (chains.length === 0) {
    return { chain: 'Ethereum', profile: classifySingleChain('Ethereum') };
  }
  const ranked = chains.map((chain) => {
    const profile = classifySingleChain(chain);
    const l2Bonus = LOW_GAS_EVM_ORDER.indexOf(chain);
    const priority = l2Bonus >= 0 ? l2Bonus : 1000;
    return { chain, profile, priority };
  });
  ranked.sort(
    (a, b) =>
      a.profile.costOrder - b.profile.costOrder ||
      a.priority - b.priority ||
      (a.chain < b.chain ? -1 : a.chain > b.chain ? 1 : 0),
  );
  return { chain: ranked[0]!.chain, profile: ranked[0]!.profile };
}

function sizeCapital(tvlUsd: number, profile: ChainProfile): number {
  const base =
    tvlUsd >= 1_000_000_000 ? 250 : tvlUsd >= 200_000_000 ? 200 : tvlUsd >= 50_000_000 ? 150 : 100;
  return Math.max(profile.minCap, base);
}

function holdDaysFor(ageDays: number | null, profile: ChainProfile): number {
  if (profile.family === 'eth_l1') return 60;
  if (ageDays === null) return 45;
  if (ageDays < 180) return 60;
  if (ageDays < 365) return 45;
  return 30;
}

function coreActionText(p: SnapshotProtocol, chain: string, profile: ChainProfile, cap: number): string {
  const cat = (p.category ?? '').toLowerCase();
  const name = p.name;

  if (profile.family === 'bitcoin') {
    return `Open a balanced native BTC Lightning channel or liquidity node peer with ${name} ($${cap}+ in BTC) instead of bridged wrappers.`;
  }
  if (profile.family === 'bittensor') {
    return `Stake $${cap}+ of native TAO into ${name}'s dTAO subnet liquidity pool on Bittensor and monitor alpha exchange ratio.`;
  }
  if (profile.family === 'algorand') {
    if (cat.includes('rwa')) {
      return `Complete issuer KYC/eligibility verification and acquire $${cap}+ of fractional RWA tokens on ${name} (${chain}) using ALGO/native ASA rails.`;
    }
    return `Opt into the protocol ASA and delegate or deposit $${cap}+ in native ALGO through ${name} on ${chain}.`;
  }
  if (profile.family === 'cosmos_ibc') {
    return `Transfer $${cap}+ via canonical IBC onto ${chain} and supply native Cosmos liquidity into ${name}'s core pool.`;
  }
  if (profile.family === 'xrpl_stellar') {
    const asset = chain === 'Ripple' ? 'XRP' : 'XLM';
    return `Set the required trustline on ${chain} and supply $${cap}+ of ${asset} or native ledger liquidity into ${name}.`;
  }
  if (cat.includes('insurance')) {
    return `Supply $${cap}+ of capital to ${name}'s underwriting / cover pool on ${chain} (avoid buying cover unless hedging, as premiums are sunk costs).`;
  }
  if (cat.includes('curator') || cat.includes('allocator') || cat.includes('aggregator') || cat.includes('cdp manager') || cat.includes('indexes')) {
    return `Deposit $${cap}+ into a ${name} curated vault on ${chain} receiving liquid vault shares; compare curator fee % and utilization.`;
  }
  if (cat.includes('lend') || cat.includes('cdp') || cat.includes('collateral')) {
    return `Supply $${cap}+ of collateral to ${name} on ${chain}; optionally borrow conservatively (<40% LTV) only if positive net carry justifies risk.`;
  }
  if (cat.includes('dex') || cat.includes('liquidity manager')) {
    return `Provide $${cap}+ of balanced liquidity in a deep major pair on ${name} (${chain}) to earn organic swap fees without excessive narrow-range IL.`;
  }
  if (cat.includes('derivative') || cat.includes('prediction') || cat.includes('option') || cat.includes('otc') || cat.includes('synthetic')) {
    return `Deposit $${cap}+ of margin on ${name} (${chain}) and place small hedged limit orders; keep turnover modest because fees/funding are sunk costs.`;
  }
  if (cat.includes('basis') || cat.includes('yield') || cat.includes('farm') || cat.includes('governance') || cat === 'dor') {
    return `Mint or stake $${cap}+ of ${name}'s yield-bearing or delta-neutral receipt position on ${chain} and track epoch accrual.`;
  }
  if (cat.includes('rwa') || cat.includes('cedefi') || cat.includes('crypto card') || cat.includes('payments')) {
    return `Verify KYC/accreditation eligibility first, then hold $${cap}+ in ${name}'s permitted yield or payment rail on ${chain}.`;
  }
  if (cat.includes('restak') || cat.includes('staking') || cat.includes('chain') || cat.includes('privacy')) {
    return `Delegate or stake $${cap}+ of native ${chain} assets through ${name} and track validator commission and unbonding terms.`;
  }
  return `Deploy $${cap}+ of native ${chain} assets into ${name}'s primary liquidity module on ${chain}.`;
}

function riskDisclosureText(p: SnapshotProtocol, profile: ChainProfile, flags: readonly string[], siblingSymbol: string | null): string {
  const cat = (p.category ?? '').toLowerCase();
  const parts: string[] = [];

  if (cat.includes('insurance')) {
    parts.push('Underwriting capital faces claim-payout slashing and lockup queues.');
  } else if (cat.includes('rwa') || cat.includes('cedefi') || cat.includes('crypto card')) {
    parts.push('Assess off-chain issuer custody, legal/KYC gating, and counterparty solvency.');
  } else if (cat.includes('derivative') || cat.includes('prediction') || cat.includes('option')) {
    parts.push('Monitor funding rates, spread slippage, and liquidation buffers (fees are non-recoverable).');
  } else if (cat.includes('basis') || cat.includes('yield') || cat.includes('curator') || cat.includes('allocator')) {
    parts.push('Check curator strategy exposure, basis-hedge inversion, and withdrawal queue cooldowns.');
  } else if (cat.includes('restak') || cat.includes('staking')) {
    parts.push('Verify validator slashing conditions and 7–21 day unbonding periods.');
  } else {
    parts.push('Monitor smart-contract audit status, oracle dependencies, and pool utilization.');
  }

  if (siblingSymbol !== null) {
    parts.push(`Note tokenized sibling ${siblingSymbol} already trades.`);
  }
  if (flags.some((f) => f.includes('Bitcoin P2P'))) {
    parts.push('Bitcoin base P2P routing is utility infra unlikely to issue a token.');
  }
  if (flags.some((f) => f.includes('Missing listed_at'))) {
    parts.push('DefiLlama lacks listed_at; verify domain history independently.');
  }
  return parts.join(' ');
}

function formatStep(step: FarmStep): string {
  let s = `${step.action} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Verify official protocol documentation.`;
  return s;
}

export function buildFarmPlan(
  p: SnapshotProtocol,
  ageDays: number | null,
  flags: readonly string[],
  siblingSymbol: string | null,
): { meta: FarmMeta; steps: string[]; structured: FarmStep[] } {
  const { chain, profile } = selectBestChain(p.chains);
  const capital = sizeCapital(p.tvl_usd, profile);
  const holdDays = holdDaysFor(ageDays, profile);
  const multiChainNote =
    p.chains.length > 1 && p.chains.includes('Ethereum') && profile.family !== 'eth_l1'
      ? ` Auto-routed to ${chain} (lowest-gas among ${p.chains.length} chains); watch bridge risk if transferring from Ethereum.`
      : '';

  const epistemicTier = flags.some((f) => f.includes('Bitcoin P2P') || f.includes('Tokenized Sibling'))
    ? 'Organic Utility (Low Token Probability)'
    : 'Potential Pre-Token Participation (Unconfirmed)';

  const riskTags: string[] = [];
  const cat = (p.category ?? '').toLowerCase();
  if (profile.family === 'eth_l1') riskTags.push('High L1 Gas');
  if (cat.includes('insurance')) riskTags.push('Underwriting Slashing');
  if (cat.includes('cedefi') || cat.includes('rwa') || cat.includes('crypto card')) riskTags.push('Custody / KYC');
  if (cat.includes('derivative') || cat.includes('prediction') || cat.includes('option')) riskTags.push('Sunk Trading Fees');
  if (cat.includes('restak') || cat.includes('staking')) riskTags.push('Unbonding Queue');
  if (siblingSymbol !== null) riskTags.push(`Sibling ${siblingSymbol}`);
  if (riskTags.length === 0) riskTags.push('Smart-Contract Risk');

  const structured: FarmStep[] = [
    {
      action: `Prepare a dedicated ${profile.wallet} on ${chain} and verify ${p.name}'s official domain and docs (no airdrop is confirmed).`,
      cost: profile.setupGas,
      time: '10 minutes',
    },
    {
      action: `Fund at least $${capital} in native ${chain} assets with a small ${profile.gasAsset} fee buffer.${multiChainNote}`,
      cost: `$${capital}+ principal + ${profile.setupGas}`,
      time: '10 minutes',
    },
    {
      action: coreActionText(p, chain, profile, capital),
      cost: `$${capital} deployed + ${profile.setupGas}`,
      time: '15 minutes',
    },
    {
      action: `Hold across ${holdDays} days with ${profile.cadence}; avoid pointless micro-churn that destroys net yield.`,
      cost: profile.actionGas,
      time: `${holdDays} days`,
    },
    {
      action: riskDisclosureText(p, profile, flags, siblingSymbol),
      cost: 'zero extra fee for monitoring',
      time: '5 minutes weekly',
    },
    {
      action: `Before exiting, check withdrawal queues, ${profile.cleanup}, and log tx hashes (verify any points page only via official channels).`,
      cost: profile.family === 'eth_l1' ? '$4–$12 L1 exit gas' : profile.actionGas,
      time: '10 minutes',
    },
  ];

  return {
    meta: {
      best_chain: chain,
      chain_family: profile.family,
      family_label: profile.familyLabel,
      gas_tier: profile.gasTier,
      min_capital_usd: capital,
      hold_days: holdDays,
      cadence: profile.cadence,
      risk_tags: riskTags,
      epistemic_tier: epistemicTier,
    },
    steps: structured.map(formatStep),
    structured,
  };
}
