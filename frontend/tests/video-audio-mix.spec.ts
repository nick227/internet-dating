import { test, expect } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'

test('audio overlay mix generates a playable video', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Uses MediaRecorder + canvas.captureStream; run in Chromium only')

  await page.goto('/test/audio-overlay-mix.html')
  await page.waitForFunction(() => window.__mixResult || window.__mixError, { timeout: 120000 })

  const payload = await page.evaluate(async () => {
    if (window.__mixError) {
      return { error: window.__mixError }
    }
    const buffer = await window.__mixBlob.arrayBuffer()
    return {
      result: window.__mixResult,
      bytes: Array.from(new Uint8Array(buffer)),
    }
  })

  if ('error' in payload) {
    throw new Error(payload.error)
  }

  const { result, bytes } = payload
  expect(result.ok).toBe(true)
  expect(result.size).toBeGreaterThan(10_000)
  expect(result.duration).toBeGreaterThan(0)
  expect(result.duration).toBeGreaterThanOrEqual(result.inputDuration - 0.5)

  const outDir = path.resolve(process.cwd(), '..', 'test')
  await fs.mkdir(outDir, { recursive: true })
  const outPath = path.join(outDir, 'mixed-output.webm')
  await fs.writeFile(outPath, Buffer.from(bytes))
})

declare global {
  interface Window {
    __mixResult?: {
      ok: boolean
      size: number
      type: string
      duration: number
      width: number
      height: number
      inputDuration: number
    }
    __mixBlob?: Blob
    __mixError?: string
  }
}
