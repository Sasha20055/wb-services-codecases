import { Elysia } from "elysia"

const MB = 1024 * 1024

function envFlag(name: string, fallback: boolean): boolean {
  const raw = process.env[name]
  if (raw == null) return fallback
  const v = raw.trim().toLowerCase()
  return v === "1" || v === "true" || v === "yes" || v === "on"
}

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

function envList(name: string, fallback: string[]): string[] {
  const raw = process.env[name]
  if (raw == null) return fallback
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

const MAX_CONCURRENT = envNumber("MEMORY_GUARD_MAX_CONCURRENT", 3)
const RSS_LIMIT_BYTES = envNumber("MEMORY_GUARD_RSS_MB", 1300) * MB
const RETRY_AFTER_MS = envNumber("MEMORY_GUARD_RETRY_AFTER_MS", 5000)
const GUARDED_PREFIXES = envList("MEMORY_GUARD_PATHS", ["/nm-summary"])
const GC_MIN_INTERVAL_MS = envNumber("MEMORY_GUARD_GC_MIN_INTERVAL_MS", 2000)
const INFLIGHT_MAX_AGE_MS = envNumber("MEMORY_GUARD_INFLIGHT_MAX_AGE_MS", 120000)
const ENABLED = envFlag("MEMORY_GUARD", true) && (MAX_CONCURRENT > 0 || RSS_LIMIT_BYTES > 0)

const bunGc = (globalThis as { Bun?: { gc?: (force: boolean) => void } }).Bun?.gc

const inFlight = new Map<Request, number>()

let lastGcAtMs = 0
let lastLogAtMs = 0

function rssBytes(): number {
  try {
    return process.memoryUsage().rss
  } catch {
    return 0
  }
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname
  } catch {
    const q = url.indexOf("?")
    return q >= 0 ? url.slice(0, q) : url
  }
}

function isGuarded(path: string): boolean {
  return GUARDED_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix))
}

function reapStaleInFlight(now: number): void {
  if (inFlight.size === 0) return
  for (const [request, startedAt] of inFlight) {
    if (now - startedAt > INFLIGHT_MAX_AGE_MS) inFlight.delete(request)
  }
}

function shed(path: string, reason: string): Response {
  const now = Date.now()
  if (now - lastLogAtMs >= 1000) {
    lastLogAtMs = now
    console.warn(`[mem-guard] 🛑 503 ${path}: ${reason} — отклоняю запрос (load shedding)`)
  }
  return new Response(JSON.stringify({ error: "memory_pressure", retryAfterMs: RETRY_AFTER_MS }), {
    status: 503,
    headers: {
      "Content-Type": "application/json",
      "Retry-After": String(Math.max(1, Math.ceil(RETRY_AFTER_MS / 1000))),
    },
  })
}

export function createMemoryGuardPlugin() {
  if (!ENABLED) {
    console.log("[mem-guard] выключен (MEMORY_GUARD=0 или пороги не заданы)")
    return (app: Elysia) => app
  }

  console.log(
    `[mem-guard] включён: maxConcurrent=${MAX_CONCURRENT || "off"}, rss-лимит=${
      RSS_LIMIT_BYTES > 0 ? Math.round(RSS_LIMIT_BYTES / MB) + "MB" : "off"
    }, пути=[${GUARDED_PREFIXES.join(", ")}], retryAfter=${RETRY_AFTER_MS}ms`,
  )

  return (app: Elysia) => {
    app.onRequest(({ request }) => {
      const path = pathOf(request.url)
      if (!isGuarded(path)) return

      const now = Date.now()
      reapStaleInFlight(now)

      if (MAX_CONCURRENT > 0 && inFlight.size >= MAX_CONCURRENT) {
        return shed(path, `конкурентных тяжёлых ${inFlight.size}/${MAX_CONCURRENT}`)
      }

      if (RSS_LIMIT_BYTES > 0) {
        let rss = rssBytes()
        if (rss >= RSS_LIMIT_BYTES) {
          if (bunGc && now - lastGcAtMs >= GC_MIN_INTERVAL_MS) {
            lastGcAtMs = now
            try {
              bunGc(true)
            } catch {

            }
            rss = rssBytes()
          }
          if (rss >= RSS_LIMIT_BYTES) {
            return shed(path, `rss=${Math.round(rss / MB)}MB ≥ ${Math.round(RSS_LIMIT_BYTES / MB)}MB`)
          }
        }
      }

      inFlight.set(request, now)
    })

    app.onError(({ request }) => {
      inFlight.delete(request)
    })
    app.onAfterResponse(({ request }) => {
      inFlight.delete(request)
    })

    return app
  }
}
