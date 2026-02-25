/** Advisor request/response types for CosmosDB data modeling recommendations. */

// ─── Request types ───

export interface AdvisorColumnInfo {
  name: string
  dataType?: string
  isPrimaryKey?: boolean
}

export interface AdvisorTableInfo {
  id: string
  name: string
  columns: AdvisorColumnInfo[]
}

export interface AdvisorRelationship {
  sourceTable: string
  targetTable: string
  sourceColumn: string
  targetColumn: string
  type: 'one-to-many' | 'one-to-one'
}

export interface AdvisorSchemaInput {
  tables: AdvisorTableInfo[]
  relationships: AdvisorRelationship[]
}

export type OperationType = 'point-read' | 'query' | 'write' | 'delete'
export type OperationFrequency = 'hot' | 'warm' | 'cold'
export type ResultSize = 'single' | 'small' | 'large'

export interface QueryPattern {
  name: string
  type: OperationType
  frequency: OperationFrequency
  description: string
  filters?: string[]
  sortFields?: string[]
  resultSize?: ResultSize
}

export interface AdvisorRequest {
  schema: AdvisorSchemaInput
  operations: QueryPattern[]
  additionalContext?: string
}

// ─── Response types ───

export interface RecommendedProperty {
  name: string
  dataType?: string
  source?: string // e.g. "Orders.OrderDate" — original table.column
}

export interface RecommendedContainer {
  name: string
  partitionKey: string
  properties: RecommendedProperty[]
  embeddedEntities?: {
    name: string
    sourceTable: string
    relationship: 'one-to-many' | 'one-to-one'
    properties: RecommendedProperty[]
  }[]
  description?: string
}

export interface AdvisorFeedback {
  rating: 'up' | 'down'
  comment: string
}

export interface AdvisorResponse {
  containers: RecommendedContainer[]
  reasoning: string
  tradeoffs?: string[]
  warnings?: string[]
  /** Session ID returned by the backend — used to associate feedback with the session. */
  sessionId?: string
  /** User feedback submitted after reviewing the recommendation. */
  feedback?: AdvisorFeedback
}
