import { describe, it, expect } from 'vitest'
import type { TableData } from './types'
import { generateDummyRowsForSchema } from './dummyData'

const makeTable = (id: string, cols: string[], primaryKeys: string[], columnTypes: Record<string, any> = {}): TableData => ({
  id,
  name: id,
  fileName: id,
  columns: cols,
  rows: [],
  sourceType: 'sqlschema',
  primaryKeys,
  columnTypes,
})

describe('generateDummyRowsForSchema', () => {
  it('generates rows and respects FK relationships', async () => {
    const parent = makeTable('parent', ['Id', 'Name'], ['Id'], { Id: { dataType: 'uniqueidentifier', isPrimaryKey: true }, Name: { dataType: 'nvarchar' } })
    const child = makeTable('child', ['Id', 'ParentId'], ['Id'], { Id: { dataType: 'uniqueidentifier', isPrimaryKey: true }, ParentId: { dataType: 'uniqueidentifier' } })
    const edges = [{ id: 'e1', source: 'child', target: 'parent', sourceHandle: 'ParentId', targetHandle: 'Id' } as any]
    const [pOut, cOut] = await generateDummyRowsForSchema([parent, child], edges, 5)
    expect(pOut.rows).toHaveLength(5)
    expect(cOut.rows).toHaveLength(5)
    const parentIds = new Set(pOut.rows.map((r: any) => r.Id))
    cOut.rows.forEach((r: any) => {
      expect(parentIds.has(r.ParentId)).toBe(true)
    })
  })
})
