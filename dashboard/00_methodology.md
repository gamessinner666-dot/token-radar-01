# Token Radar v7 (`radar-7`) — Methodology

- **MECE (`758/758`):** >=$5M TVL split into `Board (185)` (`40` WL >=$50M + `17` EXT >=$50M + `128` Early $5M–$50M),
  `Live Comps (98)`, `Tokenized (318)`, and `Set Aside (157)` via `classifyProtocolUniverse()`.
- **Stage 1 (`fitStage1Huber()`, `runValueAblation()`):** 25-iter Huber (`$100M`, `delta=1.35`) + ridge (`k=64`) on `98`
  comps: `LOO x3.104`, `WF x2.672` (`50%/51%` <=3x) vs flat (`x5.219`/`x5.156`) & `20x shuffled` (`x3.179`/`x3.076`).
- **Stage 2 (`fitStage2Logistic()`, `runOddsAblation()`):** L2 logit (`lambda=1.5`, `427` peers): `log(age+0.15)`, `legacy`,
  6 sectors, `log(TVL/$50M)`, `tanh(7d)` (`10F 0.193` / `71.2%`; `WF 0.234` / `68.3%`). Survival puts `pMax` at median 7d.
- **Farm & Parity (`buildFarmPlan()`, `verifyBoardParity()`):** 10-family router, `$25/h`, `2%` carry, `-16.7%` P05 TVL exit.
