import type { Edge } from 'reactflow'
import type { TableData } from './types'
import type { AdvisorSchemaInput, AdvisorTableInfo, AdvisorRelationship } from './advisorTypes'

/**
 * Extract a clean schema representation from the canvas state
 * for use with the CosmosDB data modeling advisor.
 */
export function extractSchemaForAdvisor(
  tables: TableData[],
  edges: Edge[],
  edgeTypes?: Record<string, 'one-to-many' | 'one-to-one'>,
): AdvisorSchemaInput {
  const tableInfos: AdvisorTableInfo[] = tables.map((t) => ({
    id: t.id,
    name: t.name,
    columns: t.columns.map((col) => ({
      name: col,
      dataType: t.columnTypes?.[col]?.dataType,
      isPrimaryKey: t.columnTypes?.[col]?.isPrimaryKey ?? t.primaryKeys?.includes(col),
    })),
  }))

  const tableMap = new Map(tables.map((t) => [t.id, t]))

  const relationships: AdvisorRelationship[] = edges
    .filter((e) => e.sourceHandle && e.targetHandle)
    .map((e) => {
      const sourceTable = tableMap.get(e.source)
      const targetTable = tableMap.get(e.target)
      return {
        sourceTable: sourceTable?.name ?? e.source,
        targetTable: targetTable?.name ?? e.target,
        sourceColumn: e.sourceHandle!,
        targetColumn: e.targetHandle!,
        type: edgeTypes?.[e.id] ?? (e.data as any)?.type ?? 'one-to-many',
      }
    })

  return { tables: tableInfos, relationships }
}
