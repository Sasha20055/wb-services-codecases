export type RefreshResult = "ok" | "unauthorized" | "failed"

let refreshPromise: Promise<RefreshResult> | null = null

async function requestTokenRefresh(): Promise<RefreshResult> {
  try {
    const res = await fetch("/api/main/auth/refresh", {
      credentials: "include",

      headers: { "X-Requested-With": "XMLHttpRequest" },
    })
    if (res.ok) return "ok"

    return res.status === 401 ? "unauthorized" : "failed"
  } catch {
    return "failed"
  }
}

export function refreshAuthSession(): Promise<RefreshResult> {
  if (!refreshPromise) {
    refreshPromise = requestTokenRefresh().finally(() => {
      refreshPromise = null
    })
  }
  return refreshPromise
}

let didRedirectToLogin = false

export function handleSessionExpired() {
  if (didRedirectToLogin || window.location.pathname === "/login") return
  didRedirectToLogin = true
  window.location.replace("/login")
}

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, { credentials: "include", ...init })
  if (res.status !== 401) return res

  const refreshed = await refreshAuthSession()
  if (refreshed === "ok") {
    return fetch(input, { credentials: "include", ...init })
  }
  if (refreshed === "unauthorized") {
    handleSessionExpired()
  }
  return res
}
