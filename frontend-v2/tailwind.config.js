export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"', '"Helvetica Neue"', 'sans-serif'],
        mono: ['"SF Mono"', '"JetBrains Mono"', 'Menlo', 'monospace'],
      },
      colors: {
        // iOS/macOS dark palette
        sys: {
          bg:         '#0D0D0E',
          elevated:   '#161617',
          card:       '#1E1E1F',
          separator:  'rgba(255,255,255,0.1)',
          overlay:    'rgba(0,0,0,0.6)',
        },
        label: {
          primary:   '#FFFFFF',
          secondary: 'rgba(255,255,255,0.55)',
          tertiary:  'rgba(255,255,255,0.30)',
          disabled:  'rgba(255,255,255,0.18)',
        },
        acc: {
          amber:  '#FFB800',   // warm Samantha gold
          orange: '#FF9500',   // iOS orange
          green:  '#30D158',   // macOS green
          red:    '#FF453A',   // macOS red
          blue:   '#0A84FF',   // iOS blue
          purple: '#BF5AF2',   // iOS purple
        },
        fill: {
          primary:   'rgba(255,255,255,0.12)',
          secondary: 'rgba(255,255,255,0.08)',
          tertiary:  'rgba(255,255,255,0.05)',
          quarternary:'rgba(255,255,255,0.03)',
        },
      },
      boxShadow: {
        'card':       '0 2px 8px rgba(0,0,0,0.4), 0 0 0 0.5px rgba(255,255,255,0.08) inset',
        'card-focus': '0 0 0 2px rgba(255,184,0,0.5), 0 4px 20px rgba(255,184,0,0.12)',
        'float':      '0 8px 40px rgba(0,0,0,0.6), 0 0 0 0.5px rgba(255,255,255,0.1)',
        'glow-amber': '0 0 30px rgba(255,184,0,0.18)',
        'glow-sm':    '0 0 12px rgba(255,184,0,0.15)',
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
        'slide-up': {
          '0%':   { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        'pulse-amber': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(255,184,0,0)' },
          '50%':       { boxShadow: '0 0 0 8px rgba(255,184,0,0.18)' },
        },
        'scan': {
          '0%':   { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(400%)' },
        },
        'breathe': {
          '0%, 100%': { opacity: '0.5', transform: 'scale(0.98)' },
          '50%':      { opacity: '1',   transform: 'scale(1.02)' },
        },
      },
      animation: {
        'fade-up':     'fade-up 0.45s cubic-bezier(0.22,0.61,0.36,1) forwards',
        'fade-in':     'fade-in 0.3s ease-out forwards',
        'pulse-amber': 'pulse-amber 2.5s ease-out infinite',
        'scan':        'scan 1.6s cubic-bezier(0.4,0,0.6,1) infinite',
        'breathe':     'breathe 3s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
