import { Handle, Position } from 'reactflow'
import type { NodeProps } from 'reactflow'
import type { TableData } from '../lib/types'
import './TableNode.css'

export type TableNodeData = {
  table: TableData
  isRoot?: boolean
}

export default function TableNode({ data }: NodeProps<TableNodeData>) {
  return (
    <div className={["table-node", data.isRoot ? "table-node--root" : ""].join(" ") }>
      <div className="table-node__header">
        <span>{data.table.name}</span>
        {data.isRoot && <span className="table-node__badge" aria-label="Root table">Root</span>}
      </div>
      <div className="table-node__columns">
        {data.table.columns.map((col) => (
          <div className="table-node__column" key={col}>
            <Handle type="target" position={Position.Left} id={col} className="table-node__handle table-node__handle--left" />
            <span className="table-node__colname">{col}</span>
            <Handle type="source" position={Position.Right} id={col} className="table-node__handle table-node__handle--right" />
          </div>
        ))}
      </div>
    </div>
  )
}
