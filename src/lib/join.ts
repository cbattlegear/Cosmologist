import type { Edge } from 'reactflow'
import type { TableData, RelationshipEdge } from './types'

export function toRelationshipEdges(edges: Edge[], edgeTypes?: Record<string, 'one-to-many' | 'one-to-one'>): RelationshipEdge[] {
  return edges
    .map((e) => ({
      sourceTableId: e.source,
      targetTableId: e.target,
      sourceColumn: e.sourceHandle ?? '',
      targetColumn: e.targetHandle ?? '',
      type: edgeTypes?.[e.id] ?? (e.data as any)?.type,
    }))
    .filter((e) => e.sourceColumn && e.targetColumn)
}

export function buildJoinedDocument(
  leadTableId: string,
  leadRowIndex: number,
  tables: TableData[],
  relationships: RelationshipEdge[],
  options?: { columnsFilter?: Record<string, string[]> },
) {
  const tableMap = new Map<string, TableData>(tables.map((t) => [t.id, t]))
  const leadTable = tableMap.get(leadTableId)
  if (!leadTable) throw new Error(`Lead table not found: ${leadTableId}`)
  const leadRow = leadTable.rows[leadRowIndex]
  if (!leadRow) throw new Error(`Lead row not found index=${leadRowIndex}`)

  const columnsFilter = options?.columnsFilter
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
    if (!cols || !cols.length) return { ...row }
    return cols.reduce((acc, key) => {
      if (key in row) acc[key] = row[key]
      return acc
    }, {} as Record<string, any>)
  }

  function buildNested(tableId: string, row: Record<string, any>, parentId?: string): Record<string, any> {
    const key = rowKey(tableId, row)
    if (visited.has(key)) return projectRow(tableId, row)
    visited.add(key)

    const projected = projectRow(tableId, row)

    const rels = relationships.filter((r) => r.sourceTableId === tableId || r.targetTableId === tableId)
    for (const rel of rels) {
      const childTableId = rel.sourceTableId === tableId ? rel.targetTableId : rel.sourceTableId
      if (childTableId === parentId) continue // avoid parent backref
      const childTable = tableMap.get(childTableId)
      if (!childTable) continue
      const childMatches = childTable.rows.filter((r) => {
        return rel.sourceTableId === tableId
          ? r[rel.targetColumn] === row[rel.sourceColumn]
          : r[rel.sourceColumn] === row[rel.targetColumn]
      })
      if (childMatches.length) {
        const nested = uniqBy(
          childMatches.map((m) => buildNested(childTableId, m, tableId)),
  (node) => JSON.stringify(node),
        )
        const existing = projected[childTable.name]
        const type = rel.type ?? 'one-to-many'
        if (type === 'one-to-one') {
          // For 1:1 keep a single object (prefer first)
          projected[childTable.name] = nested[0]
        } else if (existing) {
          const arr = Array.isArray(existing) ? existing : [existing]
          projected[childTable.name] = uniqBy(arr.concat(nested), (node: any) => JSON.stringify(node))
        } else {
          projected[childTable.name] = nested
        }
      }
    }

    return projected
  }

  return { [leadTable.name]: buildNested(leadTableId, leadRow) }
}
