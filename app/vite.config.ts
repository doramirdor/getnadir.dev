import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8084,
  },
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          // clsx / tailwind-merge / cva are used eagerly by `cn` (Layout, Sidebar,
          // every ui/* component) AND by recharts. Give them their own tiny chunk
          // so they are NOT swept into vendor-recharts — otherwise the eager `cn`
          // path statically imports clsx from vendor-recharts and drags the whole
          // ~410 KB charting bundle into the initial page load.
          "vendor-utils": ["clsx", "tailwind-merge", "class-variance-authority"],
          "vendor-recharts": ["recharts"],
          "vendor-supabase": ["@supabase/supabase-js"],
          "vendor-query": ["@tanstack/react-query"],
        },
      },
    },
  },
}));
