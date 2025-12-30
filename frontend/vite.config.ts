import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'
import { criticalCssPlugin } from './vite-plugin-critical-css'
import { inlineShellPlugin } from './vite-plugin-inline-shell'

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    // Inject critical CSS in both dev and production (needed for testing)
    criticalCssPlugin(),
    // Inline minimal shell JS in dev + production for fast-boot testing
    inlineShellPlugin(),
    ...(mode === 'analyze'
      ? [
          visualizer({
            open: true,
            filename: 'dist/stats.html',
            gzipSize: true,
            brotliSize: true,
          }),
        ]
      : []),
  ],
  server: { port: 5173 },
  build: {
    target: 'esnext',
    minify: 'esbuild',
    cssMinify: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Split vendor chunks more granularly for better caching
          if (id.includes('node_modules')) {
            // React core - always needed
            if (id.includes('react/') && !id.includes('react-dom')) {
              return 'vendor/react-core'
            }
            // React DOM - always needed
            if (id.includes('react-dom')) {
              return 'vendor/react-dom'
            }
            // React Router - needed for navigation
            if (id.includes('react-router')) {
              return 'vendor/react-router'
            }
            // All other vendors
            return 'vendor'
          }
          
          // Route-based code splitting - each route gets its own chunk
          if (id.includes('/pages/')) {
            const pageName = id.match(/pages\/(\w+Page)\.tsx?$/)?.[1]
            if (pageName) {
              return `routes/${pageName.toLowerCase()}`
            }
          }
          
          // Modal components - lazy loaded
          if (id.includes('/shell/') && (id.includes('Modal') || id.includes('Panel'))) {
            const modalName = id.match(/(\w+Modal|\w+Panel)\.tsx?$/)?.[1]
            if (modalName) {
              return `modals/${modalName.toLowerCase()}`
            }
          }
          
          // Card components - already split
          if (id.includes('/river/') && (id.includes('Card') || id.includes('Card.tsx'))) {
            const cardName = id.match(/(\w+Card)\.tsx?$/)?.[1]
            if (cardName && cardName !== 'RiverCard') {
              return `cards/${cardName.toLowerCase()}`
            }
          }
          
          // Core features - shared across routes
          if (id.includes('/core/')) {
            if (id.includes('/ws/') || id.includes('/feed/')) {
              return 'core/features'
            }
            if (id.includes('/auth/') || id.includes('/routing/')) {
              return 'core/app'
            }
          }
        },
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith('.css')) {
            // Separate critical CSS from other CSS
            if (assetInfo.name?.includes('critical')) {
              return 'assets/css/critical-[hash][extname]'
            }
            return 'assets/css/[name]-[hash][extname]'
          }
          return 'assets/[name]-[hash][extname]'
        },
        // Generate modulepreload links for faster loading
        experimentalMinChunkSize: 20000, // Only split if chunk > 20KB
      },
    },
    chunkSizeWarningLimit: 1000,
    // Optimize chunk loading
    cssCodeSplit: true,
    // Generate modulepreload links automatically for faster loading
    modulePreload: {
      polyfill: true,
    },
  },
  css: {
    devSourcemap: true,
  },
}))
