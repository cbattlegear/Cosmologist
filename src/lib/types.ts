export type Row = Record<string, any>

export interface TableData {
  id: string
  name: string
  fileName: string
  columns: string[]
  rows: Row[]
  sourceText?: string
  sourceType?: string
  originalName?: string
  columnRenames?: Record<string, string> // original -> current
  isDocumentRoot?: boolean
  primaryKeys?: string[]
  columnTypes?: Record<string, { dataType?: string; isPrimaryKey?: boolean }>
}

export interface ParseFileError {
  id: string
  fileName?: string
  message: string
  detail?: string
  sourceType?: string
}

export interface RelationshipEdge {
  sourceTableId: string
  targetTableId: string
  sourceColumn: string
  targetColumn: string
  type?: 'one-to-many' | 'one-to-one'
  includedColumns?: string[] // per-edge column filter for child table
  maxDepth?: number          // recursion depth limit (0 = no recurse, undefined = default 1-level)
  propertyName?: string      // override property name in joined output (defaults to child table name)
}
