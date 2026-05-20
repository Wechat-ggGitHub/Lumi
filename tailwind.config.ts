import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        'bg-app': 'var(--bg-app)',
        'bg-window': 'var(--bg-window)',
        'bg-surface-1': 'var(--bg-surface-1)',
        'bg-surface-2': 'var(--bg-surface-2)',
        'bg-surface-3': 'var(--bg-surface-3)',
        'line-default': 'var(--line-default)',
        'line-strong': 'var(--line-strong)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-muted': 'var(--text-muted)',
        'brand': {
          DEFAULT: 'var(--brand-primary)',
          hover: 'var(--brand-primary-hover)',
          active: 'var(--brand-primary-active)',
          soft: 'var(--brand-soft)',
        },
        success: 'var(--success)',
        warning: 'var(--warning)',
        danger: 'var(--danger)',
        info: 'var(--info)',
      },
      fontFamily: {
        sans: ["'Clash Display'", 'Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', "'PingFang SC'", "'Hiragino Sans GB'", "'Microsoft YaHei'", 'sans-serif'],
        display: ["'Playfair Display'", 'serif'],
      },
      fontSize: {
        'page-title': ['24px', { lineHeight: '1.2', fontWeight: '700' }],
        'section-title': ['15px', { lineHeight: '1.4', fontWeight: '600' }],
        'card-title': ['14px', { lineHeight: '1.4', fontWeight: '600' }],
        body: ['14px', { lineHeight: '1.6' }],
        'body-sm': ['13px', { lineHeight: '1.6' }],
        label: ['12px', { lineHeight: '1.4', fontWeight: '500' }],
        'label-xs': ['11px', { lineHeight: '1.4', fontWeight: '500' }],
        'section-tag': ['11px', { lineHeight: '1.0', fontWeight: '600', letterSpacing: '0.08em' }],
      },
      borderRadius: {
        card: '12px',
        btn: '10px',
        'icon-box': '9px',
        chip: '999px',
      },
      spacing: {
        'page-x': '20px',
        'page-top': '16px',
        'section-gap': '24px',
        'card-p': '16px',
        'card-gap': '8px',
        'item-gap': '12px',
      },
    },
  },
};

export default config;
