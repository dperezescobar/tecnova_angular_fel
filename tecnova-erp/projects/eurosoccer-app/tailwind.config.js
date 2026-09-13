/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./projects/eurosoccer-app/src/**/*.{html,ts}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#ecfdf5',
          100: '#d1fae5',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857'
        },
        pitch: {
          dark: '#0b1120',
          card: '#151f32',
          surface: '#1e293b',
          border: '#24344d',
          gold: '#f59e0b'
        }
      },
      fontFamily: {
        outfit: ['Outfit', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace']
      }
    }
  },
  plugins: []
};
