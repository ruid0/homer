import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 3000,
    // API_URL lets a second copy of the app run against a different api, for example one with a scratch database.
    proxy: { "/trpc": process.env.API_URL ?? "http://127.0.0.1:3001" },
  },
});
