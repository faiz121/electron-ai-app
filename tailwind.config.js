/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx}",
    "./*.html",
    "./dist/**/*.{js,jsx}"
  ],
  theme: {
    extend: {
      colors: {
        gray: {
          750: '#1f2937',
          850: '#1a1f2b',
          900: '#111827',
        }
      },
      transitionProperty: {
        'all': 'all',
      },
      transitionDuration: {
        '300': '300ms',
      },
      transitionTimingFunction: {
        'in-out': 'cubic-bezier(0.4, 0, 0.2, 1)',
      }
    }
  },
  plugins: [],
};