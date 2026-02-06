import type { Edge } from 'reactflow'
import type { TableData } from './types'

export function ensureColumnRenames(table: TableData): Record<string, string> {
  if (table.columnRenames) return table.columnRenames
  const map = Object.fromEntries((table.columns ?? []).map((c) => [c, c]))
  table.columnRenames = map
  return map
}

export function findOriginalColumn(columnRenames: Record<string, string>, current: string): string | undefined {
  return Object.entries(columnRenames).find(([, cur]) => cur === current)?.[0]
}

export function renameTable(table: TableData, newName: string): TableData {
  return { ...table, name: newName }
}

export function renameColumn(table: TableData, current: string, next: string): TableData {
  const columnRenames = ensureColumnRenames(table)
  const original = findOriginalColumn(columnRenames, current) ?? current
  const columns = table.columns.map((c) => (c === current ? next : c))
  const rows = table.rows.map((r) => {
    if (!(current in r) || next === current) return r
    const val = r[current]
    const out = { ...r, [next]: val }
    if (next !== current) delete out[current]
    return out
  })
  return { ...table, columns, rows, columnRenames: { ...columnRenames, [original]: next } }
}

export function applyColumnRenames(table: TableData, columnRenames: Record<string, string>): TableData {
  let out = table
  for (const [original, current] of Object.entries(columnRenames)) {
    const existingCurrent = findOriginalColumn(out.columnRenames ?? {}, current)
    // If already applied, skip
    if (existingCurrent === original) continue
    if ((out.columnRenames ?? {})[original] === current) continue
    const currentName = (out.columnRenames ?? {})[original] ?? original
    out = renameColumn(out, currentName, current)
  }
  return out
}

export function applyTableRenames(tables: TableData[], tableRenames?: Record<string, string>): TableData[] {
  if (!tableRenames) return tables
  return tables.map((t) => (tableRenames[t.id] ? { ...t, name: tableRenames[t.id], originalName: t.originalName ?? t.name } : t))
}

export function applyAllColumnRenames(tables: TableData[], columnRenames?: Record<string, Record<string, string>>): TableData[] {
  if (!columnRenames) return tables
  return tables.map((t) => {
    const cr = columnRenames[t.id]
    if (!cr) return t
    return applyColumnRenames({ ...t, columnRenames: ensureColumnRenames(t) }, cr)
  })
}

export function updateEdgesForColumnRename(edges: Edge[], tableId: string, current: string, next: string): Edge[] {
  return edges.map((e) => {
    let changed = false
    let sourceHandle = e.sourceHandle
    let targetHandle = e.targetHandle
    if (e.source === tableId && e.sourceHandle === current) {
      sourceHandle = next
      changed = true
    }
    if (e.target === tableId && e.targetHandle === current) {
      targetHandle = next
      changed = true
    }
    return changed ? { ...e, sourceHandle, targetHandle } : e
  })
}

export function renameSelectedColumns(selected: Record<string, string[]>, tableId: string, current: string, next: string) {
  const cur = selected[tableId]
  if (!cur) return selected
  const set = new Set(cur)
  if (set.has(current)) {
    set.delete(current)
    set.add(next)
  }
  return { ...selected, [tableId]: Array.from(set) }
}
