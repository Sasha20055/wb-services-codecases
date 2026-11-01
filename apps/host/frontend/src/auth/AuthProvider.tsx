import * as React from "react"
import { refreshAuthSession } from "../lib/api"

export type ClientSummary = {
  _id: string
  name: string
  role: string
  isFounder: boolean
}

export type AuthUser = {
  _id: string
  externalId: string
  telegramId?: string
  name?: string
  photoUrl?: string
  email?: string
  clients?: ClientSummary[]
  activeClient?: ClientSummary | null
  canCreateClient?: boolean
  hasBotSubscription?: boolean
  botSubscriptionStatus?: string
  botSubscriptionMessage?: string
}

export type AuthContextValue = {
  user: AuthUser | null
  activeClient: ClientSummary | null
  setActiveClient: (clientId: string | null) => Promise<void>
  logout: () => Promise<void>
  reauthorize: () => Promise<void>
  isLoading: boolean
}

const AUTH_CTX_KEY = "__AUTH_CONTEXT__"
const ACTIVE_CLIENT_STORAGE_KEY = "host-active-client-id"

const AuthContext: React.Context<AuthContextValue | null> =
  (window as any)[AUTH_CTX_KEY] ??
  ((window as any)[AUTH_CTX_KEY] = React.createContext<AuthContextValue | null>(null))

export function useAuth() {
  const ctx = React.useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}

async function fetchMe(): Promise<any | null> {
  const activeClientId = window.localStorage.getItem(ACTIVE_CLIENT_STORAGE_KEY)
  const headers = new Headers()
  if (activeClientId) {
    headers.set("X-Client-Id", activeClientId)
  }

  let res = await fetch("/api/main/auth/me", { credentials: "include", headers })

  if (res.status === 401) {

    const refreshed = await refreshAuthSession()
    if (refreshed !== "ok") return null
    res = await fetch("/api/main/auth/me", { credentials: "include", headers })
  }

  if (!res.ok) return null
  return res.json()
}

export function AuthProvider({
  children,
  requireAuth = true,
}: {
  children: React.ReactNode
  requireAuth?: boolean
}) {
  const [user, setUser] = React.useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [hasError, setHasError] = React.useState(false)
  const pathname = usePathname()
  const isLoginRoute = pathname === "/login"

  const load = React.useCallback(async () => {
    setHasError(false)
    setIsLoading(true)
    try {
      const data = await fetchMe()
      if (!data?.ok) {
        setUser(null)
        window.localStorage.removeItem(ACTIVE_CLIENT_STORAGE_KEY)
      } else {
        const nextUser = (data.user ?? null) as AuthUser | null
        if (nextUser?.activeClient?._id) {
          window.localStorage.setItem(ACTIVE_CLIENT_STORAGE_KEY, nextUser.activeClient._id)
        } else {
          window.localStorage.removeItem(ACTIVE_CLIENT_STORAGE_KEY)
        }
        setUser(nextUser)
      }
    } catch {
      setHasError(true)
    } finally {
      setIsLoading(false)
    }
  }, [])

  React.useEffect(() => {
    if (isLoginRoute) {
      setIsLoading(false)
      return
    }
    let active = true
    load().catch(() => {
      if (active) setHasError(true)
    })
    return () => {
      active = false
    }
  }, [load, isLoginRoute])

  const logout = React.useCallback(async () => {
    await fetch("/api/main/auth/logout", {
      method: "POST",
      credentials: "include",
    })
    window.localStorage.removeItem(ACTIVE_CLIENT_STORAGE_KEY)
    await load()
  }, [load])

  const setActiveClient = React.useCallback(async (clientId: string | null) => {
    if (clientId) {
      window.localStorage.setItem(ACTIVE_CLIENT_STORAGE_KEY, clientId)
    } else {
      window.localStorage.removeItem(ACTIVE_CLIENT_STORAGE_KEY)
    }

    window.location.reload()
  }, [])

  const reauthorize = React.useCallback(async () => {
    try {
      await fetch("/api/main/auth/logout", {
        method: "POST",
        credentials: "include",
      })
    } finally {
      window.location.assign("/api/main/auth/start")
    }
  }, [])

  if (!isLoading && hasError) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <h2 style={{ margin: 0 }}>Ошибка авторизации</h2>
          <p style={{ marginTop: 8, color: "#6b7280" }}>Попробуйте перезагрузить страницу.</p>
        </div>
      </div>
    )
  }

  if (!isLoading && !user && !isLoginRoute && requireAuth) {
    return <RedirectToLogin />
  }

  return (
    <AuthContext.Provider value={{ user, activeClient: user?.activeClient ?? null, setActiveClient, logout, reauthorize, isLoading }}>
      {isLoading ? null : children}
    </AuthContext.Provider>
  )
}

function RedirectToLogin() {
  React.useEffect(() => {
    window.location.replace("/login")
  }, [])

  return null
}

function usePathname() {
  const [pathname, setPathname] = React.useState(() => window.location.pathname)

  React.useEffect(() => {
    const onChange = () => setPathname(window.location.pathname)
    window.addEventListener("popstate", onChange)
    window.addEventListener("auth:navigate", onChange)

    const { pushState, replaceState } = window.history
    window.history.pushState = function (...args) {
      const ret = pushState.apply(this, args as any)
      window.dispatchEvent(new Event("auth:navigate"))
      return ret
    }
    window.history.replaceState = function (...args) {
      const ret = replaceState.apply(this, args as any)
      window.dispatchEvent(new Event("auth:navigate"))
      return ret
    }

    return () => {
      window.removeEventListener("popstate", onChange)
      window.removeEventListener("auth:navigate", onChange)
      window.history.pushState = pushState
      window.history.replaceState = replaceState
    }
  }, [])

  return pathname
}
