/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
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
        space: ['"Space Grotesk"', 'sans-serif'],
        inter: ['Inter', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
