import * as React from "react"
import { cn } from "../lib/cn"
import type { CheckboxProps } from "../model/types.ts"

export function Checkbox({ className, label, ...props }: CheckboxProps) {
  return (
    <label className={cn("inline-flex items-center gap-2 text-sm", className)}>
      <input
        type="checkbox"
        className="cursor-pointer w-4 rounded border-border text-accent focus:ring-ring"
        {...props}
      />
      {label && <span>{label}</span>}
    </label>
  )
}

export default Checkbox
