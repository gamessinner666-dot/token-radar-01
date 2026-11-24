# Token Radar 01 (`radar-3`)

[![Token Radar 01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![Rank](https://make.fun/badge/token-radar-01/gamessinner666-dot/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01)
[![Reward](https://make.fun/badge/token-radar-01/gamessinner666-dot/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01)

Deterministic institutional DeFi pre-token valuation radar and net-of-fees farming intelligence terminal built for [Token Radar 01](https://make.fun/bounty/token-radar-01) on Node.js 22+ (erasable TypeScript, standard library only, zero network calls).

## Architecture (`radar-3`)

- **`lib/comparables.ts`** — Clean tokenized-peer universe (`98` entities, `mcap_usd > 0`), brand-verified symbol consolidation, 25-iteration Huber IRLS log-TVL elasticity (`ref = $100M`, `delta = 1.35`, `beta_tvl = 0.4941`), category ridge shrinkage (`k = 64`), and L2-regularized Newton-Raphson logistic token-odds solver (`lambda = 1.5`).
- **`lib/discovery.ts`** — Complete MECE `758`-protocol universe ledger (`40` mandatory watchlist + `17` `>= $1B` large-cap + `128` early = `185` ranked opportunities, `98` live comparables, `318` excluded tokenized, `44` bridges/chains, `53` LST/BTC, `60` sibling/CEX/versioned) plus standalone `427`-protocol logistic training cohort.
- **`lib/model.ts`** — Two-stage conditional `radar-3` engine: Stage 1 (`Value if Launched`, LOO median error `x3.104`, chronological Walk-Forward `x2.672`, empirical `50%`/`80%` residual intervals) × Stage 2 (`Conditional Launch Odds`, 10-fold CV Brier `0.213`, Walk-Forward Brier `0.225` vs `0.343` base, chain-count tested and explicitly rejected via `beta_chains = 0`), `100` seeded bootstrap rank bands (`rank_low..rank_high`), and FNV-1a checksum.
- **`lib/farming.ts`** — Quantitative net-of-fees 10-family Chain-Architecture × Category-Action ticket engine computing `planDepositUsd`, itemized setup/weekly/exit gas fees, hands-on time, `4%` T-bill opportunity hurdle, `FARM / MARGINAL / SKIP` verdicts (`$20/h` hurdle), break-even drop share & launch odds, `-17.0%` P05 TVL exit trigger, and `8` costed/timed execution steps.
- **`dashboard/`** — Self-contained Obsidian Terminal (`< 54,000` B, zero external URLs, zero `<svg xmlns>`), featuring 6 live browser integrity checks across all `185` rows, dual Stage 1 + Stage 2 blind OOS ablation tables, inline log-log MCap vs TVL SVG scatter plot, interactive Ticket scenario controls, full-width `1440×900` Detail Dossier, and exact Node ↔ browser JS parity.

## Running Locally

```bash
node main.ts --input ../competition-kit/token-radar-01-kit/input/snapshot.json --output out
node --test tests/regression.test.ts
node scripts/capture-screenshots.mjs
```
