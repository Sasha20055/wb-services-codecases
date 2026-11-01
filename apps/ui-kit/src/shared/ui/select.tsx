import { cn } from "../lib/cn"
import type { SelectProps } from "../model/types"

export function Select({ className, label, error, children, ...props }: SelectProps) {
  return (
    <label className="block text-sm">
      {label && <span className="mb-1 block text-muted">{label}</span>}
      <div className="relative">
        <select
          {...props}
          className={cn(
            "bg-transparent     w-full appearance-none rounded-xl2 border border-border px-3 py-[5px] pr-9 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer",
            error && "border-danger/60",
            className,
          )}
        >
          {children}
        </select>
      </div>
      {error && <div className="mt-1 text-[12px] text-danger">{error}</div>}
    </label>
  )
}

export default Select
