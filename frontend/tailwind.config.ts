import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        mantle: {
          green: "#65B3AE",
          dark: "#0D1117",
          gray: "#1C2128",
        },
      },
    },
  },
  plugins: [],
};

export default config;
