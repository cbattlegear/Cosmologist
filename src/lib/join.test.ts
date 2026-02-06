import { describe, it, expect } from 'vitest'
import { buildJoinedDocument } from './join'
import type { TableData, RelationshipEdge } from './types'
import type { TablePivot } from './transforms'

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
  { sourceTableId: 'a', targetTableId: 'b', sourceColumn: 'b_id', targetColumn: 'id' },
]

describe('buildJoinedDocument', () => {
  it('joins rows across tables hierarchically', () => {
    const doc = buildJoinedDocument('a', 0, tables, relationships)
    expect(doc).toEqual({
      A: {
        id: 1,
        b_id: 10,
        B: [{ id: 10, val: 'x' }],
      },
    })
  })

  it('handles reverse traversal', () => {
    const reversed: RelationshipEdge[] = [
      { sourceTableId: 'b', targetTableId: 'a', sourceColumn: 'id', targetColumn: 'b_id' },
    ]
    const doc = buildJoinedDocument('a', 1, tables, reversed)
    expect(doc).toEqual({ A: { id: 2, b_id: 11, B: [{ id: 11, val: 'y' }] } })
  })

  it('includes multiple matches as array', () => {
    const multi: TableData[] = [
      tables[0],
      {
        ...tables[1],
        rows: [
          { id: 10, val: 'x' },
          { id: 10, val: 'x2' },
        ],
      },
    ]
    const doc = buildJoinedDocument('a', 0, multi, relationships)
    expect(doc.A.B).toEqual([
      { id: 10, val: 'x' },
      { id: 10, val: 'x2' },
    ])
  })

  it('deduplicates rows in result', () => {
    const rels: RelationshipEdge[] = [
      { sourceTableId: 'a', targetTableId: 'b', sourceColumn: 'b_id', targetColumn: 'id' },
      { sourceTableId: 'b', targetTableId: 'a', sourceColumn: 'id', targetColumn: 'b_id' },
    ]
    const doc = buildJoinedDocument('a', 0, tables, rels)
    expect(doc.A.B).toEqual([{ id: 10, val: 'x' }])
  })

  it('projects selected columns per table', () => {
    const doc = buildJoinedDocument('a', 0, tables, relationships, {
      columnsFilter: {
        a: ['id'],
        b: ['val'],
      },
    })
    expect(doc).toEqual({ A: { id: 1, B: [{ val: 'x' }] } })
  })

  it('nests deeper hierarchies', () => {
    const cTable: TableData = {
      id: 'c',
      name: 'C',
      fileName: 'c.csv',
      columns: ['id', 'b_id'],
      rows: [{ id: 100, b_id: 10 }],
    }
    const rels: RelationshipEdge[] = [
      { sourceTableId: 'a', targetTableId: 'b', sourceColumn: 'b_id', targetColumn: 'id' },
      { sourceTableId: 'b', targetTableId: 'c', sourceColumn: 'id', targetColumn: 'b_id' },
    ]
    const doc = buildJoinedDocument('a', 0, [tables[0], tables[1], cTable], rels)
    expect(doc).toEqual({
      A: {
        id: 1,
        b_id: 10,
        B: [
          {
            id: 10,
            val: 'x',
            C: [{ id: 100, b_id: 10 }],
          },
        ],
      },
    })
  })

  it('filters columns per edge via includedColumns', () => {
    const rels: RelationshipEdge[] = [
      { sourceTableId: 'a', targetTableId: 'b', sourceColumn: 'b_id', targetColumn: 'id', includedColumns: ['val'] },
    ]
    const doc = buildJoinedDocument('a', 0, tables, rels)
    expect(doc).toEqual({
      A: {
        id: 1,
        b_id: 10,
        B: [{ val: 'x' }],
      },
    })
  })

  it('blocks recursive relationships by default', () => {
    const selfTable: TableData = {
      id: 'emp',
      name: 'Employee',
      fileName: 'emp.csv',
      columns: ['id', 'name', 'manager_id'],
      rows: [
        { id: 1, name: 'Boss', manager_id: null },
        { id: 2, name: 'Worker', manager_id: 1 },
      ],
    }
    const rels: RelationshipEdge[] = [
      { sourceTableId: 'emp', targetTableId: 'emp', sourceColumn: 'id', targetColumn: 'manager_id' },
    ]
    // With no maxDepth, recursive edges are blocked
    const doc = buildJoinedDocument('emp', 0, [selfTable], rels)
    expect(doc).toEqual({ Employee: { id: 1, name: 'Boss', manager_id: null } })
  })

  it('allows recursive relationships up to maxDepth', () => {
    const selfTable: TableData = {
      id: 'emp',
      name: 'Employee',
      fileName: 'emp.csv',
      columns: ['id', 'name', 'manager_id'],
      rows: [
        { id: 1, name: 'Boss', manager_id: null },
        { id: 2, name: 'Worker', manager_id: 1 },
        { id: 3, name: 'Intern', manager_id: 2 },
      ],
    }
    const rels: RelationshipEdge[] = [
      { sourceTableId: 'emp', targetTableId: 'emp', sourceColumn: 'id', targetColumn: 'manager_id', maxDepth: 2 },
    ]
    const doc = buildJoinedDocument('emp', 0, [selfTable], rels)
    expect(doc.Employee.Employee).toBeDefined()
    // Boss -> Worker (depth 1) -> Intern (depth 2), then stops
    expect(doc.Employee.Employee[0].name).toBe('Worker')
    expect(doc.Employee.Employee[0].Employee[0].name).toBe('Intern')
  })

  it('excludes split columns when deselected via includedColumns', () => {
    const rels: RelationshipEdge[] = [
      { sourceTableId: 'a', targetTableId: 'b', sourceColumn: 'b_id', targetColumn: 'id', includedColumns: ['id'] },
    ]
    const splitTables: TableData[] = [
      tables[0],
      { ...tables[1], columns: ['id', 'val'], rows: [{ id: 10, val: 'a;b;c' }] },
    ]
    // Split on 'val' column, but edge only includes 'id'
    const doc = buildJoinedDocument('a', 0, splitTables, rels, {
      columnSplits: [{ tableId: 'b', column: 'val', delimiter: ';' }],
    })
    // 'val' should NOT appear even though split turns it into an array
    expect(doc.A.B[0]).toEqual({ id: 10 })
    expect(doc.A.B[0].val).toBeUndefined()
  })

  it('embeds pivot-grouped relationship matches inside each pivot element', () => {
    const ordersTable: TableData = {
      id: 'orders',
      name: 'Orders',
      fileName: 'orders.csv',
      columns: ['id', 'product1', 'qty1', 'product2', 'qty2'],
      rows: [
        { id: 1, product1: 'A', qty1: 5, product2: 'B', qty2: 3 },
      ],
    }
    const productsTable: TableData = {
      id: 'products',
      name: 'Products',
      fileName: 'products.csv',
      columns: ['sku', 'name'],
      rows: [
        { sku: 'A', name: 'Widget' },
        { sku: 'B', name: 'Gadget' },
        { sku: 'C', name: 'Gizmo' },
      ],
    }
    // Relationship from product1 → sku, with a pivot on product,qty
    // Each pivot element should embed its own matching Products entry
    const rels: RelationshipEdge[] = [
      { sourceTableId: 'orders', targetTableId: 'products', sourceColumn: 'product1', targetColumn: 'sku' },
    ]
    const pivot: TablePivot = {
      tableId: 'orders',
      arrayName: 'Items',
      groups: [
        { pattern: 'product', propertyName: 'product' },
        { pattern: 'qty', propertyName: 'qty' },
      ],
    }
    const doc = buildJoinedDocument('orders', 0, [ordersTable, productsTable], rels, {
      tablePivots: [pivot],
    })
    // Each Items element should have its own Products match embedded
    expect(doc.Orders.Items).toHaveLength(2)
    expect(doc.Orders.Items[0].product).toBe('A')
    expect(doc.Orders.Items[0].Products).toEqual([{ sku: 'A', name: 'Widget' }])
    expect(doc.Orders.Items[1].product).toBe('B')
    expect(doc.Orders.Items[1].Products).toEqual([{ sku: 'B', name: 'Gadget' }])
    // Products should NOT appear as a sibling to Items
    expect(doc.Orders.Products).toBeUndefined()
  })

  it('embeds 1:1 pivot-grouped matches as objects not arrays', () => {
    const ordersTable: TableData = {
      id: 'orders',
      name: 'Orders',
      fileName: 'orders.csv',
      columns: ['id', 'product1', 'qty1', 'product2', 'qty2'],
      rows: [
        { id: 1, product1: 'A', qty1: 5, product2: 'B', qty2: 3 },
      ],
    }
    const productsTable: TableData = {
      id: 'products',
      name: 'Products',
      fileName: 'products.csv',
      columns: ['sku', 'name'],
      rows: [
        { sku: 'A', name: 'Widget' },
        { sku: 'B', name: 'Gadget' },
      ],
    }
    const rels: RelationshipEdge[] = [
      { sourceTableId: 'orders', targetTableId: 'products', sourceColumn: 'product1', targetColumn: 'sku', type: 'one-to-one' },
    ]
    const pivot: TablePivot = {
      tableId: 'orders',
      arrayName: 'Items',
      groups: [
        { pattern: 'product', propertyName: 'product' },
        { pattern: 'qty', propertyName: 'qty' },
      ],
    }
    const doc = buildJoinedDocument('orders', 0, [ordersTable, productsTable], rels, {
      tablePivots: [pivot],
    })
    expect(doc.Orders.Items).toHaveLength(2)
    expect(doc.Orders.Items[0].Products).toEqual({ sku: 'A', name: 'Widget' })
    expect(doc.Orders.Items[1].Products).toEqual({ sku: 'B', name: 'Gadget' })
  })
})
