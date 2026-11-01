"use client"

import * as React from "react"
import { cn } from "../lib/cn"

export interface DateRange {
  from?: string
  to?: string
}

export interface DateRangePickerProps {
  value?: DateRange
  onChange?: (range: DateRange) => void
  label?: string
  placeholder?: string
  className?: string
  disabled?: boolean
  error?: string

  presets?: Array<{ label: string; getRange: () => DateRange }>

  replaceBuiltInPresets?: boolean
}

function formatISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function isBetween(d: Date, from: Date, to: Date): boolean {
  const t = d.getTime()
  return t >= from.getTime() && t <= to.getTime()
}

const MONTH_NAMES = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
]

const DAY_NAMES = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]

function getBuiltInPresets(): Array<{ label: string; getRange: () => DateRange }> {
  return [
    {
      label: "Сегодня",
      getRange: () => {
        const now = startOfDay(new Date())
        return { from: formatISO(now), to: formatISO(now) }
      },
    },
    {
      label: "Вчера",
      getRange: () => {
        const y = addDays(startOfDay(new Date()), -1)
        return { from: formatISO(y), to: formatISO(y) }
      },
    },
    {
      label: "Неделя",
      getRange: () => {

        const now = startOfDay(new Date())
        const start = addDays(now, -6)
        return { from: formatISO(start), to: formatISO(now) }
      },
    },
    {
      label: "Месяц",
      getRange: () => {
        const now = startOfDay(new Date())
        const start = addDays(now, -29)
        return { from: formatISO(start), to: formatISO(now) }
      },
    },
    {
      label: "2 месяца",
      getRange: () => {
        const now = startOfDay(new Date())
        const start = addDays(now, -59)
        return { from: formatISO(start), to: formatISO(now) }
      },
    },
    {
      label: "3 месяца",
      getRange: () => {
        const now = startOfDay(new Date())
        const start = addDays(now, -89)
        return { from: formatISO(start), to: formatISO(now) }
      },
    },
  ]
}

function formatDisplayRange(range?: DateRange): string {
  if (!range?.from && !range?.to) return ""
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split("-")
    return `${d}.${m}.${y}`
  }
  if (range.from && range.to) {
    if (range.from === range.to) return fmt(range.from)
    return `${fmt(range.from)} — ${fmt(range.to)}`
  }
  if (range.from) return `с ${fmt(range.from)}`
  if (range.to) return `до ${fmt(range.to)}`
  return ""
}

function buildCalendarGrid(year: number, month: number): (Date | null)[][] {
  const firstDay = new Date(year, month, 1)
  let dayOfWeek = firstDay.getDay()
  if (dayOfWeek === 0) dayOfWeek = 7
  const prefixCount = dayOfWeek - 1

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const totalCells = prefixCount + daysInMonth
  const rowCount = Math.ceil(totalCells / 7)

  const grid: (Date | null)[][] = []
  let dayNum = 1 - prefixCount
  for (let w = 0; w < rowCount; w++) {
    const row: (Date | null)[] = []
    for (let d = 0; d < 7; d++) {
      if (dayNum < 1 || dayNum > daysInMonth) {
        row.push(null)
      } else {
        row.push(new Date(year, month, dayNum))
      }
      dayNum++
    }
    grid.push(row)
  }
  return grid
}

function CalendarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

function ChevronLeftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 18-6-6 6-6" />
    </svg>
  )
}

function ChevronRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}

export function DateRangePicker({
  value,
  onChange,
  label,
  placeholder = "Выберите даты…",
  className,
  disabled,
  error,
  presets: extraPresets,
  replaceBuiltInPresets,
}: DateRangePickerProps) {
  const rootRef = React.useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = React.useState(false)
  const [dropUp, setDropUp] = React.useState(false)

  const now = new Date()
  const [calYear, setCalYear] = React.useState(now.getFullYear())
  const [calMonth, setCalMonth] = React.useState(now.getMonth())

  const [selStart, setSelStart] = React.useState<Date | null>(null)
  const [selEnd, setSelEnd] = React.useState<Date | null>(null)
  const [hoveredDate, setHoveredDate] = React.useState<Date | null>(null)

  React.useEffect(() => {
    if (value?.from) {
      const d = new Date(value.from)
      setSelStart(d)
      setCalYear(d.getFullYear())
      setCalMonth(d.getMonth())
    } else {
      setSelStart(null)
    }
    setSelEnd(value?.to ? new Date(value.to) : null)
  }, [value?.from, value?.to])

  const allPresets = React.useMemo(() => {
    if (replaceBuiltInPresets && extraPresets) return extraPresets
    const builtIn = getBuiltInPresets()
    return extraPresets ? [...builtIn, ...extraPresets] : builtIn
  }, [extraPresets, replaceBuiltInPresets])

  React.useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [])

  const computePlacement = React.useCallback(() => {
    const el = rootRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const gap = 8
    const below = window.innerHeight - r.bottom - gap
    const above = r.top - gap
    setDropUp(below < 380 && above > below)
  }, [])

  const openDropdown = () => {
    if (disabled) return
    computePlacement()
    setOpen(true)
  }

  const applyRange = (range: DateRange) => {
    onChange?.(range)
    setOpen(false)
  }

  const clearRange = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange?.({})
    setSelStart(null)
    setSelEnd(null)
  }

  const onDayClick = (d: Date) => {
    if (!selStart || (selStart && selEnd)) {

      setSelStart(d)
      setSelEnd(null)
    } else {

      let from = selStart
      let to = d
      if (d < selStart) {
        from = d
        to = selStart
      }
      setSelEnd(to)
      setSelStart(from)
      onChange?.({ from: formatISO(from), to: formatISO(to) })
      setOpen(false)
    }
  }

  const prevMonth = () => {
    if (calMonth === 0) {
      setCalMonth(11)
      setCalYear((y) => y - 1)
    } else {
      setCalMonth((m) => m - 1)
    }
  }

  const nextMonth = () => {
    if (calMonth === 11) {
      setCalMonth(0)
      setCalYear((y) => y + 1)
    } else {
      setCalMonth((m) => m + 1)
    }
  }

  const grid = buildCalendarGrid(calYear, calMonth)

  const activePresetLabel = React.useMemo(() => {
    if (!value?.from || !value?.to) return null
    for (const p of allPresets) {
      const r = p.getRange()
      if (r.from === value.from && r.to === value.to) return p.label
    }
    return null
  }, [value, allPresets])

  const hlFrom = selStart
  const hlTo = selEnd ?? hoveredDate

  const displayText = formatDisplayRange(value)
  const hasValue = Boolean(value?.from || value?.to)

  return (
    <div className="block text-[10px] md:text-sm" ref={rootRef}>
      {label && (
        <label className="mb-1 block text-muted">{label}</label>
      )}

      {                         }
      <div
        className={cn(
          "relative isolate flex items-center gap-2 rounded-xl2 border border-border px-3",
          "focus-within:ring-2 focus-within:ring-ring transition-all duration-200",
          disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer",
          open && "z-[350] ring-2 ring-ring",
          className,
        )}
        onMouseDown={() => {
          if (!open && !disabled) openDropdown()
        }}
      >
        <span className="pointer-events-none text-muted shrink-0">
          <CalendarIcon />
        </span>

        <span
          className={cn(
            "min-w-0 flex-1 truncate py-[5px] text-[10px] md:text-sm select-none",
            hasValue ? "text-text" : "text-muted/70",
          )}
        >
          {displayText || placeholder}
        </span>

        {hasValue && !disabled && (
          <button
            type="button"
            aria-label="Очистить"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={clearRange}
            className="rounded p-1 hover:bg-surface cursor-pointer shrink-0 transition-colors"
          >
            ✕
          </button>
        )}

        <span aria-hidden className="pointer-events-none text-muted shrink-0">
          ▾
        </span>

        {                          }
        {open && (
          <div
            className={cn(
              "absolute left-0 right-0 rounded-xl2 border border-border bg-panel shadow-glow animate-scaleIn",
              dropUp ? "bottom-full mb-2" : "top-full mt-2",
              "z-[350] min-w-[320px] w-max max-w-[460px]",
            )}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col md:flex-row">
              {                           }
              <div className="border-b md:border-b-0 md:border-r border-border p-2 md:p-3 md:min-w-[120px] shrink-0">
                <div className="text-[10px] md:text-xs text-muted uppercase tracking-wider mb-2 px-1">
                  Быстрый выбор
                </div>
                <div className="flex flex-wrap md:flex-col gap-1">
                  {allPresets.map((preset) => {
                    const isActive = activePresetLabel === preset.label
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          const r = preset.getRange()
                          setSelStart(r.from ? new Date(r.from) : null)
                          setSelEnd(r.to ? new Date(r.to) : null)
                          applyRange(r)
                        }}
                        className={cn(
                          "px-2.5 py-1.5 rounded-lg text-[10px] md:text-xs text-left transition-all duration-150 cursor-pointer",
                          isActive
                            ? "bg-accent/15 text-accent font-medium"
                            : "hover:bg-surface text-text",
                        )}
                      >
                        {preset.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {                    }
              <div className="p-3 flex-1 min-w-0">
                {                     }
                <div className="flex items-center justify-between mb-3">
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); e.stopPropagation() }}
                    onClick={prevMonth}
                    className="p-1 rounded-lg hover:bg-surface transition-colors cursor-pointer text-muted hover:text-text"
                  >
                    <ChevronLeftIcon />
                  </button>

                  <span className="text-xs md:text-sm font-medium text-text select-none">
                    {MONTH_NAMES[calMonth]} {calYear}
                  </span>

                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); e.stopPropagation() }}
                    onClick={nextMonth}
                    className="p-1 rounded-lg hover:bg-surface transition-colors cursor-pointer text-muted hover:text-text"
                  >
                    <ChevronRightIcon />
                  </button>
                </div>

                {                        }
                <div className="grid grid-cols-7 mb-1">
                  {DAY_NAMES.map((dn) => (
                    <div key={dn} className="text-center text-[10px] md:text-xs text-muted py-1 select-none">
                      {dn}
                    </div>
                  ))}
                </div>

                {                   }
                <div className="grid grid-cols-7">
                  {grid.flat().map((day, i) => {
                    if (!day) {
                      return <div key={`empty-${i}`} className="aspect-square" />
                    }

                    const today = isSameDay(day, startOfDay(new Date()))
                    const isStart = hlFrom && isSameDay(day, hlFrom)
                    const isEnd = hlTo && isSameDay(day, hlTo)
                    const isInRange =
                      hlFrom &&
                      hlTo &&
                      (hlFrom <= hlTo
                        ? isBetween(day, hlFrom, hlTo)
                        : isBetween(day, hlTo, hlFrom))
                    const isEdge = isStart || isEnd

                    return (
                      <button
                        key={day.toISOString()}
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation() }}
                        onClick={() => onDayClick(day)}
                        onMouseEnter={() => {
                          if (selStart && !selEnd) setHoveredDate(day)
                        }}
                        onMouseLeave={() => setHoveredDate(null)}
                        className={cn(
                          "relative aspect-square flex items-center justify-center text-[10px] md:text-xs transition-all duration-100 cursor-pointer select-none",

                          isInRange && !isEdge && "bg-accent/10",

                          isEdge && "bg-accent text-white font-medium rounded-lg z-10",

                          isStart && !isEnd && hlTo && "rounded-r-none",
                          isEnd && !isStart && hlFrom && "rounded-l-none",
                          isInRange && !isEdge && "rounded-none",

                          today && !isEdge && "ring-1 ring-accent/40 rounded-lg",

                          !isInRange && !isEdge && "hover:bg-surface rounded-lg",

                          !isEdge && "text-text",
                        )}
                      >
                        {day.getDate()}
                      </button>
                    )
                  })}
                </div>

                {                    }
                {selStart && !selEnd && (
                  <div className="mt-2 text-[10px] md:text-xs text-muted text-center animate-fadeIn">
                    Выберите конечную дату
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {error && <div className="mt-1 text-[12px] text-danger">{error}</div>}
    </div>
  )
}

export default DateRangePicker
