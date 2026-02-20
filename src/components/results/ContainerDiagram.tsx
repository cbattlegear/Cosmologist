import { useMemo } from 'react'
import ReactFlow, { Background, Controls } from 'reactflow'
import type { Node, Edge } from 'reactflow'
import ContainerNode from './ContainerNode'
import type { ContainerNodeData } from './ContainerNode'
import type { RecommendedContainer } from '../../lib/advisorTypes'

interface Props {
  containers: RecommendedContainer[]
}

const nodeTypes = { containerNode: ContainerNode }

export default function ContainerDiagram({ containers }: Props) {
  const { nodes, edges } = useMemo(() => {
    const ns: Node<ContainerNodeData>[] = []
    const es: Edge[] = []

    containers.forEach((container, i) => {
      const nodeId = `container-${i}`
      ns.push({
        id: nodeId,
        type: 'containerNode',
        position: { x: i * 400, y: Math.floor(i / 3) * 350 },
        data: { container },
      })

      // Create edges for references between containers
      container.documentTypes.forEach((dt) => {
        dt.references.forEach((ref) => {
          const targetIdx = containers.findIndex((c) => c.name === ref.targetContainer)
          if (targetIdx >= 0) {
            es.push({
              id: `ref-${nodeId}-${ref.propertyName}`,
              source: nodeId,
              target: `container-${targetIdx}`,
              label: ref.propertyName,
              style: { strokeDasharray: '5 5' },
              animated: true,
            })
          }
        })
      })
    })

    return { nodes: ns, edges: es }
  }, [containers])

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.3}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  )
}
