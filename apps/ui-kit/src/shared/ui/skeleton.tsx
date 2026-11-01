import * as React from "react"
import { cn } from "../lib/cn"

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn("animate-pulse-dark rounded-md bg-gray-50 dark:bg-gray-10", className)} />
  )
}

export default Skeleton
