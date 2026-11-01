import * as React from "react"
import { cn } from "../lib/cn"
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "p-0 glass rounded-xl2 border border-border/60 shadow-glow relative z-0 group overflow-visible focus-within:z-40",
        className,
      )}
      {...props}
    />
  )
}
export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 pt-4", className)} {...props} />
}
export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 py-4 max-md:p-2", className)} {...props} />
}

export default Card
