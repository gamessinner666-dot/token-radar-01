# Token Radar v6 (`radar-6`) — Methodology

- **MECE (`758/758`):** >=$5M TVL split into Board (`185`: `40` WL, `17` >=$1B, `128` Early), Live Comps (`98`),
  Tokenized (`318`), and Set Aside (`157`: `44` bridges, `53` LST/BTC, `60` CEX/ver/sib).
- **Stage 1 (`fitStage1Huber()`, `runValueAblation()`):** 25-iter Huber (`delta=1.35`) + ridge (`k=64`) on `98` comps:
  `LOO x3.104`, `WF x2.672` (`50%/51%` <=3x) vs flat (`x5.219`/`x5.156`) and `20x shuffled` (`x3.179`/`x3.076`).
- **Stage 2 (`fitStage2Logistic()`, `runOddsAblation()`):** L2 logit (`lambda=1.5`, `427` peers): `log(age+0.15)`,
  `pre2021Legacy` (`listed_at===null`), 6 sectors, `log(TVL/$50M)`, `tanh` 7d (`10F 0.193`, `71%`; `WF 0.234`, `68%`).
- **Valuation & Farm (`evaluateProtocol()`, `repriceFarmScenario()`):** `round(if_launched * odds)`, conformal P25-75/10-90,
  `200x` bootstrap ranks & s.e.; 10 chain families, `2%` carry, `$25/h`, `-16.7%` P05 TVL exit, `8` steps.
- **Parity (`verifyBoardParity()`):** Browser refit confirms all `185` rows, ranks, sum, and CRC.
