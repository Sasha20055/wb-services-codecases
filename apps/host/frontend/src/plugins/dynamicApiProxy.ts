import http from "node:http"
import type { Plugin } from "vite"

type ProjectInfo = {
  slug: string
  backend: { url?: string }
}

export default function dynamicApiProxy(apiUrl = "http://localhost:8080"): Plugin {
  let projects: ProjectInfo[] = []

  return {
    name: "dynamic-api-proxy",
    configureServer(server) {

      loadProjects(apiUrl).then((p) => {
        projects = p
        const mapped = p
          .filter((x) => x.backend?.url)
          .map((x) => `  /api/${x.slug}/* → ${x.backend.url}`)
        if (mapped.length) console.log("[proxy] Маршруты:\n" + mapped.join("\n"))
      })

      server.middlewares.use((req, res, next) => {
        if (!req.url) return next()

        const match = req.url.match(/^\/api\/([^/]+)(.*)$/)
        if (!match) return next()

        const slug = match[1]
        const restPath = match[2] || "/"

        const project = projects.find((p) => p.slug === slug)
        if (!project?.backend?.url) return next()

        const target = new URL(project.backend.url)
        const options: http.RequestOptions = {
          hostname: target.hostname,
          port: target.port,
          path: restPath,
          method: req.method,
          headers: {
            ...req.headers,
            host: target.host,
            "x-forwarded-host": req.headers.host || "",
            "x-forwarded-proto": "http",
          },
        }

        const proxyReq = http.request(options, (proxyRes) => {
          res.writeHead(proxyRes.statusCode || 500, proxyRes.headers)
          proxyRes.pipe(res, { end: true })
        })

        proxyReq.on("error", (err) => {
          console.error(`[proxy] Ошибка ${slug}:`, err.message)
          if (!res.headersSent) {
            res.writeHead(502)
            res.end(`Proxy error: ${err.message}`)
          }
        })

        const abortUpstream = () => {
          if (!res.writableFinished && !proxyReq.destroyed) proxyReq.destroy()
        }
        req.on("aborted", abortUpstream)
        res.on("close", abortUpstream)

        req.pipe(proxyReq, { end: true })
      })
    },
  }
}

async function loadProjects(apiUrl: string): Promise<ProjectInfo[]> {
  try {
    const res = await fetch(`${apiUrl}/projects`)
    if (!res.ok) {
      console.error("[proxy] Ошибка загрузки проектов:", res.status)
      return []
    }
    return await res.json()
  } catch (err) {
    console.error("[proxy] Не удалось подключиться к API:", err)
    return []
  }
}
