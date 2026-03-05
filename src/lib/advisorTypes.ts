/** Advisor request/response types for Cosmos DB data modeling recommendations. */

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

export interface IndexingPolicy {
  compositeIndexes?: string[][]
  excludedPaths?: string[]
  spatialIndexes?: string[]
}

export interface ChangeFeedPattern {
  sourceContainer: string
  targetContainer: string
  purpose: string
}

export interface GlobalSettings {
  consistencyLevel?: string
  multiRegion?: boolean
  schemaVersioning?: boolean
}

export interface RecommendedContainer {
  name: string
  partitionKey: string
  hierarchicalPartitionKeys?: string[]
  properties: RecommendedProperty[]
  embeddedEntities?: {
    name: string
    sourceTable: string
    relationship: 'one-to-many' | 'one-to-one'
    properties: RecommendedProperty[]
  }[]
  indexingPolicy?: IndexingPolicy
  ttl?: number | null
  estimatedDocumentSizeKB?: number
  description?: string
}

export interface AdvisorFeedback {
  rating: 'up' | 'down'
  comment: string
}

export interface AdvisorResponse {
  containers: RecommendedContainer[]
  changeFeedPatterns?: ChangeFeedPattern[]
  globalSettings?: GlobalSettings
  reasoning: string
  tradeoffs?: string[]
  warnings?: string[]
  /** Session ID returned by the backend — used to associate feedback with the session. */
  sessionId?: string
  /** User feedback submitted after reviewing the recommendation. */
  feedback?: AdvisorFeedback
}
