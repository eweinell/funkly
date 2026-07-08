import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Fuer lokale Entwicklung: VITE_API_BASE auf den deployten API-/CloudFront-Endpunkt
// setzen (z. B. https://dxxxx.cloudfront.net), dann laufen /api-Calls dorthin.
// Ohne VITE_API_BASE (Standardfall) proxied /api auf den kleinen Dev-Mock unter
// dev/mock-server.mjs (`npm run dev:mock`), damit `npm run dev` sofort ohne
// echtes Backend funktioniert (UMSETZUNGSPLAN.md Leitplanken, Welle 1).
const MOCK_TARGET = "http://localhost:8787";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": { target: process.env.VITE_API_BASE ?? MOCK_TARGET, changeOrigin: true },
    },
  },
});
