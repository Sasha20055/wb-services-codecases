import { cn } from "../lib/cn.ts"

export function Switch({
  checked,
  onChange,
  label,
  tip,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  tip?: string
}) {
  return (
    <button
      data-tip={tip?.toString()}
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        "tt inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition-colors",
        checked ? "bg-accent text-white" : "bg-surface text-muted border border-border",
      )}
    >
      <span className={cn("h-2.5 w-2.5 rounded-full", checked ? "bg-white" : "bg-muted")} />
      {label}
    </button>
  )
}
