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
          soft: 'var(--brand-soft)',
        },
        success: 'var(--success)',
        warning: 'var(--warning)',
        danger: 'var(--danger)',
        info: 'var(--info)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"PingFang SC"', '"Hiragino Sans GB"', '"Microsoft YaHei"', 'sans-serif'],
      },
      fontSize: {
        'window-title': ['13px', { lineHeight: '1.2', fontWeight: '500' }],
        'page-title': ['28px', { lineHeight: '1.2', fontWeight: '700' }],
        'page-subtitle': ['14px', { lineHeight: '1.5', fontWeight: '400' }],
        'section-title': ['16px', { lineHeight: '1.4', fontWeight: '600' }],
        'card-title': ['15px', { lineHeight: '1.4', fontWeight: '600' }],
        body: ['14px', { lineHeight: '1.6', fontWeight: '400' }],
        'body-sm': ['13px', { lineHeight: '1.6', fontWeight: '400' }],
        label: ['12px', { lineHeight: '1.4', fontWeight: '500' }],
        'label-xs': ['11px', { lineHeight: '1.4', fontWeight: '500' }],
      },
      borderRadius: {
        window: '20px',
        card: '16px',
        'card-sm': '14px',
        btn: '12px',
        input: '12px',
        chip: '999px',
      },
      spacing: {
        'page-x': '24px',
        'page-top': '20px',
        'section-gap': '20px',
        'card-p': '16px',
        'widget-gap': '8px',
        'block-gap': '12px',
      },
    },
  },
};

export default config;
