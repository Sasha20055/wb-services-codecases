import * as React from "react"
import { useEffect, useState } from "react"

const AUTH_CTX_KEY = "__AUTH_CONTEXT__"

const AuthContext: React.Context<any> =
  (window as any)[AUTH_CTX_KEY] ?? ((window as any)[AUTH_CTX_KEY] = React.createContext<any>(null))

export function StandaloneAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetch("/api/main/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setUser(data))
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false))
  }, [])

  const logout = async () => {
    await fetch("/api/main/auth/logout", {
      method: "POST",
      credentials: "include",
    })
    window.location.href = "/"
  }

  return (
    <AuthContext.Provider value={{ user, logout, isLoading }}>
      {isLoading ? null : children}
    </AuthContext.Provider>
  )
}
