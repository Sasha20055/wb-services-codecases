// @ts-nocheck

import * as React from "react"
import { cn } from "../lib/cn"
import type { InputProps } from "../model/types"

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, leftIcon, rightIcon, error, classNameTree, ...props }, ref) => (
    <div className={cn("group relative", classNameTree)}>
      {leftIcon && (
        <span className="pointer-events-none  absolute left-3 top-1/2 -translate-y-1/2 text-muted">
          {leftIcon}
        </span>
      )}
      <input
        ref={ref}
        {...props}
        autoComplete="off"
        className={cn(
          "bg-transparent w-full rounded-xl2 border border-border px-3 py-[5px] text-[10px] text-text placeholder:text-muted/70 outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm",
          leftIcon && "pl-9",
          rightIcon && "pr-9",
          error && "border-danger/60",
          className,
        )}
      />
      {rightIcon && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted">{rightIcon}</span>
      )}
      {error && (
        <div role="alert" className="mt-1 text-[12px] text-danger">
          {error}
        </div>
      )}
    </div>
  ),
)

export default Input
