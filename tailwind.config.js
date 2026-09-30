/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        savi: {
          bg: '#04170F',
          cream: '#F5EEDB',
          serpent: '#133020',
          castleton: '#046241',
          amber: '#FFB347',
          gold: '#FFC370',
          muted: '#8EB69B',
          pale: '#DAF1DE',
        },
        shell: {
          dark: '#133020',
          emerald: '#046241',
          cream: '#f5eedb',
          white: '#ffffff',
          offwhite: '#F9F7F7',
          amber: '#FFB347',
        }
      },
      fontFamily: {
        fraunces: ['Fraunces', 'Georgia', 'serif'],
        manrope: ['Manrope', 'system-ui', 'sans-serif'],
        space: ['"Space Grotesk"', 'sans-serif'],
        inter: ['Inter', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
