export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"', '"Helvetica Neue"', 'sans-serif'],
        mono: ['"SF Mono"', '"JetBrains Mono"', 'Menlo', 'monospace'],
      },
      colors: {
        // Her OS — warm luminous palette
        sys: {
          bg:        '#FDF8F0',               // warm ivory page background
          elevated:  '#FFF5E8',               // slightly warmer elevated surface
          card:      '#FFFFFF',               // pure white cards
          separator: 'rgba(180,110,50,0.10)', // warm amber separator
          overlay:   'rgba(45,27,14,0.45)',   // warm dark overlay
        },
        label: {
          primary:    '#2D1B0E',              // warm near-black brown
          secondary:  'rgba(45,27,14,0.56)',  // warm muted
          tertiary:   'rgba(45,27,14,0.38)',  // warm dim
          disabled:   'rgba(45,27,14,0.22)',  // warm disabled
        },
        acc: {
          amber:  '#E8855A',   // Samantha coral-amber — the Her signature
          orange: '#F0A030',   // warm golden
          green:  '#2A9D6F',   // warm sage green
          red:    '#E05252',   // warm red
          blue:   '#4A8FD9',   // warm blue
          purple: '#9B6EC8',   // warm lavender
        },
        fill: {
          primary:    'rgba(200,120,60,0.10)',
          secondary:  'rgba(200,120,60,0.07)',
          tertiary:   'rgba(200,120,60,0.04)',
          quarternary:'rgba(200,120,60,0.02)',
        },
      },
      boxShadow: {
        'card':       '0 2px 16px rgba(180,100,40,0.08), 0 0 0 0.5px rgba(255,255,255,0.9) inset',
        'card-focus': '0 0 0 2.5px rgba(232,133,90,0.45), 0 4px 24px rgba(232,133,90,0.15)',
        'float':      '0 8px 40px rgba(180,100,40,0.14), 0 0 0 0.5px rgba(180,110,50,0.10)',
        'glow-amber': '0 0 32px rgba(232,133,90,0.22)',
        'glow-sm':    '0 0 14px rgba(232,133,90,0.16)',
      },
      keyframes: {
        'fade-up': {
          '0%':   { opacity: '0', transform: 'translateY(16px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'fade-in': {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'pulse-amber': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(232,133,90,0)' },
          '50%':       { boxShadow: '0 0 0 10px rgba(232,133,90,0.18)' },
        },
        'scan': {
          '0%':   { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(400%)' },
        },
        'breathe': {
          '0%, 100%': { opacity: '0.6', transform: 'scale(0.97)' },
          '50%':      { opacity: '1',   transform: 'scale(1.03)' },
        },
        'shimmer': {
          '0%':   { backgroundPosition: '-400px 0' },
          '100%': { backgroundPosition: '400px 0' },
        },
      },
      animation: {
        'fade-up':     'fade-up 0.45s cubic-bezier(0.22,0.61,0.36,1) forwards',
        'fade-in':     'fade-in 0.3s ease-out forwards',
        'pulse-amber': 'pulse-amber 2.5s ease-out infinite',
        'scan':        'scan 1.6s cubic-bezier(0.4,0,0.6,1) infinite',
        'breathe':     'breathe 3.5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
