import type { TableData } from './types'
import type { ProjectState } from './projects'
import { parseFiles } from './parseFiles'
import { getProjectSource } from './projects'
import { applyTableRenames, applyAllColumnRenames } from './rename'

export async function rehydrateTables(state: ProjectState): Promise<TableData[]> {
  const files: File[] = []
  for (const [id, src] of Object.entries(state.tablesSources)) {
    const sourceText = src.sourceText ?? (await getProjectSource(state.projectId, id))
    if (!sourceText) continue
    const blob = new Blob([sourceText], { type: 'text/plain' })
    const file = new File([blob], src.fileName || `${src.name || id}.txt`, { type: 'text/plain' })
    files.push(file)
  }
  if (!files.length) return []
  const { tables } = await parseFiles(files)
  const renamedTables = applyAllColumnRenames(applyTableRenames(tables, state.tableRenames), state.columnRenames)
  return renamedTables
}
