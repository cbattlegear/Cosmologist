# Cosmologist

Visualize, relate, and export data from CSV/TSV/TXT/JSON/JSONL files or archives (ZIP/TAR/TGZ, nested archives supported) as merged JSON documents. Delete tables to prune your model.

## ✨ Features
- Upload multiple files (directory selection & drag/drop) or add files incrementally; supports CSV/TSV/TXT/JSON/JSONL plus ZIP/TAR/GZ/TGZ archives (nested archives); metadata persists in LocalStorage, sources in IndexedDB; per-table parsing options (delimiter, skip rows)
- Auto-infer table schemas (table name from filename, columns from headers/keys)
- Canvas with column-level connectors (React Flow)
- Delete tables and relationships
- Choose a root table for preview/export
- Build preview JSON as root object with arrays of related tables; select columns per table (column list collapsible)
- Export ZIP with one merged JSON per root row
- Tested with Vitest

## 📦 Requirements
- Node.js **>= 20.19** or **>= 22.12** (Node 22.6 shows engine warnings)
- npm

## 🚀 Scripts
- `npm install`
- `npm run dev` — start dev server
- `npm test` — run Vitest
- `npm run build` — type-check & build

## 🐳 Docker
Build production image and run:

```bash
docker build -t cosmologist --build-arg VITE_APP_VERSION=$(npm pkg get version | tr -d '"') .
docker run -it --rm -p 8080:80 cosmologist
```

Then open http://localhost:8080

## 🧭 Usage
1. Start the dev server (`npm run dev`).
2. Upload files via drag/drop or directory picker, or add individual files.
3. Create relationships by dragging column handles between tables.
4. Select lead table & row, generate preview.
5. Download ZIP of merged JSON documents.

## 📝 Notes & Limitations
- Joins perform equality matches on connected columns; cycles are skipped.
- JSON parsing expects arrays, objects, or JSONL (one JSON per line).
- Node layout is auto-positioned; drag to adjust.

## 📂 Tech Stack
- React 19, Vite, TypeScript
- React Flow, PapaParse, JSZip, FileSaver
- Vitest, Testing Library
