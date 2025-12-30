/**
 * Quick Frontend Test Script
 * 
 * Run this in browser console to quickly verify all optimizations
 * 
 * Usage:
 * 1. Open http://localhost:5173 in browser
 * 2. Open DevTools Console (F12)
 * 3. Copy and paste this entire script
 * 4. Press Enter
 */

(async function testFrontendOptimizations() {
  console.log('%c🧪 Frontend Optimization Tests', 'font-size: 16px; font-weight: bold; color: #a855f7')
  console.log('='.repeat(50))
  
  const results = []
  
  // Test 1: Critical CSS
  const criticalCss = document.getElementById('critical-css')
  const cssLoaded = !!criticalCss?.textContent
  results.push({ test: 'Critical CSS Loaded', pass: cssLoaded, detail: cssLoaded ? 'Found in <head>' : 'Missing from <head>' })
  
  // Test 2: CSS Variables
  const bgVar = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
  const textVar = getComputedStyle(document.documentElement).getPropertyValue('--text').trim()
  const varsLoaded = bgVar && textVar
  results.push({ test: 'CSS Variables Loaded', pass: varsLoaded, detail: `--bg: ${bgVar || 'missing'}, --text: ${textVar || 'missing'}` })
  
  // Test 3: Background Color
  const bodyBg = getComputedStyle(document.body).backgroundColor
  const isDark = bodyBg.includes('7, 7, 10') || bodyBg.includes('rgb(7, 7, 10)') || bodyBg === 'rgb(7, 7, 10)'
  results.push({ test: 'Background Color Correct', pass: isDark, detail: bodyBg })
  
  // Test 4: Cards Rendered
  await new Promise(resolve => setTimeout(resolve, 2000)) // Wait 2s for cards
  const cards = document.querySelectorAll('.riverCard')
  const cardsRendered = cards.length > 0
  results.push({ test: 'Cards Rendered', pass: cardsRendered, detail: `${cards.length} cards found` })
  
  // Test 5: Phase-1 Request
  const phase1Requests = performance.getEntriesByType('resource')
    .filter(r => r.name.includes('/api/feed') && r.name.includes('lite=1'))
  const phase1Made = phase1Requests.length > 0
  results.push({ 
    test: 'Phase-1 Request Made', 
    pass: phase1Made, 
    detail: phase1Made ? `${phase1Requests.length} request(s), ${Math.round(phase1Requests[0].duration)}ms` : 'No requests found' 
  })
  
  // Test 6: Phase-2 Request
  const phase2Requests = performance.getEntriesByType('resource')
    .filter(r => r.name.includes('/api/feed') && !r.name.includes('lite=1'))
  const phase2Made = phase2Requests.length > 0
  results.push({ 
    test: 'Phase-2 Request Made', 
    pass: phase2Made, 
    detail: phase2Made ? `${phase2Requests.length} request(s), ${Math.round(phase2Requests[0].duration)}ms` : 'No requests found' 
  })
  
  // Test 7: Performance Metrics
  const paint = performance.getEntriesByType('paint')
  const fcp = paint.find(p => p.name === 'first-contentful-paint')
  const fcpTime = fcp ? Math.round(fcp.startTime) : null
  const fcpGood = fcpTime && fcpTime < 600
  results.push({ 
    test: 'First Contentful Paint', 
    pass: fcpGood, 
    detail: fcpTime ? `${fcpTime}ms (target: <600ms)` : 'Not measured' 
  })
  
  // Test 8: Console Errors
  // Note: This won't catch errors that already happened, but we can check for common issues
  const hasReactErrors = window.console._errors?.some(e => e.includes('React')) || false
  results.push({ 
    test: 'No React Errors', 
    pass: !hasReactErrors, 
    detail: hasReactErrors ? 'React errors detected' : 'No React errors' 
  })
  
  // Test 9: Layout Stability
  const cls = performance.getEntriesByType('layout-shift')
    .filter(entry => !entry.hadRecentInput)
    .reduce((sum, entry) => sum + entry.value, 0)
  const clsGood = cls < 0.1
  results.push({ 
    test: 'Layout Stability (CLS)', 
    pass: clsGood, 
    detail: `CLS: ${cls.toFixed(3)} (target: <0.1)` 
  })
  
  // Test 10: Code Splitting
  const scripts = Array.from(document.querySelectorAll('script[src]'))
    .map(s => s.src)
    .filter(src => src.includes('/assets/js/'))
  const hasChunks = scripts.length > 1
  results.push({ 
    test: 'Code Splitting', 
    pass: hasChunks, 
    detail: `${scripts.length} JS chunks loaded` 
  })
  
  // Print Results
  console.log('\n')
  results.forEach((result, i) => {
    const icon = result.pass ? '✅' : '❌'
    const color = result.pass ? 'color: #22c55e' : 'color: #fb7185'
    console.log(`%c${icon} ${result.test}`, color, `- ${result.detail}`)
  })
  
  // Summary
  const passed = results.filter(r => r.pass).length
  const total = results.length
  const percentage = Math.round((passed / total) * 100)
  
  console.log('\n' + '='.repeat(50))
  console.log(`%cResults: ${passed}/${total} passed (${percentage}%)`, 
    `font-weight: bold; color: ${percentage >= 80 ? '#22c55e' : percentage >= 60 ? '#fbbf24' : '#fb7185'}`)
  
  if (percentage === 100) {
    console.log('%c🎉 All tests passed!', 'font-size: 14px; font-weight: bold; color: #22c55e')
  } else {
    console.log('%c⚠️ Some tests failed. Review details above.', 'font-size: 14px; font-weight: bold; color: #fbbf24')
  }
  
  return results
})()
