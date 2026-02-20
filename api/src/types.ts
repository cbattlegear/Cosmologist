/* Shared types for the CosmosDB Advisor API contract */

/** User-defined access pattern / operation */
export interface AccessPattern {
  id: string
  name: string
  operationType: 'read' | 'write' | 'query' | 'aggregation'
  targetTables: string[]
  filterFields: string[]
  frequency: 'low' | 'medium' | 'high' | 'critical'
  description?: string
}

/** Overall workload characteristics */
export interface WorkloadProfile {
  readWriteRatio: 'read-heavy' | 'balanced' | 'write-heavy'
  estimatedItemsPerTable: Record<string, 'hundreds' | 'thousands' | 'millions' | 'billions'>
  growthPatterns: Record<string, 'static' | 'slow' | 'fast'>
  maxRUBudget?: number
  multiRegion: boolean
  additionalContext?: string
}

/** Simplified table schema sent to the advisor (no row data) */
export interface TableSchema {
  id: string
  name: string
  columns: { name: string; type: string }[]
  rowCount: number
}

/** Simplified relationship sent to the advisor */
export interface RelationshipSchema {
  id: string
  sourceTableId: string
  targetTableId: string
  sourceColumn: string
  targetColumn: string
  type: 'one-to-many' | 'one-to-one'
}

/** Request body for POST /api/advisor */
export interface AdvisorRequest {
  tables: TableSchema[]
  relationships: RelationshipSchema[]
  accessPatterns: AccessPattern[]
  workload: WorkloadProfile
}

/** A property in a recommended document type */
export interface RecommendedProperty {
  name: string
  sourceColumn: string
  type: string
}

/** An embedded sub-document within a document type */
export interface EmbeddedDocument {
  propertyName: string
  sourceTable: string
  relationship: 'one-to-one' | 'one-to-few' | 'one-to-many'
  properties: RecommendedProperty[]
  reasoning: string
}

/** A reference to another container/document */
export interface DocumentReference {
  propertyName: string
  targetContainer: string
  targetPartitionKey: string
  reasoning: string
}

/** A document type within a recommended container */
export interface RecommendedDocumentType {
  typeName: string
  sourceTable: string
  properties: RecommendedProperty[]
  embeddedDocuments: EmbeddedDocument[]
  references: DocumentReference[]
}

/** A recommended CosmosDB container */
export interface RecommendedContainer {
  name: string
  partitionKeyPath: string
  partitionKeyReasoning: string
  documentTypes: RecommendedDocumentType[]
}

/** A single recommendation with reasoning */
export interface Recommendation {
  category:
    | 'embedding'
    | 'referencing'
    | 'partition-key'
    | 'container-design'
    | 'denormalization'
    | 'change-feed'
    | 'warning'
  title: string
  reasoning: string
  impact: string
  relatedTables: string[]
}

/** Full response from the advisor API */
export interface AdvisorResponse {
  containers: RecommendedContainer[]
  recommendations: Recommendation[]
  summary: string
  tradeoffs: string
}
