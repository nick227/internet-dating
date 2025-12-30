import type { Plugin } from 'vite'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Vite plugin to inline minimal JS for shell mounting
 * Renders bare DOM shell before React hydration
 * Buys ~30-80ms on mid devices
 */
export function inlineShellPlugin(): Plugin {
  return {
    name: 'inline-shell',
    enforce: 'pre',
    transformIndexHtml: {
      enforce: 'pre',
      transform(html, ctx) {
        try {
          // Minimal inline script to mount shell before React
          // This renders the optimistic first card frame immediately
          const inlineScript = `
<script>
(function() {
  // Mount shell structure immediately (before React)
  const root = document.getElementById('root');
  if (root && !root.hasChildNodes()) {
    // Render bare DOM shell - shell layout + river container + first card frame
    root.innerHTML = '<div class="shell"><div class="stage"><div class="river u-hide-scroll"><div class="river__pad"><article class="riverCard"><div class="riverCard__media"></div><div class="riverCard__scrim"></div><div class="riverCard__meta"><div class="u-stack"><div class="riverCard__name"><h2 style="margin:0;font-size:28px;line-height:1.15;color:rgba(255,255,255,0.92)"><span style="opacity:0.3">Loading...</span></h2></div><div style="color:rgba(255,255,255,0.84);font-size:16px;line-height:1.35;min-height:60px;opacity:0.3">Content loading...</div></div></div></article></div></div></div></div>';
  }
  
  // Inject cached Phase-1 feed JSON in dev (localStorage snapshot)
  try {
    const cached = localStorage.getItem('phase1-feed-dev');
    if (cached && !document.getElementById('phase1-feed')) {
      JSON.parse(cached);
      const script = document.createElement('script');
      script.type = 'application/json';
      script.id = 'phase1-feed';
      script.textContent = cached;
      document.head.appendChild(script);
    }
  } catch (e) {
    // Ignore cache parse errors
  }
  
  // React will hydrate this later - no flicker because structure matches
})();
</script>`.trim()

          // Insert before closing </head> tag (after critical CSS)
          if (html.includes('</head>')) {
            return html.replace('</head>', `${inlineScript}\n</head>`)
          }

          return html
        } catch (error) {
          console.warn('[inline-shell] Failed to inject shell script:', error)
          return html
        }
      },
    },
  }
}
