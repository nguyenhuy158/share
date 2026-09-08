import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const API_DEV_SERVER = "http://127.0.0.1:8787";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": { target: API_DEV_SERVER, changeOrigin: false },
      "/artifact": { target: API_DEV_SERVER, changeOrigin: false },
      "/login": { target: API_DEV_SERVER, changeOrigin: false },
      "/logout": { target: API_DEV_SERVER, changeOrigin: false },
    },
  },
});
