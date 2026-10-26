import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// vibeMate 1.1 has five pages:
//   index.html          home: Create anything (AI assistant) + Image studio (AI images, guideline banners)
//   bannercreation.html the guideline banner editor
//   history.html        everything from the last 30 days
//   login.html          log in / sign up
//   setup.html          brand kits: sample images, voice of tone, fonts and sizes (1.1)
// While developing, /api calls go to the vibeMate server (src/server folder, port 4000).
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        editor: resolve(import.meta.dirname, 'bannercreation.html'),
        history: resolve(import.meta.dirname, 'history.html'),
        login: resolve(import.meta.dirname, 'login.html'),
        setup: resolve(import.meta.dirname, 'setup.html'),
      },
    },
  },
})
