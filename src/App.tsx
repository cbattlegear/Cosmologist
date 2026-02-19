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
import { parseFiles, detectDelimiter, parseDelimitedText, slugify } from './lib/parseFiles'
import { parseSqlServerSchema } from './lib/parseSqlSchema'
import { generateDummyRowsForSchema } from './lib/dummyData'
import { buildJoinedDocument, toRelationshipEdges } from './lib/join'
import { removeTable } from './lib/removeTable'
import { loadProjectList, loadProject, saveProjectList, saveProject, deleteProject, makeProjectId, type ProjectState, setProjectSource, getProjectSource, renameProject, exportProject, importProject, type ExportedProject } from './lib/projects'
import { rehydrateTables } from './lib/rehydrate'
import type { TableData, ParseFileError } from './lib/types'
import { renameColumn as renameColumnData, renameTable as renameTableData, updateEdgesForColumnRename, renameSelectedColumns, ensureColumnRenames, findOriginalColumn, applyColumnRenames } from './lib/rename'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import TableNode, { type TableNodeData } from './components/TableNode'
import JsonTree from './components/JsonTree'
import { estimateRu, type RuEstimate } from './lib/ru'
import { type ColumnSplit, type TablePivot, applyTransforms } from './lib/transforms'
import logoUrl from './assets/logo.svg'
import { getEmbeddedModel } from './lib/models'

const nodeTypes = { tableNode: TableNode }
const VERSION = import.meta.env.VITE_APP_VERSION ?? '0.0.0'
const AUTHOR = 'Cosmologist'
const GITHUB_URL = import.meta.env.VITE_APP_GITHUB_URL ?? 'https://github.com/cbattlegear/Cosmologist'

function App() {
  const [tables, setTables] = useState<TableData[]>([])
  const [nodes, setNodes] = useState<Node<TableNodeData>[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [errors, setErrors] = useState<ParseFileError[]>([])
  const [rootTableId, setRootTableId] = useState('')
  const [documentRootIds, setDocumentRootIds] = useState<string[]>([])
  const [leadRowIndex, setLeadRowIndex] = useState(0)
  const [selectedColumns, setSelectedColumns] = useState<Record<string, string[]>>({})
  const [expandedTables, setExpandedTables] = useState<Record<string, boolean>>({})
  const [tableParsingOptions, setTableParsingOptions] = useState<Record<string, { delimiter?: 'auto' | 'csv' | 'tsv'; skipRows?: number }>>({})
  const [tableRenames, setTableRenames] = useState<Record<string, string>>({})
  const [columnRenames, setColumnRenames] = useState<Record<string, Record<string, string>>>({})
  const [columnSplits, setColumnSplits] = useState<ColumnSplit[]>([])
  const [tablePivots, setTablePivots] = useState<TablePivot[]>([])
  const [contextMenu, setContextMenu] = useState<
    | { type: 'table'; x: number; y: number; tableId: string }
    | { type: 'column'; x: number; y: number; tableId: string; column: string }
    | { type: 'edge'; x: number; y: number; edgeId: string }
    | { type: 'pane'; x: number; y: number }
    | null
  >(null)
  const [edgeTypes, setEdgeTypes] = useState<Record<string, 'one-to-many' | 'one-to-one'>>({})
  const [edgeColumnFilters, setEdgeColumnFilters] = useState<Record<string, string[]>>({})
  const [edgeMaxDepth, setEdgeMaxDepth] = useState<Record<string, number>>({})
  const [edgePropertyNames, setEdgePropertyNames] = useState<Record<string, string>>({})
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])
  const [projectId, setProjectId] = useState('')
  const [hydrated, setHydrated] = useState(false)
  const [persistError, setPersistError] = useState<string>('')
  const [preview, setPreview] = useState('')
  const [previewData, setPreviewData] = useState<any>(null)
  const [previewRu, setPreviewRu] = useState<RuEstimate | null>(null)
  const [previewMode, setPreviewMode] = useState<'tree' | 'raw'>('tree')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [tablePreviewOpen, setTablePreviewOpen] = useState(false)
  const [selectedError, setSelectedError] = useState<ParseFileError | null>(null)
  const [tablePreviewTableId, setTablePreviewTableId] = useState<string | null>(null)
  const [tablePreviewTransformed, setTablePreviewTransformed] = useState(true)
  const [menuOpen, setMenuOpen] = useState<'file' | 'load' | 'help' | null>(null)
  const [projectsModalOpen, setProjectsModalOpen] = useState<false | 'open' | 'manage'>(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [welcomeOpen, setWelcomeOpen] = useState(() => {
    return !localStorage.getItem('cosmologist_welcomed')
  })

  const currentProjectName = useMemo(() => projects.find((p) => p.id === projectId)?.name ?? 'Project', [projects, projectId])
  const [dragOverlay, setDragOverlay] = useState(false)
  const [sqlSchemaModalOpen, setSqlSchemaModalOpen] = useState(false)
  const [sqlSchemaText, setSqlSchemaText] = useState('')
  const [sqlSchemaSource, setSqlSchemaSource] = useState('')
  const [createTableOpen, setCreateTableOpen] = useState(false)
  const [createTableName, setCreateTableName] = useState('')

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const stored = localStorage.getItem('cosmologist_theme') as 'light' | 'dark' | null
    if (stored) return stored
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('cosmologist_theme', theme)
  }, [theme])
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!mq) return
    const handler = (e: MediaQueryListEvent) => {
      if (!localStorage.getItem('cosmologist_theme')) setTheme(e.matches ? 'dark' : 'light')
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  const [createTableColumns, setCreateTableColumns] = useState<string[]>([''])
  const [createTableRows, setCreateTableRows] = useState<Record<string, string>[]>([])

  const loadInputRef = useRef<HTMLInputElement>(null)
  const addInputRef = useRef<HTMLInputElement>(null)
  const dragCounterRef = useRef(0)
  const modelLoadedRef = useRef(false)

  const closeMenus = useCallback(() => setMenuOpen(null), [])

  const nodesRef = useRef<Node<TableNodeData>[]>([])
  const edgesRef = useRef<Edge[]>([])
  const tablesRef = useRef<TableData[]>([])
  useEffect(() => { nodesRef.current = nodes }, [nodes])
  useEffect(() => { edgesRef.current = edges }, [edges])
  useEffect(() => { tablesRef.current = tables }, [tables])

  useEffect(() => {
    const stored = localStorage.getItem('sidebarWidth')
    if (stored) document.documentElement.style.setProperty('--sidebar-width', `${stored}px`)
  }, [])

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

  // Auto-load embedded model from ?model= query param
  useEffect(() => {
    if (modelLoadedRef.current || !projects.length) return
    const params = new URLSearchParams(window.location.search)
    const slug = params.get('model')
    if (!slug) return
    const model = getEmbeddedModel(slug)
    if (!model) return
    modelLoadedRef.current = true
    importProject(model).then((meta) => {
      setProjects((prev) => [...prev, meta])
      setProjectId(meta.id)
      params.delete('model')
      const qs = params.toString()
      window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''))
    })
  }, [projects])

  useEffect(() => {
    if (!projectId) return
    const state = loadProject(projectId)
    if (state) {
      rehydrateTables(state as ProjectState).then(async (tables) => {
        const parsedOpts = state.tableParsingOptions ?? {}
        const applied = await applyParsingOptions(tables, state.edges ?? [], parsedOpts, state.selectedColumns ?? {}, state.projectId)
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
        setEdgeColumnFilters((state as any).edgeColumnFilters ?? {})
        setEdgeMaxDepth((state as any).edgeMaxDepth ?? {})
        setEdgePropertyNames((state as any).edgePropertyNames ?? {})
        setRootTableId(state.rootTableId ?? applied.tablesOut[0]?.id ?? '')
        setLeadRowIndex(state.leadRowIndex ?? 0)
        setSelectedColumns(applied.selectedOut)
        setExpandedTables(state.expandedTables ?? {})
        setTableParsingOptions(parsedOpts)
        setTableRenames(state.tableRenames ?? {})
        setColumnRenames(state.columnRenames ?? {})
        setColumnSplits((state as any).columnSplits ?? [])
        setTablePivots((state as any).tablePivots ?? [])
        setDocumentRootIds(state.documentRootIds ?? (applied.tablesOut[0] ? [applied.tablesOut[0].id] : []))
        setSqlSchemaSource(state.sqlSchemaText ?? '')
      })
    } else {
      setTables([])
      setNodes([])
      setEdges([])
      setEdgeTypes({})
      setEdgeColumnFilters({})
      setEdgeMaxDepth({})
      setEdgePropertyNames({})
      setRootTableId('')
      setLeadRowIndex(0)
      setSelectedColumns({})
      setExpandedTables({})
      setTableParsingOptions({})
      setDocumentRootIds([])
      setColumnSplits([])
      setTablePivots([])
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
      documentRootIds,
      sqlSchemaText: sqlSchemaSource,
      columnSplits,
      tablePivots,
      edgeColumnFilters,
      edgeMaxDepth,
      edgePropertyNames,
    } as any)
    setPersistError(ok ? '' : 'Project too large to save; persistence disabled for this project.')
  }, [hydrated, projectId, tables, nodes, edges, rootTableId, leadRowIndex, selectedColumns, expandedTables, tableParsingOptions, edgeTypes, documentRootIds, columnSplits, tablePivots, edgeColumnFilters, edgeMaxDepth, edgePropertyNames])
  const onFiles = useCallback(async (files: FileList | File[]) => {
    const { tables: parsed, errors } = await parseFiles(files)
    setErrors(errors)
    setTables(parsed)
    setDocumentRootIds(parsed.filter((t) => t.isDocumentRoot).map((t) => t.id) ?? (parsed[0] ? [parsed[0].id] : []))
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

  const tablePreviewHasTransforms = useMemo(() => {
    if (!tablePreviewTableId) return false
    return columnSplits.some((s) => s.tableId === tablePreviewTableId) || tablePivots.some((p) => p.tableId === tablePreviewTableId)
  }, [tablePreviewTableId, columnSplits, tablePivots])

  const tablePreviewRows = useMemo(() => {
    if (!tablePreviewTable) return []
    if (!tablePreviewTransformed || !tablePreviewHasTransforms) return tablePreviewTable.rows
    return tablePreviewTable.rows.map((row) =>
      applyTransforms(row, tablePreviewTable.id, tablePreviewTable.columns, columnSplits, tablePivots),
    )
  }, [tablePreviewTable, tablePreviewTransformed, tablePreviewHasTransforms, columnSplits, tablePivots])

  const tablePreviewColumns = useMemo(() => {
    if (!tablePreviewTable) return []
    if (!tablePreviewTransformed || !tablePreviewHasTransforms || !tablePreviewRows.length) return tablePreviewTable.columns
    // Derive columns from first transformed row (pivot may add/remove columns)
    const seen = new Set<string>()
    const cols: string[] = []
    for (const row of tablePreviewRows.slice(0, 10)) {
      for (const key of Object.keys(row)) {
        if (!seen.has(key)) { seen.add(key); cols.push(key) }
      }
    }
    return cols
  }, [tablePreviewTable, tablePreviewTransformed, tablePreviewHasTransforms, tablePreviewRows])

  useEffect(() => {
    setNodes((prev) => prev.map((n) => {
      const splitCols = new Set(columnSplits.filter((s) => s.tableId === n.id).map((s) => s.column))
      const hasPivot = tablePivots.some((p) => p.tableId === n.id)
      return { ...n, data: { ...n.data, isRoot: n.id === rootTableId, isDocRoot: documentRootIds.includes(n.id), splitColumns: splitCols, hasPivot } }
    }))
  }, [rootTableId, documentRootIds, columnSplits, tablePivots])

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

  const handleProjectDuplicate = useCallback(() => {
    if (!projectId) return
    const source = projects.find((p) => p.id === projectId)
    const baseName = source?.name ?? 'Project'
    let candidate = `${baseName} (copy)`
    let idx = 2
    while (projects.some((p) => p.name === candidate)) {
      candidate = `${baseName} (copy ${idx++})`
    }
    const newId = makeProjectId(candidate)
    const state = loadProject(projectId)
    saveProjectList([...projects, { id: newId, name: candidate }])
    saveProject(newId, state ? { ...state, projectId: newId } : {
      projectId: newId, tablesSources: {}, nodePositions: {}, edges: [], rootTableId: '', leadRowIndex: 0, selectedColumns: {}, expandedTables: {}, tableParsingOptions: {}, edgeTypes: {},
    })
    setProjects((prev) => [...prev, { id: newId, name: candidate }])
    setProjectId(newId)
    setProjectsModalOpen(false)
    closeMenus()
  }, [projectId, projects, closeMenus])

  const handleProjectExport = useCallback(async () => {
    if (!projectId) return
    const name = projects.find((p) => p.id === projectId)?.name ?? 'Project'
    const data = await exportProject(projectId, name)
    if (!data) return
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    saveAs(blob, `${name.replace(/[^a-z0-9_\- ]/gi, '_')}.cosmologist.json`)
    closeMenus()
  }, [projectId, projects, closeMenus])

  const importInputRef = useRef<HTMLInputElement>(null)

  const handleProjectImport = useCallback(() => {
    importInputRef.current?.click()
    closeMenus()
  }, [closeMenus])

  const handleImportFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const data = JSON.parse(text) as ExportedProject
      if (!data._cosmologist || !data.state) {
        alert('Invalid Cosmologist project file.')
        return
      }
      const meta = await importProject(data)
      setProjects((prev) => [...prev, meta])
      setProjectId(meta.id)
    } catch {
      alert('Failed to import project. Please check the file is valid.')
    }
    e.target.value = ''
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

  const onPaneContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault()
    setContextMenu({ type: 'pane', x: event.clientX, y: event.clientY })
  }, [])

  const arrangeNodes = useCallback(() => {
    setNodes((prev) => {
      if (!prev.length) return prev
      const nodeIds = prev.map((n) => n.id)
      const nodeSet = new Set(nodeIds)
      const currentEdges = edgesRef.current
      // Build adjacency for topological sort (parent → children)
      const children = new Map<string, string[]>()
      const inDegree = new Map<string, number>()
      for (const id of nodeIds) {
        children.set(id, [])
        inDegree.set(id, 0)
      }
      for (const e of currentEdges) {
        if (nodeSet.has(e.source) && nodeSet.has(e.target) && e.source !== e.target) {
          children.get(e.source)!.push(e.target)
          inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1)
        }
      }
      // Kahn's algorithm – topological sort into layers
      const layers: string[][] = []
      let queue = nodeIds.filter((id) => (inDegree.get(id) ?? 0) === 0)
      const visited = new Set<string>()
      while (queue.length) {
        layers.push(queue)
        for (const id of queue) visited.add(id)
        const next: string[] = []
        for (const id of queue) {
          for (const child of children.get(id) ?? []) {
            inDegree.set(child, (inDegree.get(child) ?? 0) - 1)
            if ((inDegree.get(child) ?? 0) <= 0 && !visited.has(child)) {
              next.push(child)
              visited.add(child)
            }
          }
        }
        queue = next
      }
      // Add any remaining nodes (cycles) as a final layer
      const remaining = nodeIds.filter((id) => !visited.has(id))
      if (remaining.length) layers.push(remaining)

      const NODE_W = 280
      const NODE_H = 220
      const GAP_X = 60
      const GAP_Y = 60
      const START_X = 80
      const START_Y = 60

      // Assign positions: each layer is a row, nodes in each row spread horizontally
      const positionMap = new Map<string, { x: number; y: number }>()
      // Center each layer relative to the widest layer
      const maxCols = Math.max(...layers.map((l) => l.length))
      const totalWidth = maxCols * (NODE_W + GAP_X) - GAP_X
      for (let row = 0; row < layers.length; row++) {
        const layer = layers[row]
        const layerWidth = layer.length * (NODE_W + GAP_X) - GAP_X
        const offsetX = START_X + (totalWidth - layerWidth) / 2
        for (let col = 0; col < layer.length; col++) {
          positionMap.set(layer[col], { x: offsetX + col * (NODE_W + GAP_X), y: START_Y + row * (NODE_H + GAP_Y) })
        }
      }

      return prev.map((n) => {
        const pos = positionMap.get(n.id)
        return pos ? { ...n, position: pos } : n
      })
    })
    closeContextMenu()
  }, [closeContextMenu])

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

  const applyParsedTablesAndEdges = useCallback((tablesIn: TableData[], edgesIn: Edge[], sqlSchema?: string) => {
    const withDummy = tablesIn.some((t) => t.sourceType === 'sqlschema')
      ? generateDummyRowsForSchema(tablesIn, edgesIn, 10)
      : tablesIn
    if (sqlSchema) setSqlSchemaSource(sqlSchema)
    setTables(withDummy)
    setDocumentRootIds((prev) => (prev.length ? prev : (withDummy.filter((t) => t.isDocumentRoot).map((t) => t.id) ?? (withDummy[0] ? [withDummy[0].id] : []))))
    const computedNodes = tablesIn.map((table, idx) => ({
      id: table.id,
      type: 'tableNode',
      position: {
        x: 120 + (idx % 3) * 320,
        y: 80 + Math.floor(idx / 3) * 260,
      },
      data: { table, isRoot: idx === 0, onColumnContextMenu },
    }))
    setNodes(computedNodes)
    setEdges(edgesIn)
    const selection: Record<string, string[]> = {}
    const expanded: Record<string, boolean> = {}
    tablesIn.forEach((t) => { selection[t.id] = [...t.columns]; expanded[t.id] = false })
    setSelectedColumns(selection)
    setExpandedTables(expanded)
    if (tablesIn[0]) {
      setRootTableId(tablesIn[0].id)
      setLeadRowIndex(0)
    }
  }, [onColumnContextMenu])

  const handleSqlSchemaParse = useCallback(() => {
    const { tables: parsedTables, edges: parsedEdges, errors: parseErrors } = parseSqlServerSchema(sqlSchemaText)
    if (parseErrors.length) {
      setErrors(parseErrors)
      return
    }
    applyParsedTablesAndEdges(parsedTables, parsedEdges, sqlSchemaText)
    setSqlSchemaModalOpen(false)
    setSqlSchemaText('')
  }, [sqlSchemaText, applyParsedTablesAndEdges])

  const handleCreateTable = useCallback(() => {
    const name = createTableName.trim()
    if (!name) return
    const cols = createTableColumns.map((c) => c.trim()).filter(Boolean)
    if (!cols.length) return
    const usedIds = new Set(tablesRef.current.map((t) => t.id))
    let id = slugify(name) || 'table'
    let i = 1
    while (usedIds.has(id)) { id = `${slugify(name) || 'table'}-${i++}` }
    const rows = createTableRows
      .map((r) => {
        const row: Record<string, any> = {}
        cols.forEach((c) => { row[c] = r[c] ?? '' })
        return row
      })
      .filter((r) => Object.values(r).some((v) => v !== ''))
    const table: TableData = {
      id,
      name,
      fileName: `${name} (manual)`,
      columns: cols,
      rows,
      sourceType: 'manual',
    }
    setTables((prev) => [...prev, table])
    setSelectedColumns((prev) => ({ ...prev, [id]: [...cols] }))
    setExpandedTables((prev) => ({ ...prev, [id]: false }))
    setNodes((prev) => {
      const offset = prev.length
      return [...prev, {
        id: table.id,
        type: 'tableNode',
        position: { x: 120 + (offset % 3) * 320, y: 80 + Math.floor(offset / 3) * 260 },
        data: { table, isRoot: false, onColumnContextMenu },
      }]
    })
    if (!tablesRef.current.length) {
      setRootTableId(id)
      setLeadRowIndex(0)
    }
    setCreateTableOpen(false)
    setCreateTableName('')
    setCreateTableColumns([''])
    setCreateTableRows([])
  }, [createTableName, createTableColumns, createTableRows, onColumnContextMenu])

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

  const toggleDocumentRoot = useCallback((tableId: string) => {
    setDocumentRootIds((prev) => {
      const exists = prev.includes(tableId)
      let next = exists ? prev.filter((id) => id !== tableId) : [...prev, tableId]
      if (!next.length) {
        if (rootTableId) next = [rootTableId]
        else if (tablesRef.current[0]) next = [tablesRef.current[0].id]
      }
      return next
    })
  }, [rootTableId])

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

  const handleDeleteColumn = useCallback((tableId: string, column: string) => {
    setTables((prev) => prev.map((t) => {
      if (t.id !== tableId) return t
      const columns = t.columns.filter((c) => c !== column)
      const rows = t.rows.map((r) => {
        if (!(column in r)) return r
        const nr = { ...r }
        delete (nr as any)[column]
        return nr
      })
      const renames = { ...(t.columnRenames ?? {}) }
      const original = findOriginalColumn(renames, column)
      if (original) delete renames[original]
      return { ...t, columns, rows, columnRenames: renames }
    }))
    setEdges((prev) => prev.filter((e) => !((e.source === tableId && e.sourceHandle === column) || (e.target === tableId && e.targetHandle === column))))
    setSelectedColumns((prev) => {
      const next = { ...prev }
      if (next[tableId]) next[tableId] = next[tableId].filter((c) => c !== column)
      return next
    })
  }, [])

  const handlePreview = useCallback(() => {
    if (!rootTableId || !tables.length) return
    try {
      const doc = buildJoinedDocument(rootTableId, leadRowIndex, tables, toRelationshipEdges(edges, edgeTypes, edgeColumnFilters, edgeMaxDepth, edgePropertyNames), {
        columnsFilter: selectedColumns,
        columnSplits,
        tablePivots,
      })
      setPreviewData(doc)
      setPreviewRu(estimateRu(doc))
      setPreview(JSON.stringify(doc, null, 2))
      setPreviewMode('tree')
      setPreviewOpen(true)
    } catch (e: any) {
      setPreview(`Error: ${e?.message ?? e}`)
      setPreviewData(null)
      setPreviewRu(null)
      setPreviewMode('raw')
    }
  }, [rootTableId, leadRowIndex, tables, edges, edgeTypes, selectedColumns, columnSplits, tablePivots, edgeColumnFilters, edgeMaxDepth, edgePropertyNames])

  const handleDownload = useCallback(async () => {
    if (!tables.length) return
    const roots = documentRootIds.length ? documentRootIds : (rootTableId ? [rootTableId] : [])
    if (!roots.length) return
    const relationships = toRelationshipEdges(edges, edgeTypes, edgeColumnFilters, edgeMaxDepth, edgePropertyNames)
    const zip = new JSZip()
    roots.forEach((rid) => {
      const lead = tables.find((t) => t.id === rid)
      if (!lead) return
      const folder = zip.folder(lead.name) ?? zip
      lead.rows.forEach((_, idx) => {
        const doc = buildJoinedDocument(lead.id, idx, tables, relationships, {
          columnsFilter: selectedColumns,
          columnSplits,
          tablePivots,
        })
        folder.file(`${lead.name}_${idx}.json`, JSON.stringify(doc, null, 2))
      })
    })
    const blob = await zip.generateAsync({ type: 'blob' })
    const name = roots.length === 1 ? (tables.find((t) => t.id === roots[0])?.name ?? 'documents') : 'documents'
    saveAs(blob, `${name}_export.zip`)
  }, [rootTableId, documentRootIds, tables, edges, edgeTypes, selectedColumns, columnSplits, tablePivots, edgeColumnFilters, edgeMaxDepth, edgePropertyNames])

  const applyParsingOptions = useCallback(async (
    tablesInput: TableData[],
    edgesInput: Edge[],
    opts: Record<string, { delimiter?: 'auto' | 'csv' | 'tsv'; skipRows?: number }>,
    selectedCols: Record<string, string[]>,
    pid?: string,
  ) => {
    let tablesOut: TableData[] = tablesInput.map((t) => ({ ...t, rows: t.rows.map((r) => ({ ...r })) }))
    let edgesOut: Edge[] = [...edgesInput]
    let selectedOut: Record<string, string[]> = { ...selectedCols }

    for (const t of tablesOut) {
      const opt = opts[t.id]
      if (!opt) continue
      const sourceText = t.sourceText ?? (pid ? await getProjectSource(pid, t.id) : undefined)
      if (!sourceText) continue
      const delimiter = opt.delimiter === 'csv' ? ',' : opt.delimiter === 'tsv' ? '\t' : detectDelimiter(sourceText)
      const rows = await parseDelimitedText(sourceText, delimiter, opt.skipRows ?? 0)
      const columns = Array.from(new Set(rows.flatMap((r) => Object.keys(r))))
      let tableNew: TableData = { ...t, sourceText, rows, columns }
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
    if (!table) return
    const sourceText = table.sourceText ?? (projectId ? await getProjectSource(projectId, tableId) : undefined)
    if (!sourceText) return
    const delimiter = opts.delimiter === 'csv' ? ',' : opts.delimiter === 'tsv' ? '\t' : detectDelimiter(sourceText)
    const skipRows = opts.skipRows ?? 0
    const rows = await parseDelimitedText(sourceText, delimiter, skipRows)
    const columns = Array.from(new Set(rows.flatMap((r) => Object.keys(r))))
    const withSource = { ...table, sourceText }
    const recomputed = table.columnRenames ? applyColumnRenames({ ...withSource, rows, columns }, table.columnRenames) : { ...withSource, rows, columns }
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
  }, [projectId])

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
    setDocumentRootIds((prev) => prev.filter((i) => i !== id))
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

  const handleSidebarResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width')) || 320
    const min = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-min-width')) || 220
    const max = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-max-width')) || 520
    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX
      const next = Math.min(max, Math.max(min, startWidth + delta))
      document.documentElement.style.setProperty('--sidebar-width', `${next}px`)
      localStorage.setItem('sidebarWidth', String(next))
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
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
                <button onClick={handleProjectDuplicate}>Duplicate Project</button>
                <button onClick={() => { setProjectsModalOpen('open'); closeMenus() }}>Open Project</button>
                <button onClick={() => { setProjectsModalOpen('manage'); closeMenus() }}>Manage Projects</button>
                <hr className="menu-separator" />
                <button onClick={handleProjectExport}>Export Project</button>
                <button onClick={handleProjectImport}>Import Project</button>
              </div>
            )}
          </div>
          <div className="menu">
            <button className="menu-button" onClick={() => toggleMenu('load')}>Load Data ▾</button>
            {menuOpen === 'load' && (
              <div className="menu-dropdown" role="menu">
                <button onClick={triggerLoadFiles}>Load dataset(s)</button>
                <button onClick={triggerAddFiles}>Add file(s)</button>
                <button onClick={() => { setSqlSchemaModalOpen(true); closeMenus() }}>Load SQL Server Schema</button>
                <button onClick={() => { setCreateTableOpen(true); closeMenus() }}>Create Table</button>
              </div>
            )}
          </div>
          <div className="menu">
            <button className="menu-button" onClick={() => toggleMenu('help')}>Help ▾</button>
            {menuOpen === 'help' && (
              <div className="menu-dropdown" role="menu">
                <button onClick={() => { setWelcomeOpen(true); closeMenus() }}>Welcome Guide</button>
                <button onClick={() => { setHelpOpen(true); closeMenus() }}>Help</button>
                <button onClick={() => { setAboutOpen(true); closeMenus() }}>About</button>
              </div>
            )}
          </div>
        </nav>
        <div className="project-title" title={currentProjectName}>{currentProjectName}</div>
        <div className="app-brand">
          <button
            onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1.1rem', padding: '0 0.25rem', lineHeight: 1 }}
            title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
          >
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
          <img src={logoUrl} alt="Cosmologist logo" className="app-logo" />
          <div className="app-title">Cosmologist</div>
        </div>
      </header>

      <input ref={loadInputRef} type="file" multiple webkitdirectory="true" directory="true" accept=".csv,.tsv,.txt,.json,.jsonl,.zip,.gz,.tgz,.tar,.tar.gz" style={{ display: 'none' }} onChange={handleFileInput} />
      <input ref={addInputRef} type="file" multiple accept=".csv,.tsv,.txt,.json,.jsonl,.zip,.gz,.tgz,.tar,.tar.gz" style={{ display: 'none' }} onChange={handleAddFileInput} />
      <input ref={importInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImportFile} />

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
                      <span className="table-item__label">{t.name}</span>
                      <span className="table-item__count">({t.rows.length})</span>
                      {t.id === rootTableId && <span className="table-item__root">Root</span>}
                    </button>
                    <div className="table-item__actions">
                      <button className={['table-item__docroot', documentRootIds.includes(t.id) ? 'active' : ''].join(' ')} onClick={() => toggleDocumentRoot(t.id)} aria-label={`Toggle document root for ${t.name}`}>
                        📄
                      </button>
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
                          <li key={col} className="table-column" onContextMenu={(e) => onColumnContextMenu(t.id, col, e)}>
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
                              <button className="table-column__delete" onClick={() => handleDeleteColumn(t.id, col)} aria-label={`Delete ${col}`}>
                                ×
                              </button>
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
              <li key={r.id} className="relationship-item" onContextMenu={(e) => { e.preventDefault(); setContextMenu({ type: 'edge', x: e.clientX, y: e.clientY, edgeId: r.id }) }}>
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
          <select value={rootTableId} onChange={(e) => { setRootTableId(e.target.value); setDocumentRootIds((prev) => prev.length ? prev : [e.target.value]) }} disabled={!tables.length}>
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
      <div className="sidebar-resizer" onMouseDown={handleSidebarResize} />
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
          onPaneContextMenu={onPaneContextMenu}
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
            <div className="preview-modal__content preview-modal__content--json" onClick={(e) => e.stopPropagation()}>
              <div className="preview-modal__header">
                <h3>Preview JSON</h3>
                <div className="preview-modal__actions">
                  <div className="preview-modal__mode">
                    <button className={previewMode === 'tree' ? 'active' : ''} onClick={() => setPreviewMode('tree')}>Tree</button>
                    <button className={previewMode === 'raw' ? 'active' : ''} onClick={() => setPreviewMode('raw')}>Raw</button>
                  </div>
                  <button onClick={() => navigator.clipboard?.writeText(preview)}>Copy</button>
                  <button onClick={() => setPreviewOpen(false)}>Close</button>
                </div>
              </div>
              <div className="preview-modal__body preview-modal__body--json">
                {previewRu && (
                  <div className="preview-ru">
                    <div>Size: {previewRu.sizeKB.toFixed(2)} KB</div>
                    <div>Read RU (point): {previewRu.readPointRU.toFixed(2)}</div>
                    <div>Read RU (query): {previewRu.readQueryRU.toFixed(2)}</div>
                    <div>Write RU: {previewRu.writeRU.toFixed(2)}</div>
                  </div>
                )}
                {previewMode === 'tree' && previewData ? (
                  <JsonTree data={previewData} collapsedLevels={1} />
                ) : (
                  <pre className="preview preview--modal">{preview || 'No preview yet'}</pre>
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
                  {tablePreviewHasTransforms && (
                    <div className="preview-modal__mode">
                      <button className={tablePreviewTransformed ? 'active' : ''} onClick={() => setTablePreviewTransformed(true)}>Transformed</button>
                      <button className={!tablePreviewTransformed ? 'active' : ''} onClick={() => setTablePreviewTransformed(false)}>Original</button>
                    </div>
                  )}
                  <button onClick={() => setTablePreviewOpen(false)}>Close</button>
                </div>
              </div>
              <div className="preview-modal__body table-preview__body">
                <div className="table-preview__meta">
                  Rows: {tablePreviewTable.rows.length} · Columns: {tablePreviewColumns.length}
                  {tablePreviewHasTransforms && (
                    <span className="table-preview__transform-badge">
                      {columnSplits.filter((s) => s.tableId === tablePreviewTable.id).length > 0 && <span>✂ {columnSplits.filter((s) => s.tableId === tablePreviewTable.id).length} split(s)</span>}
                      {tablePivots.filter((p) => p.tableId === tablePreviewTable.id).length > 0 && <span>⟳ {tablePivots.filter((p) => p.tableId === tablePreviewTable.id).length} pivot(s)</span>}
                    </span>
                  )}
                </div>
                <div className="table-preview__table-wrapper">
                  <table className="table-preview__table">
                    <thead>
                      <tr>
                        {tablePreviewColumns.map((c) => (
                          <th key={c}>{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tablePreviewRows.slice(0, 50).map((row, idx) => (
                        <tr key={idx}>
                          {tablePreviewColumns.map((c) => {
                            const val = (row as any)[c]
                            const display = (typeof val === 'object' && val !== null) ? JSON.stringify(val) : String(val ?? '')
                            return <td key={c} title={display}>{display}</td>
                          })}
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
                  <li>Supports CSV, TSV, TXT, JSON, JSONL, ZIP, TAR, GZ/TGZ (nested archives), SQL Server schema paste, and multiple document roots.</li>
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
                <p>GitHub: <a href={GITHUB_URL} target="_blank" rel="noreferrer">{GITHUB_URL}</a></p>
              </div>
            </div>
          </div>
        )}

        {welcomeOpen && (
          <div className="modal" onClick={() => { setWelcomeOpen(false); localStorage.setItem('cosmologist_welcomed', '1') }}>
            <div className="modal__content modal__content--wide" onClick={(e) => e.stopPropagation()}>
              <div className="modal__header">
                <h3>Welcome to Cosmologist!</h3>
                <button onClick={() => { setWelcomeOpen(false); localStorage.setItem('cosmologist_welcomed', '1') }}>Close</button>
              </div>
              <div className="modal__body welcome-body">
                <p className="welcome-intro">Cosmologist helps you visualize, relate, and export data from multiple file formats into merged JSON documents — perfect for building Azure Cosmos DB models.</p>
                <ol className="welcome-steps">
                  <li>
                    <strong>Load your data</strong>
                    <span>Use <em>Load Data → Load dataset(s)</em> or drag & drop files onto the canvas. Supports CSV, TSV, JSON, JSONL, ZIP, TAR, and SQL Server schemas.</span>
                  </li>
                  <li>
                    <strong>Create relationships</strong>
                    <span>Drag from a column handle on one table to a column on another to define joins. Right-click edges to set one-to-one or one-to-many.</span>
                  </li>
                  <li>
                    <strong>Set a root table</strong>
                    <span>In the sidebar, pick the root table that all other tables relate to. This determines the shape of your output document.</span>
                  </li>
                  <li>
                    <strong>Preview & export</strong>
                    <span>Select a row index, then click <em>Generate Preview</em> to see the merged JSON. When ready, click <em>Download ZIP</em> to export one JSON file per root row.</span>
                  </li>
                </ol>
                <div className="welcome-footer">
                  <button className="welcome-start-btn" onClick={() => { setWelcomeOpen(false); localStorage.setItem('cosmologist_welcomed', '1') }}>Get Started</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {sqlSchemaModalOpen && (
          <div className="modal" onClick={() => setSqlSchemaModalOpen(false)}>
            <div className="modal__content modal__content--wide" onClick={(e) => e.stopPropagation()}>
              <div className="modal__header">
                <h3>Load SQL Server Schema</h3>
                <button onClick={() => setSqlSchemaModalOpen(false)}>Close</button>
              </div>
              <div className="modal__body">
                <p>Paste the tab-delimited schema dump (including header).</p>
                <details className="sql-schema-help">
                  <summary>How to export from SSMS (SQL Server)</summary>
                  <ol>
                    <li>Open a <strong>New Query</strong> window in SQL Server Management Studio.</li>
                    <li>Run the query below.</li>
                    <li>In the results grid, click the top-left corner to select all rows.</li>
                    <li>Right-click → <strong>Copy with Headers</strong>.</li>
                    <li>Paste into the textbox below.</li>
                  </ol>
                  <pre className="sql-schema-query"><code>{`SELECT 
    s.name AS [table_schema],
    t.name AS [table_name],
    c.name AS [column_name],
    c.column_id AS [ordinal_position],
    ty.name AS [data_type],
    c.max_length,
    c.precision,
    c.scale,
    c.is_nullable,
    c.is_identity,
    ISNULL(dc.definition, '') AS [default_value],
    CASE WHEN pk_ic.column_id IS NOT NULL THEN 1 ELSE 0 END AS [is_primary_key],
    fk.name AS [fk_name],
    rs.name AS [fk_ref_schema],
    rt.name AS [fk_ref_table],
    rc.name AS [fk_ref_column]
FROM sys.tables t
INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
INNER JOIN sys.columns c ON t.object_id = c.object_id
INNER JOIN sys.types ty ON c.user_type_id = ty.user_type_id
LEFT JOIN sys.default_constraints dc ON c.default_object_id = dc.object_id
LEFT JOIN sys.key_constraints pk 
    ON pk.parent_object_id = t.object_id AND pk.type = 'PK'
LEFT JOIN sys.index_columns pk_ic 
    ON pk.unique_index_id = pk_ic.index_id 
    AND pk.parent_object_id = pk_ic.object_id 
    AND c.column_id = pk_ic.column_id
LEFT JOIN sys.foreign_key_columns fkc 
    ON fkc.parent_object_id = t.object_id 
    AND fkc.parent_column_id = c.column_id
LEFT JOIN sys.foreign_keys fk 
    ON fkc.constraint_object_id = fk.object_id
LEFT JOIN sys.tables rt ON fkc.referenced_object_id = rt.object_id
LEFT JOIN sys.schemas rs ON rt.schema_id = rs.schema_id
LEFT JOIN sys.columns rc 
    ON fkc.referenced_object_id = rc.object_id 
    AND fkc.referenced_column_id = rc.column_id
ORDER BY s.name, t.name, c.column_id;`}</code></pre>
                </details>
                <textarea
                  className="sql-schema-input"
                  value={sqlSchemaText}
                  onChange={(e) => setSqlSchemaText(e.target.value)}
                  rows={12}
                  placeholder="table_schema\ttable_name\tcolumn_name\t..."
                />
              </div>
              <div className="modal__footer">
                <button onClick={handleSqlSchemaParse} disabled={!sqlSchemaText.trim()}>Parse & Load</button>
              </div>
            </div>
          </div>
        )}
        {createTableOpen && (
          <div className="modal" onClick={() => setCreateTableOpen(false)}>
            <div className="modal__content modal__content--wide" onClick={(e) => e.stopPropagation()}>
              <div className="modal__header">
                <h3>Create Table</h3>
                <button onClick={() => setCreateTableOpen(false)}>Close</button>
              </div>
              <div className="modal__body">
                <label className="create-table__label">
                  Table name
                  <input
                    type="text"
                    className="create-table__name-input"
                    value={createTableName}
                    onChange={(e) => setCreateTableName(e.target.value)}
                    placeholder="e.g. Products"
                    autoFocus
                  />
                </label>
                <fieldset className="create-table__columns-fieldset">
                  <legend>Columns</legend>
                  <ul className="create-table__columns-list">
                    {createTableColumns.map((col, idx) => (
                      <li key={idx} className="create-table__column-row">
                        <input
                          type="text"
                          value={col}
                          placeholder={`Column ${idx + 1}`}
                          onChange={(e) => {
                            const next = [...createTableColumns]
                            next[idx] = e.target.value
                            setCreateTableColumns(next)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              setCreateTableColumns((prev) => [...prev, ''])
                              setTimeout(() => {
                                const inputs = document.querySelectorAll<HTMLInputElement>('.create-table__columns-list input')
                                inputs[inputs.length - 1]?.focus()
                              }, 0)
                            }
                          }}
                        />
                        <button
                          className="create-table__remove-col"
                          onClick={() => {
                            if (createTableColumns.length <= 1) return
                            const next = createTableColumns.filter((_, i) => i !== idx)
                            setCreateTableColumns(next)
                            setCreateTableRows((prev) => prev.map((r) => {
                              const row = { ...r }
                              delete row[col]
                              return row
                            }))
                          }}
                          disabled={createTableColumns.length <= 1}
                          aria-label="Remove column"
                        >×</button>
                      </li>
                    ))}
                  </ul>
                  <button className="create-table__add-col" onClick={() => setCreateTableColumns((prev) => [...prev, ''])}>
                    + Add column
                  </button>
                </fieldset>

                {createTableColumns.some((c) => c.trim()) && (
                  <fieldset className="create-table__rows-fieldset">
                    <legend>Data rows ({createTableRows.length})</legend>
                    <div className="create-table__grid-wrapper">
                      <table className="create-table__grid">
                        <thead>
                          <tr>
                            {createTableColumns.filter((c) => c.trim()).map((col) => (
                              <th key={col}>{col}</th>
                            ))}
                            <th className="create-table__grid-action"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {createTableRows.map((row, ri) => (
                            <tr key={ri}>
                              {createTableColumns.filter((c) => c.trim()).map((col) => (
                                <td key={col}>
                                  <input
                                    type="text"
                                    value={row[col] ?? ''}
                                    onChange={(e) => {
                                      setCreateTableRows((prev) => {
                                        const next = [...prev]
                                        next[ri] = { ...next[ri], [col]: e.target.value }
                                        return next
                                      })
                                    }}
                                  />
                                </td>
                              ))}
                              <td className="create-table__grid-action">
                                <button onClick={() => setCreateTableRows((prev) => prev.filter((_, i) => i !== ri))} aria-label="Delete row">×</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <button className="create-table__add-row" onClick={() => setCreateTableRows((prev) => [...prev, {}])}>
                      + Add row
                    </button>
                  </fieldset>
                )}
              </div>
              <div className="modal__footer">
                <button onClick={handleCreateTable} disabled={!createTableName.trim() || !createTableColumns.some((c) => c.trim())}>
                  Create
                </button>
              </div>
            </div>
          </div>
        )}
        {contextMenu && contextMenu.type === 'table' && (() => {
          const table = tables.find((t) => t.id === contextMenu.tableId)
          const isDelimited = table ? ['csv', 'tsv', 'txt'].includes((table.sourceType ?? '').toLowerCase()) || (!!table.sourceText && !['json', 'jsonl', 'sqlschema'].includes((table.sourceType ?? '').toLowerCase())) : false
          return (
            <div className="context-menu" style={{ top: contextMenu.y, left: contextMenu.x }} onClick={(e) => e.stopPropagation()}>
              <h4>Table</h4>
              <button onClick={() => { openTablePreview(contextMenu.tableId); closeContextMenu() }}>View Table</button>
              <button onClick={() => { setRootTableId(contextMenu.tableId); setDocumentRootIds((prev) => prev.length ? prev : [contextMenu.tableId]); closeContextMenu() }}>Set as Root</button>
              <button onClick={() => { toggleDocumentRoot(contextMenu.tableId); closeContextMenu() }}>
                {documentRootIds.includes(contextMenu.tableId) ? 'Unset Document Root' : 'Set Document Root'}
              </button>
              <button onClick={() => { handleRenameTable(contextMenu.tableId); closeContextMenu() }}>Rename</button>
              {table?.originalName && table.originalName !== table.name && (
                <button onClick={() => { handleResetTableName(contextMenu.tableId); closeContextMenu() }}>Reset name</button>
              )}
              <button onClick={() => {
                const arrayName = prompt('Array property name for pivoted columns (e.g. "Items")')?.trim()
                if (!arrayName) { closeContextMenu(); return }
                const patternsRaw = prompt('Column prefixes to group (comma-separated, e.g. "Item,Fact")')?.trim()
                if (!patternsRaw) { closeContextMenu(); return }
                const patterns = patternsRaw.split(',').map((s) => s.trim()).filter(Boolean)
                if (!patterns.length) { closeContextMenu(); return }
                const groups = patterns.map((p) => ({ pattern: p, propertyName: p }))
                setTablePivots((prev) => {
                  const filtered = prev.filter((pv) => !(pv.tableId === contextMenu.tableId && pv.arrayName === arrayName))
                  return [...filtered, { tableId: contextMenu.tableId, arrayName, groups }]
                })
                closeContextMenu()
              }}>Pivot</button>
              {tablePivots.some((pv) => pv.tableId === contextMenu.tableId) && (
                <button onClick={() => {
                  setTablePivots((prev) => prev.filter((pv) => pv.tableId !== contextMenu.tableId))
                  closeContextMenu()
                }}>Remove Pivots</button>
              )}
              <button onClick={() => { handleDeleteTable(contextMenu.tableId); closeContextMenu() }}>Delete</button>
              {isDelimited && (
                <>
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
                </>
              )}
              <button onClick={closeContextMenu}>Close</button>
            </div>
          )
        })()}
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
              <button onClick={() => {
                const delim = prompt('Split delimiter (e.g. "," or "|" or ";")')?.trim()
                if (!delim) { closeContextMenu(); return }
                setColumnSplits((prev) => {
                  const filtered = prev.filter((s) => !(s.tableId === contextMenu.tableId && s.column === contextMenu.column))
                  return [...filtered, { tableId: contextMenu.tableId, column: contextMenu.column, delimiter: delim }]
                })
                closeContextMenu()
              }}>Split</button>
              {columnSplits.some((s) => s.tableId === contextMenu.tableId && s.column === contextMenu.column) && (
                <button onClick={() => {
                  setColumnSplits((prev) => prev.filter((s) => !(s.tableId === contextMenu.tableId && s.column === contextMenu.column)))
                  closeContextMenu()
                }}>Remove Split</button>
              )}
              <button onClick={() => { handleDeleteColumn(contextMenu.tableId, contextMenu.column); closeContextMenu() }}>Delete</button>
              <button onClick={closeContextMenu}>Close</button>
            </div>
          )
        })()}
        {contextMenu && contextMenu.type === 'edge' && (() => {
          const edge = edges.find((e) => e.id === contextMenu.edgeId)
          const childTableId = edge ? edge.target : ''
          const parentTableId = edge ? edge.source : ''
          const childTable = tables.find((t) => t.id === childTableId)
          const parentTable = tables.find((t) => t.id === parentTableId)
          const childColumns = childTable?.columns ?? []
          const currentFilter = edgeColumnFilters[contextMenu.edgeId]
          const isRecursive = childTableId === parentTableId
          return (
            <div className="context-menu context-menu--wide" style={{ top: contextMenu.y, left: contextMenu.x }} onClick={(e) => e.stopPropagation()}>
              <h4>Relationship</h4>
              <div className="context-menu__edge-label">
                {parentTable?.name ?? parentTableId}.{edge?.sourceHandle} → {childTable?.name ?? childTableId}.{edge?.targetHandle}
              </div>
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
              <label>
                Property name
                <input
                  type="text"
                  value={edgePropertyNames[contextMenu.edgeId] ?? ''}
                  placeholder={childTable?.name ?? 'auto'}
                  onChange={(e) => {
                    const v = e.target.value.trim()
                    setEdgePropertyNames((prev) => {
                      if (!v) {
                        const next = { ...prev }
                        delete next[contextMenu.edgeId]
                        return next
                      }
                      return { ...prev, [contextMenu.edgeId]: v }
                    })
                  }}
                />
              </label>
              {(isRecursive || childTableId !== parentTableId) && (
                <label>
                  Max depth{isRecursive ? ' (recursive)' : ''}
                  <input
                    type="number"
                    min={0}
                    value={edgeMaxDepth[contextMenu.edgeId] ?? (isRecursive ? 0 : '')}
                    placeholder={isRecursive ? '0 (blocked)' : 'unlimited'}
                    onChange={(e) => {
                      const v = e.target.value === '' ? undefined : Number(e.target.value)
                      setEdgeMaxDepth((prev) => {
                        const next = { ...prev }
                        if (v === undefined) delete next[contextMenu.edgeId]
                        else next[contextMenu.edgeId] = Math.max(0, v)
                        return next
                      })
                    }}
                  />
                </label>
              )}
              <div className="context-menu__columns-section">
                <h5>Included columns ({childTable?.name})</h5>
                <div className="context-menu__column-actions">
                  <button onClick={() => setEdgeColumnFilters((prev) => ({ ...prev, [contextMenu.edgeId]: [...childColumns] }))}>All</button>
                  <button onClick={() => setEdgeColumnFilters((prev) => ({ ...prev, [contextMenu.edgeId]: [] }))}>None</button>
                  <button onClick={() => {
                    const next = { ...edgeColumnFilters }
                    delete next[contextMenu.edgeId]
                    setEdgeColumnFilters(next)
                  }}>Reset</button>
                </div>
                <ul className="context-menu__column-list">
                  {childColumns.map((col) => {
                    const checked = !currentFilter || currentFilter.includes(col)
                    return (
                      <li key={col}>
                        <label>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setEdgeColumnFilters((prev) => {
                                const existing = prev[contextMenu.edgeId] ?? [...childColumns]
                                const next = checked
                                  ? existing.filter((c) => c !== col)
                                  : [...existing, col]
                                return { ...prev, [contextMenu.edgeId]: next }
                              })
                            }}
                          />
                          {col}
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </div>
              <button onClick={() => handleDeleteEdge(contextMenu.edgeId)}>Delete</button>
              <button onClick={closeContextMenu}>Close</button>
            </div>
          )
        })()}
        {contextMenu && contextMenu.type === 'pane' && (
          <div className="context-menu" style={{ top: contextMenu.y, left: contextMenu.x }} onClick={(e) => e.stopPropagation()}>
            <h4>Canvas</h4>
            <button onClick={arrangeNodes}>Arrange</button>
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
