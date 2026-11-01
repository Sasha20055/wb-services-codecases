"use client"
import * as React from "react"
import { createPortal } from "react-dom"
import { useEffect } from "react"
export function Portal({ children }: { children: React.ReactNode }) {
  const [el] = React.useState(() => document.createElement("div"))
  useEffect(() => {
    document.body.appendChild(el)
    return () => {
      document.body.removeChild(el)
    }
  }, [el])
  return createPortal(children, el)
}
