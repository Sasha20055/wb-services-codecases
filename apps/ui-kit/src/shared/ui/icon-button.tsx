import * as React from "react"
import { cn } from "../lib/cn"
import type { IconButtonProps } from "../model/types"

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, variant = "ghost", size = "sm", ...props }, ref) => {
    const sizes = {
      xs: "h-7 w-7 text-[12px]",
      sm: "h-8 w-8 text-[13px]",
      md: "h-10 w-10 text-[14px]",
    }[size]
    const variants = {
      solid: "bg-surface hover:bg-panel text-text border border-border shadow-glow",
      ghost: "hover:bg-surface text-text border border-transparent",
    }[variant]
    return (
      <button
        ref={ref}
        className={cn(
          "inline-grid place-items-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          sizes,
          variants,
          className,
        )}
        {...props}
      />
    )
  },
)

export default IconButton
