import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'
import { ProfileSearchQueryBuilder } from '../../../../services/search/profileSearchQueryBuilder.js'
import { readFileSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

/**
 * Minimal architecture test for profile search constraints
 * 
 * Verifies:
 * 1. ProfileSearchQueryBuilder does not import or use MatchScore
 * 2. ViewerId handling is properly guarded
 * 3. No hidden MatchScore usage in search builder
 */

describe('Profile Search Architecture Constraints', () => {
  it('ProfileSearchQueryBuilder does not use MatchScore', () => {
    // Read the source file
    const builderPath = join(__dirname, '../../../../services/search/profileSearchQueryBuilder.ts')
    const source = readFileSync(builderPath, 'utf-8')
    
    // Check for MatchScore references (case-insensitive)
    const matchScorePatterns = [
      /MatchScore/gi,
      /matchScore/gi,
      /match_score/gi,
      /from.*match.*score/gi,
      /prisma\.matchScore/gi
    ]
    
    for (const pattern of matchScorePatterns) {
      const matches = source.match(pattern)
      if (matches) {
        assert.fail(`ProfileSearchQueryBuilder contains MatchScore reference: ${matches[0]}`)
      }
    }
    
    // Should pass - no MatchScore found
    assert.ok(true, 'ProfileSearchQueryBuilder is clean of MatchScore')
  })

  it('ProfileSearchQueryBuilder guards viewerId usage', () => {
    const builderPath = join(__dirname, '../../../../services/search/profileSearchQueryBuilder.ts')
    const source = readFileSync(builderPath, 'utf-8')
    
    // Check that block filtering is guarded
    const hasGuard = source.includes('if (this.viewerId)') || source.includes('if (viewerId)')
    assert.ok(hasGuard, 'Block filtering should be guarded with if (viewerId)')
    
    // Check that viewerId is optional in constructor
    const constructorMatch = source.match(/constructor\([^)]*viewerId\?/s)
    assert.ok(constructorMatch, 'viewerId should be optional in constructor')
  })

  it('Advanced-search endpoint uses optional viewerId', () => {
    const endpointPath = join(__dirname, '../index.ts')
    const source = readFileSync(endpointPath, 'utf-8')
    
    // Find advanced-search handler
    const advancedSearchMatch = source.match(/profiles\.GET\.\/profiles\/advanced-search[\s\S]*?handler:\s*async[^}]*?\{[\s\S]*?\}/)
    
    if (advancedSearchMatch) {
      const handler = advancedSearchMatch[0]
      
      // Should use optional viewerId pattern
      const hasOptionalViewerId = handler.includes('req.ctx.userId ?? undefined') || 
                                   handler.includes('viewerId ?? undefined')
      assert.ok(hasOptionalViewerId, 'Advanced-search should use optional viewerId pattern')
      
      // Should not require Auth.user() (should be Auth.public())
      const hasPublicAuth = handler.includes('auth: Auth.public()') || 
                           source.includes('auth: Auth.public()', advancedSearchMatch.index || 0)
      assert.ok(hasPublicAuth, 'Advanced-search should allow anonymous access')
    }
  })

  it('Recommendations endpoint requires authentication', () => {
    const endpointPath = join(__dirname, '../index.ts')
    const source = readFileSync(endpointPath, 'utf-8')
    
    // Find recommendations handler
    const recommendationsMatch = source.match(/profiles\.GET\.\/profiles\/recommendations[\s\S]*?auth:\s*Auth\.user\(\)/)
    
    assert.ok(recommendationsMatch, 'Recommendations endpoint should require Auth.user()')
  })
})
