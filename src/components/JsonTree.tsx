import { useEffect, useState, type FC } from 'react'

type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | { [k: string]: JsonValue }

interface JsonTreeProps {
  data: JsonValue
  collapsedLevels?: number // collapse nodes at depth >= collapsedLevels
}

interface JsonNodeProps {
  name?: string | number
  value: JsonValue
  depth: number
  collapsedLevels: number
}

function isObject(val: any): val is Record<string, JsonValue> {
  return val !== null && typeof val === 'object' && !Array.isArray(val)
}

const JsonNode: FC<JsonNodeProps> = ({ name, value, depth, collapsedLevels }) => {
  const initialCollapsed = depth >= collapsedLevels
  const [collapsed, setCollapsed] = useState(initialCollapsed)

  useEffect(() => {
    setCollapsed(depth >= collapsedLevels)
  }, [collapsedLevels, depth])

  const toggle = () => setCollapsed((c) => !c)

  if (isObject(value)) {
    const entries = Object.entries(value)
    const label = `{${entries.length ? '…' : ''}}`
    return (
      <div className="json-node json-node--object" style={{ paddingLeft: depth * 16 }}>
        <span
          className="json-node__caret"
          role="button"
          tabIndex={0}
          onClick={toggle}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && toggle()}
        >
          {collapsed ? '▸' : '▾'}
        </span>
        {name !== undefined && <span className="json-node__key">{String(name)}</span>}
        <span className="json-node__sep">: </span>
        <span className="json-node__braces">{label}</span>
        {!collapsed && (
          <div className="json-node__children">
            {entries.map(([k, v]) => (
              <JsonNode key={k} name={k} value={v} depth={depth + 1} collapsedLevels={collapsedLevels} />
            ))}
          </div>
        )}
      </div>
    )
  }

  if (Array.isArray(value)) {
    const label = `[${value.length ? '…' : ''}]`
    return (
      <div className="json-node json-node--array" style={{ paddingLeft: depth * 16 }}>
        <span
          className="json-node__caret"
          role="button"
          tabIndex={0}
          onClick={toggle}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && toggle()}
        >
          {collapsed ? '▸' : '▾'}
        </span>
        {name !== undefined && <span className="json-node__key">{String(name)}</span>}
        <span className="json-node__sep">: </span>
        <span className="json-node__braces">{label}</span>
        {!collapsed && (
          <div className="json-node__children">
            {value.map((v, idx) => (
              <JsonNode key={idx} name={idx} value={v} depth={depth + 1} collapsedLevels={collapsedLevels} />
            ))}
          </div>
        )}
      </div>
    )}

  const renderPrimitive = () => {
    if (typeof value === 'string') return <span className="json-node__value json-node__value--string">"{value}"</span>
    if (typeof value === 'number') return <span className="json-node__value json-node__value--number">{value}</span>
    if (typeof value === 'boolean') return <span className="json-node__value json-node__value--boolean">{String(value)}</span>
    if (value === null) return <span className="json-node__value json-node__value--null">null</span>
    return <span className="json-node__value">{String(value)}</span>
  }

  return (
    <div className="json-node json-node--primitive" style={{ paddingLeft: depth * 16 }}>
      {name !== undefined && <><span className="json-node__key">{String(name)}</span><span className="json-node__sep">: </span></>}
      {renderPrimitive()}
    </div>
  )
}

const JsonTree: FC<JsonTreeProps> = ({ data, collapsedLevels = 1 }) => {
  return (
    <div className="json-tree">
      <JsonNode value={data} depth={0} collapsedLevels={collapsedLevels} />
    </div>
  )
}

export default JsonTree
