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
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET || 'http://localhost:4000',
        changeOrigin: true,
        secure: false,
      },
      '/media': {
        target: process.env.VITE_API_TARGET || 'http://localhost:4000',
        changeOrigin: true,
        secure: false,
      },
      '/ws': {
        target: process.env.VITE_API_TARGET || 'http://localhost:4000',
        ws: true,
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    target: 'esnext',
    minify: 'esbuild',
    cssMinify: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Only split vendor chunks and routes - let Vite handle the rest automatically
          // This avoids circular dependency issues with manual chunking
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
          // This is safe because routes don't have circular dependencies
          if (id.includes('/pages/')) {
            const pageName = id.match(/pages\/(\w+Page)\.tsx?$/)?.[1]
            if (pageName) {
              return `routes/${pageName.toLowerCase()}`
            }
          }
          
          // Let Vite automatically chunk everything else (cards, modals, core)
          // This avoids circular dependency issues
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
