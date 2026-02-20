/**
 * Advisor types shared between frontend and backend (api/src/types.ts).
 * Keep in sync with the canonical definitions in api/src/types.ts.
 */

export interface AccessPattern {
  id: string
  name: string
  operationType: 'read' | 'write' | 'query' | 'aggregation'
  targetTables: string[]
  filterFields: string[]
  frequency: 'low' | 'medium' | 'high' | 'critical'
  description?: string
}

export interface WorkloadProfile {
  readWriteRatio: 'read-heavy' | 'balanced' | 'write-heavy'
  estimatedItemsPerTable: Record<string, 'hundreds' | 'thousands' | 'millions' | 'billions'>
  growthPatterns: Record<string, 'static' | 'slow' | 'fast'>
  maxRUBudget?: number
  multiRegion: boolean
  additionalContext?: string
}

export interface TableSchema {
  id: string
  name: string
  columns: { name: string; type: string }[]
  rowCount: number
}

export interface RelationshipSchema {
  id: string
  sourceTableId: string
  targetTableId: string
  sourceColumn: string
  targetColumn: string
  type: 'one-to-many' | 'one-to-one'
}

export interface AdvisorRequest {
  tables: TableSchema[]
  relationships: RelationshipSchema[]
  accessPatterns: AccessPattern[]
  workload: WorkloadProfile
}

export interface RecommendedProperty {
  name: string
  sourceColumn: string
  type: string
}

export interface EmbeddedDocument {
  propertyName: string
  sourceTable: string
  relationship: 'one-to-one' | 'one-to-few' | 'one-to-many'
  properties: RecommendedProperty[]
  reasoning: string
}

export interface DocumentReference {
  propertyName: string
  targetContainer: string
  targetPartitionKey: string
  reasoning: string
}

export interface RecommendedDocumentType {
  typeName: string
  sourceTable: string
  properties: RecommendedProperty[]
  embeddedDocuments: EmbeddedDocument[]
  references: DocumentReference[]
}

export interface RecommendedContainer {
  name: string
  partitionKeyPath: string
  partitionKeyReasoning: string
  documentTypes: RecommendedDocumentType[]
}

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

export interface AdvisorResponse {
  containers: RecommendedContainer[]
  recommendations: Recommendation[]
  summary: string
  tradeoffs: string
}

