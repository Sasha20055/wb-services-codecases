import * as React from "react"
import { Portal } from "../lib/portal"
import { useFocusTrap } from "../lib/focus-trap"
import { cn } from "../lib/cn"

export function Drawer({
  open,
  onClose,
  side = "right",
  children,
}: {
  open: boolean
  onClose: () => void
  side?: "left" | "right"
  children: React.ReactNode
}) {
  const trapRef = useFocusTrap(open)
  if (!open) return null

  const pos = side === "right" ? "right-0" : "left-0"
  const anim = side === "right" ? "animate-slideInRight" : "animate-slideInLeft"

  return (
    <Portal>
      <div className="fixed inset-0 z-[100]">
        <div className="absolute inset-0 bg-black/60 opacity-0 animate-fadeIn" onClick={onClose} />
        <aside
          ref={trapRef}
          className={cn(
            `glass absolute top-0 ${pos} h-full w-[360px] border border-border shadow-glow p-5 ${anim}`,
          )}
        >
          {children}
        </aside>
      </div>
    </Portal>
  )
}

export default Drawer
