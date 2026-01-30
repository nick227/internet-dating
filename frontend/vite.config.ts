import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'
import { criticalCssPlugin } from './vite-plugin-critical-css'
import { inlineShellPlugin } from './vite-plugin-inline-shell'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ServerOptions } from 'node:https'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const devHttps = env.VITE_DEV_HTTPS === '1' || env.VITE_DEV_HTTPS === 'true'
  const rootDir = path.dirname(fileURLToPath(import.meta.url))
  const defaultCertPath = path.resolve(rootDir, 'certs', 'localhost.pem')
  const defaultKeyPath = path.resolve(rootDir, 'certs', 'localhost-key.pem')
  const certPath = env.VITE_DEV_CERT_PATH || defaultCertPath
  const keyPath = env.VITE_DEV_KEY_PATH || defaultKeyPath
  const apiTarget = env.VITE_API_TARGET || (devHttps ? 'https://localhost:4000' : 'http://localhost:4000')
  const httpsConfig: ServerOptions | undefined =
    devHttps && fs.existsSync(certPath) && fs.existsSync(keyPath)
      ? {
          cert: fs.readFileSync(certPath),
          key: fs.readFileSync(keyPath),
        }
      : devHttps
        ? {}
        : undefined

  return {
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
      https: httpsConfig,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
        },
        '/media': {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
        },
        '/ws': {
          target: apiTarget,
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
  }
})
