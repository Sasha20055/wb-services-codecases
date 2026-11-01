import federation from "@originjs/vite-plugin-federation"
import react from "@vitejs/plugin-react"
import path from "node:path"
import { defineConfig, loadEnv } from "vite"
import dynamicApiProxy from "./src/plugins/dynamicApiProxy"

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")

  const isDev = mode === "development"
  const apiUrl = env.DEV_API_URL
  if (isDev && !apiUrl) {
    throw new Error(
      "[vite] DEV_API_URL не задан! Укажи URL хост-бэкенда в .env, например: DEV_API_URL=http://localhost:8080",
    )
  }

  return {
    resolve: {
      alias: {
        "host/Auth": path.resolve(__dirname, "src/auth/AuthProvider.tsx"),
      },
      dedupe: ["react", "react-dom"],
    },
    plugins: [
      react(),
      federation({
        name: "host",
        filename: "remoteEntry.js",
        exposes: {
          "./Auth": "./src/auth/AuthProvider.tsx",
        },
        remotes: {},
        shared: [
          "react",
          "react-dom",
          "react/jsx-runtime",
          "react/jsx-dev-runtime",
          "react-dom/client",
          "react-datasheet-grid",
          "react-router-dom",
        ],
      }),

      dynamicApiProxy(apiUrl),
    ],
    server: {
      proxy: apiUrl
        ? {

            "/api/main": {
              target: apiUrl,
              changeOrigin: true,
              rewrite: (path) => path.replace(/^\/api\/main/, ""),
            },
          }
        : undefined,
    },
    build: {
      target: "esnext",
    },
  }
})
