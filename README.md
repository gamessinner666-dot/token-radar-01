# Token Radar 01 (`radar-5`)

[![Token Radar 01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![Rank](https://make.fun/badge/token-radar-01/gamessinner666-dot/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01)
[![Reward](https://make.fun/badge/token-radar-01/gamessinner666-dot/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01)

Deterministic institutional DeFi pre-token valuation radar and net-of-fees farming terminal built for [Token Radar 01](https://make.fun/bounty/token-radar-01) on Node.js 22+ (erasable TypeScript, standard library only, zero network calls).

## Architecture (`radar-5`)

- **`lib/comparables.ts`** — Clean tokenized-peer universe (`98` entities, `mcap_usd > 0`), brand-verified symbol consolidation, 25-iteration Huber IRLS log-TVL elasticity (`ref = $100M`, `delta = 1.35`), category ridge shrinkage (`k = 64`), and L2-regularized Newton-Raphson logistic token-odds solver (`lambda = 1.5`) with `pre2021Legacy` (`listed_at === null`, where `51/58` trade) and 6-sector dummies.
- **`lib/discovery.ts`** — Complete MECE `758`-protocol universe ledger (`40` mandatory watchlist + `17` `>= $1B` large-cap + `128` early = `185` ranked opportunities, `98` live comparables, `318` excluded tokenized, and `157` explicitly documented set-aside protocols across `44` bridges/chains, `53` LST/BTC, `60` sibling/CEX/versioned) plus `427`-protocol standalone logistic cohort.
- **`lib/model.ts`** — Two-stage conditional `radar-5` engine: Stage 1 (`Value if Launched`, LOO median error `x3.104`, chronological Walk-Forward `x2.672`, empirical `50%`/`80%` residual intervals) × Stage 2 (`Conditional Launch Odds`, 10F CV Brier `0.193` / `71.2%` acc, Walk-Forward Brier `0.234` / `68.3%` acc vs `0.343` base; chain count tested out-of-sample and explicitly rejected via `beta_chains = 0`), `200` seeded bootstrap refits for `rank_low..rank_high` and coefficient `± s.e.`, FNV-1a checksum `bfde1cee`, and raw comp/peer + set-aside arrays for live browser refitting.
- **`lib/farming.ts`** — Quantitative net-of-fees 10-family Chain-Architecture × Category-Action ticket engine (`10%` modelled drop share, `$25/h` hurdle, `2%` carry spread -> `88 FARM / 96 MARGINAL / 1 SKIP`) producing break-even drop share & odds, `-16.7%` P05 TVL exit rule, and `8` costed/timed operator steps summing strictly to `total_minutes`.
- **`dashboard/`** — Clean multi-line Obsidian Terminal (`60,425 B` across `00_methodology.md`, `index.html`, `app.css`, `model.js`, `app.js`, every line `<= 400` chars, zero external URLs, zero `<svg xmlns>`, `0` dossier truncation, `803,562 B` total `dossier.json`) with live in-browser Huber IRLS + Logistic refitting (`fitStage1Huber()`, `fitStage2Logistic()`), live Stage 1 & 2 blind LOO/WF ablations (`runValueAblation()`, `runOddsAblation()`), 6 live parity checks (`verifyBoardParity()`), `Set Aside (157)` tab, inline row expansion (`#exp=...`) showing box-by-box equations + 8 costed farm steps, and full-width Detail Dossier.

## Running Locally

```bash
node main.ts --input ../competition-kit/token-radar-01-kit/input/snapshot.json --output out
node --test tests/regression.test.ts
node scripts/capture-screenshots.mjs
```
