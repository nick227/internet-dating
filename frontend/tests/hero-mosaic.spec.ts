import { test, expect } from '@playwright/test'

test.describe('Hero Mosaic', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to a profile page with hero images
    // This assumes you have test data setup
    await page.goto('/profile/test-user')
    // Wait for the page to load
    await page.waitForSelector('.profile__hero', { timeout: 10000 })
  })

  test('clicking a hero tile opens the MediaViewer', async ({ page }) => {
    // Find a hero tile with an image
    const tile = page.locator('.heroMosaic__tile').first()
    await expect(tile).toBeVisible()

    // Click the tile
    await tile.click()

    // Check that the MediaViewer modal opens
    const mediaViewer = page.locator('.mediaViewer')
    await expect(mediaViewer).toBeVisible({ timeout: 2000 })

    // Check that the modal has content
    const mediaContent = page.locator('.mediaViewer__media, .mediaViewer__content')
    await expect(mediaContent.first()).toBeVisible()
  })

  test('MediaViewer can be closed', async ({ page }) => {
    // Open the viewer
    const tile = page.locator('.heroMosaic__tile').first()
    await tile.click()

    const mediaViewer = page.locator('.mediaViewer')
    await expect(mediaViewer).toBeVisible({ timeout: 2000 })

    // Close the viewer
    const closeButton = page.locator('.mediaViewer__close')
    await closeButton.click()

    // Check that the viewer is closed
    await expect(mediaViewer).not.toBeVisible({ timeout: 1000 })
  })

  test('empty hero tiles open media picker for owners', async ({ page }) => {
    // This test assumes the user is the owner
    // Find an empty tile
    const emptyTile = page.locator('.heroMosaic__tile--empty').first()
    
    // Check if tile is clickable (owner)
    const isClickable = await emptyTile.getAttribute('role') === 'button'
    
    if (isClickable) {
      await emptyTile.click()
      
      // Check that the media picker opens
      const picker = page.locator('.heroMediaPicker')
      await expect(picker).toBeVisible({ timeout: 2000 })
    }
  })
})
