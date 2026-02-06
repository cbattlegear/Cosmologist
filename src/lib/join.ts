import type { Edge } from 'reactflow'
import type { TableData, RelationshipEdge } from './types'
import { applyTransforms, matchGroupColumns, type ColumnSplit, type TablePivot } from './transforms'

export function toRelationshipEdges(
  edges: Edge[],
  edgeTypes?: Record<string, 'one-to-many' | 'one-to-one'>,
  edgeColumnFilters?: Record<string, string[]>,
  edgeMaxDepth?: Record<string, number>,
  edgePropertyNames?: Record<string, string>,
): RelationshipEdge[] {
  return edges
    .map((e) => ({
      sourceTableId: e.source,
      targetTableId: e.target,
      sourceColumn: e.sourceHandle ?? '',
      targetColumn: e.targetHandle ?? '',
      type: edgeTypes?.[e.id] ?? (e.data as any)?.type,
      includedColumns: edgeColumnFilters?.[e.id],
      maxDepth: edgeMaxDepth?.[e.id],
      propertyName: edgePropertyNames?.[e.id],
    }))
    .filter((e) => e.sourceColumn && e.targetColumn)
}

export function buildJoinedDocument(
  leadTableId: string,
  leadRowIndex: number,
  tables: TableData[],
  relationships: RelationshipEdge[],
  options?: {
    columnsFilter?: Record<string, string[]>
    columnSplits?: ColumnSplit[]
    tablePivots?: TablePivot[]
  },
) {
  const tableMap = new Map<string, TableData>(tables.map((t) => [t.id, t]))
  const leadTable = tableMap.get(leadTableId)
  if (!leadTable) throw new Error(`Lead table not found: ${leadTableId}`)
  const leadRow = leadTable.rows[leadRowIndex]
  if (!leadRow) throw new Error(`Lead row not found index=${leadRowIndex}`)

  const columnsFilter = options?.columnsFilter
  const columnSplits = options?.columnSplits ?? []
  const tablePivots = options?.tablePivots ?? []
  const visited = new Set<string>() // tableId:rowIndex

  const rowKey = (tableId: string, row: Record<string, any>) => {
    const table = tableMap.get(tableId)
    if (!table) return `${tableId}:unknown:${JSON.stringify(row)}`
    const idx = table.rows.indexOf(row)
    return idx >= 0 ? `${tableId}:${idx}` : `${tableId}:${JSON.stringify(row)}`
  }

  const uniqBy = <T>(arr: T[], keyFn: (t: T) => string) => {
    const seen = new Set<string>()
    return arr.filter((item) => {
      const k = keyFn(item)
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
  }

  const projectRow = (tableId: string, row: Record<string, any>) => {
    const cols = columnsFilter?.[tableId]
    let out: Record<string, any>
    if (!cols || !cols.length) {
      out = { ...row }
    } else {
      out = cols.reduce((acc, key) => {
        if (key in row) acc[key] = row[key]
        return acc
      }, {} as Record<string, any>)
    }
    const table = tableMap.get(tableId)
    const allColumns = table?.columns ?? Object.keys(row)
    return applyTransforms(out, tableId, allColumns, columnSplits, tablePivots)
  }

  function buildNested(tableId: string, row: Record<string, any>, parentId?: string, depth = 0, _parentRel?: RelationshipEdge): Record<string, any> {
    const key = rowKey(tableId, row)
    // For recursion: use depth tracking instead of simple visited check
    const depthKey = `${key}:${depth}`
    if (visited.has(depthKey)) return projectRow(tableId, row)
    visited.add(depthKey)

    const projected = projectRow(tableId, row)

    const rels = relationships.filter((r) => r.sourceTableId === tableId || r.targetTableId === tableId)
    for (const rel of rels) {
      const childTableId = rel.sourceTableId === tableId ? rel.targetTableId : rel.sourceTableId
      // Check recursion depth for this edge
      const maxDepth = rel.maxDepth ?? undefined
      const isRecursive = childTableId === parentId || childTableId === tableId
      if (isRecursive) {
        // If no maxDepth set, block recursion (backward compat)
        if (maxDepth === undefined || maxDepth === 0) continue
        if (depth >= maxDepth) continue
      } else if (childTableId === parentId) {
        continue // avoid parent backref (non-recursive)
      }
      const childTable = tableMap.get(childTableId)
      if (!childTable) continue

      // Pivot-aware: if the join column belongs to a pivot group, expand to all sibling columns
      // and track which pivot array element each column maps to
      const findPivotInfo = (tblId: string, col: string): { pivot: TablePivot; siblingCols: Map<string, string> } | null => {
        const tbl = tableMap.get(tblId)
        if (!tbl) return null
        for (const pivot of tablePivots) {
          if (pivot.tableId !== tblId) continue
          for (const group of pivot.groups) {
            const matched = matchGroupColumns(tbl.columns, group.pattern)
            for (const colName of matched.values()) {
              if (colName === col) {
                return { pivot, siblingCols: matched }
              }
            }
          }
        }
        return null
      }

      const isSource = rel.sourceTableId === tableId
      const localCol = isSource ? rel.sourceColumn : rel.targetColumn
      const remoteCol = isSource ? rel.targetColumn : rel.sourceColumn
      const pivotInfo = findPivotInfo(tableId, localCol)

      // Build per-edge column filter (shared by both pivot and non-pivot paths)
      const childTableNames = new Set(
        relationships
          .filter((r) => r.sourceTableId === childTableId || r.targetTableId === childTableId)
          .map((r) => {
            const tid = r.sourceTableId === childTableId ? r.targetTableId : r.sourceTableId
            return tableMap.get(tid)?.name
          })
          .filter(Boolean) as string[],
      )
      const filterNestedCols = (obj: Record<string, any>) => {
        if (!rel.includedColumns || !rel.includedColumns.length) return obj
        const filtered: Record<string, any> = {}
        for (const key of Object.keys(obj)) {
          if (rel.includedColumns.includes(key) || childTableNames.has(key)) {
            filtered[key] = obj[key]
          }
        }
        return filtered
      }

      if (pivotInfo) {
        // Embed matched children inside each pivot array element
        const { pivot, siblingCols } = pivotInfo
        const pivotArray = projected[pivot.arrayName]
        if (Array.isArray(pivotArray)) {
          // Build a sorted index list matching the pivot element order
          const tbl = tableMap.get(tableId)!
          const allGroupMaps = pivot.groups.map((g) => matchGroupColumns(tbl.columns, g.pattern))
          const allIndices = new Set<string>()
          for (const gm of allGroupMaps) for (const idx of gm.keys()) allIndices.add(idx)
          const sortedIndices = [...allIndices].sort((a, b) => {
            const na = Number(a); const nb = Number(b)
            if (!isNaN(na) && !isNaN(nb)) return na - nb
            return a.localeCompare(b)
          })

          for (let i = 0; i < sortedIndices.length && i < pivotArray.length; i++) {
            const idx = sortedIndices[i]
            const colName = siblingCols.get(idx)
            if (!colName || !(colName in row)) continue
            const localValue = row[colName]
            const matches = childTable.rows.filter((r) => r[remoteCol] === localValue)
            if (matches.length) {
              const nested = uniqBy(
                matches.map((m) => filterNestedCols(buildNested(childTableId, m, tableId, isRecursive ? depth + 1 : 0, rel))),
                (node) => JSON.stringify(node),
              )
              const propName = rel.propertyName ?? childTable.name
              const type = rel.type ?? 'one-to-many'
              if (type === 'one-to-one') {
                pivotArray[i][propName] = nested[0]
              } else {
                pivotArray[i][propName] = nested
              }
            }
          }
        }
      } else {
        // Non-pivot: standard single-column matching
        const childMatches = childTable.rows.filter((r) => {
          return r[remoteCol] === row[localCol]
        })
        if (childMatches.length) {
          const nested = uniqBy(
            childMatches.map((m) => filterNestedCols(buildNested(childTableId, m, tableId, isRecursive ? depth + 1 : 0, rel))),
            (node) => JSON.stringify(node),
          )
          const propName = rel.propertyName ?? childTable.name
          const existing = projected[propName]
          const type = rel.type ?? 'one-to-many'
          if (type === 'one-to-one') {
            projected[propName] = nested[0]
          } else if (existing) {
            const arr = Array.isArray(existing) ? existing : [existing]
            projected[propName] = uniqBy(arr.concat(nested), (node: any) => JSON.stringify(node))
          } else {
            projected[propName] = nested
          }
        }
      }
    }

    return projected
  }

  return { [leadTable.name]: buildNested(leadTableId, leadRow) }
}
