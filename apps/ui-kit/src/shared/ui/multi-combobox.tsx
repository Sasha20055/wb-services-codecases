"use client"
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { cn } from "../lib/cn"
import type { MultiComboBoxProps } from "../model/types"
import { Checkbox } from "./checkbox"

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

interface ExtendedMultiComboBoxProps extends MultiComboBoxProps {
  mode?: "include" | "exclude"
  onModeChange?: (mode: "include" | "exclude") => void
  individualModes?: boolean
  modes?: Record<string, "include" | "exclude">
  onModesChange?: (modes: Record<string, "include" | "exclude">) => void

  menuInBody?: boolean

  size?: "md" | "sm"
}

export function MultiComboBox({
  label,
  error,
  options = [],
  value = [],
  onChange,
  placeholder = "Выберите…",
  disabled,
  className,
  maxVisible = 50,
  mode = "include",
  onModeChange,
  individualModes = false,
  modes = {},
  onModesChange,
  lazy = false,
  loadOptions,
  commitOnClose = false,
  menuInBody = false,
  size = "md",
}: ExtendedMultiComboBoxProps) {
  const [isMounted, setIsMounted] = useState(false)

  const isSm = size === "sm"
  const rootSizeClasses = isSm ? "px-2 py-0.5 min-h-0" : "px-3 py-[5px] min-h-[34px]"
  const chipSizeClasses = isSm ? "px-1.5 py-0 text-[11px] leading-4" : "px-2 py-1 text-xs"

  useEffect(() => {
    setIsMounted(true)
  }, [])

  const inputId = React.useId()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const valueContainerRef = useRef<HTMLDivElement | null>(null)
  const measureRef = useRef<HTMLDivElement | null>(null)

  const menuRef = useRef<HTMLDivElement | null>(null)

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [highlight, setHighlight] = useState(0)
  const [visible, setVisible] = useState(maxVisible)
  const [dropUp, setDropUp] = useState(false)
  const [maxH, setMaxH] = useState(256)

  const [menuPos, setMenuPos] = useState<{ left: number; top: number; width: number } | null>(null)

  const [internalOptions, setInternalOptions] = useState(options)
  const [loading, setLoading] = useState(false)
  const [loadedOnce, setLoadedOnce] = useState(false)
  const [visibleChipCount, setVisibleChipCount] = useState(value.length)
  const [selectedValuesAtOpen, setSelectedValuesAtOpen] = useState<string[]>(value)

  const [draft, setDraft] = useState<string[]>(value)

  useEffect(() => {
    setDraft(value)
  }, [value])
  const effectiveValue = commitOnClose && open ? draft : value
  const applyChange = useCallback(
    (newValue: string[], newSelected: { value: string; label: string }[]) => {

      if (commitOnClose && open) setDraft(newValue)
      else onChange?.(newValue, newSelected)
    },
    [commitOnClose, open, onChange],
  )

  useEffect(() => {
    if (!lazy) {
      setInternalOptions(options)
    }
  }, [options, lazy])

  const selected = useMemo(() => {
    if (internalOptions.length === 0) {
      return effectiveValue.map((v) => ({ label: v, value: v }))
    }
    return internalOptions.filter((o) => effectiveValue && effectiveValue?.includes(o.value))
  }, [internalOptions, effectiveValue])

  const pinnedSelectedValues = open ? selectedValuesAtOpen : value

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const selectedValues = new Set(pinnedSelectedValues)

    const rankedOptions = internalOptions
      .map((option, index) => ({
        option,
        index,
        matchScore: getMatchScore(option, q),
        isSelected: selectedValues.has(option.value),
      }))
      .filter(({ matchScore }) => !q || matchScore >= 0)
      .sort((left, right) => {
        if (left.isSelected !== right.isSelected) return left.isSelected ? -1 : 1
        if (left.matchScore !== right.matchScore) return left.matchScore - right.matchScore
        return left.index - right.index
      })

    return rankedOptions.map(({ option }) => option)
  }, [internalOptions, pinnedSelectedValues, query])

  useEffect(() => {
    if (!isMounted) return

    const valueContainer = valueContainerRef.current
    const measureContainer = measureRef.current
    if (!valueContainer || !measureContainer) return

    const recalculateVisibleChipCount = () => {
      const containerWidth = valueContainer.clientWidth
      if (!containerWidth) {
        setVisibleChipCount(selected.length)
        return
      }

      const chipElements = Array.from(measureContainer.querySelectorAll<HTMLElement>("[data-chip-width]"))
      const gap = 4
      const reserveWidth = 96

      let usedWidth = 0
      let nextVisibleCount = 0

      chipElements.forEach((chipElement, index) => {
        const remainingCount = chipElements.length - (index + 1)
        const summaryWidth = remainingCount > 0 ? 42 : 0
        const chipWidth = chipElement.offsetWidth
        const nextWidth = usedWidth + (index > 0 ? gap : 0) + chipWidth

        if (nextWidth + reserveWidth + summaryWidth <= containerWidth) {
          usedWidth = nextWidth
          nextVisibleCount = index + 1
        }
      })

      if (nextVisibleCount === 0 && chipElements.length > 0) {
        nextVisibleCount = 1
      }

      setVisibleChipCount(nextVisibleCount)
    }

    recalculateVisibleChipCount()

    const resizeObserver = new ResizeObserver(() => {
      recalculateVisibleChipCount()
    })

    resizeObserver.observe(valueContainer)
    return () => resizeObserver.disconnect()
  }, [isMounted, selected])

  const slice = useMemo(
    () => filtered.slice(0, Math.max(maxVisible, visible)),
    [filtered, visible, maxVisible],
  )

  const toggleOptionMode = useCallback(
    (optionValue: string, e: React.MouseEvent) => {
      e.stopPropagation()
      e.preventDefault()

      const newMode = modes[optionValue] === "include" ? "exclude" : "include"
      const newModes = {
        ...modes,
        [optionValue]: newMode,
      }

      onModesChange?.(newModes)
    },
    [modes, onModesChange],
  )

  const getOptionMode = useCallback(
    (optionValue: string): "include" | "exclude" => {
      return modes[optionValue] || "include"
    },
    [modes],
  )

  const computePlacement = useCallback(() => {
    if (!isMounted || typeof window === "undefined") return

    const el = rootRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const gap = 8
    const below = window.innerHeight - r.bottom - gap
    const above = r.top - gap
    const preferDown = below >= 180 || below >= above
    setDropUp(!preferDown)
    const nextMaxH = Math.max(120, Math.min(256, preferDown ? below : above))
    setMaxH(nextMaxH)
    if (menuInBody) {
      setMenuPos({
        left: r.left,
        top: preferDown ? r.bottom + gap : Math.max(gap, r.top - gap - nextMaxH),
        width: r.width,
      })
    }
  }, [isMounted, menuInBody])

  const openDropdown = useCallback(async () => {
    if (disabled || !isMounted) return

    setSelectedValuesAtOpen(value)
    setDraft(value)
    setOpen(true)

    if (lazy && loadOptions && !loadedOnce && !loading) {
      try {
        setLoading(true)
        const data = await loadOptions()
        setInternalOptions(data)
        setLoadedOnce(true)
      } finally {
        setLoading(false)
      }
    }

    requestAnimationFrame(() => {
      computePlacement()
      inputRef.current?.focus()
    })
  }, [disabled, isMounted, lazy, loadOptions, loadedOnce, loading, computePlacement, value])

  const closeDropdown = useCallback(() => {

    if (commitOnClose) {
      const changed =
        draft.length !== value.length ||
        draft.some((v) => !value.includes(v)) ||
        value.some((v) => !draft.includes(v))
      if (changed) {
        const newSelected =
          internalOptions.length === 0
            ? draft.map((v) => ({ label: v, value: v }))
            : internalOptions.filter((o) => draft.includes(o.value))
        onChange?.(draft, newSelected)
      }
    }
    setOpen(false)
    setQuery("")
    setHighlight(0)
    setVisible(maxVisible)
  }, [maxVisible, commitOnClose, draft, value, onChange, internalOptions])

  useEffect(() => {
    if (!isMounted) return

    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current) return
      const target = e.target as Node

      if (!rootRef.current.contains(target) && !menuRef.current?.contains(target)) closeDropdown()
    }

    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [closeDropdown, isMounted])

  useEffect(() => {
    if (!open || !menuInBody) return
    const onReposition = () => computePlacement()
    window.addEventListener("scroll", onReposition, true)
    window.addEventListener("resize", onReposition)
    return () => {
      window.removeEventListener("scroll", onReposition, true)
      window.removeEventListener("resize", onReposition)
    }
  }, [open, menuInBody, computePlacement])

  const onListScroll = useCallback(() => {
    const el = listRef.current
    if (!el) return
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 32
    if (nearBottom && slice.length < filtered.length) setVisible((v) => v + maxVisible)
  }, [slice.length, filtered.length, maxVisible])

  const ensureItemVisible = useCallback(
    (index: number) => {
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
    },
    [slice.length],
  )

  const toggleOption = useCallback(
    (option: { value: string; label: string }) => {
      const isSelected = effectiveValue.includes(option.value)
      let newValue: string[]

      if (isSelected) {
        newValue = effectiveValue.filter((v) => v !== option.value)
        if (individualModes && onModesChange) {
          const newModes = { ...modes }
          delete newModes[option.value]
          onModesChange(newModes)
        }
      } else {
        newValue = [...effectiveValue, option.value]
        if (individualModes && onModesChange) {
          const newModes = {
            ...modes,
            [option.value]: "include",
          }
          onModesChange(newModes)
        }
      }

      applyChange(
        newValue,
        isSelected ? selected.filter((s) => s.value !== option.value) : [...selected, option],
      )

      setQuery("")
      setHighlight(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    },
    [effectiveValue, selected, applyChange, individualModes, modes, onModesChange],
  )

  const removeOption = useCallback(
    (option: { value: string; label: string }) => {
      const newValue = effectiveValue.filter((v) => v !== option.value)
      const newSelected = selected.filter((s) => s.value !== option.value)

      if (individualModes && onModesChange) {
        const newModes = { ...modes }
        delete newModes[option.value]
        onModesChange(newModes)
      }

      applyChange(newValue, newSelected)
    },
    [effectiveValue, selected, individualModes, modes, onModesChange, applyChange],
  )

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
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
          toggleOption(opt)
        }
      } else if (e.key === "Escape") {
        e.preventDefault()
        closeDropdown()
      } else if (e.key === "Backspace" && !query && selected.length > 0) {
        removeOption(selected[selected.length - 1])
      }
    },
    [
      open,
      filtered,
      highlight,
      ensureItemVisible,
      toggleOption,
      closeDropdown,
      query,
      selected,
      removeOption,
    ],
  )

  const clearAll = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      applyChange([], [])
      if (individualModes && onModesChange) {
        onModesChange({})
      }
      setQuery("")
      setHighlight(0)
      setVisible(maxVisible)
      setOpen(true)
      requestAnimationFrame(() => inputRef.current?.focus())
    },
    [applyChange, individualModes, onModesChange, maxVisible],
  )

  const toggleGlobalMode = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      const newMode = mode === "include" ? "exclude" : "include"
      onModeChange?.(newMode)
    },
    [mode, onModeChange],
  )

  if (!isMounted) {
    return (
      <div className="block text-[10px] md:text-sm" suppressHydrationWarning>
        {label && (
          <div className="mb-1 flex items-center justify-between">
            <label>{label}</label>
            {onModeChange && !individualModes && (
              <span
                className={cn(
                  "text-xs px-2 py-1 rounded border",
                  mode === "include"
                    ? "bg-accent/10 text-accent border-accent/30"
                    : "bg-red-100 text-red-700 border-red-300",
                )}
              >
                {mode === "include" ? "Включая" : "Исключая"}
              </span>
            )}
          </div>
        )}
        <div
          className={cn(
            "rounded-xl2 border border-border",
            rootSizeClasses,
            !individualModes && mode === "exclude" && "border-red-300",
            className,
          )}
        >
          {selected.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {selected.map((option) => {
                const optionMode = individualModes ? getOptionMode(option.value) : mode
                return (
                  <div
                    key={option.value}
                    className={cn(
                      "rounded-lg whitespace-nowrap",
                      chipSizeClasses,
                      optionMode === "include"
                        ? "border border-accent/30 bg-accent/10 text-accent"
                        : "bg-red-50 text-red-700 border border-red-200",
                    )}
                  >
                    {option.label}
                  </div>
                )
              })}
            </div>
          ) : (
            <span className="text-muted">{placeholder}</span>
          )}
        </div>
        {error && <div className="mt-1 text-[12px] text-danger">{error}</div>}
      </div>
    )
  }

  return (
    <div className="block text-[10px] md:text-sm" suppressHydrationWarning>
      {label && (
        <div className="mb-1 flex items-center justify-between">
          <label htmlFor={inputId}>{label}</label>
          {onModeChange && !individualModes && (
            <button
              type="button"
              onClick={toggleGlobalMode}
              className={cn(
                "text-xs px-2 py-1 rounded border transition-colors",
                mode === "include"
                  ? "bg-accent/10 text-accent border-accent/30"
                  : "bg-red-100 text-red-700 border-red-300",
              )}
            >
              {mode === "include" ? "Включая" : "Исключая"}
            </button>
          )}
        </div>
      )}

      <div
        ref={rootRef}
        className={cn(
          "relative isolate flex items-center gap-2 rounded-xl2 border border-border",
          rootSizeClasses,
          "focus-within:ring-2 focus-within:ring-ring",
          disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer",
          open && "z-[350]",
          !individualModes && mode === "exclude" && "border-red-300",
          className,
        )}
        onMouseDown={(e) => {
          if (!open && !disabled) {
            e.preventDefault()
            openDropdown()
          }
        }}
      >
        <div ref={valueContainerRef} className="flex items-center gap-1 flex-1 min-w-0 overflow-hidden">
          {selected.slice(0, visibleChipCount).map((option) => {
            const optionMode = individualModes ? getOptionMode(option.value) : mode
            return (
              <div
                key={option.value}
                className={cn(
                  "flex items-center gap-1 rounded-lg whitespace-nowrap flex-shrink-0",
                  chipSizeClasses,
                  optionMode === "include"
                    ? "border border-accent/30 bg-accent/10 text-accent"
                    : "bg-red-50 text-red-700 border border-red-200",
                )}
              >
                {individualModes && (
                  <button
                    type="button"
                    onClick={(e) => toggleOptionMode(option.value, e)}
                    style={{ fontSize: "10px", fontWeight: 800 }}
                    className={cn(
                      "w-3 h-3 rounded text-[10px] flex items-center justify-center",
                      optionMode === "include" ? "bg-accent text-white" : "bg-red-500 text-white",
                    )}
                  >
                    {optionMode === "include" ? "+" : "−"}
                  </button>
                )}
                <span className="truncate max-w-[120px]">{option.label}</span>
                {!disabled && (
                  <button
                    type="button"
                    aria-label={`Удалить ${option.label}`}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation()
                      removeOption(option)
                    }}
                    className="rounded-sm hover:bg-muted cursor-pointer w-4 h-4 flex items-center justify-center flex-shrink-0"
                  >
                    ×
                  </button>
                )}
              </div>
            )
          })}

          {selected.length > visibleChipCount && (
            <div
              className={cn(
                "flex-shrink-0 rounded-lg border border-border bg-surface/70 text-muted whitespace-nowrap",
                chipSizeClasses,
              )}
            >
              +{selected.length - visibleChipCount}
            </div>
          )}

          <input
            autoComplete="off"
            id={inputId}
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls="combobox-listbox"
            aria-multiselectable="true"
            disabled={disabled}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setHighlight(0)
              setVisible(maxVisible)
              if (!open) {
                setSelectedValuesAtOpen(value)
                setOpen(true)
              }
            }}
            onKeyDown={onKeyDown}
            placeholder={selected.length === 0 ? placeholder : ""}
            className={cn(
              "bg-transparent text-text border-0 outline-none ring-0 appearance-none py-0",
              isSm ? "text-xs" : "text-[10px] md:text-sm",
              "focus:outline-none focus:ring-0 focus:border-transparent cursor-pointer focus:shadow-none focus-visible:outline-none",
              !open && selected.length === 0 && "text-muted",
              "min-w-[80px] flex-1",
            )}
          />
        </div>

        {

                                                                                                    }
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 overflow-hidden opacity-0"
        >
          <div ref={measureRef} className="absolute left-3 top-0 flex">
            {selected.map((option) => {
              const optionMode = individualModes ? getOptionMode(option.value) : mode
              return (
                <div
                  key={`measure-${option.value}`}
                  data-chip-width
                  className={cn(

                    "mr-1 flex items-center gap-1 rounded-lg whitespace-nowrap",
                    chipSizeClasses,
                    optionMode === "include"
                      ? "border border-accent/30 bg-accent/10 text-accent"
                      : "bg-red-50 text-red-700 border border-red-200",
                  )}
                >
                  {individualModes && <span className="w-3" />}
                  <span>{option.label}</span>
                  {!disabled && <span className="w-4" />}
                </div>
              )
            })}
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {selected.length > 0 && !disabled && (
            <button
              type="button"
              aria-label="Очистить все"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={clearAll}
              className={cn(
                "rounded hover:bg-surface cursor-pointer text-muted flex-shrink-0",
                isSm ? "p-0.5 text-xs" : "p-1",
              )}
            >
              ✕
            </button>
          )}
          <span
            aria-hidden
            className={cn("pointer-events-none text-muted flex-shrink-0", isSm && "text-xs")}
          >
            ▾
          </span>
        </div>

        {open &&
          (() => {
            const menu = (
              <div
                ref={menuRef}
                className={cn(
                  "rounded-xl2 border border-border bg-panel shadow-glow z-[350]",
                  menuInBody
                    ? "fixed"
                    : cn("absolute left-0 right-0", dropUp ? "bottom-full mb-2" : "top-full mt-2"),
                )}
                style={
                  menuInBody && menuPos
                    ? { left: menuPos.left, top: menuPos.top, width: menuPos.width, maxHeight: maxH }
                    : { maxHeight: maxH }
                }
                onMouseDown={(e) => e.preventDefault()}
              >
            {!individualModes && onModeChange && (
              <div
                className={cn(
                  "px-3 py-2 text-xs border-b",
                  mode === "include"
                    ? "bg-accent/10 text-accent border-accent/30"
                    : "bg-red-50 text-red-700 border-red-200",
                )}
              >
                Режим: {mode === "include" ? "ВКЛЮЧЕНИЕ" : "ИСКЛЮЧЕНИЕ"}
              </div>
            )}

            <div
              id="combobox-listbox"
              ref={listRef}
              onScroll={onListScroll}
              className="overflow-auto py-1"
              role="listbox"
              aria-multiselectable="true"
              style={{ maxHeight: maxH }}
            >
              {loading ? (
                <div className="px-3 py-2 text-[10px] text-muted md:text-sm">Загрузка данных…</div>
              ) : filtered.length === 0 ? (
                <div className="px-3 py-2 text-[10px] text-muted md:text-sm">Ничего не найдено</div>
              ) : null}
              {slice.map((opt, index) => {
                if (!individualModes || !onModesChange) {
                  const isSelected = effectiveValue.includes(opt.value)

                  return (
                    <div
                      key={opt.value}
                      className={cn(
                        `flex items-center gap-3 px-3 py-2 text-[10px] cursor-pointer md:text-sm ${index === 0 ? "rounded-tl-lg rounded-tr-lg" : ""} ${index === slice.length - 1 ? "rounded-bl-lg rounded-br-lg" : ""}`,
                        isSelected ? "bg-accent/20" : "hover:bg-surface/70",
                      )}
                      onClick={() => toggleOption(opt)}
                    >
                      <Checkbox checked={isSelected} />

                      <span className="truncate">{opt.label}</span>
                    </div>
                  )
                }

                const optionMode = modes[opt.value]

                return (
                  <div
                    key={opt.value}
                    className="grid grid-cols-[30px_minmax(30px,1fr)_30px]
                                                2xl:grid-cols-[48px_minmax(40px,1fr)_48px] items-center px-2 py-1 rounded-lg hover:bg-surface/70"
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        if (optionMode === "include") {
                          removeOption(opt)
                        } else {
                          if (!effectiveValue.includes(opt.value)) {
                            applyChange([...effectiveValue, opt.value], [...selected, opt])
                          }
                          onModesChange({ ...modes, [opt.value]: "include" })
                        }
                      }}
                      className={cn(
                        "rounded-lg border text-xs  border-border ",
                        optionMode === "include" ? "bg-accent text-white" : "bg-panel",
                      )}
                    >
                      <span className="hidden 2xl:inline!">ВКЛ</span>
                      <span className="2xl:hidden">+</span>
                    </button>

                    <span className="truncate text-center">{opt.label}</span>

                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        if (optionMode === "exclude") {
                          removeOption(opt)
                        } else {
                          if (!effectiveValue.includes(opt.value)) {
                            applyChange([...effectiveValue, opt.value], [...selected, opt])
                          }
                          onModesChange({ ...modes, [opt.value]: "exclude" })
                        }
                      }}
                      className={cn(
                        "rounded-lg border text-xs border-border",
                        optionMode === "exclude" ? "bg-red-500 text-white" : "bg-panel",
                      )}
                    >
                      <span className="hidden 2xl:inline!">ИСКЛ</span>
                      <span className="2xl:hidden">−</span>
                    </button>
                  </div>
                )
              })}
            </div>
              </div>
            )
            if (menuInBody) return menuPos ? createPortal(menu, document.body) : null
            return menu
          })()}
      </div>

      {error && <div className="mt-1 text-[12px] text-danger">{error}</div>}
    </div>
  )
}

export default MultiComboBox
