import * as React from "react"
import { cn } from "../lib/cn"
import type { SwitchProps } from "../model/types"

export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ className, checked, onChange, ...props }, ref) => (
    <button
      ref={ref}
      role="switch"
      aria-checked={checked}
      onClick={() => onChange?.(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 items-center rounded-full border transition",
        checked ? "bg-accent/80 border-accent" : "bg-accent/15 border-accent/10",
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          "absolute left-0.5 inline-block h-5 w-5 transform rounded-full bg-white transition will-change-transform",
          checked ? "translate-x-5" : "translate-x-0",
        )}
      />
    </button>
  ),
)

export default Switch
