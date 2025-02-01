import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['*.cjs'], // Include CJS modules
  },
  build: {
    commonjsOptions: {
      include: [/\.cjs$/, /node_modules/],  // Include CJS files and node_modules
    },
  },
})
