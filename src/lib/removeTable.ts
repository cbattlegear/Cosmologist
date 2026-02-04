import type { Edge, Node } from 'reactflow'
import type { TableData } from './types'
import type { TableNodeData } from '../components/TableNode'

export function removeTable(
  tableId: string,
  tables: TableData[],
  nodes: Node<TableNodeData>[],
  edges: Edge[],
): { tables: TableData[]; nodes: Node<TableNodeData>[]; edges: Edge[]; rootTableId: string; leadTableId: string } {
  const newTables = tables.filter((t) => t.id !== tableId)
  const newNodes = nodes.filter((n) => n.id !== tableId)
  const newEdges = edges.filter((e) => e.source !== tableId && e.target !== tableId)
  const rootTableId = newTables[0]?.id ?? ''
  return { tables: newTables, nodes: newNodes, edges: newEdges, rootTableId, leadTableId: rootTableId }
}
