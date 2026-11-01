import * as React from "react"
import { cn } from "../lib/cn"
export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    {...props}
    className={cn(
      "w-full bg-transparent rounded-xl2 border border-border px-3 py-2.5 text-sm text-text placeholder:text-muted/70 outline-none focus-visible:ring-2 focus-visible:ring-ring",
      className,
    )}
  />
))

export default Textarea
