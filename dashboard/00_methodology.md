# Sonar (`sonar-2`) — Methodology
- **MECE (`758/758`, `ledgerOf()`):** `185` ranked (`40` WL `>=$50M`+`17` EXT `>=$50M`+`128` Early `$5–50M`),
  `98` comps (`mcap_usd>0`), `318` tokenized, `157` aside.
- **Stage 1 (`fitStage1Huber()`, `valueLadder()`):** Huber IRLS+ridge (`k=64`): `LOO ×3.104`, `10F ×3.078`,
  `WF ×2.672`, `Size ×5.520` vs `20×` ctrl (`×3.076`); sector scales `×0.70..×1.34`.
- **Stage 2 (`fitStage2Logistic()`, `oddsLadder()`):** L2 logit (`427` peers): `10F 0.193`/`71.2%`,
  `WF 0.234`/`68.3%`; `beta_chains=0`; `0.50×` sib cut.
- **Self-Contained Farm (`farmPlan()`):** `8` concrete steps across `10` families (`excess = drop-fees-2% carry`,
  `56/95/34`), `4%` T-bill, `185/185` parity (`crc 660b243f`).
