/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./popup/**/*.{html,js}",
    "./background/**/*.js",
  ],
  theme: {
    extend: {
      colors: {
        vault: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
        }
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'monospace'],
      }
    }
  },
  plugins: [],
}
