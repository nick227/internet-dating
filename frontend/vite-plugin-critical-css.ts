import type { Plugin } from 'vite'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Vite plugin to inline critical CSS in HTML head
 * Strategy: Inline for fastest paint (100-200ms target)
 * Alternative: Use <link rel="preload"> + blocking <link> for Layer 0
 */
export function criticalCssPlugin(): Plugin {
  return {
    name: 'critical-css',
    enforce: 'pre',
    transformIndexHtml: {
      enforce: 'pre',
      transform(html, _ctx) {
        // Always inject critical CSS (both dev and production)
        // This ensures consistent styling and allows testing in dev mode

        try {
          // Read critical CSS file
          const criticalCssPath = join(process.cwd(), 'src/styles/critical.css')
          const criticalCss = readFileSync(criticalCssPath, 'utf-8')

          // Aggressive minification for Layer 0
          const minified = criticalCss
            .replace(/\/\*[\s\S]*?\*\//g, '') // Remove comments
            .replace(/\s*{\s*/g, '{') // Remove spaces around braces
            .replace(/\s*}\s*/g, '}') 
            .replace(/\s*:\s*/g, ':') // Remove spaces around colons
            .replace(/\s*;\s*/g, ';') // Normalize semicolons
            .replace(/\s+/g, ' ') // Collapse whitespace
            .replace(/;\s*}/g, '}') // Remove semicolon before closing brace
            .trim()

          // Inline critical CSS for instant paint (Layer 0)
          // This blocks render but ensures 100-200ms paint target
          const styleTag = `<style id="critical-css">${minified}</style>`
          
          // Insert before closing </head> tag (before any other styles)
          if (html.includes('</head>')) {
            return html.replace('</head>', `${styleTag}\n</head>`)
          }

          // Fallback: insert at beginning of <head>
          if (html.includes('<head>')) {
            return html.replace('<head>', `<head>\n${styleTag}`)
          }

          return html
        } catch (error) {
          console.warn('[critical-css] Failed to inject critical CSS:', error)
          return html
        }
      },
    },
  }
}
