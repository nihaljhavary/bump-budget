import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Build identifier: Netlify injects DEPLOY_ID in CI; fall back to timestamp locally.
// Embedded in the app bundle AND written to /version.json so the version-check
// hook can compare what is running vs what is deployed.
const BUILD_ID   = process.env.DEPLOY_ID || process.env.BUILD_ID || Date.now().toString(36)
const BUILD_TIME = new Date().toISOString()

export default defineConfig({
  plugins: [
    react(),

    // Emit /version.json into dist so the app can poll it to detect a new deploy.
    {
      name: 'bump-version-manifest',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify({ buildId: BUILD_ID, buildTime: BUILD_TIME }, null, 2),
        })
      },
    },
  ],

  // Expose build metadata to the running app via compile-time constants.
  define: {
    __BUMP_BUILD_ID__:   JSON.stringify(BUILD_ID),
    __BUMP_BUILD_TIME__: JSON.stringify(BUILD_TIME),
  },

  resolve: {
    alias: {
      '@supabase/postgrest-js': resolve(__dirname, 'node_modules/@supabase/postgrest-js/dist/index.cjs'),
      '@supabase/storage-js':   resolve(__dirname, 'node_modules/@supabase/storage-js/dist/index.cjs'),
    },
  },

  build: {
    // Single-bundle SPA is intentional; raise warning threshold accordingly.
    chunkSizeWarningLimit: 1000,
  },
})
