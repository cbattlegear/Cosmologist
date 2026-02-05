export type Row = Record<string, any>

export interface TableData {
  id: string
  name: string
  fileName: string
  columns: string[]
  rows: Row[]
  sourceText?: string
  sourceType?: string
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
}
