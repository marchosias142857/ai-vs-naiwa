import { defineConfig } from 'vite';

// base 用相对路径：同一份构建既能放在 GitHub Pages 子路径，也能放在任意静态托管的根目录。
// PWA（vite-plugin-pwa）在 M0 的 PWA 任务中接入（Issue #3）。
// 注意：Vite 8 使用 Rolldown 打包，不支持 Rollup 的对象式 manualChunks；需要分包时查 Vite 8 文档。
export default defineConfig({
  base: './',
  server: { port: 5173 },
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 2000,
  },
});
