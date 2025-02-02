import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // Vite automatically replaces import.meta.env.VITE_* variables
    // No need to explicitly define them here
  },
  optimizeDeps: {
    include: ['*.cjs'], // Include CJS modules
  },
  build: {
    commonjsOptions: {
      include: [/\.cjs$/, /node_modules/],  // Include CJS files and node_modules
    },
  },
})
