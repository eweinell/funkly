import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Fuer lokale Entwicklung: VITE_API_BASE auf den deployten API-/CloudFront-Endpunkt
// setzen (z. B. https://dxxxx.cloudfront.net) - sonst laufen /api-Calls same-origin.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: process.env.VITE_API_BASE
      ? { "/api": { target: process.env.VITE_API_BASE, changeOrigin: true } }
      : undefined,
  },
});
