"use client"
import * as React from "react"
import type { ChipColor } from "../model/types.ts"
import { cn } from "../lib/cn.ts"

export function Chip({
  pressed,
  label,
  color = "primary",
  onClick,
  deletable = false,
  onDelete,
  className,
  variant,
  tip,
}: {
  pressed?: boolean
  label: React.ReactNode
  color?: ChipColor
  onClick?: () => void
  variant?: string
  deletable?: boolean
  onDelete?: () => void
  tip?: string
  className?: string
}) {
  const palette =
    color === "danger"
      ? pressed
        ? "bg-red-600 text-white shadow-sm dark:bg-red-700"
        : "border border-red-300 text-red-700 dark:border-red-600 dark:text-red-300 dark:bg-red-900/30"
      : color === "neutral"
        ? pressed
          ? "bg-violet-600 text-white shadow-sm dark:bg-violet-700"
          : "border border-violet-300 text-violet-700 dark:border-violet-600 dark:text-violet-300 dark:bg-violet-900/30"
        : pressed
          ? "bg-violet-600 text-white shadow-sm dark:bg-violet-700"
          : "border border-violet-300 text-violet-700 dark:border-violet-600 dark:text-violet-300 dark:bg-violet-900/30"

  return (
    <button
      data-tip={tip?.toString()}
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "tt group inline-flex items-center gap-1 rounded-2xl px-3 py-1.5 text-sm leading-none transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-violet-500 dark:focus:ring-violet-400",
        palette,
        className,
      )}
    >
      <span className="truncate">{label}</span>
      {deletable && (
        <span
          onClick={(e) => {
            e.stopPropagation()
            onDelete?.()
          }}
          className="grid h-4 w-4 place-items-center rounded-full text-[10px] leading-none hover:bg-black/10 dark:hover:bg-white/10"
          aria-hidden="true"
        >
          ✕
        </span>
      )}
    </button>
  )
}

export default Chip
