// @ts-nocheck

"use client"

import * as React from "react"
import { memo, RefObject, useCallback, useEffect, useMemo, useRef } from "react"
import { cn } from "../lib/cn"
import type { Column, DataTableProps } from "../model/types"
import { Button } from "./button"
import { Checkbox } from "./checkbox"
import { ComboBox } from "./combobox"
import { Input } from "./input"
import { MultiComboBox } from "./multi-combobox"
import { Pagination as Pager } from "./pagination"
import { TabFilter } from "./tab-filter"
import { Table, TBody, TD, TH, THead, TR } from "./table-comp"

function useIndeterminate(
  ref: RefObject<HTMLInputElement>,
  checked: boolean,
  indeterminate: boolean,
) {
  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = indeterminate
      ref.current.checked = checked && !indeterminate
    }
  }, [checked, indeterminate])
}

function SortIcon({ dir }: { dir: "asc" | "desc" | undefined }) {
  return (
    <svg
      className={cn("ml-1 h-3.5 w-3.5 text-muted")}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      {dir === "asc" && <path d="M6 12l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />}
      {dir === "desc" && <path d="M6 8l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />}
      {!dir && <path d="M7 8h6M7 12h6" strokeLinecap="round" />}
    </svg>
  )
}

function DataTableComponent<T extends Record<string, any>>({
  columns,
  rows,
  rowKey,
  pagination,
  sorting,
  filters,
  clientFilter = true,
  clientSort = false,
  loading,
  empty,
  className,
  hasActiveFilters,
  onClearFilters,
  toolbarRight,
  rowSelection,
  isFiltersAccordionOpen,
  onFiltersAccordionToggle,
  rowSize,
}: DataTableProps<T>) {
  const [internalFiltersOpen, setInternalFiltersOpen] = React.useState(isFiltersAccordionOpen)
  const [isMounted, setIsMounted] = React.useState(false)
  const [hasActiveFiltersState, setHasActiveFiltersState] = React.useState(false)

  useEffect(() => {
    setHasActiveFiltersState(hasActiveFilters)
  }, [])

  useEffect(() => {
    setIsMounted(true)
    if (isFiltersAccordionOpen !== undefined) {
      setInternalFiltersOpen(isFiltersAccordionOpen)
    }
  }, [isFiltersAccordionOpen])

  const filtersOpen = isMounted ? (isFiltersAccordionOpen ?? internalFiltersOpen) : false
  const setFiltersOpen = onFiltersAccordionToggle ?? setInternalFiltersOpen

  const toggleFiltersAccordion = () => {
    setFiltersOpen(!filtersOpen)
  }

  const allActiveFilters = useMemo(() => {
    if (!filters?.length) return []

    const activeFilters: any[] = []

    filters.forEach((filter) => {
      if (filter.type === "tab") {
        const activeTab = filter.tabs.find((tab) => tab.value === filter.activeTab)
        if (activeTab) activeFilters.push(...activeTab.filters)
      } else {
        activeFilters.push(filter)
      }
    })

    return activeFilters
  }, [filters])

  const filtered = useMemo(() => {
    if (!clientFilter || !allActiveFilters.length) return rows
    return rows.filter((row) =>
      allActiveFilters.every((f) => {
        if (f.type === "text") {
          if (!f.value) return true
          const v = f.accessor ? f.accessor(row) : ""
          const s = (v ?? "").toString().toLowerCase()
          return s.includes(f.value.toLowerCase())
        }
        if (f.type === "select") {
          if (!f.value) return true
          const v = f.accessor ? f.accessor(row) : ""
          return v === f.value
        }
        if (f.type === "numberRange") {
          const val = f.accessor ? f.accessor(row) : undefined
          if (val == null) return false
          if (f.value.min != null && val < f.value.min) return false
          if (f.value.max != null && val > f.value.max) return false
          return true
        }
        if (f.type === "dateRange") {
          const raw = f.accessor ? f.accessor(row) : undefined
          if (!raw) return false
          const d = raw instanceof Date ? raw : new Date(raw)
          if (f.value.from) {
            const from = new Date(f.value.from)
            from.setHours(0, 1, 0, 0)
            if (d < from) return false
          }
          if (f.value.to) {
            const to = new Date(f.value.to)
            to.setHours(23, 59, 59, 999)
            if (d > to) return false
          }

          return true
        }
        if (f.type === "boolean") {
          if (typeof f.value === "undefined") return true
          const val = f.accessor ? f.accessor(row) : undefined
          return Boolean(val) === Boolean(f.value)
        }
        return true
      }),
    )
  }, [rows, filters, clientFilter, allActiveFilters])

  const sorted = useMemo(() => {
    if (!clientSort || !sorting?.sortBy) return filtered
    const col = columns.find((c) => c.id === sorting.sortBy)
    if (!col) return filtered
    const dir = sorting.sortDir === "desc" ? -1 : 1
    const getVal = (r: T) => (col.field ? (r[col.field] as any) : undefined)
    return [...filtered].sort((a, b) => {
      const av = getVal(a)
      const bv = getVal(b)
      if (av == null && bv == null) return 0
      if (av == null) return -1 * dir
      if (bv == null) return 1 * dir
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir
      const as = av instanceof Date ? av.getTime() : av.toString()
      const bs = bv instanceof Date ? bv.getTime() : bv.toString()
      return (as > bs ? 1 : as < bs ? -1 : 0) * dir
    })
  }, [filtered, clientSort, sorting?.sortBy, sorting?.sortDir, columns])

  const handleSortClick = (col: Column<T>) => {
    if (!sorting || !col.sortable) return
    const next: "asc" | "desc" =
      sorting.sortBy !== col.id ? "asc" : sorting.sortDir === "asc" ? "desc" : "asc"
    sorting.onSortChange(col.id, next)
  }

  const selectable = !!rowSelection?.enabled
  const getKey = useCallback((r: T, i: number) => String(rowKey(r, i)), [rowKey])

  const pageKeys = selectable ? sorted.map((r, i) => getKey(r, i)) : []
  const selectedSet = new Set(rowSelection?.selectedKeys ?? [])
  const selectedRows = selectable ? sorted.filter((r, i) => selectedSet.has(getKey(r, i))) : []

  const allOnPageSelected =
    selectable && pageKeys.length > 0 && pageKeys.every((k) => selectedSet.has(k))
  const someOnPageSelected =
    selectable && !allOnPageSelected && pageKeys.some((k) => selectedSet.has(k))

  const headCbRef = useRef<HTMLInputElement>(null)
  useIndeterminate(headCbRef, allOnPageSelected, someOnPageSelected)

  const commitSelection = useCallback(
    (nextKeys: string[]) => {
      const setNext = new Set(nextKeys)
      const nextRows = sorted.filter((r, i) => setNext.has(getKey(r, i)))
      rowSelection?.onChange(nextKeys, nextRows)
    },
    [rowSelection, sorted, getKey],
  )

  const toggleRow = (key: string, row: T) => {
    if (!selectable) return
    if (rowSelection?.mode === "single") {
      commitSelection(selectedSet.has(key) ? [] : [key])
      return
    }
    const next = new Set(rowSelection?.selectedKeys ?? [])
    if (next.has(key)) next.delete(key)
    else next.add(key)
    commitSelection(Array.from(next))
  }

  const toggleAllOnPage = () => {
    if (!selectable) return
    const next = new Set(rowSelection?.selectedKeys ?? [])
    if (allOnPageSelected) {
      pageKeys.forEach((k) => next.delete(k))
    } else {
      pageKeys.forEach((k) => next.add(k))
    }
    commitSelection(Array.from(next))
  }

  const clearSelection = () => commitSelection([])

  const onClickToggleRow = (e, key, row) => {
    if (!selectable) return
    const el = e.target as Element
    if (el.closest('a,button,input,textarea,label,[role="button"]')) return
    toggleRow(key, row)
  }

  const textFilters = useMemo(() => filters?.filter((f) => f.type === "text") || [], [filters])

  const tabFilters = useMemo(() => filters?.filter((f) => f.type === "tab") || [], [filters])

  const dateFilters = useMemo(() => filters?.filter((f) => f.type === "dateRange") || [], [filters])

  const otherFilters = useMemo(() => filters?.filter((f) => f.type !== "text") || [], [filters])

  return (
    <div
      className={cn(
        "rounded-xl2 border border-border bg-panel flex min-h-0 flex-col",
        "max-h-[calc(100vh-8rem)]",
        "md:min-h-[880px]",
        "min-h-[1080px]",
        className,
      )}
    >
      {(filters?.length || toolbarRight) && (
        <div className="shrink-0 border-b border-border" id="mainFilters">
          <div className="p-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="flex gap-2 md:flex-1 items-center flex-wrap">
                {textFilters.map((f) => {
                  if (f.type === "text") {
                    return (
                      <div
                        key={f.id}
                        className={cn(
                          "min-w-[150px] flex-1",
                          f.isShowMobile ? "" : "hidden md:block",
                        )}
                      >
                        <label htmlFor={f.id} className="mb-1 block text-sm">
                          {f.label}
                        </label>
                        <Input
                          id={f.id}
                          placeholder={f.placeholder ?? f.label ?? "Поиск"}
                          value={f.value}
                          onChange={(e) => f.onChange(e.target.value)}
                          className="w-full bg-transparent"
                        />
                      </div>
                    )
                  }
                  return null
                })}

                {dateFilters.map((f) => {
                  if (f.type === "dateRange") {
                    return (
                      <div
                        key={f.id}
                        className={cn("flex-nowrap", f.isShowMobile ? "" : "hidden md:block")}
                      >
                        {f.label && (
                          <label className="mb-1 block hidden sm:inline text-sm">{f.label}</label>
                        )}
                        <div className="flex flex-row flex-wrap sm:flex-nowrap items-stretch gap-2 min-w-0">
                          <div>
                            <span className="mb-1 inline sm:hidden text-sm">От</span>
                            <Input
                              type="date"
                              value={f.value?.from ?? ""}
                              onChange={(e) =>
                                f.onChange({
                                  ...f.value,
                                  from: e.target.value || undefined,
                                })
                              }
                              className="bg-transparent w-full sm:w-[11.5rem] min-w-0"
                            />
                          </div>
                          <span className="hidden sm:inline m-auto">→</span>
                          <div>
                            <span className="mb-1 inline sm:hidden text-sm">До</span>
                            <Input
                              type="date"
                              value={f.value?.to ?? ""}
                              onChange={(e) =>
                                f.onChange({
                                  ...f.value,
                                  to: e.target.value || undefined,
                                })
                              }
                              className="bg-transparent w-full sm:w-[11.5rem] min-w-0"
                            />
                          </div>
                        </div>
                      </div>
                    )
                  }
                  return null
                })}

                {tabFilters.map((f) => {
                  if (f.type === "tab") {
                    return (
                      <div key={f.id} className="flex-shrink-0">
                        <TabFilter filter={f} />
                      </div>
                    )
                  }
                  return null
                })}

                {                                                                            }
                {otherFilters.length > 0 && (
                  <div className="flex-shrink-0 flex items-end relative top-[10px]">
                    <Button
                      variant="ghost"
                      size="sm"
                      id="filters"
                      onClick={toggleFiltersAccordion}
                      className="flex items-center gap-1 group relative pr-8"
                    >
                      <span>Доп. фильтры</span>
                      <svg
                        className={cn(
                          "h-4 w-4 transition-transform duration-200",
                          filtersOpen ? "rotate-180" : "",
                        )}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </Button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onClearFilters()
                      }}
                      aria-disabled={!hasActiveFiltersState}
                      className="absolute right-2 top-1/2 -translate-y-1/2 transition-opacity duration-200 p-1 rounded hover:bg-danger/10 text-danger"
                      title="Очистить фильтры"
                    >
                      <svg
                        className="h-4 w-4"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                      >
                        <path d="M6 6l12 12" />
                        <path d="M18 6 6 18" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>

              {toolbarRight && (
                <div className="flex items-center gap-2 md:ml-6">{toolbarRight}</div>
              )}
            </div>

            {                                           }
            {otherFilters.length > 0 && (
              <div
                className={cn(
                  "transition-all duration-300 ease-in-out ",
                  filtersOpen ? "max-h-[500px] opacity-100 mt-3" : "max-h-0 opacity-0",
                )}
              >
                <div className="flex flex-wrap gap-2 items-end border-t border-border pt-3">
                  {otherFilters.map((f) => {
                    if (f.type === "select") {
                      return (
                        <div
                          key={f.id}
                          className="min-w-0 basis-full sm:flex-[1_1_120px]"
                        >
                          <ComboBox
                            label={f.label}
                            value={f.value || null}
                            options={[{ label: "Все", value: "" }, ...f.options]}
                            onChange={(val) => f.onChange(val ?? "")}
                            className="w-full"
                          />
                        </div>
                      )
                    }
                    if (f.type === "multiSelect") {
                      return (
                        <div
                          key={f.id}
                          className="min-w-0 basis-full sm:flex-[1_1_120px]"
                        >
                          <MultiComboBox
                            individualModes={f.individualModes ?? false}
                            modes={f.mode ?? "include"}
                            onModesChange={f.onModeChange}
                            label={f.label}
                            value={f.value || []}
                            options={f.options}
                            lazy={f.lazy}
                            loadOptions={f.loadOptions ?? false}
                            onChange={(values) => f.onChange(values)}
                            placeholder={f.placeholder ?? f.label ?? "Выберите..."}
                            className="w-full"
                          />
                        </div>
                      )
                    }
                    if (f.type === "numberRange") {
                      return (
                        <div
                          key={f.id}
                          className="min-w-0 basis-full sm:flex-[1_1_120px] flex flex-wrap items-center gap-2"
                        >
                          {f.label && <span className="mb-1 block text-sm">{f.label}</span>}
                          <div className="flex items-center gap-1">
                            <Input
                              placeholder="min"
                              type="number"
                              value={f.value.min ?? ""}
                              onChange={(e) =>
                                f.onChange({
                                  ...f.value,
                                  min: e.target.value === "" ? undefined : Number(e.target.value),
                                })
                              }
                              className="w-full sm:w-24"
                            />
                            <span className="">—</span>
                            <Input
                              placeholder="max"
                              type="number"
                              value={f.value.max ?? ""}
                              onChange={(e) =>
                                f.onChange({
                                  ...f.value,
                                  max: e.target.value === "" ? undefined : Number(e.target.value),
                                })
                              }
                              className="w-full sm:w-24"
                            />
                          </div>
                        </div>
                      )
                    }
                    if (f.type === "boolean") {
                      return (
                        <div key={f.id}>
                          {f.label && <label className="mb-1 block text-sm">{f.label}</label>}
                          <div className="flex gap-1">
                            <div className="hidden">{String(f.value)}</div>
                            <Button
                              size="sm"
                              variant={f.value === true ? "primary" : "secondary"}
                              onClick={() => f.onChange(true)}
                            >
                              Да
                            </Button>
                            <Button
                              size="sm"
                              variant={f.value === false ? "primary" : "secondary"}
                              onClick={() => f.onChange(false)}
                            >
                              Нет
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => f.onChange(undefined)}>
                              Сброс
                            </Button>
                          </div>
                        </div>
                      )
                    }
                    return null
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {                                            }
      <div className="sticky top-0 z-[2] border-b border-border bg-panel/95 backdrop-blur px-3 py-2 flex items-center justify-start gap-3">
        <span className="text-sm text-muted">
          Кол-во записей: <span className="font-medium text-text">{rowSize || 0}</span>
        </span>
        {rowSelection && (
          <span className="text-sm text-muted">
            Выбрано: <span className="font-medium text-text">{selectedRows.length}</span>
          </span>
        )}

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={clearSelection}
            className={
              selectedRows.length > 0
                ? "opacity-100 transition-opacity max-md:hidden"
                : "opacity-0 pointer-events-none transition-opacity max-md:hidden"
            }
          >
            Снять выбор
          </Button>

          <div
            className={
              selectedRows.length > 0
                ? "opacity-100 transition-opacity"
                : "opacity-0 pointer-events-none transition-opacity"
            }
          >
            {rowSelection?.renderActions?.({
              selectedRows,
              clear: clearSelection,
            })}
          </div>
        </div>
      </div>

      <div className="relative flex-1 min-h-0 overflow-y-auto overflow-x-auto">
        <Table>
          <THead>
            <TR>
              {selectable && (
                <TH style={{ width: 36 }} className="text-center">
                  <Checkbox
                    ref={headCbRef}
                    aria-label={
                      allOnPageSelected ? "Снять выделение со страницы" : "Выделить всё на странице"
                    }
                    className="accent-accent"
                    onChange={toggleAllOnPage}
                  />
                </TH>
              )}
              {columns.map((c) => {
                const isSorted = sorting?.sortBy === c.id ? sorting?.sortDir : undefined
                return (
                  <TH
                    key={c.id}
                    style={{ width: c.width }}
                    className={cn(
                      c.align === "right" && "text-right",
                      c.align === "center" && "text-center",
                      (!c.align || c.align === "left") && "text-center",
                    )}
                  >
                    <button
                      type="button"
                      className={cn(
                        "inline-flex w-full items-center gap-1 cursor-pointer text-nowrap justify-center",
                        c.align === "right" && "justify-end",
                        c.align === "center" && "justify-center",
                        c.sortable ? "text-text hover:text-accent" : "text-muted cursor-default",
                      )}
                      onClick={() => handleSortClick(c)}
                    >
                      {typeof c.header === "function"
                        ? c.header({
                          sortBy: sorting?.sortBy,
                          sortDir: sorting?.sortDir,
                        })
                        : c.header}
                      {c.sortable && <SortIcon dir={isSorted} />}
                    </button>
                  </TH>
                )
              })}
            </TR>
          </THead>
          <TBody>
            {loading ? (
              <TR>
                <TD
                  className="py-10 text-center text-muted"
                  colSpan={columns.length + (selectable ? 1 : 0)}
                >
                  Загрузка...
                </TD>
              </TR>
            ) : sorted.length ? (
              sorted.map((row, ri) => {
                const key = selectable ? getKey(row, ri) : ""
                const isSelected = selectable ? selectedSet.has(key) : false
                return (
                  <TR
                    key={rowKey(row, ri)}
                    aria-selected={isSelected || undefined}
                    className={cn(isSelected && "bg-accent/5")}
                    onClick={
                      rowSelection?.isAllPageToggle
                        ? (e) => onClickToggleRow(e, key, row)
                        : undefined
                    }
                  >
                    {selectable && (
                      <TD
                        className="text-center"
                        onClick={
                          !rowSelection?.isAllPageToggle
                            ? (e) => onClickToggleRow(e, key, row)
                            : undefined
                        }
                      >
                        <Checkbox
                          aria-label="Выделить строку"
                          checked={isSelected}
                          onChange={() => toggleRow(key, row)}
                          onClick={(e) => e.stopPropagation()}
                          className="accent-accent"
                        />
                      </TD>
                    )}
                    {columns.map((c) => {
                      const content = c.accessor
                        ? c.accessor(row, ri)
                        : c.field
                          ? (row[c.field] as any)
                          : null
                      return (
                        <TD
                          key={c.id}
                          className={cn(
                            c.align === "right" && "text-right",
                            c.align === "center" && "text-center",
                            selectable && rowSelection.isAllPageToggle ? "cursor-pointer" : "",
                          )}
                        >
                          {content}
                        </TD>
                      )
                    })}
                  </TR>
                )
              })
            ) : (
              <TR>
                <TD
                  className="py-10 text-center text-muted"
                  colSpan={columns.length + (selectable ? 1 : 0)}
                >
                  {empty ?? "Нет данных по текущим фильтрам"}
                </TD>
              </TR>
            )}
          </TBody>
        </Table>
      </div>

      <div className="shrink-0 border-top">
        <div className="border-t border-border p-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2 text-sm text-muted">
              Страница <span className="font-medium text-text">{pagination.page}</span> из{" "}
              <span className="font-medium text-text">
                {Math.max(1, Math.ceil(pagination.total / pagination.pageSize))}
              </span>
            </div>
            <div className="flex items-center gap-3 max-sm:flex-col">
              {pagination.onPageSizeChange && (
                <div className="relative max-w-[160px] overflow-visible z-[1]">
                  <ComboBox
                    value={String(pagination.pageSize)}
                    options={[10, 20, 50].map((s) => ({
                      label: `${s} / стр`,
                      value: String(s),
                    }))}
                    onChange={(val) =>
                      pagination.onPageSizeChange?.(Number(val ?? pagination.pageSize))
                    }
                    className="h-10"
                  />
                </div>
              )}
              <div className="flex items-center gap-2 overflow-x-auto md:overflow-visible">
                <Pager
                  page={pagination.page}
                  pageSize={pagination.pageSize}
                  total={pagination.total}
                  onChange={pagination.onPageChange}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default memo(DataTableComponent) as typeof DataTableComponent
