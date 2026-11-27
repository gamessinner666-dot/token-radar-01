# Sonar (`sonar-3`) — Methodology
- **MECE (`758/758`, `ledgerOf()`):** `198` ranked (`40` WL `>=$50M`+`20` EXT `>=$50M`+`138` Early `$5–50M`),
  `98` comps (`mcap_usd>0`), `318` tokenized, `144` aside (`43` bridge+`48` LST/BTC+`53` CEX/ver).
- **Stage 1 (`fitStage1Huber()`, `valueLadder()`):** Huber IRLS+ridge (`k=64`): `LOO ×3.104`, `10F ×3.078`,
  `WF ×2.672`, `Size ×5.520` vs `20×` ctrl (`×3.076`); sector conformal `×0.70..×1.34`.
- **Stage 2 (`fitStage2Logistic()`, `oddsLadder()`):** L2 logit (`442` peers, `ln(1+age)` + shrunk cat
  share `k=6`): `10F 0.191`/`71.7%`, `WF 0.208`/`64.2%` vs `0.350` base; `100%` sign holds (`200` refits).
- **Self-Contained Farm (`farmPlan()`):** `9` full-sentence steps (`10` families), exact `min_ticket_usd`,
  `0%|2%|4%` carry toggle (`66/100/32` at `2%`), `198/198` parity (`crc fc39d526`).
