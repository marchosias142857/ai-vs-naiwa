import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// base 用相对路径：同一份构建既能放在 GitHub Pages 子路径，也能放在任意静态托管的根目录。
// 注意：Vite 8 使用 Rolldown 打包，不支持 Rollup 的对象式 manualChunks；需要分包时查 Vite 8 文档。
export default defineConfig({
  base: './',
  plugins: [
    VitePWA({
      strategies: 'generateSW',
      registerType: 'prompt',
      injectRegister: null,
      includeManifestIcons: false,
      scope: './',
      manifest: {
        id: './',
        name: 'AI娘大战奶蛙',
        short_name: 'AI VS NAIWA',
        lang: 'zh-CN',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'landscape',
        theme_color: '#0b0d14',
        background_color: '#0b0d14',
        icons: [
          { src: 'icons/pwa_192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/pwa_512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/pwa_maskable_512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,webp,svg,json,woff2}'],
        // 源码映射和音乐不进入离线包；超出单文件预算时让构建失败，避免漏缓存。
        globIgnores: ['**/*.map', '**/music/**', 'icons/placeholder.svg'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        skipWaiting: false,
        clientsClaim: true,
      },
    }),
  ],
  server: { port: 5173 },
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 2000,
  },
});
