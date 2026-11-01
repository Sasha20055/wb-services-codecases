import * as React from "react"
import { cn } from "../lib/cn"
export function Tooltip({
  content,
  children,
  className,
}: {
  content: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  const [open, setOpen] = React.useState(false)
  return (
    <span
      className="relative inline-block"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <span tabIndex={0}>{children}</span>
      {open && (
        <span
          role="tooltip"
          className={cn(
            "absolute z-50 -translate-y-2 translate-x-0 whitespace-nowrap rounded-md bg-panel px-2 py-1 text-[12px] text-text shadow-md border border-border",
            className,
          )}
        >
          {content}
        </span>
      )}
    </span>
  )
}

export default Tooltip
