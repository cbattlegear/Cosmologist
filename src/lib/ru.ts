// Cosmos DB RU Estimator (TypeScript)
// -----------------------------------
// Converted from Python fitting script:
// - Read RU: tier-based lookup (quantized by size)
// - Write RU: regression (supports linear or polynomial features)
// - Query RU: linear on size_kb
//
// This module supports configurable models (tiers/coefficients). Defaults are sane heuristics based on official docs
// and prior heuristics to keep existing UI/tests working. Replace `DEFAULT_*` with values from your Python run when available.

export type ReadRuTier = [thresholdKb: number, ru: number] // <= thresholdKb -> ru; include Infinity as last
export type WriteModel = {
  intercept: number
  coefs: number[]
  featureNames: string[] // e.g., ['size_kb', 'num_properties', 'size_kb^2', 'size_kb*num_properties', 'num_properties^2']
  degree?: number // polynomial degree if using PolynomialFeatures
}
export type QueryModel = {
  intercept: number
  coefSize: number // size_kb coefficient
}

export type RuModelConfig = {
  readTiers?: ReadRuTier[]
  writeModel?: WriteModel
  queryModel?: QueryModel
}

export type RuEstimate = {
  sizeBytes: number
  sizeKB: number
  numProperties: number
  readPointRU: number
  readQueryRU: number
  writeRU: number
}

// --------------------------- Defaults ---------------------------
// Injected from benchmark-generated Python estimator
export const DEFAULT_READ_TIERS: ReadRuTier[] = [
  [1.0, 1.0],
  [2.0, 1.05],
  [4.0, 1.14],
  [9.96, 1.33],
  [20.03, 1.67],
  [38.35, 2.19],
  [76.84, 4.76],
  [154.75, 9.95],
  [350.79, 20.29],
  [512.0, 40.95],
  [1024.0, 145.9],
  [Infinity, 291.8],
]

export const DEFAULT_WRITE_MODEL: WriteModel = {
  intercept: 13.185295958304778,
  coefs: [
    -0.024661720142774183,
    0.49297157041454753,
    0.0016724699303381364,
    -0.004896549452692917,
    0.008337026077446397,
    0.000005025511857992271,
    -0.00003736113601646163,
    0.0000869072230423873,
    -0.00006860666010480992,
  ],
  featureNames: ['size_kb', 'num_properties'], // poly features derived dynamically
  degree: 3,
}

export const DEFAULT_QUERY_MODEL: QueryModel = {
  intercept: 2.8080338276807506,
  coefSize: 0.015162674622869772,
}

let activeModels: Required<RuModelConfig> = {
  readTiers: DEFAULT_READ_TIERS,
  writeModel: DEFAULT_WRITE_MODEL,
  queryModel: DEFAULT_QUERY_MODEL,
}

export function setRuModels(cfg: RuModelConfig) {
  activeModels = {
    readTiers: cfg.readTiers ?? activeModels.readTiers,
    writeModel: cfg.writeModel ?? activeModels.writeModel,
    queryModel: cfg.queryModel ?? activeModels.queryModel,
  }
}

// --------------------------- Utilities ---------------------------
function docSizeBytes(doc: any): number {
  try {
    const json = JSON.stringify(doc)
    if (!json) return 0
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(json).length
    }
    if (typeof Blob !== 'undefined') {
      return new Blob([json]).size
    }
    // Node fallback
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const buf = (typeof Buffer !== 'undefined' ? Buffer : require('buffer').Buffer)
    return buf.byteLength(json, 'utf8')
  } catch {
    return 0
  }
}

function countTopLevelProperties(doc: any): number {
  if (!doc || typeof doc !== 'object') return 0
  try {
    return Object.keys(doc).length
  } catch {
    return 0
  }
}

// Polynomial features generator matching sklearn PolynomialFeatures(include_bias=False)
// Order for n=2, degree=3: [x0, x1, x0^2, x0*x1, x1^2, x0^3, x0^2*x1, x0*x1^2, x1^3]
function combinationsWithReplacement(n: number, r: number): number[][] {
  const results: number[][] = []
  const combo = Array(r).fill(0)
  function backtrack(start: number, depth: number) {
    if (depth === r) {
      results.push([...combo])
      return
    }
    for (let i = start; i < n; i++) {
      combo[depth] = i
      backtrack(i, depth + 1)
    }
  }
  backtrack(0, 0)
  return results
}

function polyFeatures(xs: number[], degree: number): number[] {
  const feats: number[] = []
  const n = xs.length
  for (let d = 1; d <= degree; d++) {
    const combs = combinationsWithReplacement(n, d)
    for (const comb of combs) {
      let prod = 1
      for (const idx of comb) prod *= xs[idx]
      feats.push(prod)
    }
  }
  return feats
}

// --------------------------- Estimators ---------------------------
export function estimateReadPointRU(sizeBytesOrKb?: number, isBytes = true): number {
  const sizeKb = (() => {
    if (typeof sizeBytesOrKb !== 'number' || !Number.isFinite(sizeBytesOrKb)) return 0
    return isBytes ? sizeBytesOrKb / 1024 : sizeBytesOrKb
  })()

  const tiers = activeModels.readTiers
  if (tiers && tiers.length > 0) {
    for (const [th, ru] of tiers) {
      if (sizeKb <= th) return ru
    }
    return tiers[tiers.length - 1][1]
  }
  // Fallback linear
  return Math.max(1, Math.ceil(sizeKb))
}

export function estimateQueryRU(sizeBytesOrKb: number, isBytes = true): number {
  const sizeKb = isBytes ? sizeBytesOrKb / 1024 : sizeBytesOrKb
  const { intercept, coefSize } = activeModels.queryModel
  const ru = intercept + coefSize * sizeKb
  return Math.max(0, ru)
}

export function estimateWriteRU(sizeBytesOrKb: number, numProperties = 0, isBytes = true): number {
  const sizeKb = isBytes ? sizeBytesOrKb / 1024 : sizeBytesOrKb
  const { intercept, coefs, degree } = activeModels.writeModel
  const xs = [sizeKb, numProperties]
  const features = degree && degree > 1 ? polyFeatures(xs, degree) : xs
  const ru = intercept + features.reduce((acc, v, idx) => acc + v * (coefs[idx] ?? 0), 0)
  return Math.max(0, ru)
}

export function estimateRu(doc: any): RuEstimate {
  const sizeBytes = docSizeBytes(doc)
  const sizeKB = sizeBytes / 1024
  const numProperties = countTopLevelProperties(doc)
  const readPointRU = estimateReadPointRU(sizeBytes)
  const readQueryRU = estimateQueryRU(sizeBytes)
  const writeRU = estimateWriteRU(sizeBytes, numProperties)
  return { sizeBytes, sizeKB, numProperties, readPointRU, readQueryRU, writeRU }
}
