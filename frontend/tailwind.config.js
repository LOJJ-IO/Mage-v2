/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        'clash': ['Clash Display', 'sans-serif'],
        'sans': ['Clash Display', 'sans-serif'],
      },
      colors: {
        // Uber-inspired palette
        'mage': {
          'black': '#000000',
          'white': '#FFFFFF',
          'gray': {
            50: '#F6F6F6',
            100: '#EEEEEE',
            200: '#E2E2E2',
            300: '#CBCBCB',
            400: '#AFAFAF',
            500: '#757575',
            600: '#545454',
            700: '#333333',
            800: '#1F1F1F',
            900: '#141414',
          },
          'blue': {
            light: '#276EF1',
            DEFAULT: '#276EF1',
            dark: '#1E54B7',
          },
          'green': {
            light: '#05944F',
            DEFAULT: '#05944F',
            dark: '#03703C',
          },
          'red': {
            light: '#E11900',
            DEFAULT: '#E11900',
            dark: '#AB1300',
          },
          'yellow': {
            light: '#FFC043',
            DEFAULT: '#FFC043',
            dark: '#996F00',
          },
        },
      },
      boxShadow: {
        'uber': '0 4px 14px 0 rgba(0, 0, 0, 0.1)',
        'uber-lg': '0 10px 40px 0 rgba(0, 0, 0, 0.15)',
        'uber-xl': '0 20px 60px 0 rgba(0, 0, 0, 0.2)',
      },
      borderRadius: {
        'uber': '8px',
        'uber-lg': '16px',
        'uber-xl': '24px',
        'uber-full': '100px',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        'slide-left': 'slideLeft 0.3s ease-out',
        'slide-right': 'slideRight 0.3s ease-out',
        'pulse-ring': 'pulseRing 1.5s cubic-bezier(0.215, 0.61, 0.355, 1) infinite',
        'recording-pulse': 'recordingPulse 1s ease-in-out infinite',
        'bounce-subtle': 'bounceSubtle 0.6s ease-out',
        'toast-slide': 'toastSlide 0.3s ease-out',
        'bell-ring': 'bellRing 1.2s ease-in-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideLeft: {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        slideRight: {
          '0%': { transform: 'translateX(-100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        pulseRing: {
          '0%': { transform: 'scale(0.33)' },
          '80%, 100%': { opacity: '0' },
        },
        recordingPulse: {
          '0%, 100%': { transform: 'scale(1)', opacity: '1' },
          '50%': { transform: 'scale(1.1)', opacity: '0.8' },
        },
        bounceSubtle: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-4px)' },
        },
        toastSlide: {
          '0%': { transform: 'translateY(-100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        bellRing: {
          '0%, 100%': { transform: 'rotate(0deg)' },
          '10%, 30%': { transform: 'rotate(-12deg)' },
          '20%, 40%': { transform: 'rotate(12deg)' },
          '50%': { transform: 'rotate(-8deg)' },
          '60%, 80%': { transform: 'rotate(8deg)' },
          '70%': { transform: 'rotate(-4deg)' },
          '90%': { transform: 'rotate(4deg)' },
        },
      },
      transitionTimingFunction: {
        'uber': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
    },
  },
  plugins: [],
}
