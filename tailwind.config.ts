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
        brand: {
          50:  "#f0f4ff",
          100: "#e0eaff",
          200: "#c7d7fd",
          300: "#a5bbfb",
          400: "#8098f7",
          500: "#6172f3",
          600: "#4d55e8",
          700: "#3f43cc",
          800: "#3538a4",
          900: "#313582",
        },
        surface: {
          DEFAULT: "#0f1117",
          card:    "#16191f",
          input:   "#1c2028",
          border:  "#2a2f3a",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
      },
      animation: {
        "fade-in":    "fadeIn 0.3s ease-out",
        "slide-up":   "slideUp 0.3s ease-out",
        "bounce-dot": "bounceDot 1.2s ease-in-out infinite",
        "pulse-ring": "pulseRing 2s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          "0%":   { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%":   { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        bounceDot: {
          "0%, 80%, 100%": { transform: "scale(0)" },
          "40%":           { transform: "scale(1)" },
        },
        pulseRing: {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(97, 114, 243, 0.4)" },
          "50%":      { boxShadow: "0 0 0 8px rgba(97, 114, 243, 0)" },
        },
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "mesh-gradient":
          "radial-gradient(at 27% 37%, hsl(215, 98%, 61%) 0px, transparent 50%), radial-gradient(at 97% 21%, hsl(125, 98%, 72%) 0px, transparent 50%), radial-gradient(at 52% 99%, hsl(354, 98%, 61%) 0px, transparent 50%)",
      },
    },
  },
  plugins: [],
};

export default config;
