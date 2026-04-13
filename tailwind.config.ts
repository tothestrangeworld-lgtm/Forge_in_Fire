import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        serif: ['var(--font-noto-serif)', 'Noto Serif JP', 'serif'],
      },
      colors: {
        ai: {
          DEFAULT: '#1e1b4b',
          mid:     '#3730a3',
          light:   '#e0e7ff',
        },
        take: {
          DEFAULT: '#fefce8',
          mid:     '#fef3c7',
          accent:  '#d97706',
        },
      },
      animation: {
        'fade-up':    'fade-up 0.4s ease both',
        'slide-in':   'slide-in 0.35s ease both',
        'pulse-glow': 'pulse-glow 2s infinite',
      },
    },
  },
  plugins: [],
};

export default config;
