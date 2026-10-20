import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  // The world files live at the repository root, shared with the Python build,
  // so the dev server has to be allowed to read one level up.
  server: { fs: { allow: ['..'] } },
})
