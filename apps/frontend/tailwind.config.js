/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        honey: {
          DEFAULT: '#FFB020',
          light: '#FFC65C',
          dark: '#FF7A45',
        },
        grape: {
          DEFAULT: '#6C5CE7',
          light: '#8B7CF0',
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'Sora', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'honey-gradient': 'linear-gradient(135deg, #FFB020 0%, #FF7A45 100%)',
      },
      boxShadow: {
        glow: '0 0 40px -10px rgba(255, 176, 32, 0.45)',
        'glow-grape': '0 0 40px -10px rgba(108, 92, 231, 0.45)',
      },
      keyframes: {
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'blob-move': {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '33%': { transform: 'translate(30px, -50px) scale(1.1)' },
          '66%': { transform: 'translate(-20px, 20px) scale(0.95)' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.6s infinite',
        'blob-slow': 'blob-move 20s ease-in-out infinite',
        'blob-slower': 'blob-move 28s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
