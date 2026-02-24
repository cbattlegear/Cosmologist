import type { TableData, Row } from './types'
import type { AdvisorResponse, RecommendedProperty } from './advisorTypes'

/**
 * Populate advisor-recommended containers with actual data from source tables.
 * Uses the `source` field on each property (format: "TableName.column_name")
 * to map data from the original relational tables into the new document structure.
 */
export function materializeAdvisorData(
  response: AdvisorResponse,
  sourceTables: TableData[],
  relationships: { sourceTableId: string; targetTableId: string; sourceColumn: string; targetColumn: string }[],
): Row[] {
  // Build a lookup: normalized table name → TableData
  const tableByName = new Map<string, TableData>()
  for (const t of sourceTables) {
    tableByName.set(t.name.toLowerCase(), t)
    // Also index by name without schema prefix (e.g. "movies" for "dbo.movies")
    const dotIdx = t.name.lastIndexOf('.')
    if (dotIdx >= 0) {
      tableByName.set(t.name.substring(dotIdx + 1).toLowerCase(), t)
    }
  }

  if (!response.containers.length) return []
  const container = response.containers[0]
  const rootTable = findSourceTable(container.properties, tableByName)
  if (!rootTable) return []

  return rootTable.rows.map((rootRow) => {
    const doc: Row = {}
    // Map top-level properties
    for (const prop of container.properties) {
      const srcCol = resolveSourceColumn(prop, rootTable, tableByName)
      if (srcCol && srcCol.column in rootRow) {
        doc[prop.name] = rootRow[srcCol.column]
      } else {
        doc[prop.name] = rootRow[prop.name] ?? ''
      }
    }
    // Map embedded entities
    for (const emb of container.embeddedEntities ?? []) {
      const embTable = resolveEmbeddedTable(emb.sourceTable, tableByName)
      if (!embTable) continue
      const joinInfo = findJoinPath(rootTable, embTable, relationships, sourceTables)
      if (!joinInfo) continue
      let matched: Row[]
      if (joinInfo.localCol.startsWith('__junction__')) {
        matched = resolveJunctionMatches(rootRow, joinInfo, embTable, sourceTables)
      } else {
        matched = embTable.rows.filter((r) => r[joinInfo.remoteCol] === rootRow[joinInfo.localCol])
      }
      const mapped = matched.map((r) => {
        const obj: Row = {}
        for (const prop of emb.properties) {
          const col = resolveSourceColumn(prop, embTable, tableByName)
          obj[prop.name] = col ? r[col.column] ?? '' : r[prop.name] ?? ''
        }
        return obj
      })
      doc[emb.name] = emb.relationship === 'one-to-one' ? (mapped[0] ?? null) : mapped
    }
    return doc
  })
}

function resolveSourceColumn(
  prop: RecommendedProperty,
  defaultTable: TableData,
  tableByName: Map<string, TableData>,
): { table: TableData; column: string } | null {
  if (!prop.source) {
    // Try direct match on the default table
    if (defaultTable.columns.includes(prop.name)) return { table: defaultTable, column: prop.name }
    return null
  }
  const parts = prop.source.split('.')
  const colName = parts[parts.length - 1]
  // Try to find the source table
  if (parts.length >= 2) {
    const tablePart = parts.slice(0, -1).join('.').toLowerCase()
    const table = tableByName.get(tablePart) ?? tableByName.get(parts[parts.length - 2].toLowerCase())
    if (table && table.columns.includes(colName)) return { table, column: colName }
  }
  // Fallback: look for column in default table
  if (defaultTable.columns.includes(colName)) return { table: defaultTable, column: colName }
  return null
}

function findSourceTable(
  properties: RecommendedProperty[],
  tableByName: Map<string, TableData>,
): TableData | null {
  // Find the table that most properties map to
  const counts = new Map<TableData, number>()
  for (const prop of properties) {
    if (!prop.source) continue
    const parts = prop.source.split('.')
    if (parts.length >= 2) {
      const tablePart = parts.slice(0, -1).join('.').toLowerCase()
      const table = tableByName.get(tablePart) ?? tableByName.get(parts[parts.length - 2].toLowerCase())
      if (table) counts.set(table, (counts.get(table) ?? 0) + 1)
    }
  }
  let best: TableData | null = null
  let bestCount = 0
  for (const [table, count] of counts) {
    if (count > bestCount) { best = table; bestCount = count }
  }
  return best
}

function resolveEmbeddedTable(
  sourceTableStr: string,
  tableByName: Map<string, TableData>,
): TableData | null {
  // sourceTable can be "dbo.actors / dbo.actorstomoviesjoin" — try each part
  const candidates = sourceTableStr.split(/\s*\/\s*/)
  for (const candidate of candidates) {
    const lower = candidate.trim().toLowerCase()
    const table = tableByName.get(lower)
    if (table && table.rows.length > 0) return table
    // Try without schema
    const dotIdx = lower.lastIndexOf('.')
    if (dotIdx >= 0) {
      const short = lower.substring(dotIdx + 1)
      const t = tableByName.get(short)
      if (t && t.rows.length > 0) return t
    }
  }
  // Second pass: return first match even without rows
  for (const candidate of candidates) {
    const lower = candidate.trim().toLowerCase()
    const table = tableByName.get(lower) ?? tableByName.get(lower.split('.').pop()!)
    if (table) return table
  }
  return null
}

function findJoinPath(
  rootTable: TableData,
  targetTable: TableData,
  relationships: { sourceTableId: string; targetTableId: string; sourceColumn: string; targetColumn: string }[],
  allTables: TableData[],
): { localCol: string; remoteCol: string } | null {
  // Direct relationship
  for (const rel of relationships) {
    if (rel.sourceTableId === rootTable.id && rel.targetTableId === targetTable.id) {
      return { localCol: rel.sourceColumn, remoteCol: rel.targetColumn }
    }
    if (rel.targetTableId === rootTable.id && rel.sourceTableId === targetTable.id) {
      return { localCol: rel.targetColumn, remoteCol: rel.sourceColumn }
    }
  }
  // Through a junction table (one hop): root → junction → target
  for (const relA of relationships) {
    const junctionId = relA.sourceTableId === rootTable.id ? relA.targetTableId
      : relA.targetTableId === rootTable.id ? relA.sourceTableId : null
    if (!junctionId || junctionId === targetTable.id) continue
    const junction = allTables.find((t) => t.id === junctionId)
    if (!junction) continue
    for (const relB of relationships) {
      if (relB.sourceTableId === junctionId && relB.targetTableId === targetTable.id) {
        // root.localCol → junction.junctionRootCol ... junction.junctionTargetCol → target.remoteCol
        // We need to flatten through the junction
        const rootToJunction = relA.sourceTableId === rootTable.id
          ? { local: relA.sourceColumn, remote: relA.targetColumn }
          : { local: relA.targetColumn, remote: relA.sourceColumn }
        const junctionToTarget = { local: relB.sourceColumn, remote: relB.targetColumn }
        // Return a special handler — for now, do an in-memory join
        return {
          localCol: `__junction__${rootToJunction.local}__${rootToJunction.remote}__${junctionId}__${junctionToTarget.local}__${junctionToTarget.remote}`,
          remoteCol: '__junction__',
        }
      }
      if (relB.targetTableId === junctionId && relB.sourceTableId === targetTable.id) {
        const rootToJunction = relA.sourceTableId === rootTable.id
          ? { local: relA.sourceColumn, remote: relA.targetColumn }
          : { local: relA.targetColumn, remote: relA.sourceColumn }
        const junctionToTarget = { local: relB.targetColumn, remote: relB.sourceColumn }
        return {
          localCol: `__junction__${rootToJunction.local}__${rootToJunction.remote}__${junctionId}__${junctionToTarget.local}__${junctionToTarget.remote}`,
          remoteCol: '__junction__',
        }
      }
    }
  }
  // Heuristic: look for matching column names between root and target
  for (const col of rootTable.columns) {
    if (targetTable.columns.includes(col)) {
      return { localCol: col, remoteCol: col }
    }
  }
  // Try PK-based: root PK exists in target columns
  for (const pk of rootTable.primaryKeys ?? []) {
    if (targetTable.columns.includes(pk)) {
      return { localCol: pk, remoteCol: pk }
    }
  }
  return null
}

/**
 * Resolve junction-based joins by doing an in-memory join through the junction table.
 * Called when findJoinPath returns a __junction__ sentinel.
 */
export function resolveJunctionMatches(
  rootRow: Row,
  joinInfo: { localCol: string; remoteCol: string },
  targetTable: TableData,
  allTables: TableData[],
): Row[] {
  if (!joinInfo.localCol.startsWith('__junction__')) return []
  const parts = joinInfo.localCol.split('__').filter(Boolean) // junction, rootLocal, rootRemote, junctionId, juncLocal, juncRemote
  if (parts.length < 6) return []
  const [, rootLocal, rootRemote, junctionId, juncLocal, juncRemote] = parts
  const junction = allTables.find((t) => t.id === junctionId)
  if (!junction) return []
  const rootVal = rootRow[rootLocal]
  const junctionMatches = junction.rows.filter((r) => r[rootRemote] === rootVal)
  const targetVals = new Set(junctionMatches.map((r) => r[juncLocal]))
  return targetTable.rows.filter((r) => targetVals.has(r[juncRemote]))
}
