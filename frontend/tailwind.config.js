/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          light: '#1e2942',
          DEFAULT: '#0a0f1e',
          dark: '#05070e',
        },
        gold: {
          light: '#dfb75c',
          DEFAULT: '#c8952a',
          dark: '#9a711b',
        },
        darkcard: '#111827',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }
    },
  },
  plugins: [],
}
