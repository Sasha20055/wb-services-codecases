const MAIN_SLUG = import.meta.env.VITE_MAIN_SLUG ?? "main"

const PROJECT_SLUG = import.meta.env.VITE_PROJECT_SLUG ?? "analytics"

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000

type ApiRequestOptions = RequestInit & {
  timeoutMs?: number
}

export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

type FileResponse = {
  blob: Blob
  fileName: string
}

const ACTIVE_CLIENT_STORAGE_KEY = "host-active-client-id"

function getActiveClientId() {
  if (typeof window === "undefined") return ""
  return String(window.localStorage.getItem(ACTIVE_CLIENT_STORAGE_KEY) ?? "").trim()
}

function withActiveClientQuery(path: string) {
  const clientId = getActiveClientId()
  if (!clientId) return path

  const separator = path.includes("?") ? "&" : "?"
  return `${path}${separator}clientId=${encodeURIComponent(clientId)}`
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError"
}

function isRetriableNetworkError(error: unknown) {
  return error instanceof TypeError || isAbortError(error)
}

function isIdempotentMethod(method: string) {
  return method === "GET" || method === "HEAD"
}

function shouldSetJsonContentType(body: BodyInit | null | undefined) {
  return !(body instanceof FormData)
}

type RefreshResult = "ok" | "unauthorized" | "failed"

let refreshPromise: Promise<RefreshResult> | null = null

async function requestTokenRefresh(): Promise<RefreshResult> {
  try {
    const res = await fetch(`/api/${MAIN_SLUG}/auth/refresh`, {
      credentials: "include",

      headers: { "X-Requested-With": "XMLHttpRequest" },
    })
    if (res.ok) return "ok"

    return res.status === 401 ? "unauthorized" : "failed"
  } catch {
    return "failed"
  }
}

function refreshAuthSession(): Promise<RefreshResult> {
  if (!refreshPromise) {
    refreshPromise = requestTokenRefresh().finally(() => {
      refreshPromise = null
    })
  }
  return refreshPromise
}

let didRedirectToLogin = false

function handleSessionExpired() {
  if (typeof window === "undefined") return
  if (didRedirectToLogin || window.location.pathname === "/login") return
  didRedirectToLogin = true
  window.location.replace("/login")
}

async function request<T>(url: string, options?: ApiRequestOptions): Promise<T> {
  const method = (options?.method ?? "GET").toUpperCase()
  const timeoutMs = options?.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
  const maxAttempts = isIdempotentMethod(method) ? 2 : 1
  let didTryRefresh = false

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController()
    const headers = new Headers(options?.headers)
    const externalSignal = options?.signal
    let didTimeout = false

    if (!headers.has("Content-Type") && shouldSetJsonContentType(options?.body)) {
      headers.set("Content-Type", "application/json")
    }

    const activeClientId = getActiveClientId()
    if (activeClientId && !headers.has("X-Client-Id")) {
      headers.set("X-Client-Id", activeClientId)
    }

    const timeout = window.setTimeout(() => {
      didTimeout = true
      controller.abort()
    }, timeoutMs)

    const onExternalAbort = () => controller.abort()
    externalSignal?.addEventListener("abort", onExternalAbort, { once: true })

    try {
      const res = await fetch(url, {
        ...options,
        headers,
        credentials: "include",
        signal: controller.signal,
      })

      if (res.status === 401 && !didTryRefresh) {
        didTryRefresh = true

        window.clearTimeout(timeout)
        const refreshed = await refreshAuthSession()
        if (refreshed === "ok") {

          attempt -= 1
          continue
        }

        if (refreshed === "unauthorized") handleSessionExpired()
      }

      if (!res.ok) {
        const msg = await res.text().catch(() => "")
        throw new ApiError(res.status, msg || `Request failed (${res.status})`)
      }

      return res.json()
    } catch (error) {
      const canRetry =
        attempt < maxAttempts &&
        !externalSignal?.aborted &&
        isRetriableNetworkError(error)

      if (canRetry) {
        continue
      }

      if (didTimeout) {
        throw new Error(`Request timeout after ${Math.round(timeoutMs / 1000)}s`)
      }

      throw error instanceof Error ? error : new Error("Request failed")
    } finally {
      window.clearTimeout(timeout)
      externalSignal?.removeEventListener("abort", onExternalAbort)
    }
  }

  throw new Error("Request failed")
}

export function mainApi<T>(path: string, options?: ApiRequestOptions): Promise<T> {
  return request<T>(`/api/${MAIN_SLUG}${path}`, options)
}

export function projectApi<T>(path: string, options?: ApiRequestOptions): Promise<T> {
  return request<T>(`/api/${PROJECT_SLUG}${path}`, options)
}

export function projectApiUrl(path: string) {
  return `/api/${PROJECT_SLUG}${withActiveClientQuery(path)}`
}

function getFileNameFromDisposition(disposition: string | null) {
  if (!disposition) return "download"

  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1])
    } catch {
      return utf8Match[1]
    }
  }

  const plainMatch = disposition.match(/filename="?([^";]+)"?/i)
  return plainMatch?.[1] ?? "download"
}

async function requestFile(
  url: string,
  options?: ApiRequestOptions,
  isRetryAfterRefresh = false,
): Promise<FileResponse> {
  const headers = new Headers(options?.headers)
  const controller = new AbortController()
  const timeoutMs = options?.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
  const externalSignal = options?.signal
  let didTimeout = false

  if (!headers.has("Content-Type") && shouldSetJsonContentType(options?.body)) {
    headers.set("Content-Type", "application/json")
  }

  const activeClientId = getActiveClientId()
  if (activeClientId && !headers.has("X-Client-Id")) {
    headers.set("X-Client-Id", activeClientId)
  }

  const timeout = window.setTimeout(() => {
    didTimeout = true
    controller.abort()
  }, timeoutMs)

  const onExternalAbort = () => controller.abort()
  externalSignal?.addEventListener("abort", onExternalAbort, { once: true })

  try {
    const res = await fetch(url, {
      ...options,
      headers,
      credentials: "include",
      signal: controller.signal,
    })

    if (!res.ok) {
      if (res.status === 401 && !isRetryAfterRefresh) {

        window.clearTimeout(timeout)
        const refreshed = await refreshAuthSession()

        if (refreshed === "ok") return requestFile(url, options, true)
        if (refreshed === "unauthorized") handleSessionExpired()
      }
      const msg = await res.text().catch(() => "")
      throw new Error(msg || "Request failed")
    }

    return {
      blob: await res.blob(),
      fileName: getFileNameFromDisposition(res.headers.get("content-disposition")),
    }
  } catch (error) {
    if (didTimeout) {
      throw new Error(`Request timeout after ${Math.round(timeoutMs / 1000)}s`)
    }

    throw error instanceof Error ? error : new Error("Request failed")
  } finally {
    window.clearTimeout(timeout)
    externalSignal?.removeEventListener("abort", onExternalAbort)
  }
}

export function projectApiFile(path: string, options?: ApiRequestOptions): Promise<FileResponse> {
  return requestFile(projectApiUrl(path), options)
}

export function projectSseUrl(path: string) {
  return projectApiUrl(path)
}
