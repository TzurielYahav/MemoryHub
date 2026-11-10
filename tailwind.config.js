/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter"', '"Heebo"', '"Rubik"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
      },
      colors: {
        notion: {
          bg: '#FFFFFF',
          sidebar: '#F7F7F5',
          hover: '#EFEFED',
          border: '#E9E9E7',
          text: '#37352F',
          muted: '#787774',
          darkBg: '#191919',
          darkSidebar: '#202020',
          darkCard: '#252525',
          darkHover: '#2C2C2C',
          darkBorder: '#2F2F2F',
          darkText: '#E6E6E4',
          darkMuted: '#9B9A97',
        }
      }
    },
  },
  plugins: [],
};
