# Token Radar 01 (`radar-4`)

[![Token Radar 01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![Rank](https://make.fun/badge/token-radar-01/gamessinner666-dot/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01)
[![Reward](https://make.fun/badge/token-radar-01/gamessinner666-dot/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01)

Deterministic institutional DeFi pre-token valuation radar and net-of-fees farming terminal built for [Token Radar 01](https://make.fun/bounty/token-radar-01) on Node.js 22+ (erasable TypeScript, standard library only, zero network calls).

## Architecture (`radar-4`)

- **`lib/comparables.ts`** — Clean tokenized-peer universe (`98` entities, `mcap_usd > 0`), brand-verified symbol consolidation, 25-iteration Huber IRLS log-TVL elasticity (`ref = $100M`, `delta = 1.35`, `beta_tvl = 0.4941`), category ridge shrinkage (`k = 64`), and L2-regularized Newton-Raphson logistic token-odds solver (`lambda = 1.5`).
- **`lib/discovery.ts`** — Complete MECE `758`-protocol universe ledger (`40` mandatory watchlist + `17` `>= $1B` large-cap + `128` early = `185` ranked opportunities, `98` live comparables, `318` excluded tokenized, `44` bridges/chains, `53` LST/BTC, `60` sibling/CEX/versioned) plus `427`-protocol standalone logistic cohort.
- **`lib/model.ts`** — Two-stage conditional `radar-4` engine: Stage 1 (`Value if Launched`, LOO median error `x3.104`, chronological Walk-Forward `x2.672`, empirical `50%`/`80%` residual intervals) × Stage 2 (`Conditional Launch Odds`, 10F CV Brier `0.213`, Walk-Forward Brier `0.225` vs `0.343` base; category tokenization share and chain count tested out-of-sample and explicitly rejected via `beta_chains = 0`), `200` seeded bootstrap refits for `rank_low..rank_high` and coefficient `± s.e.`, FNV-1a checksum `eb4b13d5`, and raw comp/peer snapshot arrays for live browser refitting.
- **`lib/farming.ts`** — Quantitative net-of-fees 10-family Chain-Architecture × Category-Action ticket engine (`10%` modelled drop share, `$25/h` hurdle, `4%` T-bill capital charge) producing `FARM / MARGINAL / SKIP` verdicts, break-even drop share & odds, `-16.7%` P05 TVL exit rule, and `8` costed/timed operator steps summing strictly to `total_minutes`.
- **`dashboard/`** — Self-contained Obsidian Terminal (`59,768 B` across `00_methodology.md`, `index.html`, `app.css`, `model.js`, `app.js`, zero external URLs, zero `<svg xmlns>`, `0` dossier truncation) with live in-browser Huber IRLS + Logistic refitting (`fitStage1Huber()`, `fitStage2Logistic()`), 6 live parity checks (`verifyBoardParity()`), dual Stage 1 + Stage 2 ablation tables, bootstrap s.e. + band honesty table, inline log-log SVG scatter plot, interactive scenario controls, CSV/JSON export, and full-width `1440×1280` Detail Dossier.

## Running Locally

```bash
node main.ts --input ../competition-kit/token-radar-01-kit/input/snapshot.json --output out
node --test tests/regression.test.ts
node scripts/capture-screenshots.mjs
```
