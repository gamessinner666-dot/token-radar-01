# Token Radar v5 (`radar-5`) — Guide

- **MECE (`758/758`):** >=$5M TVL -> Board (`185`: `40` WL, `17` LC, `128` Early), Comps (`98`), Tok (`318`), Aside (`157`: `44` bridge, `53` LST/BTC, `60` CEX/ver/sib).
- **Stage 1 (`fitStage1Huber()`, `runValueAblation()`):** Huber (`delta=1.35`) + ridge (`k=64`) on `98` comps: `LOO x3.104`, `WF x2.672` vs flat (`x5.219`/`x5.156`).
- **Stage 2 (`fitStage2Logistic()`, `runOddsAblation()`):** L2 logit (`1.5`) on `427` peers: `log(age+0.15)`, `pre2021Legacy` (51/58), 6 sectors, `log(TVL)`, `tanh` 7d (`10F 0.193`, `71%`; `WF 0.234`, `68%`). Chains dropped; siblings `0.50x`.
- **Farm (`evaluateProtocol()`, `buildFarmTicket()`):** `P25-75`/`P10-90`, `200` bootstrap ranks, 10 chain families, `2%` carry, `$25/h`, `-16.7%` P05 TVL exit, `8` timed steps.
- **Parity (`verifyBoardParity()`):** Live-refits Stage 1/2 + ablations asserting `185` rows, ranks, sum, FNV CRC.
