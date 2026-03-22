import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: { DEFAULT: "#F5F6F4", alt: "#EDEEED", hover: "#E6E8E5" },
        border: { DEFAULT: "#D9DDD8", hover: "#B8BFB5", focus: "#022C12" },
        text: { DEFAULT: "#1A1A1A", secondary: "#4D4D4D", muted: "#8A8A8A", dim: "#B5B5B5" },
        primary: {
          DEFAULT: "#022C12",
          hover: "#04391A",
          muted: "#3A6B4A",
          bg: "#EAF3EC",
          "bg-hover": "#D7EADC",
          badge: "#022C12",
          "badge-bg": "#E0F0E4",
        },
        accent: "#F1F97E",
        error: { DEFAULT: "#C62828", bg: "#FFF0EF" },
      },
      fontFamily: {
        sans: ["Inter", "Arial", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
