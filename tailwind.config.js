/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./parents-night-out/**/*.html",
    "./homeschool-functional-fitness/**/*.html",
    "./scholarship/**/*.html",
  ],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: "#3FC8F4", dark: "#16A6DC", deep: "#0B7FAE" },
        ink: { DEFAULT: "#0E1116", soft: "#161B22", card: "#1B2230", line: "#2A3343" },
      },
      fontFamily: {
        display: ["Anton", "Oswald", "sans-serif"],
        head: ["Oswald", "sans-serif"],
        body: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
