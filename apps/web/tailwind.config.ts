import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        muted: "hsl(var(--muted))",
        "muted-foreground": "hsl(var(--muted-foreground))",
        card: "hsl(var(--card))",
        "card-foreground": "hsl(var(--card-foreground))",
        primary: "hsl(var(--primary))",
        "primary-foreground": "hsl(var(--primary-foreground))",
        accent: "hsl(var(--accent))",
        danger: "hsl(var(--danger))",
        success: "hsl(var(--success))",
        warning: "hsl(var(--warning))",
        shell: "hsl(var(--shell))",
        "shell-foreground": "hsl(var(--shell-foreground))",
      },
      boxShadow: {
        panel: "0 14px 40px hsl(222 35% 8% / 0.10)",
        glow: "0 0 0 1px hsl(var(--primary) / 0.20), 0 18px 54px hsl(var(--primary) / 0.16)",
      },
    },
  },
  plugins: [],
};

export default config;
