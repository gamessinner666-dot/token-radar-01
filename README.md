# Sonar (`sonar-2`)

[![Token Radar 01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![Rank](https://make.fun/badge/token-radar-01/gamessinner666-dot/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01)
[![Reward](https://make.fun/badge/token-radar-01/gamessinner666-dot/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01)

Deterministic institutional DeFi pre-token valuation radar and excess-after-carry farming terminal built for [Token Radar 01](https://make.fun/bounty/token-radar-01) on Node.js 22+ (erasable TypeScript, standard library only, zero network calls).

## Architecture (`sonar-2`)

- **`lib/comparables.ts`** — Clean tokenized-peer universe (`98` entities, `mcap_usd > 0`), brand-verified symbol consolidation, 25-iteration Huber IRLS log-TVL elasticity (`ref = $100M`, `delta = 1.35`), category ridge shrinkage (`k = 64`), and L2-regularized Newton-Raphson logistic token-odds solver (`lambda = 1.5`) with `pre2021Legacy` (`listed_at === null`) and 6-sector dummies.
- **`lib/discovery.ts`** — Complete MECE `758`-protocol universe ledger (`40` mandatory watchlist + `17` extended `>= $50M` + `128` early `>= $5M` = `185` ranked opportunities, `98` live comparables, `318` excluded tokenized, and `157` documented set-aside exclusions across `44` bridges/chains, `53` LST/BTC, `60` sibling/CEX/versioned) plus `427`-protocol logistic cohort.
- **`lib/model.ts`** — Monotonic two-stage conditional `sonar-2` engine: Stage 1 (`Value if Launched`, 4-way OOS: LOO `x3.104`, 10F CV `x3.078`, chronological Walk-Forward `x2.672`, Size-Split `>=$50M` `x5.520`, Empirical-Bayes `m=6` per-sector conformal scales `RWA x0.698 .. Credit x1.344`) × Stage 2 (`Conditional Launch Odds`, 10F CV Brier `0.193`, Walk-Forward Brier `0.234`, structural `pMax` at median 7d growth so rising 7d momentum strictly increases survival odds; `beta_chains = 0`; 20× seeded shuffled-7d placebos), `200` seeded bootstrap refits, and FNV-1a checksum `660b243f`.
- **`lib/farming.ts`** — Excess-after-2%-carry 10-family Chain-Architecture × Category-Action ticket engine (`10%` modelled drop share, `excess_after_carry = drop - fees - 2% carry`, `FARM` iff `excess > 0 && excess/h >= $25`, -> `56 FARM / 95 MARGINAL / 34 SKIP`) flagging whale-diluted pools as `SKIP`, break-even drop share & odds, `-16.7%` P05 TVL exit rule, and `8` costed/timed operator steps summing strictly to `total_minutes`.
- **`dashboard/`** — Abyssal Marine Dark Command Deck (`64,246 B` across `00_methodology.md`, `01_model.js`, `02_app.js`, `03_styles.css`, `index.html`; `maxLine <= 137`; zero external URLs; zero `<svg xmlns>`; `0` dossier truncation across `64,694 B` text; `3` screenshots `1-board.jpg`, `2-detail.jpg`, `3-filtered.jpg`; `993,707 B` `dossier.json`) with plain-English 6-KPI cover, 4-column OOS + Curve grid, `farmPlan()` self-contained 8-step generator in `01_model.js`, expandable inline `#open=<slug>` farm drawer + `All in:` totals, `4%` T-bill Benchmarks panel, `185/185` refit parity (`verifyBoardParity()`), and `#19 Axis` Detail Dossier (`#p=axis`).

## Running Locally

```bash
node main.ts --input ../competition-kit/token-radar-01-kit/input/snapshot.json --output out
node --test tests/regression.test.ts
node scripts/capture-screenshots.mjs
```
