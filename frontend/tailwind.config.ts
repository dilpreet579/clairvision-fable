import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        line: "var(--line)",
        fg: "var(--fg)",
        muted: "var(--muted)",
        muted2: "var(--muted2)",
        accent: "var(--accent)",
        accentHover: "var(--accent-hover)",
      },
      fontFamily: {
        serif: ["var(--font-newsreader)", "Georgia", "serif"],
      },
      transitionDuration: {
        fast: "120ms",
      },
    },
  },
  plugins: [],
};

export default config;
