import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  optimizeDeps: {
    exclude: ["@sqlite.org/sqlite-wasm"]
  },
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        id: "/",
        name: "Goobs Song Finder",
        short_name: "Song Finder",
        description: "Find songs from the lyric fragments you remember, completely offline.",
        theme_color: "#0a1525",
        background_color: "#07101d",
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons: [
          {
            src: "/app-icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable"
          }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,wasm}"],
        navigateFallback: "/index.html",
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024
      }
    })
  ],
  worker: {
    format: "es"
  }
});
