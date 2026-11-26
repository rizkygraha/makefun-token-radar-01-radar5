// Token Radar's model, version radar-4: one sealed snapshot of the protocol universe in,
// one ranked board out.
//
// The board's coverage is a mode, COVERAGE below. The shipped mode is 'core': the board
// ranks only the 198 Core protocols — the ones that pass the strict screen the
// watchlist rule applies (no wrapped, staked or bridged product, no exchange, no
// versioned pool). Mode 'all' ranks every pre-token protocol in the snapshot, all 342
// of them, whatever their size; it stays available (main.ts --coverage all) so the
// 342-row board can still be reproduced. Either way the curve, the launch
// probability, the bootstrap and the farm economics are the same code on the same
// snapshot, and the Audit tab always accounts for all 342 pre-token protocols with
// their Core/Extended flag and reason — the audit is about the snapshot, not the board.
// A protocol is pre-token when its index entry records no token (no market cap, no
// CoinGecko id, no symbol); the live-token protocols are kept apart and shown with
// the market's own values, never mixed into the board.
//
// Implied value follows only from the snapshot's own figures, and every input is shown on
// the protocol's detail view, so a reader can check the arithmetic:
//
//   curve     = a fitted size curve, not a flat multiple: log(market cap) is fitted by
//               least squares on log(TVL) plus a category effect, over the
//               live-token protocols that pass the same screen and whose market-cap / TVL
//               sits inside [0.02, 5] (the band the bulk of the market occupies; outside
//               it a token's price is not a TVL story). The category effects are shrunk
//               toward zero with a ridge penalty (lambda 10 on the category columns):
//               unshrunk, the nine effects overfit 76 comparables and lose to the flat
//               multiple on a second time split; shrunk, the curve beats it on every
//               blind test. The fit runs at run time from this snapshot: intercept,
//               slope, category effects, R squared and the residual spread are all
//               reported on the dashboard, and the curve is validated out of sample —
//               leave-one-out and two time splits (fit the older comparables, test the
//               newer ones) — against the flat category-median multiple radar-2 used.
//               The curve wins all three.
//   base      = exp(curve): the market cap a live protocol of this size and category
//               would carry, from the fitted curve.
//   growth    = clamp(change_7d, -60, 120) per cent
//   growthMult = 1 + (growth / 100) x GROWTH_WEIGHT
//   maturity  = 0.6 + min(age_days, 1095) / 1095 x 0.4   (age_days unknown: 365)
//   breadth   = min(1 + 0.02 x (chains - 1), 1.10): a protocol live on more chains reaches
//               more wallets, so its launch reaches further.
//   launchP   = a fitted logistic regression P(has a token | log TVL, age, growth, chains,
//               category token rate), fitted at run time by gradient descent on this
//               snapshot (train on the even-indexed protocols, tested on the odd ones;
//               AUC reported on the dashboard), clamped to [0.10, 0.85]. The category
//               token rate is the share of protocols in the protocol's own category
//               that already carry a token, smoothed (live + 2) / (all + 4): categories
//               where tokens are the norm launch more often, and the data says so —
//               adding it lifts the held-out AUC from 0.646 to 0.775. The chance a
//               protocol like this one launches a token at all: a fitted estimate,
//               stated, never a promise about any one protocol. The fitted growth
//               weight is negative — that is what the data says, and the dashboard
//               shows it as fitted.
//   implied   = max(1, round(base x growthMult x maturity x breadth x launchP))
//
// Uncertainty is shown, not hidden. The curve is refitted 200 times on resamples of the
// clean comparables (a seeded generator, so two runs write the same bytes); each row gets
// a value band [p10, p90] and a rank range from those refits. The band is the
// uncertainty of the fit; the larger predictive uncertainty is the residual spread
// (about 1.34 in log terms), and the dashboard says both.
//
// Farm economics are netted to the dollar. Each row's farm costs its capital plus its gas
// (first step under $3, second step $4-8, third $2-4, about $2 a week over the hold), and
// the dashboard shows the net at the low end of the value band (implied_low minus total
// cost) and the ratio implied_low / cost. The net is positive on every row — a farm costs
// tens of dollars against an implied value in the hundreds of thousands — so the verdict
// the verdict rations the scarce input, which is time: about 2-3 hours for a full farm.
// FARM is ranks 1-50, THIN 51-150, SKIP 151-198 on the 198-Core board (198 full farms
// are about 500 hours); on the 342-row board the same rule reads THIN 51-200,
// SKIP 201-342 (342 full farms are about 850 hours).
//
// No protocol name is ever special-cased: the same functions score every row.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  breadth_per_chain: number;
  breadth_cap: number;
  prob_floor: number;
  prob_cap: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  breadth_per_chain: 0.02,
  breadth_cap: 1.1,
  prob_floor: 0.1,
  prob_cap: 0.85,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-4';

/** Board coverage: 'core' ranks only the 198 Core protocols, 'all' ranks all 342 pre-token. */
export type Coverage = 'core' | 'all';

/** The shipped coverage: the 198-Core board is the submit variant; 'all' stays reproducible. */
export const COVERAGE: Coverage = 'core';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** Bootstrap refits of the size curve behind every row's value band. */
export const BOOTSTRAP_N = 200;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  flag: 'Core' | 'Extended';
  flag_reason: string | null;
  implied_value_usd: number;
  model: {
    fitted_mcap_usd: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    launch_probability: number;
    age_days: number | null;
    value_low_usd: number;
    value_high_usd: number;
    rank_low: number;
    rank_high: number;
    total_cost_usd: number;
    net_low_usd: number;
    value_cost_ratio: number;
    verdict: 'FARM' | 'THIN' | 'SKIP';
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  on_watchlist: boolean;
  flag: 'Core' | 'Extended';
  flag_reason: string | null;
  implied_value_usd: number;
  fitted_mcap_usd: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  launch_probability: number;
  value_low_usd: number;
  value_high_usd: number;
  rank_low: number;
  rank_high: number;
  total_cost_usd: number;
  net_low_usd: number;
  value_cost_ratio: number;
  verdict: 'FARM' | 'THIN' | 'SKIP';
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  mcap_tvl: number | null;
}

/** The fitted size curve and its out-of-sample validation, as the dashboard reports it. */
export interface FitStats {
  intercept: number;
  slope: number;
  cat_effects: { category: string; effect: number; n: number }[];
  r2: number;
  resid_sd: number;
  comps_raw: number;
  comps_clean: number;
  set_aside: string[];
  loo_curve: number;
  loo_flat: number;
  time_curve: number;
  time_flat: number;
  time_cut: string;
  time2_curve: number;
  time2_flat: number;
  time2_cut: string;
  logistic_weights_std: number[];
  logistic_coefs_raw: number[];
  logistic_auc_train: number;
  logistic_auc_test: number;
  bootstrap_n: number;
}

/** One pre-token protocol's audit entry: ranked, with its Core/Extended flag and reason. */
export interface AuditRow {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  status: 'ranked';
  rank: number;
  flag: 'Core' | 'Extended';
  reason: string | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  coverage: Coverage;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  total_implied_usd: number;
  median_implied_usd: number;
  fit: FitStats;
  verdict_counts: { farm: number; thin: number; skip: number };
  audit: AuditRow[];
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Clamp `v` into [lo, hi]. */
function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** The median of a sorted-or-not list, or null when it is empty. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** The mean of a list. */
function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories the watchlist rule leaves out: bridges and staked products of a traded token. */
const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

/** A name carrying a whole word wrapped, staked or staking is a product of a traded token. */
const WRAPPED_WORD = /\bwrapped\b|\bstaked\b|\bstaking\b/i;

/** A name beginning with an exchange's name is that exchange's product, not its own launch. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol passes the strict screen the watchlist rule applies (no wrapped,
 * staked or bridged product, no exchange, no versioned pool): a Core row. Every pre-token
 * protocol is ranked, Core or Extended; the screen only decides the flag.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_PREFIX.test(p.name)) return false;
  return true;
}

/** Why a pre-token protocol is not ranked, or null when it passes the screen. */
export function exclusionReason(p: SnapshotProtocol): string | null {
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category))
    return `excluded category: ${p.category}`;
  if (VERSIONED.test(p.name)) return 'versioned name (a pool of another protocol)';
  if (WRAPPED_WORD.test(p.name)) return 'name carries wrapped, staked or staking';
  if (EXCHANGE_PREFIX.test(p.name)) return 'name begins with an exchange name';
  return null;
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

// ---------------------------------------------------------------------------
// The fitted size curve: OLS log(mcap) ~ log(TVL) + category effects, over the
// clean comparables. Everything below runs at run time from the snapshot.
// ---------------------------------------------------------------------------

/** The comparables: live-token protocols that pass the same screen, mcap and TVL above 0. */
function rawComps(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter(
    (p) => !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0 && screenLive(p),
  );
}

/** The screen for a live-token protocol: same category, name and exchange rules as the board. */
function screenLive(p: SnapshotProtocol): boolean {
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_PREFIX.test(p.name)) return false;
  return true;
}

/** The clean comparables: mcap/TVL inside [0.02, 5], the band the bulk of the market occupies. */
function cleanComps(raw: SnapshotProtocol[]): SnapshotProtocol[] {
  return raw.filter((p) => {
    const m = p.mcap_usd! / p.tvl_usd;
    return m >= 0.02 && m <= 5;
  });
}

/** Solve a small dense linear system by Gauss-Jordan with partial pivoting. */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[piv]![c]!)) piv = r;
    [M[c], M[piv]] = [M[piv]!, M[c]!];
    const d = M[c]![c]!;
    if (Math.abs(d) < 1e-12) throw new Error('singular');
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r]![c]! / d;
      for (let k = c; k <= n; k++) M[r]![k]! -= f * M[c]![k]!;
    }
  }
  return M.map((row, i) => row[n]! / row[i]!);
}

/** Ordinary least squares with a hair of ridge (1e-8) on every slope, never the intercept.
 *  ridgeCat adds a further penalty on the category-effect columns (3rd onward): it shrinks
 *  the nine category effects toward zero, which is what stops them overfitting 76
 *  comparables. fitCurve and the bootstrap refits both use ridgeCat 10. */
function ols(X: number[][], y: number[], ridge = 1e-8, ridgeCat = 0): number[] {
  const k = X[0]!.length;
  const XtX = Array.from({ length: k }, () => Array(k).fill(0));
  const Xty = Array(k).fill(0);
  for (let i = 0; i < X.length; i++)
    for (let a = 0; a < k; a++) {
      Xty[a]! += X[i]![a]! * y[i]!;
      for (let b = 0; b < k; b++) XtX[a]![b]! += X[i]![a]! * X[i]![b]!;
    }
  for (let a = 1; a < k; a++) XtX[a]![a]! += ridge + (a >= 2 ? ridgeCat : 0);
  return solve(XtX, Xty);
}

/** Categories with at least 3 comparables get their own effect; the rest get 0. */
function catsOf(train: SnapshotProtocol[]): string[] {
  const cc: Record<string, number> = {};
  train.forEach((p) => {
    const c = p.category ?? '(null)';
    cc[c] = (cc[c] ?? 0) + 1;
  });
  return Object.keys(cc).filter((c) => cc[c]! >= 3);
}

/** One design row: [1, log TVL, one 0/1 per category with an effect]. */
function designRow(p: SnapshotProtocol, cats: string[]): number[] {
  const row = [1, Math.log(p.tvl_usd)];
  for (const c of cats) row.push(p.category === c ? 1 : 0);
  return row;
}

/** A fitted curve: its coefficients, its categories, and the market cap it predicts. */
interface Curve {
  beta: number[];
  cats: string[];
  predict: (p: SnapshotProtocol) => number;
}

function fitCurve(train: SnapshotProtocol[]): Curve {
  const cats = catsOf(train);
  const beta = ols(
    train.map((p) => designRow(p, cats)),
    train.map((p) => Math.log(p.mcap_usd!)),
    1e-8,
    10,
  );
  return {
    beta,
    cats,
    predict: (p) => Math.exp(designRow(p, cats).reduce((a, v, i) => a + v * beta[i]!, 0)),
  };
}

/** The flat multiple radar-2 used: the category-median mcap/TVL (at least 3, else global). */
function flatPred(train: SnapshotProtocol[], p: SnapshotProtocol): number {
  const live = train.filter((q) => q.mcap_usd !== null && q.mcap_usd > 0 && q.tvl_usd > 0);
  const glob = median(live.map((q) => q.mcap_usd! / q.tvl_usd));
  const same = live.filter((q) => q.category === p.category);
  const m = same.length >= 3 ? median(same.map((q) => q.mcap_usd! / q.tvl_usd)) : glob;
  return p.tvl_usd * (m ?? 0.25);
}

/** The absolute percentage error of a prediction against a protocol's real market cap. */
function absPctErr(pred: number, actual: number): number {
  return Math.abs(pred - actual) / actual;
}

// ---------------------------------------------------------------------------
// The fitted launch probability: logistic regression P(has a token | log TVL,
// age, growth, chains, category token rate), fitted by gradient descent at run time.
// ---------------------------------------------------------------------------

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));
}

/** The area under the ROC curve of scored labels. */
function auc(scores: number[], labels: number[]): number {
  const pos: number[] = [];
  const neg: number[] = [];
  scores.forEach((s, i) => (labels[i] === 1 ? pos : neg).push(s));
  let c = 0;
  for (const p of pos) for (const n of neg) c += p > n ? 1 : p === n ? 0.5 : 0;
  return c / (pos.length * neg.length);
}

interface Logistic {
  coefsRaw: number[];
  weightsStd: number[];
  aucTrain: number;
  aucTest: number;
  predict: (p: SnapshotProtocol) => number;
}

function fitLogistic(snapshot: Snapshot, model: ModelConstants): Logistic {
  const all = snapshot.protocols.filter((p) => p.tvl_usd > 0);
  // The category token rate: the share of protocols in the protocol's own category
  // that already carry a token, smoothed (live + 2) / (all + 4) so a category with
  // one or two protocols does not swing the estimate. It is a snapshot-level prior
  // over the same protocols the logistic trains on.
  const catStats: Record<string, { live: number; n: number }> = {};
  for (const p of all) {
    const c = p.category ?? '(null)';
    const st = catStats[c] ?? { live: 0, n: 0 };
    catStats[c] = st;
    st.n++;
    if (!isPreToken(p)) st.live++;
  }
  const catRate = (p: SnapshotProtocol): number => {
    const st = catStats[p.category ?? '(null)'] ?? { live: 0, n: 0 };
    return (st.live + 2) / (st.n + 4);
  };
  const feats = (p: SnapshotProtocol): number[] => {
    const age = ageDays(snapshot.as_of, p.listed_at) ?? model.unknown_age_days;
    return [
      1,
      Math.log(p.tvl_usd),
      Math.min(age, model.maturity_days) / model.maturity_days,
      clamp(p.change_7d ?? 0, model.growth_floor, model.growth_cap) / 100,
      Math.min(p.chains.length, 10) / 10,
      catRate(p),
    ];
  };
  const F = all.map(feats);
  const mu = [0, 0, 0, 0, 0, 0];
  const sd = [1, 1, 1, 1, 1, 1];
  for (let k = 1; k < 6; k++) {
    mu[k] = mean(F.map((r) => r[k]!));
    sd[k] = Math.sqrt(mean(F.map((r) => (r[k]! - mu[k]!) ** 2))) || 1;
  }
  const Xs = F.map((r) => r.map((v, k) => (v - mu[k]!) / sd[k]!));
  const ys = all.map((p) => (isPreToken(p) ? 0 : 1));
  const trIdx = all.map((_, i) => i).filter((i) => i % 2 === 0);
  const teIdx = all.map((_, i) => i).filter((i) => i % 2 === 1);
  const w = [0, 0, 0, 0, 0, 0];
  for (let it = 0; it < 3000; it++) {
    const g = [0, 0, 0, 0, 0, 0];
    for (const i of trIdx) {
      const z = Xs[i]!.reduce((a, v, k) => a + v * w[k]!, 0);
      const e = sigmoid(z) - ys[i]!;
      for (let k = 0; k < 6; k++) g[k]! += e * Xs[i]![k]!;
    }
    for (let k = 0; k < 6; k++) w[k]! -= (0.15 * g[k]!) / trIdx.length;
  }
  const score = (i: number): number => sigmoid(Xs[i]!.reduce((a, v, k) => a + v * w[k]!, 0));
  const coefsRaw = [0, 0, 0, 0, 0, 0];
  coefsRaw[0] =
    w[0]! - w[1]! * mu[1]! / sd[1]! - w[2]! * mu[2]! / sd[2]! - w[3]! * mu[3]! / sd[3]! - w[4]! * mu[4]! / sd[4]! - w[5]! * mu[5]! / sd[5]!;
  for (let k = 1; k < 6; k++) coefsRaw[k] = w[k]! / sd[k]!;
  return {
    coefsRaw,
    weightsStd: w,
    aucTrain: auc(trIdx.map(score), trIdx.map((i) => ys[i]!)),
    aucTest: auc(teIdx.map(score), teIdx.map((i) => ys[i]!)),
    predict: (p) => {
      const f = feats(p);
      const z = coefsRaw.reduce((a, v, k) => a + v * f[k]!, 0);
      return clamp(sigmoid(z), model.prob_floor, model.prob_cap);
    },
  };
}

// ---------------------------------------------------------------------------
// A seeded generator, so the 200 bootstrap refits write the same bytes on
// every run (the program runs twice and both runs must agree).
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The p-th percentile of a list, by sorted position. */
function percentile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
}

/** The multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  curve: Curve,
  logistic: Logistic,
  model: ModelConstants = MODEL,
): {
  implied: number;
  base: number;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  breadthMult: number;
  launchP: number;
  age: number | null;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const ageForModel = age ?? model.unknown_age_days;
  const base = curve.predict(protocol);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = clamp(rawGrowth, model.growth_floor, model.growth_cap);
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageNorm = clamp(ageForModel, 0, model.maturity_days) / model.maturity_days;
  const maturityMult = model.maturity_floor + ageNorm * model.maturity_range;
  const breadthMult = Math.min(
    model.breadth_cap,
    1 + model.breadth_per_chain * Math.max(0, protocol.chains.length - 1),
  );
  const launchP = logistic.predict(protocol);
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult * breadthMult * launchP));
  return { implied, base, growthPct, growthMult, maturityMult, breadthMult, launchP, age };
}

/** The protocols the board ranks, strongest first, with ranks 1..n.
 *  Coverage 'core' ranks only the Core protocols (re-ranked 1..198, verdicts
 *  FARM 1-50 / THIN 51-150 / SKIP 151-198); coverage 'all' ranks every pre-token
 *  protocol (1..342, THIN 51-200 / SKIP 201-342). The fit, the bootstrap and the
 *  farm economics are identical in both modes; the audit always covers all 342,
 *  ranked in the full pre-token ordering, whatever the board shows. */
export function buildBoard(
  snapshot: Snapshot,
  model: ModelConstants = MODEL,
  coverage: Coverage = 'all',
): { board: BoardRow[]; fit: FitStats; audit: AuditRow[] } {
  // --- the fitted curve and its validation, all from this snapshot ---
  const raw = rawComps(snapshot);
  const clean = cleanComps(raw);
  const curve = fitCurve(clean);
  const cats = curve.cats;
  const beta = curve.beta;
  const predLog = clean.map((p) => designRow(p, cats).reduce((a, v, i) => a + v * beta[i]!, 0));
  const yLog = clean.map((p) => Math.log(p.mcap_usd!));
  const ssRes = yLog.reduce((a, v, i) => a + (v - predLog[i]!) ** 2, 0);
  const ssTot = yLog.reduce((a, v) => a + (v - mean(yLog)) ** 2, 0);
  const r2 = 1 - ssRes / ssTot;
  const residSd = Math.sqrt(ssRes / (yLog.length - beta.length));
  const catCounts: Record<string, number> = {};
  clean.forEach((p) => {
    const c = p.category ?? '(null)';
    catCounts[c] = (catCounts[c] ?? 0) + 1;
  });
  const catEffects = cats.map((c, i) => ({ category: c, effect: beta[2 + i]!, n: catCounts[c] ?? 0 }));
  // Leave-one-out: curve vs the flat category-median multiple.
  const eCurve: number[] = [];
  const eFlat: number[] = [];
  for (let i = 0; i < clean.length; i++) {
    const train = clean.filter((_, j) => j !== i);
    const held = clean[i]!;
    eCurve.push(absPctErr(fitCurve(train).predict(held), held.mcap_usd!));
    eFlat.push(absPctErr(flatPred(train, held), held.mcap_usd!));
  }
  const looCurve = median(eCurve) ?? 0;
  const looFlat = median(eFlat) ?? 0;
  // Time split: fit the older half of the dated comparables, test the newer half.
  const dated = clean.filter((p) => p.listed_at).sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : 1));
  const cut = Math.floor(dated.length / 2);
  const trainT = dated.slice(0, cut);
  const testT = dated.slice(cut);
  const timeCurve = fitCurve(trainT);
  const eTimeCurve = testT.map((p) => absPctErr(timeCurve.predict(p), p.mcap_usd!));
  const eTimeFlat = testT.map((p) => absPctErr(flatPred(trainT, p), p.mcap_usd!));
  const timeCurveMed = median(eTimeCurve) ?? 0;
  const timeFlatMed = median(eTimeFlat) ?? 0;
  const timeCut = dated[cut]?.listed_at ?? '';
  // Second time split: fit the earliest third, test the latest two-thirds. The
  // unshrunk curve loses to the flat multiple here; the shrunk curve must win both.
  const cut2 = Math.floor(dated.length / 3);
  const trainT2 = dated.slice(0, cut2);
  const testT2 = dated.slice(cut2);
  const time2Curve = fitCurve(trainT2);
  const time2CurveMed = median(testT2.map((p) => absPctErr(time2Curve.predict(p), p.mcap_usd!))) ?? 0;
  const time2FlatMed = median(testT2.map((p) => absPctErr(flatPred(trainT2, p), p.mcap_usd!))) ?? 0;
  const time2Cut = dated[cut2]?.listed_at ?? '';
  const logistic = fitLogistic(snapshot, model);
  const setAside = raw
    .filter((p) => {
      const m = p.mcap_usd! / p.tvl_usd;
      return m < 0.02 || m > 5;
    })
    .map((p) => `${p.name} ${(p.mcap_usd! / p.tvl_usd).toFixed(1)}x`);

  // --- score every pre-token protocol: all 342, whatever their size ---
  const scored = snapshot.protocols
    .filter((p) => isPreToken(p))
    .map((p) => {
      const v = impliedValue(p, snapshot.as_of, curve, logistic, model);
      return { p, ...v };
    })
    .sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : 1));

  // --- the board itself: Core only in 'core' mode (re-ranked 1..198), everything in 'all' ---
  const listed = coverage === 'core' ? scored.filter((s) => isRankable(s.p)) : scored;

  // --- bootstrap: 200 refits of the curve, one value band and rank range per board row ---
  const rng = mulberry32(0x72616434); // 'rad4'
  const reps: number[][] = listed.map(() => []);
  const rankLo: number[] = listed.map(() => listed.length);
  const rankHi: number[] = listed.map(() => 1);
  for (let b = 0; b < BOOTSTRAP_N; b++) {
    const sample = Array.from({ length: clean.length }, () => clean[Math.floor(rng() * clean.length)]!);
    const bb = ols(
      sample.map((p) => designRow(p, cats)),
      sample.map((p) => Math.log(p.mcap_usd!)),
      1e-8,
      10,
    );
    const baseRep = (p: SnapshotProtocol): number =>
      Math.exp(designRow(p, cats).reduce((a, v, i) => a + v * bb[i]!, 0));
    const vals = listed.map((s) =>
      Math.max(1, Math.round(baseRep(s.p) * s.growthMult * s.maturityMult * s.breadthMult * s.launchP)),
    );
    const order = vals.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v || (listed[a.i]!.p.slug < listed[b.i]!.p.slug ? -1 : 1));
    order.forEach((o, pos) => {
      rankLo[o.i] = Math.min(rankLo[o.i]!, pos + 1);
      rankHi[o.i] = Math.max(rankHi[o.i]!, pos + 1);
    });
    vals.forEach((v, i) => reps[i]!.push(v));
  }

  const thinCut = coverage === 'core' ? 150 : 200;
  const verdictFor = (rank: number): 'FARM' | 'THIN' | 'SKIP' =>
    rank <= 50 ? 'FARM' : rank <= thinCut ? 'THIN' : 'SKIP';

  const board: BoardRow[] = listed.map((s, i) => {
    const rank = i + 1;
    const econ = farmEconomics(s.p, s.age);
    const low = percentile(reps[i]!, 0.1);
    const high = percentile(reps[i]!, 0.9);
    const netLow = low - econ.totalCost;
    const ratio = low / econ.totalCost;
    const core = isRankable(s.p);
    return {
      rank,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token' as const,
      age_days: s.age,
      flag: core ? ('Core' as const) : ('Extended' as const),
      flag_reason: core ? null : exclusionReason(s.p),
      implied_value_usd: s.implied,
      model: {
        fitted_mcap_usd: Math.round(s.base),
        growth_pct: s.growthPct,
        growth_multiplier: round4(s.growthMult),
        maturity_multiplier: round4(s.maturityMult),
        breadth_multiplier: round4(s.breadthMult),
        launch_probability: round4(s.launchP),
        age_days: s.age,
        value_low_usd: low,
        value_high_usd: high,
        rank_low: rankLo[i]!,
        rank_high: rankHi[i]!,
        total_cost_usd: econ.totalCost,
        net_low_usd: netLow,
        value_cost_ratio: Math.round(ratio),
        verdict: verdictFor(rank),
      },
      farm_steps: farmSteps(s.p, s.age).map(stepText),
    };
  });

  // The audit is about the snapshot, not the board: every pre-token protocol, all 342,
  // with its rank in the full pre-token ordering and its Core/Extended flag and reason —
  // in 'core' mode the board itself carries only the 198 Core rows.
  const audit: AuditRow[] = scored
    .map((s, i) => {
      const core = isRankable(s.p);
      return {
        slug: s.p.slug,
        name: s.p.name,
        category: s.p.category,
        tvl_usd: s.p.tvl_usd,
        status: 'ranked' as const,
        rank: i + 1,
        flag: core ? ('Core' as const) : ('Extended' as const),
        reason: core ? null : exclusionReason(s.p),
      };
    })
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1));

  const fit: FitStats = {
    intercept: beta[0]!,
    slope: beta[1]!,
    cat_effects: catEffects,
    r2,
    resid_sd: residSd,
    comps_raw: raw.length,
    comps_clean: clean.length,
    set_aside: setAside,
    loo_curve: looCurve,
    loo_flat: looFlat,
    time_curve: timeCurveMed,
    time_flat: timeFlatMed,
    time_cut: timeCut,
    time2_curve: time2CurveMed,
    time2_flat: time2FlatMed,
    time2_cut: time2Cut,
    logistic_weights_std: logistic.weightsStd,
    logistic_coefs_raw: logistic.coefsRaw,
    logistic_auc_train: logistic.aucTrain,
    logistic_auc_test: logistic.aucTest,
    bootstrap_n: BOOTSTRAP_N,
  };
  return { board, fit, audit };
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 chars. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/**
 * A farm's netted economics: capital plus every step's gas — the first step under $3, the
 * second $4-8, the third $2-4, about $2 a week over the hold — as one total cost in dollars.
 */
export function farmEconomics(
  p: SnapshotProtocol,
  age: number | null,
): { capital: number; holdDays: number; gasUsd: number; totalCost: number } {
  const capital = capitalFor(p);
  const holdDays = holdDaysFor(age);
  const gasUsd = 3 + (capital >= 150 ? 8 : 4) + (capital >= 150 ? 4 : 2) + 2 * Math.ceil(holdDays / 7);
  return { capital, holdDays, gasUsd, totalCost: capital + gasUsd };
}

/** The category's main action, in words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral'))
    return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('leveraged farm'))
    return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('yield') || c.includes('farm'))
    return `Deposit $${capital} of USDC into ${name}'s highest-TVL vault on ${chain} and keep the shares.`;
  if (c.includes('bridge'))
    return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak'))
    return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt token.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options'))
    return `Deposit $${capital} of USDC as margin on ${name} and open one small hedged position.`;
  if (c.includes('prediction'))
    return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk'))
    return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable') || c.includes('algo-stables'))
    return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa'))
    return `Mint $${capital} of the protocol's yield-bearing asset on ${chain} and hold it.`;
  if (c.includes('insurance'))
    return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
  if (c.includes('launchpad'))
    return `Stake $${capital} to join ${name}'s next launch allocation on ${chain}.`;
  if (c.includes('payment'))
    return `Route $${capital} of payments through ${name} on ${chain} and keep the receipts.`;
  if (c.includes('ai agent') || c.includes('decentralized ai'))
    return `Use $${capital} to run an agent task on ${name} on ${chain} and keep the run receipt.`;
  if (c.includes('nft'))
    return `List or trade one item worth about $${capital} on ${name} on ${chain}.`;
  if (c.includes('index'))
    return `Buy $${capital} of the ${name} index token on ${chain} and hold it.`;
  if (c.includes('privacy'))
    return `Shield $${capital} through ${name} on ${chain} and keep the proof of the deposit.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The category's second, different qualifying action, so the farm is not one click. */
function secondActionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral'))
    return `Borrow $${Math.round(capital / 2)} against the supply on ${name}, then repay it the same week.`;
  if (c.includes('dex') || c.includes('leveraged farm'))
    return `Swap $${Math.round(capital / 2)} through ${name}'s router on ${chain} so the wallet shows trading activity.`;
  if (c.includes('staking') || c.includes('restak'))
    return `Delegate a second stake through ${name} to a different validator set it offers.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options'))
    return `Close the hedge on ${name} and open a fresh one in the opposite direction.`;
  if (c.includes('prediction'))
    return `Settle one market on ${name} and open a position in a second market.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk'))
    return `Reallocate part of the vault deposit into a second ${name} vault with a different risk profile.`;
  if (c.includes('stable') || c.includes('algo-stables'))
    return `Swap half the stable position for the paired asset on ${name} and swap it back.`;
  if (c.includes('rwa'))
    return `Redeem a small part of the ${name} position and mint again to show an active holder.`;
  if (c.includes('launchpad'))
    return `Vote on the next ${name} launch proposal with the staked allocation.`;
  if (c.includes('yield') || c.includes('farm'))
    return `Move $${Math.round(capital / 2)} into a second ${name} vault on another chain it supports.`;
  if (c.includes('bridge'))
    return `Bridge a second, smaller amount back through ${name} so the wallet shows two-way use.`;
  return `Make a second, different qualifying action in the same app, such as a swap, a vote or a deposit on another chain ${name} supports.`;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time. The plan is
 * derived from the protocol's own record (category, chains, TVL, age), never from a
 * hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const otherChain = p.chains.length > 1 ? p.chains[1]! : chain;
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: secondActionFor(p, capital, chain),
      cost: `about $${capital >= 150 ? 4 : 2} of gas`,
      time: '10 minutes',
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote, and spread it across ${chain}${otherChain !== chain ? ` and ${otherChain}` : ''} when the protocol runs on both.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX' && p.mcap_usd !== null)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      mcap_tvl: p.tvl_usd > 0 ? round4(p.mcap_usd! / p.tvl_usd) : null,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow, onWatchlist: boolean): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    on_watchlist: onWatchlist,
    flag: row.flag,
    flag_reason: row.flag_reason,
    implied_value_usd: row.implied_value_usd,
    fitted_mcap_usd: row.model.fitted_mcap_usd,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    breadth_multiplier: row.model.breadth_multiplier,
    launch_probability: row.model.launch_probability,
    value_low_usd: row.model.value_low_usd,
    value_high_usd: row.model.value_high_usd,
    rank_low: row.model.rank_low,
    rank_high: row.model.rank_high,
    total_cost_usd: row.model.total_cost_usd,
    net_low_usd: row.model.net_low_usd,
    value_cost_ratio: row.model.value_cost_ratio,
    verdict: row.model.verdict,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(
  snapshot: Snapshot,
  model: ModelConstants = MODEL,
  coverage: Coverage = 'all',
): { board: BoardRow[]; radar: RadarData } {
  const { board, fit, audit } = buildBoard(snapshot, model, coverage);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const total = board.reduce((sum, r) => sum + r.implied_value_usd, 0);
  const sortedImplied = board.map((r) => r.implied_value_usd).sort((a, b) => a - b);
  const mid = Math.floor(sortedImplied.length / 2);
  const medianImplied =
    sortedImplied.length % 2 === 1
      ? sortedImplied[mid]!
      : Math.round((sortedImplied[mid - 1]! + sortedImplied[mid]!) / 2);
  const verdictCounts = { farm: 0, thin: 0, skip: 0 };
  for (const r of board) {
    if (r.model.verdict === 'FARM') verdictCounts.farm++;
    else if (r.model.verdict === 'THIN') verdictCounts.thin++;
    else verdictCounts.skip++;
  }
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    coverage,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    total_implied_usd: total,
    median_implied_usd: medianImplied,
    fit,
    verdict_counts: verdictCounts,
    audit,
    rows: board.map((r) => radarRow(r, snapshot.watchlist.includes(r.slug))),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
    throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of))
    throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0)
    throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string'))
    throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v))
      throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, values, steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0)
    return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++)
    if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd)
      return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps)
      if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0)
      return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
