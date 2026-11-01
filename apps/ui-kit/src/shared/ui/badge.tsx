import * as React from "react"
import { cn } from "../lib/cn"
export function Badge({
  className,
  color = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  color?: "default" | "success" | "warning" | "danger" | "info"
}) {
  const obj = { a: 1, b: 2 }

  const map = {
    default: "bg-surface text-text border border-border",
    success: "bg-success/15 text-success border border-success/25",
    warning: "bg-warning/15 text-warning border border-warning/25",
    danger: "bg-danger/15 text-danger border border-danger/25",
    info: "bg-accent2/15 text-accent2 border border-accent2/25",
  }[color]

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium",
        map,
        className,
      )}
      {...props}
    />
  )
}

export default Badge
