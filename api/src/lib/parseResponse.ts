import type { AdvisorResponse } from '../types.js'

/**
 * Parse and validate the raw LLM JSON output into an AdvisorResponse.
 * Applies structural validation and provides sensible defaults for missing fields.
 */
export function parseAdvisorResponse(raw: string): AdvisorResponse {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    // Try extracting JSON from markdown code fences
    const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (match) {
      parsed = JSON.parse(match[1])
    } else {
      throw new Error('LLM response is not valid JSON')
    }
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('LLM response is not a JSON object')
  }

  const obj = parsed as Record<string, unknown>

  const containers = Array.isArray(obj.containers)
    ? obj.containers.map(validateContainer)
    : []

  if (containers.length === 0) {
    throw new Error('LLM response contains no containers')
  }

  const recommendations = Array.isArray(obj.recommendations)
    ? obj.recommendations.map(validateRecommendation)
    : []

  return {
    containers,
    recommendations,
    summary: typeof obj.summary === 'string' ? obj.summary : 'No summary provided.',
    tradeoffs: typeof obj.tradeoffs === 'string' ? obj.tradeoffs : 'No trade-offs provided.',
  }
}

function validateContainer(c: unknown): AdvisorResponse['containers'][number] {
  const obj = asObject(c)
  return {
    name: asString(obj.name, 'UnnamedContainer'),
    partitionKeyPath: asString(obj.partitionKeyPath, '/id'),
    partitionKeyReasoning: asString(obj.partitionKeyReasoning, ''),
    documentTypes: Array.isArray(obj.documentTypes)
      ? obj.documentTypes.map(validateDocType)
      : [],
  }
}

function validateDocType(d: unknown): AdvisorResponse['containers'][number]['documentTypes'][number] {
  const obj = asObject(d)
  return {
    typeName: asString(obj.typeName, 'unknown'),
    sourceTable: asString(obj.sourceTable, ''),
    properties: Array.isArray(obj.properties) ? obj.properties.map(validateProp) : [],
    embeddedDocuments: Array.isArray(obj.embeddedDocuments)
      ? obj.embeddedDocuments.map(validateEmbedded)
      : [],
    references: Array.isArray(obj.references) ? obj.references.map(validateRef) : [],
  }
}

function validateProp(p: unknown): { name: string; sourceColumn: string; type: string } {
  const obj = asObject(p)
  return {
    name: asString(obj.name, ''),
    sourceColumn: asString(obj.sourceColumn, ''),
    type: asString(obj.type, 'string'),
  }
}

function validateEmbedded(e: unknown): AdvisorResponse['containers'][number]['documentTypes'][number]['embeddedDocuments'][number] {
  const obj = asObject(e)
  const rel = asString(obj.relationship, 'one-to-few')
  return {
    propertyName: asString(obj.propertyName, ''),
    sourceTable: asString(obj.sourceTable, ''),
    relationship: (rel === 'one-to-one' || rel === 'one-to-few' || rel === 'one-to-many')
      ? rel
      : 'one-to-few',
    properties: Array.isArray(obj.properties) ? obj.properties.map(validateProp) : [],
    reasoning: asString(obj.reasoning, ''),
  }
}

function validateRef(r: unknown): AdvisorResponse['containers'][number]['documentTypes'][number]['references'][number] {
  const obj = asObject(r)
  return {
    propertyName: asString(obj.propertyName, ''),
    targetContainer: asString(obj.targetContainer, ''),
    targetPartitionKey: asString(obj.targetPartitionKey, ''),
    reasoning: asString(obj.reasoning, ''),
  }
}

function validateRecommendation(r: unknown): AdvisorResponse['recommendations'][number] {
  const obj = asObject(r)
  const validCategories = ['embedding', 'referencing', 'partition-key', 'container-design', 'denormalization', 'change-feed', 'warning'] as const
  const cat = asString(obj.category, 'warning')
  return {
    category: (validCategories as readonly string[]).includes(cat)
      ? (cat as AdvisorResponse['recommendations'][number]['category'])
      : 'warning',
    title: asString(obj.title, 'Untitled'),
    reasoning: asString(obj.reasoning, ''),
    impact: asString(obj.impact, ''),
    relatedTables: Array.isArray(obj.relatedTables)
      ? obj.relatedTables.filter((t): t is string => typeof t === 'string')
      : [],
  }
}

function asObject(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {}
}

function asString(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback
}
