import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@supabase/postgrest-js': resolve(__dirname, 'node_modules/@supabase/postgrest-js/dist/index.cjs'),
      '@supabase/storage-js': resolve(__dirname, 'node_modules/@supabase/storage-js/dist/index.cjs'),
    },
  },
})
