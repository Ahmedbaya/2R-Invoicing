/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#1c2733',
        mist: '#f2f4f6',
        rule: '#d9dee3',
        thread: { DEFAULT: '#2c4a8f', dark: '#223a72' },
        alert: '#b3261e',
      },
      fontFamily: { sans: ['"Segoe UI"', 'system-ui', '-apple-system', 'Roboto', 'sans-serif'] },
    },
  },
  plugins: [],
}
