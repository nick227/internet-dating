export default {
  plugins: {
    autoprefixer: {},
    ...(process.env.NODE_ENV === 'production' ? { 
      '@fullhuman/postcss-purgecss': {
        content: [
          './index.html',
          './src/**/*.{js,jsx,ts,tsx}',
        ],
        defaultExtractor: content => content.match(/[\w-/:]+(?<!:)/g) || []
      },
      cssnano: {} 
    } : {}),
  },
}