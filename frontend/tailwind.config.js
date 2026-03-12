export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        data: ['"JetBrains Mono"', 'Consolas', 'Monaco', 'monospace'],
        display: ['Syne', 'system-ui', 'sans-serif'],
      },
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
      keyframes: {
        'bar-fill': {
          '0%': { width: '0%' },
          '100%': {},
        },
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'live-ping': {
          '0%': { transform: 'scale(1)', opacity: '0.8' },
          '100%': { transform: 'scale(2.2)', opacity: '0' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-400px 0' },
          '100%': { backgroundPosition: '400px 0' },
        },
      },
      animation: {
        'bar-fill': 'bar-fill 0.7s ease-out forwards',
        'fade-in-up': 'fade-in-up 0.35s ease-out forwards',
        'live-ping': 'live-ping 1.6s ease-out infinite',
        shimmer: 'shimmer 1.8s linear infinite',
      },
    },
  },
  plugins: [],
};
