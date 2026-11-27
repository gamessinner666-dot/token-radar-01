# Sonar (`sonar-3`)

[![Token Radar 01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![Rank](https://make.fun/badge/token-radar-01/gamessinner666-dot/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01)
[![Reward](https://make.fun/badge/token-radar-01/gamessinner666-dot/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01)

Deterministic institutional DeFi pre-token valuation radar and excess-after-carry farming terminal built for [Token Radar 01](https://make.fun/bounty/token-radar-01) on Node.js 22+ (erasable TypeScript, standard library only, zero network calls).

## Architecture (`sonar-3`)

- **`lib/comparables.ts`** — Clean tokenized-peer universe (`98` entities, `mcap_usd > 0`), brand-verified symbol consolidation, 25-iteration Huber IRLS log-TVL elasticity (`ref = $100M`, `delta = 1.35`), category ridge shrinkage (`k = 64`), and L2-regularized Newton-Raphson logistic token-odds solver (`lambda = 1.5`) using `ln(1 + age_years)`, `pre2021Legacy` (`listed_at === null`), and in-fold Empirical-Bayes shrunk category token shares (`k = 6`).
- **`lib/discovery.ts`** — Complete MECE `758`-protocol universe ledger (`40` mandatory watchlist + `20` extended `>= $50M` + `138` early `>= $5M` = `198` ranked opportunities matching official house exclusions, `98` live comparables, `318` other tokenized, and `144` documented set-aside exclusions across `43` bridges, `48` LST/BTC, `53` CEX/versioned) plus `442`-protocol logistic cohort.
- **`lib/model.ts`** — Monotonic two-stage conditional `sonar-3` engine: Stage 1 (`Value if Launched`, 4-way OOS: LOO `×3.104`, 10F CV `×3.078`, chronological Walk-Forward `×2.672`, Size-Split `>=$50M` `×5.520`, Empirical-Bayes `m=6` per-sector conformal scales `RWA ×0.698 .. Credit ×1.344`) × Stage 2 (`Conditional Launch Odds`, `n=442`, 10F CV Brier `0.191 / 71.7% Acc`, Walk-Forward Brier `0.208 / 64.2% Acc` vs `0.350` base, `100%` coefficient sign stability across `200` bootstrap refits, empirical 5-bucket age record table `0–1y 31% .. 3+y 86% .. Legacy 88%`, `0.50×` tokenized-sibling haircut, 20× seeded shuffled-7d placebos), and FNV-1a checksum `fc39d526`.
- **`lib/farming.ts`** — Interactive carry-adjusted (`0% | 2% | 4%`) 10-family Chain-Architecture × Category-Action ticket engine (`10%` modelled drop share, `excess_after_carry = drop - fees - carry`, `FARM` iff `excess > 0 && excess/h >= $25`, exact `min_ticket_usd` profitability floor -> `66 FARM / 100 MARGINAL / 32 SKIP`), `-16.7%` P05 TVL exit rule, and `9` full-sentence operator steps (`SETUP..CLAIM..BUDGET`) summing strictly to `total_minutes`.
- **`dashboard/`** — Abyssal Marine Dark Command Deck (`<= 64.5 KB` source, `maxLine <= 135`, zero external URLs, zero `<svg xmlns>`, `0` dossier truncation, `3` screenshots `1-board.jpg`, `2-detail.jpg`, `3-filtered.jpg`) with 6-KPI + top-3 FARM cover, 4-column Evidence + Peer Age Record grid, interactive `Carry: 0% | 2% | 4%` toggle, `198/198` live browser refit parity (`verifyBoardParity()`), balanced `#19` / `#23 Axis` Detail Dossier (`#p=axis`), and `#1 Vault Street` inline 9-step drawer (`3-filtered.jpg`).

## Running Locally

```bash
node main.ts --input ../kit-v50/token-radar-01-kit/input/snapshot.json --output out
node --test tests/regression.test.ts
node scripts/capture-screenshots.mjs
```
