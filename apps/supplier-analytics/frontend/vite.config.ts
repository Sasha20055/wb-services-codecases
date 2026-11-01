import federation from "@originjs/vite-plugin-federation"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"
import { uiProxyPlugin } from "./src/plugins/ui-proxy-plugin"

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")
  const isDev = mode === "development"

  const apiUrl = env.DEV_API_URL

  const isAdminMode = env.isAdminMode === "true"

  if (isDev && !apiUrl) {
    throw new Error("[vite] DEV_API_URL не задан в .env")
  }

  if (isDev && !env.DEV_UI_URL) {
    throw new Error("[vite] DEV_UI_URL не задан в .env (нужен для standalone dev)")
  }

  return {
    define: {

      __IS_ADMIN_MODE__: JSON.stringify(isAdminMode),
    },
    plugins: [
      tailwindcss(),
      react(),
      federation({
        name: "r-supplier-analytics",
        filename: "remoteEntry.js",
        remotes: isDev
          ? {
              ui: `${env.DEV_UI_URL}/assets/remoteEntry.js`,
            }
          : {},
        exposes: {
          "./manifest": "./src/manifest.ts",
          "./Nav": "./src/Nav.tsx",
          "./routes": "./src/routes.tsx",
        },
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
      ...(!isDev ? [uiProxyPlugin()] : []),
    ],
    resolve: {
      alias: {
        "@/src": new URL("./src", import.meta.url).pathname,
      },
      dedupe: ["react", "react-dom"],
    },
    build: {
      target: "esnext",
      commonjsOptions: {
        esmExternals: (id) =>
          [
            "react",
            "react-dom",
            "react/jsx-runtime",
            "react/jsx-dev-runtime",
            "react-dom/client",
          ].includes(id),
      },
    },
    optimizeDeps: {
      exclude: [
        "@tanstack/react-virtual",
        "react-resize-detector",
        "throttle-debounce",
        "fast-deep-equal",
        "classnames",
      ],
    },
    server: {
      cors: true,
      proxy: {
        "/api": {
          target: apiUrl,
          changeOrigin: true,
        },
      },
    },
  }
})
