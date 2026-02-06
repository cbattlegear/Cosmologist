import { Handle, Position } from 'reactflow'
import type { NodeProps } from 'reactflow'
import type { TableData } from '../lib/types'
import type { MouseEvent } from 'react'
import './TableNode.css'

export type TableNodeData = {
  table: TableData
  isRoot?: boolean
  isDocRoot?: boolean
  splitColumns?: Set<string>
  hasPivot?: boolean
  onColumnContextMenu?: (tableId: string, column: string, event: MouseEvent) => void
}

export default function TableNode({ data }: NodeProps<TableNodeData>) {
  return (
    <div className={["table-node", data.isRoot ? "table-node--root" : "", data.isDocRoot ? "table-node--docroot" : ""].join(" ") }>
      <div className="table-node__header">
        <span>{data.table.name}</span>
        <span className="table-node__badges">
          {data.hasPivot && <span className="table-node__badge table-node__badge--pivot" aria-label="Has pivot" title="Pivot active">⟳ Pivot</span>}
          {data.isDocRoot && <span className="table-node__badge table-node__badge--doc" aria-label="Document root">Doc</span>}
          {data.isRoot && <span className="table-node__badge" aria-label="Root table">Root</span>}
        </span>
      </div>
      <div className="table-node__columns">
        {data.table.columns.map((col) => (
          <div
            className="table-node__column"
            key={col}
            onContextMenu={(e) => data.onColumnContextMenu?.(data.table.id, col, e)}
          >
            <Handle type="target" position={Position.Left} id={col} className="table-node__handle table-node__handle--left" />
            <span className="table-node__colname">{col}</span>
            {data.splitColumns?.has(col) && <span className="table-node__col-icon" title="Split active">✂</span>}
            <Handle type="source" position={Position.Right} id={col} className="table-node__handle table-node__handle--right" />
          </div>
        ))}
      </div>
    </div>
  )
}
