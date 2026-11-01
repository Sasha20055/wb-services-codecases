"use client"
import * as React from "react"
import { cn } from "../lib/cn"
import type { ButtonProps } from "../model/types.ts"

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant = "primary",
    size = "md",
    loading,
    leftIcon,
    rightIcon,
    children,
    disabled,
    ...props
  },
  ref,
) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl2 font-medium transition active:scale-[.98] focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"

  const sizes = {
    sm: "h-8 px-3 text-[10px] md:text-sm",
    md: "h-10 px-4 text-[15px]",
    input: "h-8 px-4 text-[10px] md:text-sm",
    lg: "h-12 px-6 text-base",
  }[size]

  const variants = {
    primary:
      "bg-gradient-to-r from-accent to-accent2 text-white shadow-glow hover:opacity-95 focus-visible:ring-2 focus-visible:ring-ring",
    secondary: "bg-surface text-text border border-border hover:bg-panel/80",
    ghost: "bg-transparent text-text hover:bg-surface",
    success:
      "bg-success/90 text-white hover:bg-success focus-visible:ring-2 focus-visible:ring-success/60",
    danger:
      "bg-danger/90 text-white hover:bg-danger focus-visible:ring-2 focus-visible:ring-danger/60",
  }[variant]

  return (
    <button
      ref={ref}
      type={props.type ?? "button"}
      className={cn(base, sizes, variants, className)}
      disabled={disabled || loading}
      {...props}
    >
      {leftIcon && <span className="inline-flex">{leftIcon}</span>}

      <span className="inline-flex items-center">{children}</span>

      {loading ? (
        <span
          aria-hidden
          className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
        />
      ) : (
        rightIcon && <span className="inline-flex">{rightIcon}</span>
      )}
    </button>
  )
})

export default Button
