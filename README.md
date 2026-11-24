# Token Radar 01 (`radar-2`)

[![Token Radar 01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![Rank](https://make.fun/badge/token-radar-01/gamessinner666-dot/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01)
[![Reward](https://make.fun/badge/token-radar-01/gamessinner666-dot/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01)

Deterministic institutional DeFi pre-token valuation radar and chain-aware farming intelligence terminal built for the [Token Radar 01](https://make.fun/bounty/token-radar-01) bounty on Node.js 22 (erasable TypeScript, standard library only, zero network dependencies).

## Architecture

- **`lib/comparables.ts`** — Clean tokenized-peer universe (`mcap_usd > 0`), 6-sector taxonomy, brand-verified same-sector symbol aggregation (`AAVE`, `DYDX`, `SUSHI`, `QI`, `HDX`, `QUICK` while isolating `PUMP`/`SWAP`/`MET`/`UP` ticker collisions), and 25-iteration Huber IRLS fixed-effects TVL elasticity ($\beta \approx 0.735$–$0.743$).
- **`lib/discovery.ts`** — 3-tier pre-token funnel (`40` mandatory watchlist + `17` clean `>= $50M` large-cap expansion + `128` clean `$5M–$50M` early discovery = `185` rows) with strict wrapper/bridge/CEX/versioned/tokenized-sibling hygiene.
- **`lib/model.ts`** — `radar-2` Empirical-Bayes peer multiples ($k_s=5, k_c=5$), category-relative $\tanh$ 7-day growth centering, concave Lindy maturity (neutral `1.00` for missing `listed_at`), IQR Low/Base/High scenario bands, 0–100 Confidence Score, and snapshot LOOCV verification.
- **`lib/farming.ts`** — 10-family Chain-Architecture × Category-Action generator covering all 115 board chains with automatic lowest-gas multi-chain routing, positive-EV Ethereum L1 thresholds, native non-EVM mechanics (`Bitcoin`, `Bittensor`, `Algorand`, `Noble`, `Ripple`, `Solana`, Move), and strict no-airdrop-promise disclosures.
- **`dashboard/`** — Self-contained Institutional DeFi Research Terminal (`< 53.5 KB` total source, zero external URLs, 100% live browser parity with `radar-2`, inline HTML5 SVG charts, Calibration Lab, and non-clipped Detail Drawer).

## Running Locally

```bash
MAKEFUN_OUTPUT_DIR=out node main.ts --input ../competition-kit/token-radar-01-kit/input/snapshot.json
node --test tests/regression.test.ts
```
