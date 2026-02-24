import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'
import { execSync } from 'child_process'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

let gitCommit = ''
try {
  gitCommit = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()
} catch { /* not in a git repo */ }

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: {},
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(process.env.VITE_APP_VERSION || pkg.version),
    'import.meta.env.VITE_GIT_COMMIT': JSON.stringify(gitCommit),
    'import.meta.env.VITE_IS_DEV': JSON.stringify(mode === 'development'),
    'import.meta.env.VITE_API_URL': JSON.stringify(process.env.VITE_API_URL || (mode === 'development' ? 'http://localhost:3001/api' : '/api')),
  },
  build: {
    chunkSizeWarningLimit: 5000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('reactflow')) return 'reactflow'
            if (id.includes('jszip')) return 'jszip'
            if (id.includes('@faker-js')) return 'faker'
            if (id.includes('papaparse')) return 'papaparse'
            return 'vendor'
          }
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
    css: true,
  },
}))
