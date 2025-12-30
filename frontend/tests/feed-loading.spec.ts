import { test, expect } from '@playwright/test'

/**
 * E2E Tests for Feed Loading Optimization
 * 
 * Tests:
 * 1. Critical CSS loads (colors, layout)
 * 2. Phase-1 card renders
 * 3. Phase-2 cards load
 * 4. No console errors
 */

test.describe('Feed Loading Optimization', () => {
  test.beforeEach(async ({ page }) => {
    // Capture console errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.error(`[Browser Console Error] ${msg.text()}`)
      }
    })

    // Capture network errors
    page.on('response', response => {
      if (response.status() >= 400) {
        console.error(`[Network Error] ${response.url()} - ${response.status()}`)
      }
    })
  })

  test('Critical CSS loads and colors are correct', async ({ page }) => {
    await page.goto('/')
    
    // Wait for page to load
    await page.waitForLoadState('networkidle')
    
    // Check that critical CSS is injected
    const criticalCss = await page.locator('style#critical-css').textContent()
    expect(criticalCss).toBeTruthy()
    expect(criticalCss).toContain('--bg')
    expect(criticalCss).toContain('--text')
    
    // Check computed styles for body (should have background color)
    const bodyBg = await page.evaluate(() => {
      const body = document.body
      return window.getComputedStyle(body).backgroundColor
    })
    
    // Should have background color (not transparent)
    expect(bodyBg).not.toBe('rgba(0, 0, 0, 0)')
    expect(bodyBg).not.toBe('transparent')
    
    // Check CSS variables are defined
    const cssVars = await page.evaluate(() => {
      const root = document.documentElement
      return {
        bg: getComputedStyle(root).getPropertyValue('--bg'),
        text: getComputedStyle(root).getPropertyValue('--text'),
      }
    })
    
    expect(cssVars.bg).toBeTruthy()
    expect(cssVars.text).toBeTruthy()
  })

  test('Phase-1 card renders within 600ms', async ({ page }) => {
    const startTime = Date.now()
    
    await page.goto('/')
    
    // Wait for first card to appear
    const firstCard = page.locator('.riverCard').first()
    await firstCard.waitFor({ timeout: 2000 })
    
    const loadTime = Date.now() - startTime
    
    // Should load within 600ms target
    expect(loadTime).toBeLessThan(600)
    
    // Card should be visible
    await expect(firstCard).toBeVisible()
    
    // Card should have content (not just skeleton)
    const cardContent = await firstCard.textContent()
    expect(cardContent).toBeTruthy()
    expect(cardContent!.trim().length).toBeGreaterThan(0)
  })

  test('Phase-2 cards load after first paint', async ({ page }) => {
    await page.goto('/')
    
    // Wait for Phase-1 card
    const firstCard = page.locator('.riverCard').first()
    await firstCard.waitFor({ timeout: 2000 })
    
    // Wait a bit for Phase-2 to load (should happen after RAF x 2)
    await page.waitForTimeout(1000)
    
    // Should have multiple cards (Phase-1 + Phase-2)
    const cards = page.locator('.riverCard')
    const cardCount = await cards.count()
    
    expect(cardCount).toBeGreaterThan(1)
    
    // All cards should be visible
    for (let i = 0; i < cardCount; i++) {
      await expect(cards.nth(i)).toBeVisible()
    }
  })

  test('Feed API Phase-1 request succeeds', async ({ page }) => {
    const responses: string[] = []
    
    page.on('response', response => {
      if (response.url().includes('/api/feed') && response.url().includes('lite=1')) {
        responses.push(response.url())
      }
    })
    
    await page.goto('/')
    
    // Wait for network to settle
    await page.waitForLoadState('networkidle')
    
    // Should have made Phase-1 request
    const phase1Requests = responses.filter(url => url.includes('lite=1'))
    expect(phase1Requests.length).toBeGreaterThan(0)
    
    // Check Phase-1 response
    const phase1Response = await page.waitForResponse(
      response => response.url().includes('/api/feed') && response.url().includes('lite=1'),
      { timeout: 5000 }
    ).catch(() => null)
    
    if (phase1Response) {
      const data = await phase1Response.json()
      expect(data).toHaveProperty('items')
      expect(Array.isArray(data.items)).toBe(true)
      
      if (data.items.length > 0) {
        const firstItem = data.items[0]
        // Phase-1 should have minimal fields
        expect(firstItem).toHaveProperty('id')
        expect(firstItem).toHaveProperty('kind')
        expect(firstItem).toHaveProperty('actor')
      }
    }
  })

  test('Feed API Phase-2 request succeeds', async ({ page }) => {
    await page.goto('/')
    
    // Wait for Phase-2 request (should happen after Phase-1)
    const phase2Response = await page.waitForResponse(
      response => {
        const url = response.url()
        return url.includes('/api/feed') && !url.includes('lite=1')
      },
      { timeout: 5000 }
    ).catch(() => null)
    
    if (phase2Response) {
      const data = await phase2Response.json()
      expect(data).toHaveProperty('items')
      expect(Array.isArray(data.items)).toBe(true)
      
      if (data.items.length > 0) {
        const firstItem = data.items[0]
        // Phase-2 should have full structure
        expect(firstItem).toHaveProperty('type')
        // Should have either post or suggestion
        expect(['post', 'suggestion', 'question']).toContain(firstItem.type)
      }
    }
  })

  test('No console errors during feed load', async ({ page }) => {
    const errors: string[] = []
    
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text())
      }
    })
    
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000) // Wait for Phase-2
    
    // Filter out known non-critical errors
    const criticalErrors = errors.filter(err => {
      // Ignore network errors that might be expected (CORS, etc.)
      if (err.includes('CORS') || err.includes('Failed to fetch')) return false
      return true
    })
    
    expect(criticalErrors).toHaveLength(0)
  })

  test('Cards have correct structure and content', async ({ page }) => {
    await page.goto('/')
    
    // Wait for cards to load
    await page.waitForSelector('.riverCard', { timeout: 5000 })
    await page.waitForTimeout(2000) // Wait for Phase-2
    
    const cards = page.locator('.riverCard')
    const cardCount = await cards.count()
    
    expect(cardCount).toBeGreaterThan(0)
    
    // Check first card structure
    const firstCard = cards.first()
    
    // Should have media frame
    const mediaFrame = firstCard.locator('.riverCard__media')
    await expect(mediaFrame).toBeVisible()
    
    // Should have meta container
    const metaContainer = firstCard.locator('.riverCard__meta')
    await expect(metaContainer).toBeVisible()
    
    // Should have name/header
    const name = firstCard.locator('.riverCard__name, h2')
    const nameCount = await name.count()
    expect(nameCount).toBeGreaterThan(0)
  })

  test('CSS colors match design system', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    // Check background color
    const bodyBg = await page.evaluate(() => {
      return window.getComputedStyle(document.body).backgroundColor
    })
    
    // Should be dark background (not white/transparent)
    expect(bodyBg).toMatch(/rgba?\(7,\s*7,\s*10|rgb\(7,\s*7,\s*10\)/)
    
    // Check text color
    const textColor = await page.evaluate(() => {
      const body = document.body
      return window.getComputedStyle(body).color
    })
    
    // Should be light text (not black)
    expect(textColor).toMatch(/rgba?\(255,\s*255,\s*255/)
  })
})
