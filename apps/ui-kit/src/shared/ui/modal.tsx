"use client"
import { useEffect } from "react"
import { cn } from "../lib/cn"
import { useFocusTrap } from "../lib/focus-trap"
import { Portal } from "../lib/portal"
import type { ModalProps } from "../model/types"

export function Modal({ open, onClose, title, children, footer }: ModalProps) {
  const trapRef = useFocusTrap(open)

  useEffect(() => {
    if (!open) return
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    document.addEventListener("keydown", onEsc)
    return () => document.removeEventListener("keydown", onEsc)
  }, [open, onClose])

  if (!open) return null

  return (
    <Portal>
      <div aria-modal className="fixed inset-0 z-[100] grid place-items-center">
        <div
          className="absolute inset-0 bg-black/60 opacity-0 animate-fadeIn dark:bg-black/70"
          onClick={onClose}
        />
        <div
          ref={trapRef}
          style={{
            backgroundColor: "var(--color-panel)",
            borderColor: "var(--color-border)",
          }}
          className={cn(
            "relative z-[101] w-full max-w-lg rounded-xl2 shadow-glow outline-none animate-scaleIn",
          )}
        >
          <div
            style={{
              borderColor: "var(--color-border)",
              color: "var(--color-text)",
            }}
            className="flex items-center justify-between border-b px-5 py-3"
          >
            <div className="text-[15px] font-semibold">{title}</div>
            <button
              style={{
                color: "var(--color-text)",
              }}
              className="rounded p-1 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              onClick={onClose}
              aria-label="close"
            >
              ✕
            </button>
          </div>
          <div style={{ color: "var(--color-text)" }} className="px-5 py-4">
            {children}
          </div>
          {footer && (
            <div
              style={{
                borderColor: "var(--color-border)",
                color: "var(--color-text)",
              }}
              className="border-t px-5 py-3"
            >
              {footer}
            </div>
          )}
        </div>
      </div>
    </Portal>
  )
}

export default Modal
