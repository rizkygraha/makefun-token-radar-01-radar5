# Token Radar — pre-token protocols ranked by implied launch value

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/rizkygraha/makefun-token-radar-01-radar5/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/rizkygraha/makefun-token-radar-01-radar5/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Entry for make.fun competition `token-radar-01`: build the best token launch radar.

## What it is

A program (`main.ts`, Node 22, standard library only) reads the sealed DefiLlama
snapshot (`input/snapshot.json`: 758 protocols at or above $5M TVL, fetched
2026-11-14), scores every pre-token protocol, and writes a static dashboard plus
`board.json` and `dossier.json`.

- **Board: 198 rows** — the pre-token protocols in the snapshot (758 total, 416
  live-token set aside) that pass the strict screen: not a wrapped, staked or
  bridged product, not an exchange, not a versioned pool. All 40 watchlist
  protocols are covered. The other 144 pre-token protocols fail the screen
  (exchanges, bridges, staked products, versioned pools) and are left off the
  board — a launch radar topped by exchanges is not a launch radar — but they
  are not hidden: the Audit tab lists all 758 protocols in the snapshot with
  the reason each one is ranked, set aside, or already trading. The 342-row
  board is still reproducible with `--coverage all` (see `lib/model.ts`).
- **Model `radar-5`** (see `lib/model.ts` and the dashboard's "How the model works"
  tab): `implied = fitted market cap × growth × launch probability`. The fitted
  market cap comes from a size-only curve — least squares on
  `log(market cap) ~ log(TVL)`, fitted at run time on 76 clean comparables
  (92 live-token protocols pass the screen; 16 set aside with market-cap / TVL
  outside [0.02, 5]) — intercept 5.0940, slope 0.6341, R² 0.321, residual SD 1.32
  in log terms. Category effects were tested at ridge λ = 0..1000 and did not
  improve either blind test, so the shipped curve carries none; growth (weight
  0.5) improves both blind tests and stays; maturity and breadth were tested and
  dropped for the same reason. Validated out of sample, as median factor miss:
  leave-one-out ×2.74 (76 comps) and ×3.11 (92) vs ×4.38 and ×5.55 for a flat
  category-median multiple; walk-forward ×2.01 (median split) and ×1.99
  (tertile split) on the 92 set vs ×5.05 and ×4.52 flat. The launch probability
  is a logistic regression fitted at run time (AUC 0.786 train / 0.775 test) on
  age, growth, chains and the category token rate — the share of a protocol's
  own category that already has a token. log TVL was tested and removed:
  dropping it improves both Brier scores (LOO 0.211, ten-fold 0.214) while AUC
  moves 0.7752 → 0.7745. Brier: LOO 0.211 (gate 0.22, passes), ten-fold 0.214
  (gate 0.21, misses by 0.004 — stated, not hidden). Each row carries a value
  band from leave-one-out residuals on the fitted value — [p25, p75] covers
  51.3% of held-out caps, [p10, p90] covers 81.6% — and a rank range from 200
  bootstrap refits of the curve. The old bootstrap value band covered 15.8% and
  is not printed. No protocol name is ever special-cased.
- **Farm economics, by money**: each row's farm is a $10,000 deposit. Drop =
  implied × 7% × $10,000 / TVL; net = drop − gas − the 4% T-bill charge on the
  deposit over the hold; $/hour = net / hours worked. Verdict by money: FARM
  when the net is positive and pays at least $25 an hour (71 rows), THIN when
  the net is positive but pays less (38), SKIP when the net is negative (89).
  The net is negative on 106 of 198 rows — for the biggest protocols the drop
  is smaller than the gas plus the T-bill charge, because the drop is the
  implied value times the deposit over a very large TVL. The top 10 by implied
  hold 0 FARM. The farm plan is 8 steps per protocol (7 actions plus an exit
  trigger: leave when TVL falls below 70% of today's, or the drop window
  closes), each with a cost and a time; total work is 356.5 hours for 198 farms
  (mean 1.80 h), computed from the step times. Withdrawal gas is not modelled;
  the drawer says so.
- **Dashboard**: dark, no-network static page. KPI strip (198 ranked, $1.03B
  total implied, 71 FARM, LOO ×2.74, Brier 0.211, 356.5 h), a ledger accounting
  for all 758 protocols in six groups, and an integrity strip (board recomputed,
  ranks ordered, totals equal, checksum = main.ts, watchlist 40/40, ledger
  758/758). Sortable and filterable board with net $, $/hour and verdict
  columns, per-protocol detail drawer with the full model breakdown, the
  8-step farm plan, an exit trigger and a sensitivity grid, a live-token view,
  an audit tab accounting for all 758 protocols with status and reason, a
  methodology tab with the term-by-term ablation tables, and a model sandbox.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|directory>
```

Then open `out/dashboard/index.html` (it reads `out/data.js` beside it). The
default board is the 198 Core rows; `--coverage all` reproduces the 342-row
board instead.

## Screenshots

- `screenshots/1-board.png` — the board (198 rows, Veda #1)
- `screenshots/2-detail.png` — Veda's detail view (rank #1)
- `screenshots/3-filtered.png` — the board filtered to Lending (16 rows)

## Top 10

1. Veda $47.9M · 2. USDD $39.7M · 3. CIAN Yield Layer $28.0M ·
4. Steakhouse Financial $27.4M · 5. Bittensor dTAO $25.4M ·
6. BitFi Basis $22.9M · 7. Upshift $22.8M · 8. Figure Markets Prime $22.0M ·
9. Plume Vaults $18.5M · 10. Polymarket International $18.5M.
Total implied board $1.03B, median $2.96M.

## Files

| File | What it is |
| --- | --- |
| `main.ts` | entrypoint: snapshot in, board + dashboard + dossier out |
| `lib/model.ts` | the radar-5 model, farm plans, board validation, coverage `core`/`all` |
| `vendor/makefun-board.ts` | the kit's dossier library, byte for byte |
| `dashboard/` | the static page (index.html, app.css, app.js) |
| `screenshots/` | the three screenshots, 1440×900 |
| `.makefun/owner.json` | the account wallet (wallet-only account) |

## Caveats, stated on the page

A protocol "records no token" in the snapshot — that is not proof it has no token.
An implied value is the model's claim, never a promise of a token or a price.
The ten-fold Brier misses its 0.21 gate by 0.004; the dashboard says so.

---

<sub>Entered on [make.fun](https://make.fun/?ref=zzd4x01w&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
