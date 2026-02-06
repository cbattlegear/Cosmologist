import { describe, it, expect } from 'vitest'
import type { TableData } from './types'
import { renameColumn, updateEdgesForColumnRename, renameSelectedColumns, applyColumnRenames } from './rename'

const makeTable = (cols: string[], rows: any[] = []): TableData => ({ id: 't1', name: 't1', fileName: 'f', columns: cols, rows, originalName: 't1', columnRenames: Object.fromEntries(cols.map((c) => [c, c])) })

describe('rename helpers', () => {
  it('renames column and rows, maintains mapping', () => {
    const table = makeTable(['id', 'name'], [{ id: 1, name: 'Alice' }])
    const renamed = renameColumn(table, 'name', 'full_name')
    expect(renamed.columns).toEqual(['id', 'full_name'])
    expect(renamed.rows[0]).toEqual({ id: 1, full_name: 'Alice' })
    expect(renamed.columnRenames?.name).toBe('full_name')
  })

  it('updates edges for column rename', () => {
    const edges = [{ id: 'e1', source: 't1', target: 't2', sourceHandle: 'name', targetHandle: 'id' } as any]
    const updated = updateEdgesForColumnRename(edges, 't1', 'name', 'full_name')
    expect(updated[0].sourceHandle).toBe('full_name')
  })

  it('renames selected columns', () => {
    const selected = { t1: ['id', 'name'] }
    const next = renameSelectedColumns(selected, 't1', 'name', 'full_name')
    expect(next.t1).toContain('full_name')
    expect(next.t1).not.toContain('name')
  })

  it('applies column renames to table', () => {
    const table = makeTable(['id', 'name'], [{ id: 1, name: 'Alice' }])
    const renames = { name: 'full_name' }
    const applied = applyColumnRenames(table, renames)
    expect(applied.columns).toEqual(['id', 'full_name'])
    expect(applied.rows[0]).toEqual({ id: 1, full_name: 'Alice' })
  })
})
