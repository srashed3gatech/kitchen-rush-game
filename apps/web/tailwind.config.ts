import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        beach: {
          sand: '#f5e8c7',
          ocean: '#3a8fb7',
          sunset: '#ff8c69',
        },
        cozy: {
          warm: '#fef3e2',
          dim: '#3a3a4a',
        },
      },
      keyframes: {
        floatUp: {
          '0%':   { transform: 'translateY(0)',    opacity: '0' },
          '15%':  { transform: 'translateY(-4px)', opacity: '1' },
          '85%':  { transform: 'translateY(-26px)', opacity: '1' },
          '100%': { transform: 'translateY(-34px)', opacity: '0' },
        },
        fadeInDown: {
          '0%':   { opacity: '0', transform: 'translateY(-8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        floatUp: 'floatUp 1500ms ease-out forwards',
        fadeInDown: 'fadeInDown 300ms ease',
      },
    },
  },
  plugins: [],
};

export default config;
