# Token Radar — pre-token protocols ranked by implied launch value

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/rizkygraha/makefun-token-radar-01-radar4/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/rizkygraha/makefun-token-radar-01-radar4/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

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
  are not hidden: the Audit tab lists all 342 pre-token protocols with the
  reason each one fails the screen. 24 live-token protocols are set aside and
  shown with the market's own values, never ranked. The 342-row board is still
  reproducible with `--coverage all` (see `lib/model.ts`).
- **Model `radar-4`** (see `lib/model.ts` and the dashboard's "How the model works"
  tab): `implied = fitted market cap × growth × maturity × breadth × launch
  probability`. The fitted market cap comes from a size curve — least squares on
  `log(market cap) ~ log(TVL) + category effects`, fitted at run time on 76 clean
  comparables (92 live-token protocols pass the screen; 16 set aside with
  market-cap / TVL outside [0.02, 5]) — R² 0.358, residual SD 1.37 in log terms.
  The category effects are shrunk toward zero (ridge λ=10): unshrunk they overfit
  76 comparables and lose to the flat multiple on a second time split. Validated
  out of sample: leave-one-out median error 76.9% vs 87.8% for a flat
  category-median multiple; time split 53.8% vs 80.0%; second time split 60.0% vs
  77.8%. The launch probability is a logistic regression fitted at run time (AUC
  0.791 train / 0.775 test) on log TVL, age, growth, chains and the category token
  rate — the share of a protocol's own category that already has a token. Each row
  carries a value band [p10, p90] and a rank range from 200 bootstrap refits of the
  curve. No protocol name is ever special-cased.
- **Farm plan**: 7 steps per protocol, derived from its category, chains, TVL and
  age, each with a cost and a time — then netted: total cost (capital + gas),
  net at the low end of the value band, and implied-low / cost. Verdict by rank:
  FARM 1–50, THIN 51–150, SKIP 151–198; the verdict rations farm time (198 full
  farms are about 500 hours), because the net is positive on every row.
- **Dashboard**: dark, no-network static page. Sortable and filterable board
  (including a Core-only filter), per-protocol detail drawer with the full model
  breakdown, value band and netted farm economics, a live-token view, an audit
  tab accounting for all 342 pre-token protocols with flag and reason, a
  methodology tab, and a model sandbox — three sliders recompute every implied
  value in the browser and re-rank the board live.

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

1. Veda $51.8M · 2. USDD $41.8M · 3. Steakhouse Financial $32.4M ·
4. BitFi Basis $24.9M · 5. Upshift $24.5M · 6. Polymarket International $21.6M ·
7. CIAN Yield Layer $20.7M · 8. Gauntlet $20.2M · 9. Plume Vaults $19.3M ·
10. Bittensor dTAO $18.8M. Total implied board $882.7M, median $2.22M.

## Files

| File | What it is |
| --- | --- |
| `main.ts` | entrypoint: snapshot in, board + dashboard + dossier out |
| `lib/model.ts` | the radar-4 model, farm plans, board validation, coverage `core`/`all` |
| `vendor/makefun-board.ts` | the kit's dossier library, byte for byte |
| `dashboard/` | the static page (index.html, app.css, app.js) |
| `screenshots/` | the three screenshots, 1440×900 |
| `.makefun/owner.json` | the account wallet (wallet-only account) |

## Caveats, stated on the page

A protocol "records no token" in the snapshot — that is not proof it has no token.
An implied value is the model's claim, never a promise of a token or a price.

---

<sub>Entered on [make.fun](https://make.fun/?ref=zzd4x01w&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
