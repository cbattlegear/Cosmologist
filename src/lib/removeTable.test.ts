import { describe, it, expect } from 'vitest'
import type { Edge, Node } from 'reactflow'
import type { TableData } from './types'
import type { TableNodeData } from '../components/TableNode'
import { removeTable } from './removeTable'

const tables: TableData[] = [
  { id: 'a', name: 'A', fileName: 'a.csv', columns: ['id'], rows: [{ id: 1 }] },
  { id: 'b', name: 'B', fileName: 'b.csv', columns: ['id'], rows: [{ id: 2 }] },
]

const nodes: Node<TableNodeData>[] = [
  { id: 'a', position: { x: 0, y: 0 }, data: { table: tables[0] }, type: 'tableNode' },
  { id: 'b', position: { x: 100, y: 0 }, data: { table: tables[1] }, type: 'tableNode' },
]

const edges: Edge[] = [
  { id: 'a__b', source: 'a', target: 'b' },
]

describe('removeTable', () => {
  it('removes table, node, edges and returns new lead', () => {
    const res = removeTable('a', tables, nodes, edges)
    expect(res.tables).toHaveLength(1)
    expect(res.nodes).toHaveLength(1)
    expect(res.edges).toHaveLength(0)
    expect(res.rootTableId).toBe('b')
  })
})
