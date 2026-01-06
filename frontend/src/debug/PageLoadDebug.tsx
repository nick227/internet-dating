/**
 * Page Load Debug Component
 * 
 * Systematically tests each part of the page load process
 * to identify what works and what doesn't.
 */

import { useEffect, useState } from 'react'

type TestResult = {
  name: string
  status: 'pending' | 'pass' | 'fail'
  message: string
  details?: string
}

export function PageLoadDebug() {
  const [results, setResults] = useState<TestResult[]>([])
  const [startTime] = useState(Date.now())

  useEffect(() => {
    const tests: TestResult[] = []

    // Test 1: Critical CSS Injection
    const criticalCss = document.getElementById('critical-css')
    tests.push({
      name: 'Critical CSS Injection',
      status: criticalCss ? 'pass' : 'fail',
      message: criticalCss ? 'Found style#critical-css in <head>' : 'Missing style#critical-css',
      details: criticalCss ? `Length: ${criticalCss.textContent?.length} chars` : undefined,
    })

    // Test 2: CSS Variables
    const root = document.documentElement
    const bgVar = getComputedStyle(root).getPropertyValue('--bg').trim()
    const textVar = getComputedStyle(root).getPropertyValue('--text').trim()
    tests.push({
      name: 'CSS Variables',
      status: bgVar && textVar ? 'pass' : 'fail',
      message: bgVar && textVar ? 'Variables defined' : 'Missing variables',
      details: `--bg: ${bgVar || 'MISSING'}, --text: ${textVar || 'MISSING'}`,
    })

    // Test 3: Body Background Color
    const bodyBg = getComputedStyle(document.body).backgroundColor
    const isDark = bodyBg.includes('7, 7, 10') || bodyBg === 'rgb(7, 7, 10)'
    tests.push({
      name: 'Body Background Color',
      status: isDark ? 'pass' : 'fail',
      message: isDark ? 'Dark background applied' : 'Wrong background color',
      details: `Computed: ${bodyBg}`,
    })

    // Test 4: React Root Mounted
    const rootEl = document.getElementById('root')
    const hasReactContent = rootEl && rootEl.children.length > 0
    tests.push({
      name: 'React Root Mounted',
      status: hasReactContent ? 'pass' : 'fail',
      message: hasReactContent ? 'React content rendered' : 'No React content',
      details: rootEl ? `Children: ${rootEl.children.length}` : 'Root element not found',
    })

    // Test 5: Feed Hook - Check if River component exists
    const river = document.querySelector('.river')
    tests.push({
      name: 'River Component',
      status: river ? 'pass' : 'fail',
      message: river ? 'River component rendered' : 'River component not found',
    })

    // Test 6: Phase-1 API Request
    const resourceEntries = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
    const phase1Requests = resourceEntries.filter(entry =>
      entry.name.includes('/api/feed') && entry.name.includes('lite=1')
    )
    tests.push({
      name: 'Phase-1 API Request',
      status: phase1Requests.length > 0 ? 'pass' : 'fail',
      message: phase1Requests.length > 0 ? 'Phase-1 request made' : 'No Phase-1 request found',
      details: phase1Requests.length > 0 
        ? `Found ${phase1Requests.length} request(s), duration: ${Math.round(phase1Requests[0].duration)}ms`
        : 'Check Network tab for /api/feed?lite=1',
    })

    // Test 7: Phase-2 API Request
    const phase2Requests = resourceEntries.filter(entry =>
      entry.name.includes('/api/feed') && !entry.name.includes('lite=1')
    )
    tests.push({
      name: 'Phase-2 API Request',
      status: phase2Requests.length > 0 ? 'pass' : 'fail',
      message: phase2Requests.length > 0 ? 'Phase-2 request made' : 'No Phase-2 request found',
      details: phase2Requests.length > 0 
        ? `Found ${phase2Requests.length} request(s), duration: ${Math.round(phase2Requests[0].duration)}ms`
        : 'Check Network tab for /api/feed (without lite=1)',
    })

    // Test 8: Cards Rendered
    const cards = document.querySelectorAll('.riverCard')
    tests.push({
      name: 'Cards Rendered',
      status: cards.length > 0 ? 'pass' : 'fail',
      message: cards.length > 0 ? `${cards.length} card(s) rendered` : 'No cards found',
      details: cards.length > 0 
        ? `First card: ${cards[0].className}`
        : 'Check if feed items are populated',
    })

    // Test 9: Console Errors
    const consoleErrors: string[] = []
    const originalError = console.error
    console.error = (...args: unknown[]) => {
      consoleErrors.push(args.map(a => String(a)).join(' '))
      originalError.apply(console, args)
    }
    tests.push({
      name: 'Console Errors',
      status: consoleErrors.length === 0 ? 'pass' : 'fail',
      message: consoleErrors.length === 0 ? 'No console errors' : `${consoleErrors.length} error(s) found`,
      details: consoleErrors.length > 0 ? consoleErrors.slice(0, 3).join('; ') : undefined,
    })

    // Test 10: Load Time
    const loadTime = Date.now() - startTime
    tests.push({
      name: 'Page Load Time',
      status: loadTime < 2000 ? 'pass' : 'fail',
      message: `Loaded in ${loadTime}ms`,
      details: loadTime < 2000 ? 'Within target' : 'Exceeds 2s target',
    })

    setResults(tests)
  }, [startTime])

  const passed = results.filter(r => r.status === 'pass').length
  const failed = results.filter(r => r.status === 'fail').length
  const total = results.length

  return (
    <div style={{ 
      padding: '20px', 
      fontFamily: 'monospace', 
      background: '#1a1a1a', 
      color: '#fff',
      minHeight: '100vh'
    }}>
      <h1>🔍 Page Load Debug Results</h1>
      <div style={{ marginBottom: '20px', padding: '10px', background: '#2a2a2a', borderRadius: '4px' }}>
        <strong>Summary:</strong> {passed}/{total} passed, {failed} failed
      </div>
      
      {results.map((result, i) => (
        <div 
          key={i}
          style={{
            margin: '10px 0',
            padding: '10px',
            background: result.status === 'pass' ? '#1a3a1a' : result.status === 'fail' ? '#3a1a1a' : '#2a2a2a',
            borderLeft: `4px solid ${result.status === 'pass' ? '#22c55e' : result.status === 'fail' ? '#fb7185' : '#666'}`,
            borderRadius: '4px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '20px' }}>
              {result.status === 'pass' ? '✅' : result.status === 'fail' ? '❌' : '⏳'}
            </span>
            <strong>{result.name}</strong>
          </div>
          <div style={{ marginTop: '5px', color: '#aaa' }}>{result.message}</div>
          {result.details && (
            <div style={{ marginTop: '5px', fontSize: '12px', color: '#888' }}>{result.details}</div>
          )}
        </div>
      ))}

      <div style={{ marginTop: '20px', padding: '10px', background: '#2a2a2a', borderRadius: '4px' }}>
        <h3>Network Requests</h3>
        <pre style={{ fontSize: '12px', overflow: 'auto' }}>
          {JSON.stringify(
            performance.getEntriesByType('resource')
              .filter((entry: PerformanceResourceTiming) => entry.name.includes('/api/'))
              .map((entry: PerformanceResourceTiming) => ({
                url: entry.name,
                duration: Math.round(entry.duration),
                size: entry.transferSize,
              })),
            null,
            2
          )}
        </pre>
      </div>
    </div>
  )
}
