import { describe, it, expect } from 'vitest'
import { parseSqlServerSchema } from './parseSqlSchema'

const sample = `table_schema\ttable_name\tcolumn_name\tordinal_position\tdata_type\tmax_length\tprecision\tscale\tis_nullable\tis_identity\tdefault_value\tis_primary_key\tfk_name\tfk_ref_schema\tfk_ref_table\tfk_ref_column
app\tInventory\tId\t3\tuniqueidentifier\t16\t0\t0\t0\t0\t(newid())\t1\t\t\t\t
app\tInventory\tItemDescription\t1\tvarchar\t40\t0\t0\t0\t0\t\t\t0\t\t\t\napp\tPurchaseLineItems\tId\t3\tuniqueidentifier\t16\t0\t0\t0\t0\t(newid())\t1\t\t\t\t\napp\tPurchaseLineItems\tItemId\t4\tuniqueidentifier\t16\t0\t0\t0\t0\t\t\t0\tFK_PurchaseLineItems_Inventory\tapp\tInventory\tId
app\tPurchaseLineItems\tBadFk\t5\tuniqueidentifier\t16\t0\t0\t0\t0\t\t\t0\tFK_BAD\tNULL\tNULL\tNULL
`

describe('parseSqlServerSchema', () => {
  it('parses tables and edges', () => {
    const { tables, edges, errors } = parseSqlServerSchema(sample)
    expect(errors).toHaveLength(0)
    const inv = tables.find((t) => t.name === 'app.Inventory')
    const pli = tables.find((t) => t.name === 'app.PurchaseLineItems')
    expect(inv?.columns).toEqual(['Id', 'ItemDescription'])
    expect(pli?.columns).toEqual(expect.arrayContaining(['Id', 'ItemId']))
    expect(edges).toHaveLength(1)
    expect(edges[0].source).toBe(pli?.id)
    expect(edges[0].target).toBe(inv?.id)
    expect(inv?.isDocumentRoot).toBe(true)
    expect(pli?.isDocumentRoot).toBe(true)
    expect(edges[0].sourceHandle).toBe('ItemId')
    expect(edges[0].targetHandle).toBe('Id')
  })
})
