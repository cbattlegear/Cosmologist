import type { Edge } from 'reactflow'
import type { TableData, ParseFileError } from './types'
import { slugify } from './parseFiles'

function makeError(message: string, detail?: string, fileName?: string): ParseFileError {
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `err-${Date.now()}-${Math.random().toString(16).slice(2)}`
  return { id, message, detail, fileName }
}

const norm = (v: string | undefined): string | undefined => {
  if (v == null) return undefined
  const t = String(v).trim()
  if (!t) return undefined
  if (t.toUpperCase() === 'NULL') return undefined
  return t
}

// Parse SQL Server schema dump (tab-delimited) with header:
// table_schema table_name column_name ordinal_position data_type max_length precision scale is_nullable is_identity default_value is_primary_key fk_name fk_ref_schema fk_ref_table fk_ref_column
export function parseSqlServerSchema(text: string): { tables: TableData[]; edges: Edge[]; errors: ParseFileError[] } {
  const errors: ParseFileError[] = []
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (!lines.length) return { tables: [], edges: [], errors: [makeError('Empty schema input')] }

  const header = lines[0].split(/\t/)
  const expected = ['table_schema','table_name','column_name','ordinal_position','data_type','max_length','precision','scale','is_nullable','is_identity','default_value','is_primary_key','fk_name','fk_ref_schema','fk_ref_table','fk_ref_column']
  const lower = header.map((h) => h.trim().toLowerCase())
  const hasHeader = expected.every((h) => lower.includes(h))
  const startIdx = hasHeader ? 1 : 0

  type ColRow = {
    table_schema: string
    table_name: string
    column_name: string
    ordinal_position?: string
    data_type?: string
    fk_name?: string
    fk_ref_schema?: string
    fk_ref_table?: string
    fk_ref_column?: string
    is_primary_key?: string
  }

  const rows: ColRow[] = []
  const lowerHeader = header.map((h) => h.trim().toLowerCase())
  const expectedOrder = ['table_schema','table_name','column_name','ordinal_position','data_type','max_length','precision','scale','is_nullable','is_identity','default_value','is_primary_key','fk_name','fk_ref_schema','fk_ref_table','fk_ref_column']

  for (let i = startIdx; i < lines.length; i++) {
    const raw = lines[i].split(/\t/)
    const rowValues: Record<string, string> = {}
    if (raw.length >= expectedOrder.length) {
      // Map from start for leading fields, align last 4 fields from end to handle extra empties
      for (let j = 0; j < expectedOrder.length - 4; j++) {
        rowValues[expectedOrder[j]] = raw[j] ?? ''
      }
      rowValues['fk_name'] = raw[raw.length - 4] ?? ''
      rowValues['fk_ref_schema'] = raw[raw.length - 3] ?? ''
      rowValues['fk_ref_table'] = raw[raw.length - 2] ?? ''
      rowValues['fk_ref_column'] = raw[raw.length - 1] ?? ''
    } else {
      const rowMap = new Map<string, string>()
      lowerHeader.forEach((h, idx) => rowMap.set(h, raw[idx] ?? ''))
      expectedOrder.forEach((key) => {
        rowValues[key] = rowMap.get(key) ?? rowMap.get(key.replace('_', ' ')) ?? ''
      })
    }

    rows.push({
      table_schema: norm(rowValues.table_schema) ?? '',
      table_name: norm(rowValues.table_name) ?? '',
      column_name: norm(rowValues.column_name) ?? '',
      ordinal_position: norm(rowValues.ordinal_position),
      data_type: norm(rowValues.data_type),
      fk_name: norm(rowValues.fk_name),
      fk_ref_schema: norm(rowValues.fk_ref_schema),
      fk_ref_table: norm(rowValues.fk_ref_table),
      fk_ref_column: norm(rowValues.fk_ref_column),
      is_primary_key: norm(rowValues.is_primary_key),
    })
  }

  const tableMap = new Map<string, TableData>()
  const edges: Edge[] = []
  const pkTables = new Set<string>()

  const getTableKey = (schema: string, name: string) => `${schema}.${name}`
  const ensureTable = (schema: string, name: string): TableData => {
    const key = getTableKey(schema, name)
    const existing = tableMap.get(key)
    if (existing) return existing
    const displayName = schema ? `${schema}.${name}` : name
    const id = slugify(displayName)
    const table: TableData = {
      id,
      name: displayName,
      fileName: displayName,
      columns: [],
      rows: [],
      sourceType: 'sqlschema',
      originalName: displayName,
      columnRenames: {},
    }
    tableMap.set(key, table)
    return table
  }

  for (const r of rows) {
    if (!r.table_name || !r.column_name) continue
    const table = ensureTable(r.table_schema, r.table_name)
    if (!table.columns.includes(r.column_name)) {
      table.columns.push(r.column_name)
      if (!table.columnRenames) table.columnRenames = {}
      table.columnRenames[r.column_name] = r.column_name
    }
    if (!table.columnTypes) table.columnTypes = {}
    table.columnTypes[r.column_name] = { dataType: r.data_type, isPrimaryKey: !!r.is_primary_key && (r.is_primary_key === '1' || r.is_primary_key.toLowerCase() === 'true') }
    if (table.columnTypes[r.column_name].isPrimaryKey) {
      if (!table.primaryKeys) table.primaryKeys = []
      table.primaryKeys.push(r.column_name)
      pkTables.add(`${r.table_schema}.${r.table_name}`)
    }
  }

  // Build edges; dedupe by (srcTable, srcCol, dstTable, dstCol)
  const edgeSet = new Set<string>()
  for (const r of rows) {
    if (!r.fk_name) continue
    const srcTable = ensureTable(r.table_schema, r.table_name)
    const dstTable = ensureTable(r.fk_ref_schema ?? '', r.fk_ref_table ?? '')
    const srcCol = r.column_name
    const dstCol = r.fk_ref_column ?? ''
    if (!srcCol || !dstCol) continue
    const edgeId = `${srcTable.id}:${srcCol}__${dstTable.id}:${dstCol}`
    if (edgeSet.has(edgeId)) continue
    edgeSet.add(edgeId)
    edges.push({
      id: edgeId,
      source: srcTable.id,
      target: dstTable.id,
      sourceHandle: srcCol,
      targetHandle: dstCol,
      data: { type: 'one-to-many' },
    } as any)
  }

  const tables = Array.from(tableMap.values()).map((t) => {
    const key = `${t.name}`
    const simpleKey = key
    const isPk = pkTables.has(simpleKey)
    return isPk ? { ...t, isDocumentRoot: true } as any : t
  })
  return { tables, edges, errors }
}
