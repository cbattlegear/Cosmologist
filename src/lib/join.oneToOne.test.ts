import { describe, it, expect } from 'vitest'
import { buildJoinedDocument } from './join'
import type { TableData, RelationshipEdge } from './types'

const tables: TableData[] = [
  {
    id: 'a',
    name: 'A',
    fileName: 'a.csv',
    columns: ['id', 'b_id'],
    rows: [
      { id: 1, b_id: 10 },
      { id: 2, b_id: 11 },
    ],
  },
  {
    id: 'b',
    name: 'B',
    fileName: 'b.csv',
    columns: ['id', 'val'],
    rows: [
      { id: 10, val: 'x' },
      { id: 11, val: 'y' },
    ],
  },
]

const relationships: RelationshipEdge[] = [
  { sourceTableId: 'a', targetTableId: 'b', sourceColumn: 'b_id', targetColumn: 'id', type: 'one-to-one' },
]

describe('buildJoinedDocument one-to-one', () => {
  it('nests child as object for 1:1', () => {
    const doc = buildJoinedDocument('a', 0, tables, relationships)
    expect(doc).toEqual({ A: { id: 1, b_id: 10, B: { id: 10, val: 'x' } } })
  })
})
