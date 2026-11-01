"use client"

import * as React from "react"
import { cn } from "../lib/cn"
import type { ComboBoxProps } from "../model/types"

function getMatchScore(option: { label: string; value: string }, query: string) {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return 0

  const label = option.label.toLowerCase()
  const value = option.value.toLowerCase()

  if (label === normalizedQuery || value === normalizedQuery) return 0
  if (label.startsWith(normalizedQuery) || value.startsWith(normalizedQuery)) return 1
  if (label.includes(normalizedQuery) || value.includes(normalizedQuery)) return 2
  return -1
}

export function ComboBox({
  label,
  error,
  options = [],
  value = null,
  onChange,
  placeholder = "Выберите…",
  disabled,
  className,
  maxVisible = 50,
}: ComboBoxProps) {
  const inputId = React.useId()
  const rootRef = React.useRef<HTMLDivElement | null>(null)
  const listRef = React.useRef<HTMLDivElement | null>(null)
  const inputRef = React.useRef<HTMLInputElement | null>(null)

  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [highlight, setHighlight] = React.useState(0)
  const [visible, setVisible] = React.useState(maxVisible)
  const [dropUp, setDropUp] = React.useState(false)
  const [maxH, setMaxH] = React.useState(256)
  const [selectedValueAtOpen, setSelectedValueAtOpen] = React.useState(value)

  const selected = React.useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value],
  )

  const pinnedSelectedValue = open ? selectedValueAtOpen : value

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    const rankedOptions = options
      .map((option, index) => ({
        option,
        index,
        matchScore: getMatchScore(option, q),
        isSelected: option.value === pinnedSelectedValue,
      }))
      .filter(({ matchScore }) => !q || matchScore >= 0)
      .sort((left, right) => {
        if (left.isSelected !== right.isSelected) return left.isSelected ? -1 : 1
        if (left.matchScore !== right.matchScore) return left.matchScore - right.matchScore
        return left.index - right.index
      })

    return rankedOptions.map(({ option }) => option)
  }, [options, pinnedSelectedValue, query])

  const slice = React.useMemo(
    () => filtered.slice(0, Math.max(maxVisible, visible)),
    [filtered, visible, maxVisible],
  )

  const computePlacement = React.useCallback(() => {
    const el = rootRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const gap = 8
    const below = window.innerHeight - r.bottom - gap
    const above = r.top - gap
    const preferDown = below >= 180 || below >= above
    setDropUp(!preferDown)
    setMaxH(Math.max(120, Math.min(256, preferDown ? below : above)))
  }, [])

  const openDropdown = React.useCallback(() => {
    if (disabled) return
    setSelectedValueAtOpen(value)
    setOpen(true)
    requestAnimationFrame(() => {
      computePlacement()
      inputRef.current?.focus()
    })
  }, [disabled, computePlacement, value])

  const closeDropdown = React.useCallback(() => {
    setOpen(false)
    setQuery("")
    setHighlight(0)
    setVisible(maxVisible)
  }, [maxVisible])

  React.useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current) return
      if (!rootRef.current.contains(e.target as Node)) closeDropdown()
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [closeDropdown])

  const onListScroll = React.useCallback(() => {
    const el = listRef.current
    if (!el) return
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 32
    if (nearBottom && slice.length < filtered.length) setVisible((v) => v + maxVisible)
  }, [slice.length, filtered.length, maxVisible])

  const ensureItemVisible = (index: number) => {
    const el = listRef.current
    if (!el) return
    if (index >= slice.length) {
      setVisible((v) => Math.max(v, index + 1))
      return
    }
    const row = el.querySelector<HTMLElement>(`[data-index="${index}"]`)
    if (!row) return
    const rowTop = row.offsetTop
    const rowBottom = rowTop + row.offsetHeight
    const viewTop = el.scrollTop
    const viewBottom = viewTop + el.clientHeight
    if (rowTop < viewTop) el.scrollTop = rowTop
    else if (rowBottom > viewBottom) el.scrollTop = rowBottom - el.clientHeight
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) return
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setHighlight((h) => Math.min(h + 1, filtered.length - 1))
      ensureItemVisible(Math.min(highlight + 1, filtered.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
      ensureItemVisible(Math.max(highlight - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      const opt = filtered[highlight]
      if (opt) {
        onChange?.(opt.value, opt)
        closeDropdown()
      }
    } else if (e.key === "Escape") {
      e.preventDefault()
      closeDropdown()
    }
  }

  const clearSelection = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange?.(null, null)
    setQuery("")
    setHighlight(0)
    setVisible(maxVisible)
    setOpen(true)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  return (
    <div className="block text-[10px] md:text-sm">
      {label && (
        <label htmlFor={inputId} className="mb-1 block text-muted">
          {label}
        </label>
      )}

      <div
        ref={rootRef}
        className={cn(
          "relative isolate flex items-center gap-2 rounded-xl2 border  border-border px-3",
          "focus-within:ring-2 focus-within:ring-ring",
          disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer",
          open && "z-[350]",
          className,
        )}
        onMouseDown={() => {
          if (!open && !disabled) openDropdown()
        }}
      >
        <input
          autoComplete="off"
          id={inputId}
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls="combobox-listbox"
          disabled={disabled}
          value={open ? query : (selected?.label ?? "")}
          onChange={(e) => {
            setQuery(e.target.value)
            setHighlight(0)
            setVisible(maxVisible)
            if (!open) {
              setSelectedValueAtOpen(value)
              setOpen(true)
            }
          }}
          onKeyDown={onKeyDown}
          placeholder={selected ? undefined : placeholder}
          className={cn(
            "min-w-0 flex-1 bg-transparent text-[10px] text-text border-0 outline-none ring-0 appearance-none py-[5px] md:text-sm",
            "focus:outline-none focus:ring-0 focus:border-transparent cursor-pointer focus:shadow-none focus-visible:outline-none",
            !open && !selected && "text-muted",
          )}
        />

        {selected && !disabled && (
          <button
            type="button"
            aria-label="Очистить"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={clearSelection}
            className="rounded p-1 hover:bg-surface cursor-pointer"
          >
            ✕
          </button>
        )}

        <span aria-hidden className="pointer-events-none text-muted">
          ▾
        </span>

        {open && (
          <div
            className={cn(
              "absolute left-0 right-0 rounded-xl2 border border-border bg-panel shadow-glow",
              dropUp ? "bottom-full mb-2" : "top-full mt-2",
              "z-[350]",
            )}
            style={{ maxHeight: maxH }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div
              id="combobox-listbox"
              ref={listRef}
              onScroll={onListScroll}
              className="overflow-auto py-1"
              role="listbox"
              style={{ maxHeight: maxH }}
            >
              {filtered.length === 0 && (
                <div className="px-3 py-2 text-[10px] text-muted md:text-sm">Ничего не найдено</div>
              )}
              {slice.map((opt, i) => {
                const idx = i
                const isActive = filtered[highlight]?.value === opt.value
                const isSelected = selected?.value === opt.value
                return (
                  <div
                    key={opt.value}
                    data-index={idx}
                    role="option"
                    aria-selected={isSelected}
                    className={cn(
                      "flex items-center justify-between px-3 py-2 text-[10px] cursor-pointer select-none md:text-sm",
                      isActive ? "bg-surface text-text" : "hover:bg-surface/70",
                    )}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      onChange?.(opt.value, opt)
                      closeDropdown()
                    }}
                    onMouseEnter={() =>
                      setHighlight(filtered.findIndex((o) => o.value === opt.value))
                    }
                  >
                    <span className="truncate">{opt.label}</span>
                    {isSelected && <span className="text-accent">●</span>}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {error && <div className="mt-1 text-[12px] text-danger">{error}</div>}
    </div>
  )
}

export default ComboBox
