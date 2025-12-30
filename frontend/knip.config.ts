import type { KnipConfig } from 'knip'

const config: KnipConfig = {
  entry: [
    'src/main.tsx',
    'src/App.tsx',
    'scripts/**/*.mjs',
  ],
  project: ['src/**/*.{ts,tsx}'],
  ignore: [
    'dist/**',
    'node_modules/**',
    // These files are unused but kept for potential future use
    'src/core/routing/useNavigationDirection.ts',
    'src/core/types/index.ts',
    'src/ui/river/RiverCard.tsx',
    // API contract types are used dynamically in API layer
    'src/api/contracts.ts',
    'src/api/openapi.ts',
  ],
  ignoreDependencies: [
    '@app/shared',
    'jiti',
    // Build tools (used by npm scripts, not imported in code)
    'cssnano',
    'eslint',
    'eslint-plugin-react-refresh',
    'madge',
    'postcss',
    'prettier',
    'typescript-eslint',
    'vitest',
  ],
  ignoreBinaries: ['vite', 'tsc', 'eslint', 'knip', 'madge', 'prettier'],
  // Ignore exports that are only used within the same file
  ignoreExportsUsedInFile: true,
}

export default config
