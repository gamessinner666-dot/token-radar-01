# Sonar (`sonar-1`) — Methodology & Audit Guide

- **MECE (`758/758`, `classifyProtocolUniverse()`):** `Board (185)` (`40` WL `>=$50M` + `17` EXT `>=$50M` + `128` Early
  `$5M–$50M`), `Comps (98)` (`mcap_usd>0`), `Tokenized (318)`, `Set Aside (157)` (`44` bridges, `53` LST/BTC, `60`
  CEX/versioned/sibling).
- **Stage 1 (`fitStage1Huber()`, `runValueAblation()`):** 25-iter Huber IRLS (`$100M`, `delta=1.35`) + ridge (`k=64`) on
  `98` comps: `LOO x3.104`, `10F x3.078`, `WF x2.672`, `Size >=$50M x5.520` vs flat (`x5.219`/`x5.156`) & `20x
  shuffled` (`x3.179`/`x3.076`). Sector conformal scales (`m=6`: RWA `x0.70` to Credit `x1.34`).
- **Stage 2 (`fitStage2Logistic()`, `runOddsAblation()`):** L2 logit (`lambda=1.5`, `427` peers): `10F 0.193`/`71.2%`,
  `WF 0.234`/`68.3%`; `pMax` at median 7d keeps odds monotonic in 7d growth. Siblings take `0.50x`.
- **Excess Carry (`buildFarmPlan()`):** 10-family router; `excess = drop - fees - 2% carry` (`FARM >=$25/h`, `MARG >$0`,
  `SKIP <=$0` -> `56/95/34`), `-16.7%` P05 exit, `8` steps.
- **Parity (`verifyBoardParity()`):** Live refits Stage 1/2 from raw data, verifying `185/185` rows & CRC.
