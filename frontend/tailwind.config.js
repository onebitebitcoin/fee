export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fff8e0',
          100: '#fff3b8',
          200: '#ffe680',
          300: '#ffd84d',
          400: '#ffc926',
          500: '#f0b90b',
          600: '#d4a009',
          700: '#a87c07',
          800: '#7c5a05',
          900: '#503b03',
        },
        dark: {
          100: '#474d57',
          200: '#2b2f36',
          300: '#1e2026',
          400: '#181a20',
          500: '#0b0e11',
        },
        'bnb-green': '#03a66d',
        'bnb-red': '#cf304a',
        'bnb-text': '#eaecef',
        'bnb-muted': '#848e9c',
      },
    },
  },
  plugins: [],
};
