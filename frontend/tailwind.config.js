// 색상 토큰은 모두 CSS 변수를 가리킨다. 실제 색상값은 src/index.css 의
// `:root`(살 때 = 웜 크림)와 `:root[data-theme="sell"]`(팔 때 = 라이트 퍼플)에 있다.
// 팔레트를 바꾸려면 이 파일이 아니라 index.css 의 변수만 고친다.
//
// `acc-brand`는 모드별 시그니처 액센트 슬롯이다. 살 때는 코랄, 팔 때는 보라가 들어간다.
// 반면 `acc-green`/`acc-red`/`acc-blue`는 성공·위험·정보를 뜻하는 의미색이라 모드와 무관하게 유지된다.

// `fill-*` 토큰은 기본 투명도를 지닌 채 Tailwind 투명도 수정자(`bg-fill-tertiary/50`)도
// 받아야 하므로 함수형 색상값을 쓴다.
//
// 주의: 수정자가 없을 때 Tailwind 는 opacityValue 를 undefined 로 주지 않고
// `var(--tw-bg-opacity, 1)` 같은 플레이스홀더 문자열로 넘긴다. 그 값을 그대로 쓰면
// 토큰의 기본 투명도(예: 0.04)가 1 로 덮여 채움색이 불투명해진다. 그래서 플레이스홀더인지
// 먼저 판별하고, 실제 숫자 수정자가 온 경우에만 그 값을 적용한다.
const fill = (baseAlpha) => ({ opacityValue }) => {
  const hasModifier = typeof opacityValue === 'string' && !opacityValue.startsWith('var(--tw-');
  return `rgb(var(--fill-rgb) / ${hasModifier ? opacityValue : baseAlpha})`;
};

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Noto Sans KR"', '-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"', '"Helvetica Neue"', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"SF Mono"', 'Menlo', 'monospace'],
      },
      colors: {
        sys: {
          bg:        'var(--sys-bg)',        // 페이지 배경
          elevated:  'var(--sys-elevated)',  // 한 단 깊은 표면
          card:      'var(--sys-card)',      // 카드 표면
          separator: 'var(--sys-separator)',
          overlay:   'var(--sys-overlay)',
        },
        label: {
          primary:    'var(--label-primary)',
          secondary:  'var(--label-secondary)',
          tertiary:   'var(--label-tertiary)',
          quaternary: 'var(--label-quaternary)',
          disabled:   'var(--label-disabled)',
        },
        acc: {
          // 모드별 시그니처 액센트 (살 때 코랄 / 팔 때 보라)
          brand:  'rgb(var(--acc-brand) / <alpha-value>)',
          orange: 'rgb(var(--acc-orange) / <alpha-value>)',
          // 의미색 — 모드와 무관하게 고정
          green:  'rgb(var(--acc-green) / <alpha-value>)',
          red:    'rgb(var(--acc-red) / <alpha-value>)',
          blue:   'rgb(var(--acc-blue) / <alpha-value>)',
          purple: 'rgb(var(--acc-purple) / <alpha-value>)',
        },
        fill: {
          primary:     fill(0.10),
          secondary:   fill(0.07),
          tertiary:    fill(0.04),
          quarternary: fill(0.02),
        },
        // 카드 내부 구분선 — 이전에 컴포넌트마다 임의값으로 흩어져 있던 헤어라인
        line: {
          soft:    'var(--line-soft)',
          DEFAULT: 'var(--line)',
          strong:  'var(--line-strong)',
        },
      },
      boxShadow: {
        'card':       '0 2px 16px var(--shadow-card), 0 0 0 0.5px rgba(255,255,255,0.9) inset',
        'card-focus': '0 0 0 2.5px rgb(var(--acc-brand) / 0.45), 0 4px 24px rgb(var(--acc-brand) / 0.15)',
        'float':      '0 8px 40px var(--shadow-float), 0 0 0 0.5px var(--shadow-float-ring)',
        'glow-brand': '0 0 32px rgb(var(--acc-brand) / 0.22)',
        'glow-sm':    '0 0 14px rgb(var(--acc-brand) / 0.16)',
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
        'pulse-brand': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgb(var(--acc-brand) / 0)' },
          '50%':       { boxShadow: '0 0 0 10px rgb(var(--acc-brand) / 0.18)' },
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
        'pulse-brand': 'pulse-brand 2.5s ease-out infinite',
        'scan':        'scan 1.6s cubic-bezier(0.4,0,0.6,1) infinite',
        'breathe':     'breathe 3.5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
