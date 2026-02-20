import { memo } from 'react'
import { Handle, Position } from 'reactflow'
import type { RecommendedContainer } from '../../lib/advisorTypes'
import './ContainerNode.css'

interface ContainerNodeData {
  container: RecommendedContainer
}

function ContainerNodeComponent({ data }: { data: ContainerNodeData }) {
  const { container } = data
  return (
    <div className="container-node">
      <Handle type="target" position={Position.Left} />
      <div className="container-node__header">
        <div className="container-node__name">{container.name}</div>
        <div className="container-node__pk" title={container.partitionKeyReasoning}>
          🔑 {container.partitionKeyPath}
        </div>
      </div>
      <div className="container-node__body">
        {container.documentTypes.map((dt) => (
          <div key={dt.typeName} className="container-node__doctype">
            <div className="container-node__doctype-name">
              {dt.typeName}
              {dt.sourceTable && <small> (from {dt.sourceTable})</small>}
            </div>
            <div className="container-node__props">
              {dt.properties.map((p) => (
                <span key={p.name} className="container-node__prop">{p.name}</span>
              ))}
            </div>
            {dt.embeddedDocuments.length > 0 && (
              <div className="container-node__embedded">
                {dt.embeddedDocuments.map((e) => (
                  <div key={e.propertyName} className="container-node__embed-item" title={e.reasoning}>
                    <span className="container-node__embed-icon">📦</span>
                    {e.propertyName} <small>({e.relationship})</small>
                  </div>
                ))}
              </div>
            )}
            {dt.references.length > 0 && (
              <div className="container-node__refs">
                {dt.references.map((r) => (
                  <div key={r.propertyName} className="container-node__ref-item" title={r.reasoning}>
                    <span className="container-node__ref-icon">🔗</span>
                    {r.propertyName} → {r.targetContainer}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

export default memo(ContainerNodeComponent)

export type { ContainerNodeData }
