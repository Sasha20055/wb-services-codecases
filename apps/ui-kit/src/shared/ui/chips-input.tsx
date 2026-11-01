"use client"

import * as React from "react"
import { cn } from "../lib/cn"

type ChipsInputProps = {
  value: string[]
  onChange: (v: string[]) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  addKeys?: string[]
  separators?: string[]
  format?: (raw: string) => string | null
  dedupe?: boolean
}
export function ChipsInput({
  value,
  onChange,
  placeholder,
  disabled,
  className,
  addKeys = ["Enter", "Tab"],
  separators = [",", ";", "\n"],
  format = (s) => (s.trim() ? s.trim() : null),
  dedupe = true,
}: ChipsInputProps) {
  const [input, setInput] = React.useState("")
  const ref = React.useRef<HTMLInputElement | null>(null)

  const [activeIndex, setActiveIndex] = React.useState<number | null>(null)
  const [selectedAll, setSelectedAll] = React.useState(false)

  const focusInput = React.useCallback(() => {
    const el = ref.current
    if (!el) return
    try {
      el.focus({ preventScroll: true })
    } catch {
      el.focus()
    }
  }, [])

  const sepRe = React.useMemo(() => {
    const escaped = separators.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("")
    return new RegExp(`[${escaped}]`, "g")
  }, [separators])

  const clearSelection = React.useCallback(() => {
    setSelectedAll(false)
    setActiveIndex(null)
  }, [])

  const push = React.useCallback(
    (raws: string | string[]) => {
      const next = Array.isArray(raws) ? raws : [raws]
      const tokens = next
        .flatMap((r) => r.split(sepRe))
        .map((s) => format(s))
        .filter((s): s is string => !!s)

      if (!tokens.length) return

      const merged = dedupe ? Array.from(new Set([...value, ...tokens])) : [...value, ...tokens]
      onChange(merged)
      setInput("")
      clearSelection()
    },
    [value, onChange, sepRe, format, dedupe, clearSelection],
  )

  const removeAt = React.useCallback(
    (idx: number) => {
      if (idx < 0 || idx >= value.length) return
      const next = value.slice(0, idx).concat(value.slice(idx + 1))
      onChange(next)
      setActiveIndex((prev) => {
        if (prev == null) return null
        const after = prev > idx ? prev - 1 : prev
        return Math.min(after, next.length - 1)
      })
    },
    [value, onChange],
  )

  const removeAll = React.useCallback(() => {
    if (!value.length) return
    onChange([])
    setSelectedAll(false)
    setActiveIndex(null)
  }, [value.length, onChange])

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return

    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
      if (!value.length) return
      e.preventDefault()
      setSelectedAll(true)
      setActiveIndex(null)
      return
    }

    if (addKeys.includes(e.key) || separators.includes(e.key)) {
      e.preventDefault()
      if (input) push(input)
      return
    }

    if ((e.key === "Backspace" || e.key === "Delete") && !input) {
      e.preventDefault()

      if (selectedAll) {
        removeAll()
        return
      }

      if (activeIndex == null) {
        if (!value.length) return
        setActiveIndex(value.length - 1)
        return
      }

      removeAt(activeIndex)
      return
    }

    if (!input && value.length) {
      if (e.key === "ArrowLeft") {
        e.preventDefault()
        setSelectedAll(false)
        setActiveIndex((prev) => {
          const start = prev == null ? value.length - 1 : prev
          return Math.max(0, start - 1)
        })
        return
      }

      if (e.key === "ArrowRight") {
        e.preventDefault()
        setSelectedAll(false)
        setActiveIndex((prev) => {
          if (prev == null) return null
          const next = prev + 1
          return next >= value.length ? null : next
        })
        return
      }

      if (e.key === "Escape") {
        clearSelection()
      }
    }
  }

  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    if (disabled) return
    const t = e.clipboardData.getData("text")
    if (!t) return
    e.preventDefault()
    push(t)
  }

  return (
    <div
      className={cn(
        "flex min-h-[3rem] max-h-[300px] w-full flex-wrap items-center gap-2 overflow-auto rounded-xl2 border border-border p-2 text-sm focus-within:ring-2 focus-within:ring-ring",
        disabled && "opacity-60 cursor-not-allowed",
        className,
      )}
      onMouseDown={(e) => {
        if (disabled) return
        if (e.target === ref.current) return
        focusInput()
      }}
    >
      {value.map((tag, idx) => {
        const active = !selectedAll && activeIndex === idx
        return (
          <span
            key={tag}
            onMouseDown={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setSelectedAll(false)
              setActiveIndex(idx)
              focusInput()
            }}
            className={cn(
              "inline-flex items-center gap-2 rounded-2xl border border-border bg-surface px-3 py-1.5 text-[13px] leading-none text-muted",
              selectedAll && "ring-2 ring-ring",
              active && "ring-2 ring-ring text-foreground",
            )}
          >
            <span className="truncate">{tag}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                removeAt(idx)
              }}
              className="rounded-full px-1 text-[12px] hover:text-danger"
              aria-label="Удалить"
              disabled={disabled}
              tabIndex={-1}
            >
              x
            </button>
          </span>
        )
      })}

      <input
        autoComplete="off"
        ref={ref}
        disabled={disabled}
        value={input}
        onChange={(e) => {
          setInput(e.target.value)
          if (selectedAll || activeIndex != null) clearSelection()
        }}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onBlur={() => {
          if (input) push(input)
          clearSelection()
        }}
        placeholder={value.length ? "" : placeholder}
        className={cn(
          "min-w-[8rem] flex-1 cursor-pointer border-0 bg-transparent py-1 outline-none placeholder:text-muted focus:border-transparent focus:outline-none focus:ring-0 focus:shadow-none focus-visible:outline-none",
        )}
      />
    </div>
  )
}

export default ChipsInput
