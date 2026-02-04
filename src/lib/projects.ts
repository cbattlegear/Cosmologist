import type { Edge } from 'reactflow'
import { idbSet, idbGet, STORE_SOURCES } from './idb'

export type ProjectMeta = { id: string; name: string }
export type ProjectState = {
  projectId: string
  tablesSources: Record<string, { fileName: string; sourceText?: string; sourceType?: string; name: string }>
  nodePositions: Record<string, { x: number; y: number }>
  edges: Edge[]
  rootTableId: string
  leadRowIndex: number
  selectedColumns: Record<string, string[]>
  expandedTables: Record<string, boolean>
  tableParsingOptions: Record<string, { delimiter?: 'auto' | 'csv' | 'tsv'; skipRows?: number }>
  edgeTypes?: Record<string, 'one-to-many' | 'one-to-one'>
}

const PROJECT_LIST_KEY = 'cosmologist:projects'
const PROJECT_KEY_PREFIX = 'cosmologist:project:'

export function loadProjectList(): ProjectMeta[] {
  try {
    const raw = localStorage.getItem(PROJECT_LIST_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
  } catch {
    return []
  }
}

export function saveProjectList(list: ProjectMeta[]) {
  localStorage.setItem(PROJECT_LIST_KEY, JSON.stringify(list))
}

export function renameProject(id: string, name: string) {
  const list = loadProjectList()
  const next = list.map((p) => (p.id === id ? { ...p, name } : p))
  saveProjectList(next)
}

export function loadProject(id: string): ProjectState | null {
  try {
    const raw = localStorage.getItem(PROJECT_KEY_PREFIX + id)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export async function setProjectSource(projectId: string, tableId: string, sourceText: string) {
  return idbSet(STORE_SOURCES, `${projectId}:${tableId}`, sourceText)
}

export async function getProjectSource(projectId: string, tableId: string) {
  return idbGet<string>(STORE_SOURCES, `${projectId}:${tableId}`)
}

export async function deleteProjectSources(_projectId: string) {
  // no efficient prefix delete; leave as-is for now
  return
}

export function saveProject(id: string, state: ProjectState) {
  try {
    const json = JSON.stringify(state)
    if (json.length > 4_500_000) {
      console.warn('Project too large to persist, skipping save', { size: json.length })
      return false
    }
    localStorage.setItem(PROJECT_KEY_PREFIX + id, json)
    return true
  } catch (e) {
    console.warn('Failed saving project', e)
    return false
  }
}

export function deleteProject(id: string) {
  localStorage.removeItem(PROJECT_KEY_PREFIX + id)
}

export function makeProjectId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug ? `${slug}-${Date.now()}` : `project-${Date.now()}`
}
