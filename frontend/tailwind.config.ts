import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        'ba-navy': '#163963',
        'ba-accent': '#005ba5',
        'ba-light': 'rgba(207,230,250,0.2)',
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
      fontFamily: {
        serif: ['Gelasio', 'Georgia', 'serif'],
        sans: ['Inter', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
export default config;
