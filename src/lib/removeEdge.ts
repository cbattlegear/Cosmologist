import type { Edge } from 'reactflow'

export function removeEdge(edgeId: string, edges: Edge[]): Edge[] {
  return edges.filter((e) => e.id !== edgeId)
}
