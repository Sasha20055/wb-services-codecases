import * as React from "react"

type AuthContextValue = {
  user: any | null
  logout: () => Promise<void>
  isLoading: boolean
}

const AUTH_CTX_KEY = "__AUTH_CONTEXT__"

function getAuthContext(): React.Context<AuthContextValue | null> {
  const ctx = (window as any)[AUTH_CTX_KEY]
  if (!ctx) throw new Error("AuthContext не найден — shell не инициализировал контекст авторизации")
  return ctx
}

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(getAuthContext())
  if (!ctx) throw new Error("useAuth: AuthProvider не найден выше в дереве компонентов")
  return ctx
}
