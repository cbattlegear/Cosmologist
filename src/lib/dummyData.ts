import type { Edge } from 'reactflow'
import type { TableData } from './types'

const randInt = (faker: any, min: number, max: number) => faker.number.int({ min, max })

function genValue(faker: any, type?: string, maxLength?: number, scale?: number) {
  const t = (type ?? '').toLowerCase()
  if (t.includes('uniqueidentifier')) return faker.string.uuid()
  if (t === 'int' || t === 'integer') return randInt(faker, 1, 1_000_000)
  if (t === 'bigint') return randInt(faker, 1, 9_000_000)
  if (t === 'smallint' || t === 'tinyint') return randInt(faker, 1, 1000)
  if (t === 'decimal' || t === 'numeric' || t.startsWith('decimal') || t.startsWith('numeric')) {
    const s = scale ?? 2
    const factor = Math.pow(10, s)
    return faker.number.float({ min: 0, max: 10000, multipleOf: 1 / factor })
  }
  if (t === 'float' || t === 'real') return faker.number.float({ min: 0, max: 10000 })
  if (t === 'bit') return faker.datatype.boolean()
  if (t.includes('date') || t.includes('time')) return faker.date.recent({ days: 100 }).toISOString()
  if (t.includes('char') || t.includes('text') || t.includes('string') || t.includes('varchar') || t.includes('nchar') || t.includes('nvarchar')) {
    const len = maxLength && maxLength > 0 && maxLength < 200 ? maxLength : 20
    return faker.string.alphanumeric({ length: Math.min(len, 50) })
  }
  return faker.word.noun()
}

export async function generateDummyRowsForSchema(tables: TableData[], edges: Edge[], count = 10): Promise<TableData[]> {
  const { faker } = await import('@faker-js/faker')

  const tableMap = new Map(tables.map((t) => [t.id, t]))
  const parents: Record<string, { targetTableId: string; targetCol: string; sourceCol: string }[]> = {}
  edges.forEach((e) => {
    if (!parents[e.source]) parents[e.source] = []
    parents[e.source].push({ targetTableId: e.target, targetCol: e.targetHandle ?? '', sourceCol: e.sourceHandle ?? '' })
  })

  // topo sort by parent dependencies
  const indeg: Record<string, number> = {}
  tables.forEach((t) => indeg[t.id] = 0)
  edges.forEach((e) => { indeg[e.source] = (indeg[e.source] ?? 0) + 1 })
  const q = tables.filter((t) => (indeg[t.id] ?? 0) === 0).map((t) => t.id)
  const order: string[] = []
  while (q.length) {
    const id = q.shift()!
    order.push(id)
    edges.filter((e) => e.target === id).forEach((e) => {
      indeg[e.source] = (indeg[e.source] ?? 0) - 1
      if (indeg[e.source] === 0) q.push(e.source)
    })
  }
  if (order.length < tables.length) {
    // cycle fallback
    tables.forEach((t) => { if (!order.includes(t.id)) order.push(t.id) })
  }

  const rowsByTable: Record<string, any[]> = {}
  order.forEach((tid) => {
    const table = tableMap.get(tid)
    if (!table) return
    const columnInfo = table.columnTypes ?? {}
    const pkCols = table.primaryKeys ?? []
    const pkCounters: Record<string, number> = {}
    pkCols.forEach((c) => pkCounters[c] = 1)
    const rows: any[] = []
    for (let i = 0; i < count; i++) {
      const row: any = {}
      table.columns.forEach((col) => {
        const info = columnInfo[col] ?? {}
        const isPk = info.isPrimaryKey ?? pkCols.includes(col)
        if (isPk) {
          const t = (info.dataType ?? table.sourceType ?? '').toLowerCase()
          if (t.includes('uniqueidentifier')) row[col] = faker.string.uuid()
          else row[col] = pkCounters[col]++
          return
        }
        const fk = (parents[tid] ?? []).find((p) => p.sourceCol === col)
        if (fk) {
          const parentRows = rowsByTable[fk.targetTableId] ?? []
          if (parentRows.length) {
            const pick = faker.helpers.arrayElement(parentRows)
            row[col] = pick[fk.targetCol]
            return
          }
        }
        row[col] = genValue(faker, info.dataType)
      })
      rows.push(row)
    }
    rowsByTable[tid] = rows
  })

  return tables.map((t) => ({ ...t, rows: rowsByTable[t.id] ?? t.rows }))
}
