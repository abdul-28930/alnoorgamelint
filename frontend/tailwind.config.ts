import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'cp-yellow': '#FCEE0D',
        'cp-cyan': '#00FFF7',
        'cp-magenta': '#9413FF',
        'cp-black': '#0D0D0D',
        'cp-gray': '#101820',
      },
      fontFamily: {
        'rajdhani': ['Rajdhani', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        'neon': '0 0 8px #FCEE0D',
        'neon-cyan': '0 0 8px #00FFF7',
      },
      animation: {
        'fade-rise': 'fadeRise 0.7s ease-out',
      },
      keyframes: {
        fadeRise: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}

export default config 