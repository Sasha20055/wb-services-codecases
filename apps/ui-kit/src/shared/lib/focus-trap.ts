"use client"
import { useEffect, useRef } from "react"
export function useFocusTrap(enabled: boolean) {
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!enabled || !ref.current) return
    const root = ref.current
    const focusable = () =>
      Array.from(
        root.querySelectorAll<HTMLElement>(
          'a, button, input, textarea, select, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute("disabled"))
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return
      const nodes = focusable()
      if (nodes.length === 0) return
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      const active = document.activeElement as HTMLElement | null
      if (e.shiftKey && active === first) {
        last.focus()
        e.preventDefault()
      } else if (!e.shiftKey && active === last) {
        first.focus()
        e.preventDefault()
      }
    }
    document.addEventListener("keydown", onKey)
    const prev = document.activeElement as HTMLElement | null
    ;(focusable()[0] ?? root).focus()
    return () => {
      document.removeEventListener("keydown", onKey)
      prev?.focus()
    }
  }, [enabled])
  return ref
}
