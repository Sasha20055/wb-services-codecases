import * as React from "react"

export interface SwitchProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "onChange"
> {
  checked: boolean
  onChange?: (checked: boolean) => void
}

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger"
  size?: "sm" | "md" | "lg" | "input"
  loading?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
}

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: React.ReactNode
  ref?: React.Ref<HTMLInputElement>
}

export interface ChipProps extends React.HTMLAttributes<HTMLDivElement> {
  onRemove?: () => void
}

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "solid" | "ghost"
  size?: "xs" | "sm" | "md"
}

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  classNameTree?: string
  error?: string
}

export interface ModalProps {
  open: boolean
  onClose: () => void
  title?: React.ReactNode
  children?: React.ReactNode
  footer?: React.ReactNode
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
}

export type SelectOption = { label: string; value: string }

export interface ComboBoxProps {
  label?: string
  error?: string
  options?: SelectOption[]
  value?: string | null
  onChange?: (value: string | null, option: SelectOption | null) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  maxVisible?: number
}

export type ChipColor = "primary" | "danger" | "neutral"

export interface MultiComboBoxProps {
  label?: string
  error?: string
  options?: { value: string; label: string }[]
  value?: string[]
  onChange?: (value: string[], selected: { value: string; label: string }[]) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  maxVisible?: number
  mode?: "include" | "exclude"
  onModeChange?: (mode: "include" | "exclude") => void
  individualModes?: boolean
  modes?: Record<string, "include" | "exclude">
  onModesChange?: (modes: Record<string, "include" | "exclude">) => void

  commitOnClose?: boolean
}

export type Column<T> = {
  id: string
  short: string
  hideBelow: string
  header:
    | React.ReactNode
    | ((ctx: { sortBy?: string; sortDir?: "asc" | "desc" }) => React.ReactNode)
  width?: number | string
  align?: "left" | "center" | "right"
  sortable?: boolean
  field?: keyof T
  accessor?: (row: T, rowIndex: number) => React.ReactNode
}

export interface TabFilterOption {
  value: string
  label: string
  filters: Filter<any>[]
}

export interface TabFilter {
  type: "tab"
  isShowMobile?: boolean
  label?: string
  tabs: TabFilterOption[]
  activeTab: string
  onTabChange: (tabValue: string) => void
}

export type Filter<T> =
  | TextFilter<T>
  | SelectFilter<T>
  | MultiSelectFilter<T>
  | NumberRangeFilter<T>
  | DateRangeFilter<T>
  | BooleanFilter<T>

export type TextFilter<T> = {
  type: "text"
  id: string
  label?: string
  placeholder?: string
  value: string
  onChange: (v: string) => void
  accessor?: (row: T) => string | number | null | undefined
  isShowMobile?: boolean
}
export type SelectFilter<T> = {
  type: "select"
  id: string
  label?: string
  value: string
  onChange: (v: string) => void
  options: { label: string; value: string }[]
  accessor?: (row: T) => string | null | undefined
  isShowMobile?: boolean
}
export type NumberRangeFilter<T> = {
  type: "numberRange"
  id: string
  label?: string
  value: { min?: number; max?: number }
  onChange: (v: { min?: number; max?: number }) => void
  accessor?: (row: T) => number | null | undefined
  isShowMobile?: boolean
}
export type DateRangeFilter<T> = {
  type: "dateRange"
  id: string
  label?: string
  value: { from?: string; to?: string }
  onChange: (v: { from?: string; to?: string }) => void
  accessor?: (row: T) => Date | string | null | undefined
  isShowMobile?: boolean
}
export type BooleanFilter<T> = {
  type: "boolean"
  id: string
  label?: string
  value: boolean | undefined
  onChange: (v: boolean | undefined) => void
  accessor?: (row: T) => boolean | null | undefined
  isShowMobile?: boolean
}
export type FilterDef<T> =
  | TextFilter<T>
  | SelectFilter<T>
  | NumberRangeFilter<T>
  | DateRangeFilter<T>
  | BooleanFilter<T>

export type DataTableProps<T> = {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T, index: number) => string
  loading?: boolean
  empty?: React.ReactNode
  className?: string
  rowSize?: number
  pagination: {
    page: number
    pageSize: number
    total: number
    onPageChange: (p: number) => void
    onPageSizeChange?: (ps: number) => void
  }
  sorting?: {
    sortBy?: string
    sortDir?: "asc" | "desc"
    onSortChange: (colId: string, dir: "asc" | "desc") => void
  }
  filters?: FilterDef<T>[]
  clientFilter?: boolean
  clientSort?: boolean
  rowSelection?: RowSelectionConfig<T>
  toolbarRight?: React.ReactNode
  hasActiveFilters?: boolean
  onClearFilters?: () => void
  isFiltersAccordionOpen?: boolean
  onFiltersAccordionToggle?: (open: boolean) => void
}

export type RowSelectionConfig<T> = {
  enabled?: boolean
  selectedKeys: string[]
  onChange: (nextKeys: string[], selectedRows: T[]) => void
  mode?: "multiple" | "single"
  renderActions?: (ctx: { selectedRows: T[]; clear: () => void }) => React.ReactNode
  selectAllMode?: "page"
  isAllPageToggle?: boolean
}

export interface FilterBase {
  id: string
  label?: string
  placeholder?: string
  isShowMobile?: boolean
}

export interface MultiSelectFilter<T> extends FilterBase {
  type: "multiSelect"
  value: string[]
  onChange: (value: string[]) => void
  options: { value: string; label: string }[]
  accessor?: (row: T) => any
}

export type SidebarChild = { label: string; href: string }
export type SidebarItem = {
  label: string
  icon: React.ReactNode
  href?: string
  children?: SidebarChild[]
}
export type SidebarProps = {
  items: SidebarItem[]
  mobileOpen?: boolean
  onCloseMobile?: () => void
}
