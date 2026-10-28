/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './admin.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#E53935', dark: '#C62828', soft: '#FDECEA' },
        ink: '#222222',
        blush: '#FFF7F7',
        eco: { DEFAULT: '#E8F5E9', deep: '#2E7D32' },
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['Figtree', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: { card: '0 1px 2px rgba(34,34,34,.06), 0 8px 24px -12px rgba(229,57,53,.25)' },
    },
  },
  plugins: [],
};
