import { describe, it, expect, beforeEach } from 'vitest'
import { loadProjectList, saveProjectList, loadProject, saveProject, deleteProject, makeProjectId } from './projects'

const state = {
  projectId: 'p1',
  tablesSources: {},
  nodePositions: {},
  edges: [],
  rootTableId: '',
  leadRowIndex: 0,
  selectedColumns: {},
  expandedTables: {},
  tableParsingOptions: {},
  edgeTypes: {},
}

describe('projects storage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('saves and loads project list', () => {
    const list = [{ id: 'p1', name: 'Project 1' }]
    saveProjectList(list)
    expect(loadProjectList()).toEqual(list)
  })

  it('saves and loads project state', () => {
    saveProject('p1', state as any)
    expect(loadProject('p1')).toEqual(state)
  })

  it('deletes project state', () => {
    saveProject('p1', state as any)
    deleteProject('p1')
    expect(loadProject('p1')).toBeNull()
  })

  it('generates unique id', () => {
    const id = makeProjectId('My Project')
    expect(id.startsWith('my-project')).toBe(true)
  })
})
