import autoprefixer from 'autoprefixer'
import { purgeCSSPlugin } from '@fullhuman/postcss-purgecss'
import cssnano from 'cssnano'

const isProd = process.env.NODE_ENV === 'production'

export default {
  plugins: [
    autoprefixer(),
    ...(isProd
      ? [
          purgeCSSPlugin({
            content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
            defaultExtractor: (content) => content.match(/[\w-/:]+(?<!:)/g) || [],
          }),
          cssnano(),
        ]
      : []),
  ],
}
