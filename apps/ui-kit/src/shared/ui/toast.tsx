import * as React from "react"
import { Portal } from "../lib/portal"
import { cn } from "../lib/cn"

type Toast = {
  id: string
  title?: string
  description?: string
  variant?: "default" | "danger" | "success"
}
const Ctx = React.createContext<{
  toasts: Toast[]
  show: (t: Omit<Toast, "id"> & { id?: string; timeout?: number }) => void
  remove: (id: string) => void
} | null>(null)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([])
  const remove = React.useCallback(
    (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id)),
    [],
  )
  const show = React.useCallback(
    ({
      id = crypto.randomUUID(),
      timeout = 3500,
      ...t
    }: Omit<Toast, "id"> & { id?: string; timeout?: number }) => {
      setToasts((prev) => [...prev, { id, ...t }])
      if (timeout) setTimeout(() => remove(id), timeout)
    },
    [remove],
  )
  return (
    <Ctx.Provider value={{ toasts, show, remove }}>
      {children}
      <Portal>
        <div className="pointer-events-none fixed inset-0 z-[200] flex flex-col items-end gap-2 p-4">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={cn(
                "pointer-events-auto glass w-full max-w-sm rounded-xl2 border p-4 shadow-glow",
                t.variant === "danger"
                  ? "border-danger/40"
                  : t.variant === "success"
                    ? "border-success/40"
                    : "border-border",
              )}
              onClick={() => remove(t.id)}
            >
              {t.title && <div className="mb-1 font-semibold">{t.title}</div>}
              {t.description && <div className="text-sm text-muted">{t.description}</div>}
            </div>
          ))}
        </div>
      </Portal>
    </Ctx.Provider>
  )
}
export function useToast() {
  const ctx = React.useContext(Ctx)
  if (!ctx) throw new Error("useToast must be used within ToastProvider")
  return ctx
}

export default ToastProvider
