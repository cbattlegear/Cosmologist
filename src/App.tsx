import { useCallback, useMemo, useState, useEffect, useRef } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  ReactFlowProvider,
  MarkerType,
} from 'reactflow'
import type {
  Edge,
  Node,
  Connection,
  OnConnect,
  OnEdgesChange,
  OnNodesChange,
  NodeMouseHandler,
  EdgeMouseHandler,
} from 'reactflow'
import { removeEdge } from './lib/removeEdge'
import 'reactflow/dist/style.css'
import './App.css'
import { parseFiles, detectDelimiter, parseDelimitedText } from './lib/parseFiles'
import { buildJoinedDocument, toRelationshipEdges } from './lib/join'
import { removeTable } from './lib/removeTable'
import { loadProjectList, loadProject, saveProjectList, saveProject, deleteProject, makeProjectId, type ProjectState, setProjectSource, renameProject } from './lib/projects'
import { rehydrateTables } from './lib/rehydrate'
import type { TableData, ParseFileError } from './lib/types'
import { renameColumn as renameColumnData, renameTable as renameTableData, updateEdgesForColumnRename, renameSelectedColumns, ensureColumnRenames, findOriginalColumn, applyColumnRenames } from './lib/rename'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import TableNode, { type TableNodeData } from './components/TableNode'
import JsonTree from './components/JsonTree'
import logoUrl from './assets/logo.svg'

const nodeTypes = { tableNode: TableNode }
const VERSION = import.meta.env.VITE_APP_VERSION ?? '0.0.0'
const AUTHOR = 'Cosmologist'

function App() {
  const [tables, setTables] = useState<TableData[]>([])
  const [nodes, setNodes] = useState<Node<TableNodeData>[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [errors, setErrors] = useState<ParseFileError[]>([])
  const [rootTableId, setRootTableId] = useState('')
  const [leadRowIndex, setLeadRowIndex] = useState(0)
  const [selectedColumns, setSelectedColumns] = useState<Record<string, string[]>>({})
  const [expandedTables, setExpandedTables] = useState<Record<string, boolean>>({})
  const [tableParsingOptions, setTableParsingOptions] = useState<Record<string, { delimiter?: 'auto' | 'csv' | 'tsv'; skipRows?: number }>>({})
  const [tableRenames, setTableRenames] = useState<Record<string, string>>({})
  const [columnRenames, setColumnRenames] = useState<Record<string, Record<string, string>>>({})
  const [contextMenu, setContextMenu] = useState<
    | { type: 'table'; x: number; y: number; tableId: string }
    | { type: 'column'; x: number; y: number; tableId: string; column: string }
    | { type: 'edge'; x: number; y: number; edgeId: string }
    | null
  >(null)
  const [edgeTypes, setEdgeTypes] = useState<Record<string, 'one-to-many' | 'one-to-one'>>({})
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])
  const [projectId, setProjectId] = useState('')
  const [hydrated, setHydrated] = useState(false)
  const [persistError, setPersistError] = useState<string>('')
  const [preview, setPreview] = useState('')
  const [previewData, setPreviewData] = useState<any>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [tablePreviewOpen, setTablePreviewOpen] = useState(false)
  const [selectedError, setSelectedError] = useState<ParseFileError | null>(null)
  const [tablePreviewTableId, setTablePreviewTableId] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState<'file' | 'load' | 'help' | null>(null)
  const [projectsModalOpen, setProjectsModalOpen] = useState<false | 'open' | 'manage'>(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [dragOverlay, setDragOverlay] = useState(false)

  const loadInputRef = useRef<HTMLInputElement>(null)
  const addInputRef = useRef<HTMLInputElement>(null)
  const dragCounterRef = useRef(0)

  const closeMenus = useCallback(() => setMenuOpen(null), [])

  const nodesRef = useRef<Node<TableNodeData>[]>([])
  const edgesRef = useRef<Edge[]>([])
  const tablesRef = useRef<TableData[]>([])
  useEffect(() => { nodesRef.current = nodes }, [nodes])
  useEffect(() => { edgesRef.current = edges }, [edges])
  useEffect(() => { tablesRef.current = tables }, [tables])

  useEffect(() => {
    const list = loadProjectList()
    if (!list.length) {
      const id = makeProjectId('Project')
      const meta = { id, name: 'Project 1' }
      saveProjectList([meta])
      saveProject(id, {
        projectId: id, tablesSources: {}, nodePositions: {}, edges: [], rootTableId: '', leadRowIndex: 0, selectedColumns: {}, expandedTables: {}, tableParsingOptions: {}, edgeTypes: {},
      })
      setProjects([meta])
      setProjectId(id)
      setHydrated(true)
    } else {
      setProjects(list)
      setProjectId(list[0].id)
    }
  }, [])

  useEffect(() => {
    if (!projectId) return
    const state = loadProject(projectId)
    if (state) {
      rehydrateTables(state as ProjectState).then(async (tables) => {
        const parsedOpts = state.tableParsingOptions ?? {}
        const applied = await applyParsingOptions(tables, state.edges ?? [], parsedOpts, state.selectedColumns ?? {})
        setTables(applied.tablesOut)
        setNodes(
          applied.tablesOut.map((t, idx) => ({
            id: t.id,
            type: 'tableNode',
            position: state.nodePositions[t.id] ?? { x: 120 + (idx % 3) * 320, y: 80 + Math.floor(idx / 3) * 260 },
            data: { table: t, isRoot: (state.rootTableId ?? applied.tablesOut[0]?.id) === t.id, onColumnContextMenu },
          })),
        )
        setEdges(applied.edgesOut)
        setEdgeTypes(state.edgeTypes ?? {})
        setRootTableId(state.rootTableId ?? applied.tablesOut[0]?.id ?? '')
        setLeadRowIndex(state.leadRowIndex ?? 0)
        setSelectedColumns(applied.selectedOut)
        setExpandedTables(state.expandedTables ?? {})
        setTableParsingOptions(parsedOpts)
        setTableRenames(state.tableRenames ?? {})
        setColumnRenames(state.columnRenames ?? {})
      })
    } else {
      setTables([])
      setNodes([])
      setEdges([])
      setEdgeTypes({})
      setRootTableId('')
      setLeadRowIndex(0)
      setSelectedColumns({})
      setExpandedTables({})
      setTableParsingOptions({})
    }
    setHydrated(true)
  }, [projectId])

  useEffect(() => {
    if (!hydrated || !projectId) return
    const tablesSources = Object.fromEntries(
      tables.map((t) => [t.id, { fileName: t.fileName, sourceType: t.sourceType, name: t.name }]),
    )
    tables.forEach((t) => {
      if (t.sourceText) setProjectSource(projectId, t.id, t.sourceText)
    })
    const nodePositions = Object.fromEntries(nodes.map((n) => [n.id, n.position]))
    const ok = saveProject(projectId, {
      projectId,
      tablesSources,
      nodePositions,
      edges,
      rootTableId,
      leadRowIndex,
      selectedColumns,
      expandedTables,
      tableParsingOptions,
      edgeTypes,
      tableRenames,
      columnRenames,
    })
    setPersistError(ok ? '' : 'Project too large to save; persistence disabled for this project.')
  }, [hydrated, projectId, tables, nodes, edges, rootTableId, leadRowIndex, selectedColumns, expandedTables, tableParsingOptions, edgeTypes])

  const onFiles = useCallback(async (files: FileList | File[]) => {
    const { tables: parsed, errors } = await parseFiles(files)
    setErrors(errors)
    setTables(parsed)
    const computedNodes = parsed.map((table, idx) => ({
      id: table.id,
      type: 'tableNode',
      position: {
        x: 120 + (idx % 3) * 320,
        y: 80 + Math.floor(idx / 3) * 260,
      },
      data: { table, isRoot: idx === 0, onColumnContextMenu },
    }))
    setNodes(computedNodes)
    setEdges([])
    const selection: Record<string, string[]> = {}
    const expanded: Record<string, boolean> = {}
    parsed.forEach((t) => { selection[t.id] = [...t.columns]; expanded[t.id] = false })
    setSelectedColumns(selection)
    setExpandedTables(expanded)
    if (parsed[0]) {
      setRootTableId(parsed[0].id)
      setLeadRowIndex(0)
    }
  }, [])

  const onConnect: OnConnect = useCallback((connection: Edge | Connection) => {
    const id = `${connection.source}-${connection.sourceHandle}__${connection.target}-${connection.targetHandle}`
    setEdges((eds) => addEdge({
      ...connection,
      id,
      data: { type: 'one-to-many' },
    }, eds))
    setEdgeTypes((prev) => ({ ...prev, [id]: 'one-to-many' }))
  }, [])

  const onNodesChange: OnNodesChange = useCallback((changes) => setNodes((nds) => applyNodeChanges(changes, nds)), [])
  const onEdgesChange: OnEdgesChange = useCallback((changes) => setEdges((eds) => applyEdgeChanges(changes, eds)), [])

  const openTablePreview = useCallback((tableId: string) => {
    setTablePreviewTableId(tableId)
    setTablePreviewOpen(true)
  }, [])
  const onNodeDoubleClick: NodeMouseHandler = useCallback((_event, node) => {
    openTablePreview(node.id)
  }, [openTablePreview])

  const leadTable = useMemo(() => tables.find((t) => t.id === rootTableId), [tables, rootTableId])
  const leadRowCount = leadTable?.rows.length ?? 0

  const tablePreviewTable = useMemo(() => tables.find((t) => t.id === tablePreviewTableId) ?? null, [tables, tablePreviewTableId])

  useEffect(() => {
    setNodes((prev) => prev.map((n) => ({ ...n, data: { ...n.data, isRoot: n.id === rootTableId } })))
  }, [rootTableId])

  const relationshipsSummaries = useMemo(() => {
    return edges.map((e) => {
      const src = tables.find((t) => t.id === e.source)
      const dst = tables.find((t) => t.id === e.target)
      return {
        id: e.id,
        label: `${src?.name ?? e.source}.${e.sourceHandle ?? ''} → ${dst?.name ?? e.target}.${e.targetHandle ?? ''}`,
      }
    })
  }, [edges, tables])

  const handleDeleteEdge = useCallback((id: string) => {
    setEdges((eds) => removeEdge(id, eds))
  }, [])

  const handleProjectCreate = useCallback(() => {
    const name = prompt('Project name?')?.trim()
    if (!name) return
    const id = makeProjectId(name)
    const meta = { id, name }
    setProjects((prev) => {
      const next = [...prev, meta]
      saveProjectList(next)
      return next
    })
    saveProject(id, {
      projectId: id, tablesSources: {}, nodePositions: {}, edges: [], rootTableId: '', leadRowIndex: 0, selectedColumns: {}, expandedTables: {}, tableParsingOptions: {}, edgeTypes: {},
    })
    setProjectId(id)
    setProjectsModalOpen(false)
    closeMenus()
  }, [closeMenus])

  const handleProjectRename = useCallback((id: string) => {
    const name = prompt('New project name?')?.trim()
    if (!name) return
    renameProject(id, name)
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)))
  }, [])

  const handleTableExpandToggle = useCallback((tableId: string) => {
    setExpandedTables((prev) => ({ ...prev, [tableId]: !prev[tableId] }))
  }, [])

  const handleColumnToggle = useCallback((tableId: string, column: string) => {
    setSelectedColumns((prev) => {
      const next = { ...prev }
      const current = new Set(next[tableId] ?? [])
      if (current.has(column)) current.delete(column)
      else current.add(column)
      next[tableId] = Array.from(current)
      return next
    })
  }, [])

  const onEdgeDoubleClick: EdgeMouseHandler = useCallback((_event, edge) => {
    setEdges((eds) => removeEdge(edge.id, eds))
    setEdgeTypes((prev) => {
      const next = { ...prev }
      delete next[edge.id]
      return next
    })
  }, [])

  const onEdgeContextMenu: EdgeMouseHandler = useCallback((event, edge) => {
    event.preventDefault()
    setContextMenu({ type: 'edge', x: event.clientX, y: event.clientY, edgeId: edge.id })
  }, [])

  const onNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
    event.preventDefault()
    setContextMenu({ type: 'table', x: event.clientX, y: event.clientY, tableId: node.id })
  }, [])

  const onColumnContextMenu = useCallback((tableId: string, column: string, event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setContextMenu({ type: 'column', x: event.clientX, y: event.clientY, tableId, column })
  }, [])

  const closeContextMenu = useCallback(() => setContextMenu(null), [])

  const pushError = useCallback((message: string, detail?: string, fileName?: string) => {
    setErrors((prev) => prev.concat({
      id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `err-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      message,
      detail,
      fileName,
    }))
  }, [])

  const handleErrorDismiss = useCallback((id: string) => {
    setErrors((prev) => prev.filter((e) => e.id !== id))
    setSelectedError((prev) => (prev?.id === id ? null : prev))
  }, [])

  const handleErrorClick = useCallback((err: ParseFileError) => {
    setSelectedError(err)
  }, [])

  const clearErrors = useCallback(() => {
    setErrors([])
    setSelectedError(null)
  }, [])

  const handleRenameTable = useCallback((tableId: string) => {
    const table = tablesRef.current.find((t) => t.id === tableId)
    if (!table) return
    const name = prompt('New table name?', table.name)?.trim()
    if (!name || name === table.name) return
    if (tablesRef.current.some((t) => t.id !== tableId && t.name === name)) {
      pushError(`Table name '${name}' already exists`)
      return
    }
    setTables((prev) => prev.map((t) => (t.id === tableId ? renameTableData(t, name) : t)))
    setNodes((prev) => prev.map((n) => (n.id === tableId ? { ...n, data: { ...n.data, table: { ...n.data.table, name } } } : n)))
    setTableRenames((prev) => ({ ...prev, [tableId]: name }))
  }, [pushError])

  const handleResetTableName = useCallback((tableId: string) => {
    const table = tablesRef.current.find((t) => t.id === tableId)
    if (!table) return
    const original = table.originalName ?? table.name
    if (!original || original === table.name) return
    setTables((prev) => prev.map((t) => (t.id === tableId ? renameTableData(t, original) : t)))
    setNodes((prev) => prev.map((n) => (n.id === tableId ? { ...n, data: { ...n.data, table: { ...n.data.table, name: original } } } : n)))
    setTableRenames((prev) => {
      const next = { ...prev }
      delete next[tableId]
      return next
    })
  }, [])

  const handleRenameColumn = useCallback((tableId: string, current: string) => {
    const table = tablesRef.current.find((t) => t.id === tableId)
    if (!table) return
    const next = prompt('New column name?', current)?.trim()
    if (!next || next === current) return
    if (table.columns.includes(next)) {
      pushError(`Column name '${next}' already exists in ${table.name}`)
      return
    }
    const columnRenamesMap = ensureColumnRenames(table)
    const original = findOriginalColumn(columnRenamesMap, current) ?? current
    setTables((prev) => prev.map((t) => (t.id === tableId ? renameColumnData(t, current, next) : t)))
    setEdges((prev) => updateEdgesForColumnRename(prev, tableId, current, next))
    setSelectedColumns((prev) => renameSelectedColumns(prev, tableId, current, next))
    setColumnRenames((prev) => ({
      ...prev,
      [tableId]: { ...(prev[tableId] ?? {}), [original]: next },
    }))
  }, [pushError])

  const handleResetColumnName = useCallback((tableId: string, current: string) => {
    const table = tablesRef.current.find((t) => t.id === tableId)
    if (!table) return
    const renames = ensureColumnRenames(table)
    const original = findOriginalColumn(renames, current) ?? current
    if (original === current) return
    // revert to original
    setTables((prev) => prev.map((t) => (t.id === tableId ? renameColumnData(t, current, original) : t)))
    setEdges((prev) => updateEdgesForColumnRename(prev, tableId, current, original))
    setSelectedColumns((prev) => renameSelectedColumns(prev, tableId, current, original))
    setColumnRenames((prev) => ({
      ...prev,
      [tableId]: { ...(prev[tableId] ?? {}), [original]: original },
    }))
  }, [])

  const handlePreview = useCallback(() => {
    if (!rootTableId || !tables.length) return
    try {
      const doc = buildJoinedDocument(rootTableId, leadRowIndex, tables, toRelationshipEdges(edges, edgeTypes), {
        columnsFilter: selectedColumns,
      })
      setPreviewData(doc)
      setPreview(JSON.stringify(doc, null, 2))
      setPreviewOpen(true)
    } catch (e: any) {
      setPreview(`Error: ${e?.message ?? e}`)
    }
  }, [rootTableId, leadRowIndex, tables, edges, edgeTypes, selectedColumns])

  const handleDownload = useCallback(async () => {
    if (!rootTableId || !tables.length) return
    const lead = tables.find((t) => t.id === rootTableId)
    if (!lead) return
    const relationships = toRelationshipEdges(edges, edgeTypes)
    const zip = new JSZip()
    lead.rows.forEach((_, idx) => {
      const doc = buildJoinedDocument(rootTableId, idx, tables, relationships, {
        columnsFilter: selectedColumns,
      })
      zip.file(`${lead.name}_${idx}.json`, JSON.stringify(doc, null, 2))
    })
    const blob = await zip.generateAsync({ type: 'blob' })
    saveAs(blob, `${lead.name}_export.zip`)
  }, [rootTableId, tables, edges, edgeTypes, selectedColumns])

  const applyParsingOptions = useCallback(async (
    tablesInput: TableData[],
    edgesInput: Edge[],
    opts: Record<string, { delimiter?: 'auto' | 'csv' | 'tsv'; skipRows?: number }>,
    selectedCols: Record<string, string[]>,
  ) => {
    let tablesOut: TableData[] = tablesInput.map((t) => ({ ...t, rows: t.rows.map((r) => ({ ...r })) }))
    let edgesOut: Edge[] = [...edgesInput]
    let selectedOut: Record<string, string[]> = { ...selectedCols }

    for (const t of tablesOut) {
      const opt = opts[t.id]
      if (!opt) continue
      if (!t.sourceText) continue
      const delimiter = opt.delimiter === 'csv' ? ',' : opt.delimiter === 'tsv' ? '\t' : detectDelimiter(t.sourceText)
      const rows = await parseDelimitedText(t.sourceText, delimiter, opt.skipRows ?? 0)
      const columns = Array.from(new Set(rows.flatMap((r) => Object.keys(r))))
      let tableNew = { ...t, rows, columns }
      if (t.columnRenames) {
        tableNew = applyColumnRenames(tableNew, t.columnRenames)
      }
      tablesOut = tablesOut.map((tt) => (tt.id === t.id ? tableNew : tt))
      edgesOut = edgesOut.filter((e) => {
        if (e.source === t.id && e.sourceHandle && !columns.includes(e.sourceHandle)) return false
        if (e.target === t.id && e.targetHandle && !columns.includes(e.targetHandle)) return false
        return true
      })
      const current = new Set(selectedOut[t.id] ?? columns)
      const filtered = Array.from(current).filter((c) => columns.includes(c))
      selectedOut[t.id] = filtered.length ? filtered : columns
    }

    return { tablesOut, edgesOut, selectedOut }
  }, [])

  const reparseTable = useCallback(async (tableId: string, opts: { delimiter?: 'auto' | 'csv' | 'tsv'; skipRows?: number }) => {
    const table = tablesRef.current.find((t) => t.id === tableId)
    if (!table?.sourceText) return
    const delimiter = opts.delimiter === 'csv' ? ',' : opts.delimiter === 'tsv' ? '\t' : detectDelimiter(table.sourceText)
    const skipRows = opts.skipRows ?? 0
    const rows = await parseDelimitedText(table.sourceText, delimiter, skipRows)
    const columns = Array.from(new Set(rows.flatMap((r) => Object.keys(r))))
    const recomputed = table.columnRenames ? applyColumnRenames({ ...table, rows, columns }, table.columnRenames) : { ...table, rows, columns }
    setTables((prev) => prev.map((t) => (t.id === tableId ? recomputed : t)))
    setNodes((prev) => prev.map((n) => (n.id === tableId ? { ...n, data: { table: recomputed } } : n)))
    setEdges((prev) => prev.filter((e) => {
      if (e.source === tableId && e.sourceHandle && !columns.includes(e.sourceHandle)) return false
      if (e.target === tableId && e.targetHandle && !columns.includes(e.targetHandle)) return false
      return true
    }))
    setSelectedColumns((prev) => {
      const next = { ...prev }
      const current = new Set(prev[tableId] ?? columns)
      const filtered = Array.from(current).filter((c) => columns.includes(c))
      next[tableId] = filtered.length ? filtered : columns
      return next
    })
    setTableParsingOptions((prev) => ({ ...prev, [tableId]: opts }))
  }, [])

  const onAddFiles = useCallback(async (files: FileList | File[]) => {
    const usedIds = new Set<string>(tablesRef.current.map((t) => t.id))
    const { tables: parsed, errors: newErrors } = await parseFiles(files, { usedIds })
    setErrors((prev) => prev.concat(newErrors))
    setTables((prev) => [...prev, ...parsed])
    setSelectedColumns((prev) => {
      const next = { ...prev }
      parsed.forEach((t) => { next[t.id] = [...t.columns] })
      return next
    })
    setExpandedTables((prev) => {
      const next = { ...prev }
      parsed.forEach((t) => { next[t.id] = false })
      return next
    })
    setNodes((prev) => {
      const offset = prev.length
      const extraNodes = parsed.map((table, idx) => ({
        id: table.id,
        type: 'tableNode',
        position: {
          x: 120 + ((offset + idx) % 3) * 320,
          y: 80 + Math.floor((offset + idx) / 3) * 260,
        },
        data: { table, isRoot: false, onColumnContextMenu },
      }))
      return [...prev, ...extraNodes]
    })
  }, [])

  const handleGlobalDrop = useCallback((files: FileList | File[]) => {
    onAddFiles(files)
  }, [onAddFiles])

  useEffect(() => {
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files')
    const handleDragEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      dragCounterRef.current += 1
      setDragOverlay(true)
    }
    const handleDragOver = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
    }
    const handleDragLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      dragCounterRef.current = Math.max(dragCounterRef.current - 1, 0)
      if (dragCounterRef.current === 0) setDragOverlay(false)
    }
    const handleDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      dragCounterRef.current = 0
      setDragOverlay(false)
      const files = e.dataTransfer?.files
      if (files?.length) handleGlobalDrop(files)
    }
    window.addEventListener('dragenter', handleDragEnter)
    window.addEventListener('dragover', handleDragOver)
    window.addEventListener('dragleave', handleDragLeave)
    window.addEventListener('drop', handleDrop)
    return () => {
      window.removeEventListener('dragenter', handleDragEnter)
      window.removeEventListener('dragover', handleDragOver)
      window.removeEventListener('dragleave', handleDragLeave)
      window.removeEventListener('drop', handleDrop)
    }
  }, [handleGlobalDrop])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) onFiles(e.target.files)
  }, [onFiles])

  const handleAddFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) onAddFiles(e.target.files)
  }, [onAddFiles])

  const triggerLoadFiles = useCallback(() => {
    loadInputRef.current?.click()
    closeMenus()
  }, [closeMenus])

  const triggerAddFiles = useCallback(() => {
    addInputRef.current?.click()
    closeMenus()
  }, [closeMenus])

  const handleDeleteTable = useCallback((id: string) => {
    setTables((prevTables) => {
      const { tables: nt, nodes: nn, edges: ne, rootTableId: newRoot } = removeTable(id, prevTables, nodesRef.current, edgesRef.current)
      setNodes(nn)
      setEdges(ne)
      setRootTableId((prevRoot) => {
        if (prevRoot === id) return newRoot
        if (!nt.find((t) => t.id === prevRoot)) return newRoot
        return prevRoot
      })
      setLeadRowIndex(0)
      setPreview('')
      setSelectedColumns((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      setExpandedTables((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      return nt
    })
  }, [])

  const handleProjectDeleteById = useCallback((id: string) => {
    if (!confirm('Delete project?')) return
    deleteProject(id)
    setProjects((prev) => {
      const next = prev.filter((p) => p.id !== id)
      saveProjectList(next)
      return next
    })
    setProjectId((prevId) => {
      if (prevId !== id) return prevId
      const next = projects.find((p) => p.id !== id)
      return next?.id ?? ''
    })
  }, [projects])

  const toggleMenu = useCallback((menu: 'file' | 'load' | 'help') => {
    setMenuOpen((prev) => (prev === menu ? null : menu))
  }, [])

  return (
    <div className="app" onClick={closeMenus}>
      <header className="topbar" onClick={(e) => e.stopPropagation()}>
        <nav className="menu-bar">
          <div className="menu">
            <button className="menu-button" onClick={() => toggleMenu('file')}>File ▾</button>
            {menuOpen === 'file' && (
              <div className="menu-dropdown" role="menu">
                <button onClick={handleProjectCreate}>New Project</button>
                <button onClick={() => { setProjectsModalOpen('open'); closeMenus() }}>Open Project</button>
                <button onClick={() => { setProjectsModalOpen('manage'); closeMenus() }}>Manage Projects</button>
              </div>
            )}
          </div>
          <div className="menu">
            <button className="menu-button" onClick={() => toggleMenu('load')}>Load Data ▾</button>
            {menuOpen === 'load' && (
              <div className="menu-dropdown" role="menu">
                <button onClick={triggerLoadFiles}>Load dataset(s)</button>
                <button onClick={triggerAddFiles}>Add file(s)</button>
              </div>
            )}
          </div>
          <div className="menu">
            <button className="menu-button" onClick={() => toggleMenu('help')}>Help ▾</button>
            {menuOpen === 'help' && (
              <div className="menu-dropdown" role="menu">
                <button onClick={() => { setHelpOpen(true); closeMenus() }}>Help</button>
                <button onClick={() => { setAboutOpen(true); closeMenus() }}>About</button>
              </div>
            )}
          </div>
        </nav>
        <div className="app-brand">
          <img src={logoUrl} alt="Cosmologist logo" className="app-logo" />
          <div className="app-title">Cosmologist</div>
        </div>
      </header>

      <input ref={loadInputRef} type="file" multiple webkitdirectory="true" directory="true" accept=".csv,.tsv,.txt,.json,.jsonl,.zip,.gz,.tgz,.tar,.tar.gz" style={{ display: 'none' }} onChange={handleFileInput} />
      <input ref={addInputRef} type="file" multiple accept=".csv,.tsv,.txt,.json,.jsonl,.zip,.gz,.tgz,.tar,.tar.gz" style={{ display: 'none' }} onChange={handleAddFileInput} />

      <div className="app-body">
        <aside className="sidebar">
        {persistError && <div className="persist-error">{persistError}</div>}
        {errors.length > 0 && (
          <div className="error-panel">
            <div className="error-panel__header">
              <span>Errors</span>
              <button className="error-panel__clear" onClick={clearErrors}>Clear all</button>
            </div>
            <ul className="error-list">
              {errors.map((err) => (
                <li key={err.id} className="error-item">
                  <button className="error-item__message" onClick={() => handleErrorClick(err)}>
                    {err.fileName ? `${err.fileName}: ` : ''}{err.message}
                  </button>
                  <button className="error-item__dismiss" onClick={() => handleErrorDismiss(err.id)} aria-label="Dismiss">×</button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <section className="tables-section">
          <h2>Tables</h2>
          <ul className="table-list">
            {tables.map((t) => {
              const expanded = expandedTables[t.id] ?? false
              return (
                <li key={t.id} className={['table-item', t.id === rootTableId ? 'active' : '', expanded ? 'expanded' : 'collapsed'].join(' ')}>
                  <div className="table-item__header">
                    <button className="table-item__toggle" onClick={() => handleTableExpandToggle(t.id)} aria-label={expanded ? 'Collapse columns' : 'Expand columns'}>
                      {expanded ? '▾' : '▸'}
                    </button>
                    <button className="table-item__name" onClick={() => setRootTableId(t.id)}>
                      {t.name} <span className="table-item__count">({t.rows.length})</span>
                      {t.id === rootTableId && <span className="table-item__root">Root</span>}
                    </button>
                    <div className="table-item__actions">
                      <button className="table-item__rename" onClick={() => handleRenameTable(t.id)} aria-label={`Rename ${t.name}`}>✎</button>
                      {t.originalName && t.originalName !== t.name && (
                        <button className="table-item__reset" onClick={() => handleResetTableName(t.id)} aria-label={`Reset ${t.name}`}>
                          ↺
                        </button>
                      )}
                      <button
                        className="table-item__delete"
                        onClick={() => handleDeleteTable(t.id)}
                        aria-label={`Delete ${t.name}`}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                  {expanded && (
                    <ul className="table-columns">
                      {t.columns.map((col) => {
                        const renames = t.columnRenames ?? {}
                        const original = Object.entries(renames).find((entry) => entry[1] === col)?.[0] ?? col
                        return (
                          <li key={col} className="table-column">
                            <label>
                              <input
                                type="checkbox"
                                checked={selectedColumns[t.id]?.includes(col) ?? true}
                                onChange={() => handleColumnToggle(t.id, col)}
                              />
                              {col}
                            </label>
                            <div className="table-column__actions">
                              <button className="table-column__rename" onClick={() => handleRenameColumn(t.id, col)} aria-label={`Rename ${col}`}>
                                ✎
                              </button>
                              {original !== col && (
                                <button className="table-column__reset" onClick={() => handleResetColumnName(t.id, col)} aria-label={`Reset ${col}`}>
                                  ↺
                                </button>
                              )}
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        </section>

        <section className="relationships-section">
          <h2>Relationships</h2>
          <ul className="relationship-list">
            {relationshipsSummaries.length === 0 && <li className="relationship-item empty">No relationships</li>}
            {relationshipsSummaries.map((r) => (
              <li key={r.id} className="relationship-item">
                <span>{r.label}</span>
                <button className="relationship-item__delete" onClick={() => handleDeleteEdge(r.id)} aria-label={`Delete ${r.label}`}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="controls">
          <h2>Preview</h2>
          <select value={rootTableId} onChange={(e) => setRootTableId(e.target.value)} disabled={!tables.length}>
            {tables.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={0}
            max={Math.max(leadRowCount - 1, 0)}
            value={leadRowIndex}
            onChange={(e) => setLeadRowIndex(Number(e.target.value) || 0)}
            disabled={!leadRowCount}
          />
          <button onClick={handlePreview} disabled={!tables.length}>
            Generate Preview
          </button>
          <button onClick={handleDownload} disabled={!tables.length}>
            Download ZIP
          </button>
          <div className="stats">
            <div>Tables: {tables.length}</div>
            <div>Relationships: {edges.length}</div>
          </div>
        </section>

      </aside>
      <main className="canvas" onClick={closeContextMenu}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onEdgeDoubleClick={onEdgeDoubleClick}
          onEdgeContextMenu={onEdgeContextMenu}
          onNodeDoubleClick={onNodeDoubleClick}
          onNodeContextMenu={onNodeContextMenu}
          fitView
          nodeTypes={nodeTypes}
          defaultEdgeOptions={{ markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 } }}
        >
          <Background gap={16} />
          <MiniMap pannable zoomable />
          <Controls />
        </ReactFlow>
        {dragOverlay && (
          <div className="drag-overlay">
            <div className="drag-overlay__content">
              <h2>Drop to add tables</h2>
              <p>Files or archives will be added as new tables.</p>
            </div>
          </div>
        )}

        {previewOpen && (
          <div className="preview-modal" onClick={() => setPreviewOpen(false)}>
            <div className="preview-modal__content" onClick={(e) => e.stopPropagation()}>
              <div className="preview-modal__header">
                <h3>Preview JSON</h3>
                <div className="preview-modal__actions">
                  <button onClick={() => navigator.clipboard?.writeText(preview)}>Copy</button>
                  <button onClick={() => setPreviewOpen(false)}>Close</button>
                </div>
              </div>
              <div className="preview-modal__body">
                {previewData ? (
                  <JsonTree data={previewData} collapsedLevels={1} />
                ) : (
                  <pre className="preview">{preview || 'No preview yet'}</pre>
                )}
              </div>
            </div>
          </div>
        )}

        {tablePreviewOpen && tablePreviewTable && (
          <div className="preview-modal" onClick={() => setTablePreviewOpen(false)}>
            <div className="preview-modal__content preview-modal__content--wide" onClick={(e) => e.stopPropagation()}>
              <div className="preview-modal__header">
                <h3>Table: {tablePreviewTable.name}</h3>
                <div className="preview-modal__actions">
                  <button onClick={() => setTablePreviewOpen(false)}>Close</button>
                </div>
              </div>
              <div className="preview-modal__body table-preview__body">
                <div className="table-preview__meta">Rows: {tablePreviewTable.rows.length} · Columns: {tablePreviewTable.columns.length}</div>
                <div className="table-preview__table-wrapper">
                  <table className="table-preview__table">
                    <thead>
                      <tr>
                        {tablePreviewTable.columns.map((c) => (
                          <th key={c}>{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tablePreviewTable.rows.slice(0, 50).map((row, idx) => (
                        <tr key={idx}>
                          {tablePreviewTable.columns.map((c) => (
                            <td key={c}>{String((row as any)[c] ?? '')}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {projectsModalOpen && (
          <div className="modal" onClick={() => setProjectsModalOpen(false)}>
            <div className="modal__content" onClick={(e) => e.stopPropagation()}>
              <div className="modal__header">
                <h3>{projectsModalOpen === 'open' ? 'Open Project' : 'Manage Projects'}</h3>
                <button onClick={() => setProjectsModalOpen(false)}>Close</button>
              </div>
              <div className="modal__body">
                <ul className="projects-list">
                  {projects.map((p) => (
                    <li key={p.id} className="projects-list__item">
                      <div>
                        <div className="projects-list__name">{p.name}</div>
                        <div className="projects-list__id">{p.id}</div>
                      </div>
                      <div className="projects-list__actions">
                        <button onClick={() => { setProjectId(p.id); setProjectsModalOpen(false) }}>Open</button>
                        {projectsModalOpen === 'manage' && (
                          <>
                            <button onClick={() => handleProjectRename(p.id)}>Rename</button>
                            <button onClick={() => handleProjectDeleteById(p.id)}>Delete</button>
                          </>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {selectedError && (
          <div className="modal" onClick={() => setSelectedError(null)}>
            <div className="modal__content" onClick={(e) => e.stopPropagation()}>
              <div className="modal__header">
                <h3>Error{selectedError.fileName ? ` · ${selectedError.fileName}` : ''}</h3>
                <button onClick={() => setSelectedError(null)}>Close</button>
              </div>
              <div className="modal__body">
                <p>{selectedError.message}</p>
                {selectedError.detail && <pre className="error-detail">{selectedError.detail}</pre>}
              </div>
            </div>
          </div>
        )}

        {helpOpen && (
          <div className="modal" onClick={() => setHelpOpen(false)}>
            <div className="modal__content" onClick={(e) => e.stopPropagation()}>
              <div className="modal__header">
                <h3>Help</h3>
                <button onClick={() => setHelpOpen(false)}>Close</button>
              </div>
              <div className="modal__body help-body">
                <h4>How to use</h4>
                <ul>
                  <li>File → New/Open/Manage projects</li>
                  <li>Load Data → Load dataset(s) or Add file(s)</li>
                  <li>Supports CSV, TSV, TXT, JSON, JSONL, ZIP, TAR, GZ/TGZ (nested archives).</li>
                  <li>Drag relations between tables to build hierarchy; right-click edges to set 1:1 or 1:*.</li>
                  <li>Select root table and row index, then Generate Preview or Download ZIP.</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {aboutOpen && (
          <div className="modal" onClick={() => setAboutOpen(false)}>
            <div className="modal__content" onClick={(e) => e.stopPropagation()}>
              <div className="modal__header">
                <h3>About</h3>
                <button onClick={() => setAboutOpen(false)}>Close</button>
              </div>
              <div className="modal__body">
                <p><strong>Cosmologist</strong></p>
                <p>Version: {VERSION}</p>
                <p>Author: {AUTHOR}</p>
              </div>
            </div>
          </div>
        )}
        {contextMenu && contextMenu.type === 'table' && (
          <div className="context-menu" style={{ top: contextMenu.y, left: contextMenu.x }} onClick={(e) => e.stopPropagation()}>
            <h4>Table</h4>
            <button onClick={() => { openTablePreview(contextMenu.tableId); closeContextMenu() }}>View Table</button>
            <button onClick={() => { handleRenameTable(contextMenu.tableId); closeContextMenu() }}>Rename</button>
            {tables.find((t) => t.id === contextMenu.tableId)?.originalName && tables.find((t) => t.id === contextMenu.tableId)?.originalName !== tables.find((t) => t.id === contextMenu.tableId)?.name && (
              <button onClick={() => { handleResetTableName(contextMenu.tableId); closeContextMenu() }}>Reset name</button>
            )}
            <h5>Parsing options</h5>
            <label>
              Delimiter
              <select
                value={tableParsingOptions[contextMenu.tableId]?.delimiter ?? 'auto'}
                onChange={(e) => reparseTable(contextMenu.tableId, {
                  ...tableParsingOptions[contextMenu.tableId],
                  delimiter: e.target.value as any,
                  skipRows: tableParsingOptions[contextMenu.tableId]?.skipRows ?? 0,
                })}
              >
                <option value="auto">Auto</option>
                <option value="csv">Comma</option>
                <option value="tsv">Tab</option>
              </select>
            </label>
            <label>
              Skip rows
              <input
                type="number"
                min={0}
                value={tableParsingOptions[contextMenu.tableId]?.skipRows ?? 0}
                onChange={(e) => reparseTable(contextMenu.tableId, {
                  ...tableParsingOptions[contextMenu.tableId],
                  skipRows: Number(e.target.value) || 0,
                  delimiter: tableParsingOptions[contextMenu.tableId]?.delimiter ?? 'auto',
                })}
              />
            </label>
            <button onClick={closeContextMenu}>Close</button>
          </div>
        )}
        {contextMenu && contextMenu.type === 'column' && (() => {
          const table = tables.find((t) => t.id === contextMenu.tableId)
          const original = table ? findOriginalColumn(table.columnRenames ?? {}, contextMenu.column) ?? contextMenu.column : contextMenu.column
          return (
            <div className="context-menu" style={{ top: contextMenu.y, left: contextMenu.x }} onClick={(e) => e.stopPropagation()}>
              <h4>Column</h4>
              <div>{table?.name ?? contextMenu.tableId} · {contextMenu.column}</div>
              <button onClick={() => { handleRenameColumn(contextMenu.tableId, contextMenu.column); closeContextMenu() }}>Rename</button>
              {original !== contextMenu.column && (
                <button onClick={() => { handleResetColumnName(contextMenu.tableId, contextMenu.column); closeContextMenu() }}>Reset name</button>
              )}
              <button onClick={closeContextMenu}>Close</button>
            </div>
          )
        })()}
        {contextMenu && contextMenu.type === 'edge' && (
          <div className="context-menu" style={{ top: contextMenu.y, left: contextMenu.x }} onClick={(e) => e.stopPropagation()}>
            <h4>Relationship</h4>
            <label>
              Type
              <select
                value={edgeTypes[contextMenu.edgeId] ?? 'one-to-many'}
                onChange={(e) => setEdgeTypes((prev) => ({ ...prev, [contextMenu.edgeId]: e.target.value as any }))}
              >
                <option value="one-to-many">1:* (array)</option>
                <option value="one-to-one">1:1 (object)</option>
              </select>
            </label>
            <button onClick={() => handleDeleteEdge(contextMenu.edgeId)}>Delete</button>
            <button onClick={closeContextMenu}>Close</button>
          </div>
        )}
      </main>
    </div>
  </div>
  )
}

export default function WrappedApp() {
  return (
    <ReactFlowProvider>
      <App />
    </ReactFlowProvider>
  )
}
