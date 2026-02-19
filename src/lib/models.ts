import type { ExportedProject } from './projects'
import battlecabbageMovies from '../assets/models/BattleCabbage Movies.cosmologist.json'

// slug → ExportedProject
const models: Record<string, ExportedProject> = {
  'battlecabbage-movies': battlecabbageMovies as unknown as ExportedProject,
}

/** Look up an embedded model by slug (case-insensitive). */
export function getEmbeddedModel(slug: string): ExportedProject | undefined {
  return models[slug.toLowerCase()]
}

/** All available model slugs. */
export const modelSlugs = Object.keys(models)
