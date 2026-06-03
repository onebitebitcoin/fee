export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', '-apple-system', 'sans-serif'],
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
        // Warm espresso dark surface scale — 500 = page bg, 300 = card
        dark: {
          100: '#7A6A5C',  // dim icons / tertiary text
          200: '#352F28',  // borders
          300: '#221E1A',  // card surface
          400: '#1A1713',  // elevated / pressed surface
          500: '#0E0C0A',  // page background (warm near-black)
        },
        'bnb-green':  '#34D399',   // brighter on dark
        'bnb-red':    '#F87171',   // brighter on dark
        'bnb-text':   '#EEE8DF',   // warm off-white
        'bnb-muted':  '#9A8A7A',   // warm stone muted
      },
      boxShadow: {
        card:           '0 1px 3px 0 rgba(0,0,0,0.35), 0 1px 2px -1px rgba(0,0,0,0.25)',
        'card-md':      '0 4px 20px -2px rgba(0,0,0,0.5), 0 2px 6px -2px rgba(0,0,0,0.3)',
        'card-active':  '0 0 0 1px rgba(240,185,11,0.45), 0 4px 24px rgba(240,185,11,0.12)',
        'amber-glow':   '0 0 24px rgba(240,185,11,0.20)',
        'amber-glow-sm':'0 0 10px rgba(240,185,11,0.16)',
      },
      keyframes: {
        'bar-fill': {
          '0%': { width: '0%' },
          '100%': {},
        },
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(14px) scale(0.99)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'live-ping': {
          '0%': { transform: 'scale(1)', opacity: '0.8' },
          '100%': { transform: 'scale(2.4)', opacity: '0' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-400px 0' },
          '100%': { backgroundPosition: '400px 0' },
        },
        'amber-pulse': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(240,185,11,0)' },
          '50%':       { boxShadow: '0 0 0 8px rgba(240,185,11,0.18)' },
        },
        'glow-breathe': {
          '0%, 100%': { opacity: '0.6' },
          '50%':       { opacity: '1' },
        },
      },
      animation: {
        'bar-fill':     'bar-fill 0.7s cubic-bezier(0.22,0.61,0.36,1) forwards',
        'fade-in-up':   'fade-in-up 0.45s cubic-bezier(0.22,0.61,0.36,1) forwards',
        'live-ping':    'live-ping 1.6s ease-out infinite',
        shimmer:        'shimmer 1.8s linear infinite',
        'amber-pulse':  'amber-pulse 2.4s ease-out infinite',
        'glow-breathe': 'glow-breathe 3s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
