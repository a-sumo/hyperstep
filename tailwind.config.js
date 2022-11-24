/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './dist/*.html',
    './src/**/*.{html,js}',
  ],
  theme: {
    extend: {},
  },
  variants: {
    extend: {
      backgroundImage: {
        'volume': "url('src/assets/images/vol_synth.png')",
      },
    },
  },
  plugins: [],
}