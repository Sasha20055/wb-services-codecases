import * as React from "react"
import { cn } from "../lib/cn"

export function Pagination({
  page,
  pageSize,
  total,
  onChange,
}: {
  page: number
  pageSize: number
  total: number
  onChange: (page: number) => void
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const go = (p: number) => onChange(Math.min(pages, Math.max(1, p)))

  const Item = ({ p }: { p: number }) => {
    const isActive = p === page
    return (
      <button
        type="button"
        aria-current={isActive ? "page" : undefined}
        onClick={() => go(p)}
        className={cn(
          "h-9 min-w-9 rounded-md px-3 text-[10px] outline-none transition-colors md:text-sm",
          isActive
            ? "bg-accent text-white font-semibold shadow-glow ring-1 ring-ring"
            : "bg-surface border border-border text-muted hover:text-text hover:bg-panel",
        )}
      >
        {p}
      </button>
    )
  }

  const range = React.useMemo(() => {
    if (pages <= 4) {
      return Array.from({ length: pages }, (_, i) => i + 1)
    }

    const result: number[] = []

    result.push(1)

    let start = Math.max(2, page - 1)
    let end = Math.min(pages - 1, page + 1)

    if (page <= 2) {
      start = 2
      end = 3
    } else if (page >= pages - 1) {
      start = pages - 2
      end = pages - 1
    }

    if (start > 2) {
      result.push(-1)
    }

    for (let i = start; i <= end; i++) {
      result.push(i)
    }

    if (end < pages - 1) {
      result.push(-1)
    }

    if (pages > 1) {
      result.push(pages)
    }

    return result
  }, [page, pages])

  const navBtnBase =
    "h-9 rounded-md border border-border bg-surface px-2 text-[10px] transition-colors hover:bg-panel hover:text-text disabled:opacity-50 disabled:cursor-not-allowed md:text-sm"

  return (
    <div className="flex items-center gap-2">
      <div className="items-center gap-2 flex">
        <button
          className={navBtnBase}
          onClick={() => go(page - 1)}
          disabled={page <= 1}
          aria-label="Предыдущая страница"
        >
          ←
        </button>
        <div className="flex items-center gap-2">
          {range.map((p) => p !== -1 && <Item key={p} p={p} />)}
        </div>
        <button
          className={navBtnBase}
          onClick={() => go(page + 1)}
          disabled={page >= pages}
          aria-label="Следующая страница"
        >
          →
        </button>
      </div>
    </div>
  )
}

export default Pagination
