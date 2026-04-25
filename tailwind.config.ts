import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: {
          DEFAULT: "var(--surface)",
          alt: "var(--surface-alt)",
          hover: "var(--surface-hover)",
        },
        border: {
          DEFAULT: "var(--border)",
          hover: "var(--border-hover)",
          focus: "var(--border-focus)",
        },
        text: {
          DEFAULT: "var(--text)",
          secondary: "var(--text-secondary)",
          muted: "var(--text-muted)",
          dim: "var(--text-dim)",
        },
        primary: {
          DEFAULT: "var(--primary)",
          hover: "var(--primary-hover)",
          muted: "var(--primary-muted)",
          bg: "var(--primary-bg)",
          "bg-hover": "var(--primary-bg-hover)",
        },
        accent: "var(--accent)",
        lichen: "var(--lichen)",
        error: {
          DEFAULT: "var(--error)",
          bg: "var(--error-bg)",
          border: "var(--error-border)",
        },
      },
      fontFamily: {
        sans: ["var(--font-body)", "Inter", "Helvetica", "Arial", "sans-serif"],
        display: ["var(--font-display)", "Oswald", "Impact", "sans-serif"],
      },
      borderRadius: {
        button: "10px",
      },
      animation: {
        fadeUp: "fadeUp 0.35s ease",
        spin: "spin 0.8s linear infinite",
        pulse: "pulse 1.2s ease infinite",
      },
      keyframes: {
        fadeUp: {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        spin: {
          to: { transform: "rotate(360deg)" },
        },
        pulse: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.4" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
