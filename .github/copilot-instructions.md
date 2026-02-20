# Cosmologist — Copilot Instructions

## Project Overview
Cosmologist is a browser-based data visualization and export tool. Users upload CSV/TSV/JSON/SQL schema files, relate tables on a React Flow canvas, and export merged JSON documents. Built with React 19 + TypeScript + Vite.

## Tech Stack
- **Framework**: React 19, TypeScript, Vite
- **Graph**: ReactFlow 11 (custom `TableNode` component, column-level handles)
- **Testing**: Vitest + @testing-library/react + jsdom
- **Styling**: Plain CSS with CSS custom properties for dark mode (`var(--bg-surface)`, `var(--text-primary)`, etc.)
- **State**: React hooks (`useState`, `useCallback`, `useMemo`, `useEffect`) — no external state library
- **Persistence**: localStorage (project state) + IndexedDB (source files via `src/lib/idb.ts`)
- **Bundle**: Vite with manual chunks (reactflow, jszip, faker, papaparse, vendor)

## Commands
- `npm run dev` — start dev server
- `npm run build` — `tsc -b && vite build`
- `npm test` — `vitest` (watch mode)
- `npx vitest run` — single test run
- `npm run lint` — ESLint

## Architecture

### `src/App.tsx`
Main application component (~1900 lines). Contains all state, callbacks, context menus, modals, and the ReactFlow canvas. State is persisted via a debounced effect to localStorage/IndexedDB.

### `src/components/`
- **`TableNode.tsx`** — Custom ReactFlow node wrapped in `React.memo`. Displays table name, columns with handles, badges (Root/Doc/Pivot), and callout notes.
- **`CalloutPopover.tsx`** — Popover for viewing/editing notes on tables and edges. Auto-links URLs.
- **`JsonTree.tsx`** — Collapsible JSON tree viewer for the preview modal.

### `src/lib/`
- **`types.ts`** — Core types: `TableData`, `RelationshipEdge`, `ParseFileError`
- **`parseFiles.ts`** — File parsing (CSV/TSV/JSON/JSONL/ZIP/TAR)
- **`parseSqlSchema.ts`** — SQL Server CREATE TABLE schema parser
- **`join.ts`** — `buildJoinedDocument` joins tables via relationships into nested JSON
- **`projects.ts`** — Project CRUD, export/import (`ExportedProject` type)
- **`idb.ts`** — IndexedDB wrapper with cached connection
- **`rehydrate.ts`** — Restores tables from persisted project state
- **`models.ts`** — Embedded model registry for `?model=slug` auto-loading
- **`transforms.ts`** — Column splits and table pivots
- **`rename.ts`** — Table/column rename logic with edge preservation
- **`removeEdge.ts` / `removeTable.ts`** — Removal helpers
- **`dummyData.ts`** — Generates dummy rows for SQL schemas (dynamically imports `@faker-js/faker`)
- **`ru.ts`** — Cosmos DB RU cost estimation
- **`useHistory.ts`** — Undo/redo hook

## Conventions
- CSS uses `var()` custom properties for theme support — never hardcode colors
- Custom ReactFlow nodes must be wrapped in `React.memo`
- `@faker-js/faker` is dynamically imported — do not add static imports
- The persist effect is debounced — do not remove the debounce
- IndexedDB connection is cached in `idb.ts` — reuse, don't open new connections
- When updating node `data` in `setNodes`, always spread existing data: `{ ...n.data, newProp }` to preserve callbacks
- Tests are co-located with source files (`*.test.ts` / `*.test.tsx`)
- Commit messages use conventional commits (`feat:`, `fix:`, `perf:`, `chore:`)