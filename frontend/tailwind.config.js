export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
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
        // Warm cream surface scale — 500 = page bg, 300 = card
        dark: {
          100: '#A89278',  // warm icons/placeholders
          200: '#E5D9CB',  // warm borders
          300: '#FFFFFF',  // card/panel surface
          400: '#F6F0E8',  // header/elevated surface
          500: '#FDFAF6',  // page background (warm off-white)
        },
        'bnb-green':  '#059669',
        'bnb-red':    '#dc2626',
        'bnb-text':   '#1C1410',  // warm almost-black
        'bnb-muted':  '#7D6C5E',  // warm brown-gray
      },
      boxShadow: {
        card:        '0 1px 4px 0 rgba(160,100,30,0.07), 0 1px 2px -1px rgba(160,100,30,0.06)',
        'card-md':   '0 4px 20px -2px rgba(160,100,30,0.1), 0 2px 6px -2px rgba(160,100,30,0.07)',
        'card-active': '0 0 0 2px rgba(240,185,11,0.35), 0 4px 20px rgba(160,100,30,0.1)',
        'warm-glow': '0 0 40px 0 rgba(240,185,11,0.12)',
        'warm-glow-sm': '0 0 16px 0 rgba(240,185,11,0.09)',
      },
      keyframes: {
        'bar-fill': {
          '0%': { width: '0%' },
          '100%': {},
        },
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'live-ping': {
          '0%': { transform: 'scale(1)', opacity: '0.8' },
          '100%': { transform: 'scale(2.2)', opacity: '0' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-400px 0' },
          '100%': { backgroundPosition: '400px 0' },
        },
        'warm-pulse': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(240,185,11,0)' },
          '50%':       { boxShadow: '0 0 0 8px rgba(240,185,11,0.18)' },
        },
      },
      animation: {
        'bar-fill':   'bar-fill 0.7s cubic-bezier(0.22,0.61,0.36,1) forwards',
        'fade-in-up': 'fade-in-up 0.4s cubic-bezier(0.22,0.61,0.36,1) forwards',
        'fade-in':    'fade-in 0.3s ease-out forwards',
        'live-ping':  'live-ping 1.6s ease-out infinite',
        shimmer:      'shimmer 1.8s linear infinite',
        'warm-pulse': 'warm-pulse 2.4s ease-out infinite',
      },
    },
  },
  plugins: [],
};
