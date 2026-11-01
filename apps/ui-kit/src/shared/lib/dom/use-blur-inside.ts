import * as React from "react"

export function useBlurInside() {
  const ref = React.useRef<HTMLElement | null>(null)
  const blur = React.useCallback(() => {
    const active = document.activeElement as HTMLElement | null
    if (active && ref.current?.contains(active)) active.blur()
  }, [])
  return { ref, blur }
}
