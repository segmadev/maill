/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#ffffff',
          dark:    '#f0f0f0',
          darker:  '#e0e0e0',
          light:   '#ffffff',
        },
        accent: {
          DEFAULT: '#d4af37',  // Gold accent
          hover:   '#e5c158',
        },
        surface: {
          DEFAULT: '#0a0a0a',
          raised:  '#151515',
          card:    '#1a1a1a',
          border:  '#2a2a2a',
          light:   '#3a3a3a',
        },
        gray: {
          50: '#f9fafb',
          100: '#f3f4f6',
          200: '#e5e7eb',
          300: '#d1d5db',
          400: '#9ca3af',
          500: '#6b7280',
          600: '#4b5563',
          700: '#374151',
          800: '#1f2937',
          900: '#111827',
          950: '#030712',
        },
      },
      backgroundColor: {
        black: '#000000',
        'dark-0': '#000000',
        'dark-1': '#0a0a0a',
        'dark-2': '#151515',
        'dark-3': '#1a1a1a',
        'dark-4': '#2a2a2a',
      },
    },
  },
  plugins: [],
}
