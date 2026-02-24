import type { TableData } from './types'
import type { ProjectState } from './projects'
import { parseFiles } from './parseFiles'
import { parseSqlServerSchema } from './parseSqlSchema'
import { getProjectSource } from './projects'
import { applyTableRenames, applyAllColumnRenames } from './rename'
import { generateDummyRowsForSchema } from './dummyData'

export async function rehydrateTables(state: ProjectState): Promise<TableData[]> {
  if (state.sqlSchemaText) {
    const { tables } = parseSqlServerSchema(state.sqlSchemaText)
    const withDummy = await generateDummyRowsForSchema(tables, state.edges ?? [], 10)
    const renamedTables = applyAllColumnRenames(applyTableRenames(withDummy, state.tableRenames), state.columnRenames)
    return renamedTables
  }

  const manualTables: TableData[] = []
  const files: File[] = []
  for (const [id, src] of Object.entries(state.tablesSources)) {
    if (src.sourceType === 'manual') {
      const raw = src.sourceText ?? (await getProjectSource(state.projectId, id))
      if (!raw) continue
      try {
        const data = JSON.parse(raw)
        manualTables.push({
          id,
          name: src.name,
          fileName: src.fileName,
          columns: data.columns ?? [],
          rows: data.rows ?? [],
          sourceType: 'manual',
          columnTypes: data.columnTypes,
          primaryKeys: data.primaryKeys,
          isDocumentRoot: data.isDocumentRoot ?? true,
        })
      } catch { continue }
    } else {
      const sourceText = src.sourceText ?? (await getProjectSource(state.projectId, id))
      if (!sourceText) continue
      const blob = new Blob([sourceText], { type: 'text/plain' })
      const file = new File([blob], src.fileName || `${src.name || id}.txt`, { type: 'text/plain' })
      files.push(file)
    }
  }
  const parsed = files.length ? (await parseFiles(files)).tables : []
  const allTables = [...manualTables, ...parsed]
  if (!allTables.length) return []
  const renamedTables = applyAllColumnRenames(applyTableRenames(allTables, state.tableRenames), state.columnRenames)
  return renamedTables
}
