import * as React from "react"
import { cn } from "../lib/cn"
import type { ChipProps } from "../model/types.ts"

export function Chip({ className, onRemove, children, ...props }: ChipProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-[12px]",
        className,
      )}
      {...props}
    >
      <span>{children}</span>
      {onRemove && (
        <button aria-label="remove" className="rounded-full p-1 hover:bg-panel" onClick={onRemove}>
          ✕
        </button>
      )}
    </div>
  )
}

export default Chip
