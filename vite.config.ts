import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const repositoryBasePath = process.env.GITHUB_PAGES === 'true' ? '/Brianstormmm/' : '/'

// https://vite.dev/config/
export default defineConfig({
  base: repositoryBasePath,
  plugins: [react()],
})
