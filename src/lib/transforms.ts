/**
 * Column transforms applied at document-build time.
 *
 * Split:  Splits a delimited string value into a JSON array.
 * Pivot:  Groups numbered/patterned columns into an array of objects.
 */

// ── Types ────────────────────────────────────────────────────────────

/** Split a column's string values on `delimiter` into an array. */
export interface ColumnSplit {
  tableId: string
  column: string
  delimiter: string
}

/**
 * Pivot groups of numbered columns into an array of objects.
 *
 * Example config for Item1,Fact1,Item2,Fact2,Item3,Fact3 → Items[]:
 *   { tableId, arrayName: "Items", groups: [
 *       { pattern: "Item", propertyName: "Item" },
 *       { pattern: "Fact", propertyName: "Fact" },
 *   ]}
 *
 * Resolution: for each group.pattern we find all columns whose name
 * starts with the pattern (case-sensitive), strip the pattern prefix
 * to get the index (e.g. "1","2","3"), and collect across groups by
 * matching index.
 */
export interface PivotGroup {
  pattern: string      // column-name prefix to match, e.g. "Item"
  propertyName: string // output property name in each object, e.g. "Item"
}

export interface TablePivot {
  tableId: string
  arrayName: string    // name of the resulting array property, e.g. "Items"
  groups: PivotGroup[]
}

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Resolve which concrete columns a pivot group matches.
 * Returns a map: index (suffix) → columnName.
 */
export function matchGroupColumns(
  allColumns: string[],
  pattern: string,
): Map<string, string> {
  const result = new Map<string, string>()
  for (const col of allColumns) {
    if (col.startsWith(pattern)) {
      const suffix = col.slice(pattern.length)
      if (suffix.length > 0) {
        result.set(suffix, col)
      }
    }
  }
  return result
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Apply column-split transforms to a projected row object (mutates a copy).
 */
export function applySplits(
  row: Record<string, any>,
  splits: ColumnSplit[],
  tableId: string,
): Record<string, any> {
  const out = { ...row }
  for (const split of splits) {
    if (split.tableId !== tableId) continue
    const val = out[split.column]
    if (typeof val === 'string') {
      out[split.column] = val.split(split.delimiter).map((s) => s.trim())
    }
  }
  return out
}

/**
 * Apply table-pivot transforms to a projected row object.
 * Returns a new object with pivot columns removed and the array property added.
 */
export function applyPivots(
  row: Record<string, any>,
  pivots: TablePivot[],
  tableId: string,
  allColumns: string[],
): Record<string, any> {
  let out = { ...row }
  for (const pivot of pivots) {
    if (pivot.tableId !== tableId) continue

    // 1. Resolve columns per group
    const groupMaps = pivot.groups.map((g) => ({
      group: g,
      cols: matchGroupColumns(allColumns, g.pattern),
    }))

    // 2. Collect all unique indices across groups
    const allIndices = new Set<string>()
    for (const { cols } of groupMaps) {
      for (const idx of cols.keys()) allIndices.add(idx)
    }

    // 3. Sort indices naturally (1,2,3... or a,b,c...)
    const sortedIndices = [...allIndices].sort((a, b) => {
      const na = Number(a)
      const nb = Number(b)
      if (!isNaN(na) && !isNaN(nb)) return na - nb
      return a.localeCompare(b)
    })

    // 4. Build array of objects
    const arr: Record<string, any>[] = []
    for (const idx of sortedIndices) {
      const obj: Record<string, any> = {}
      let hasValue = false
      for (const { group, cols } of groupMaps) {
        const colName = cols.get(idx)
        if (colName && colName in out) {
          obj[group.propertyName] = out[colName]
          hasValue = true
        }
      }
      if (hasValue) arr.push(obj)
    }

    // 5. Remove pivoted columns from output
    for (const { cols } of groupMaps) {
      for (const colName of cols.values()) {
        delete out[colName]
      }
    }

    // 6. Set array property
    out[pivot.arrayName] = arr
  }
  return out
}

/**
 * Apply all transforms (splits then pivots) to a projected row.
 */
export function applyTransforms(
  row: Record<string, any>,
  tableId: string,
  allColumns: string[],
  splits: ColumnSplit[],
  pivots: TablePivot[],
): Record<string, any> {
  let out = applySplits(row, splits, tableId)
  out = applyPivots(out, pivots, tableId, allColumns)
  return out
}
