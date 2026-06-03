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
          50:  '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f0b90b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
        },
        // Light-mode surface scale (500 = page bg, 300 = card, 100 = subtle)
        dark: {
          100: '#94a3b8',  // subtle icons / placeholders
          200: '#e2e8f0',  // borders
          300: '#ffffff',  // card / panel surface
          400: '#f1f5f9',  // header / elevated surface
          500: '#f8fafc',  // page background
        },
        'bnb-green':  '#059669',
        'bnb-red':    '#dc2626',
        'bnb-text':   '#0f172a',
        'bnb-muted':  '#64748b',
      },
      boxShadow: {
        card:        '0 1px 3px 0 rgb(0 0 0 / 0.07), 0 1px 2px -1px rgb(0 0 0 / 0.07)',
        'card-md':   '0 4px 6px -1px rgb(0 0 0 / 0.08), 0 2px 4px -2px rgb(0 0 0 / 0.08)',
        'card-active': '0 0 0 2px rgba(240,185,11,0.35), 0 4px 12px 0 rgb(0 0 0 / 0.08)',
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
        'bar-fill':   'bar-fill 0.7s ease-out forwards',
        'fade-in-up': 'fade-in-up 0.35s ease-out forwards',
        'live-ping':  'live-ping 1.6s ease-out infinite',
        shimmer:      'shimmer 1.8s linear infinite',
      },
    },
  },
  plugins: [],
};
