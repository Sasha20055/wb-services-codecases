import type {
  NmSummaryDailyMetric,
  NmSummaryRow,
  NmSummaryCompareDisplayMode,
  SupplyWarehouseHistoryEntry,
  WarehouseCount,
} from "@/src/entities/nm-summary/model/types"

export const EXPAND_ALL_STORAGE_KEY = "supplier-analytics-nm-summary-expand-all"
export const COLUMNS_ORDER_STORAGE_KEY = "supplier-analytics-nm-summary-columns-order"
export const WAREHOUSE_SORT_STORAGE_KEY = "supplier-analytics-nm-summary-warehouse-sort"
export const WAREHOUSE_COLUMNS_ORDER_STORAGE_KEY = "supplier-analytics-nm-summary-warehouse-columns-order"
export const WAREHOUSE_ACTIVE_STORAGE_KEY = "supplier-analytics-nm-summary-active-warehouses"
export const NM_SUMMARY_TABLE_SLUG = "nm-summary"
export const TARIFF_MODE_STORAGE_KEY = "supplier-analytics-nm-summary-tariff-mode"
export const WAREHOUSE_VISIBLE_COLUMNS_STORAGE_KEY = "supplier-analytics-nm-summary-warehouse-visible-columns"
export type TariffMode = "box" | "pallet" | "piecePallet"

export const TARIFF_MODE_OPTIONS: { value: TariffMode; label: string }[] = [
  { value: "pallet", label: "Монопалет" },
  { value: "box", label: "Короб" },
  { value: "piecePallet", label: "Поштучная палета" },
]

export type WarehouseSortField =
  | "isActive"
  | "warehouseName"
  | "orders"
  | "localOrdersCount"
  | "nonLocalOrdersCount"
  | "sales"
  | "inWayToClient"
  | "inWayFromClient"
  | "avgSales"
  | "velocity"
  | "velocity2"
  | "forecast"
  | "forecast2"
  | "forecast3"
  | "forecast4"
  | "forecast5"
  | "forecastRegion"
  | "forecastRegion2"
  | "forecastTrend"
  | "imaginaryOrders"
  | "stock"
  | "ownStockTotal"
  | "qtyToSendFinal"
  | "qtyToSendFinal2"
  | "qtyToSendTrend"
  | "qtyToSendOwnStock"
  | "qtyToSendOwnStock2"
  | "qtyToSendTrendOwnStock"
  | "sendLocally"
  | "reserve"
  | "logisticsCost"
  | "logisticsCost2"
  | "storageCostDaily"
  | "acceptanceCost"
  | "turnoverDays"
  | "localOrdersPercent"
  | "buyoutPercent"
  | "ktr"
  | "krp"
  | "il"
  | "irp"
  | "lastSupplyCount"
  | "worstNonLocalRegion"

export type WarehouseColumnId = WarehouseSortField

export type WarehouseSortState = {
  field: WarehouseSortField
  dir: "asc" | "desc"
}

export type IncomingOrderSource = {
  sourceWarehouseName: string
  sourceRegion: string | null
  sourceMacroRegion: string | null
  ordersCount: number
}

export type WarehouseTableRow = {
  warehouseName: string
  region?: string

  macroRegion?: string
  isActive: boolean
  orders: number

  localOrdersCount: number

  nonLocalOrdersCount: number
  sales: number
  inWayToClient: number
  inWayFromClient: number
  avgSales: number
  velocity: number

  velocity2: number
  forecast: number
  forecast2: number
  forecast3: number
  forecast4: number
  forecast5: number

  forecastRegion: number

  forecastRegion2: number

  imaginaryOrders: number
  stock: number
  ownStockTotal: number

  qtyToSendFinal: number

  qtyToSendFinal2: number

  qtyToSendOwnStock: number

  qtyToSendOwnStock2: number

  qtyToSendFinal2Region2: number

  forecastTrend?: number | null
  qtyToSendTrend?: number | null
  qtyToSendTrendOwnStock?: number | null
  sendLocally: number
  reserve: number
  logisticsCost: number | null
  storageCostDaily: number | null
  acceptanceCost: number | null
  turnoverDays: number | null
  localOrdersPercent: number | null
  buyoutPercent: number | null
  ktr: number | null
  krp: number | null
  il: number | null
  irp: number | null
  lastSupplyCount: number
  lastSupplyDate: string | null
  supplyHistory: SupplyWarehouseHistoryEntry[] | null

  incomingOrdersSources: IncomingOrderSource[] | null
  worstNonLocalRegion: string | null
  worstNonLocalRegionPercent: number | null
  regionLocalityData: Array<{
    regionName: string
    macroRegion?: string | null
    percent: number
    ordersCount: number
    isMax: boolean
  }> | null
  comparison?: {
    orders: number
    sales: number
    avgSales: number
    forecast: number
    forecast2: number
    forecast3: number
    forecast4: number
    forecast5: number
    stock: number
    turnoverDays: number | null
    ktr: number | null
    krp: number | null
  } | null
  warehouseMeta: WarehouseCount

  metricInfo?: WarehouseMetricInfo
}

export type WarehouseMetricInfo = {
  velDivisor: number
  noSupply: boolean
  forecastRegionTotal: number
  productForecast2: number
  inTransitSent: number
  regionForecast: number
  regionStock: number
  regionInTransit: number

  regionInWayFromClient: number

  regionExpectedReturns: number
  regionNeed: number
  ownStockTotal: number

  forecastRegion2Own?: number
  forecastRegion2Pool?: number

  forecastRegion2ActiveOwn?: number
  forecastRegion2InactiveDonation?: number

  trendPeriodCount?: number
  trendDaysCount?: number
  trendOrdersSeries?: number[]
  trendEmaOrders?: number
  trendMeanOrders?: number
  trendRatio?: number
  trendRegionForecast?: number
  trendRegionNeed?: number
}

export type ComparisonState = {
  enabled: boolean
  dateFrom: string
  dateTo: string
  mode: NmSummaryCompareDisplayMode
}

export type ComparisonDraft = {
  dateFrom: string
  mode: NmSummaryCompareDisplayMode
}

export const DEFAULT_WAREHOUSE_SORT: WarehouseSortState = {
  field: "warehouseName",
  dir: "asc",
}

export const WAREHOUSE_COLUMN_IDS: WarehouseColumnId[] = [
  "isActive",
  "warehouseName",

  "forecastRegion2",
  "forecastTrend",
  "imaginaryOrders",
  "qtyToSendFinal2",
  "qtyToSendTrend",
  "qtyToSendOwnStock2",
  "qtyToSendTrendOwnStock",
  "lastSupplyCount",
  "stock",
  "orders",
  "sales",
  "inWayToClient",
  "inWayFromClient",
  "localOrdersPercent",
  "worstNonLocalRegion",
  "il",
  "irp",
  "ownStockTotal",
  "buyoutPercent",
  "localOrdersCount",
  "nonLocalOrdersCount",
  "velocity",
  "turnoverDays",
  "ktr",
  "krp",

  "reserve",
  "sendLocally",
  "logisticsCost",
  "logisticsCost2",
  "storageCostDaily",
  "acceptanceCost",
  "forecastRegion",
  "qtyToSendFinal",
  "qtyToSendOwnStock",
  "avgSales",
]

export const DEFAULT_HIDDEN_WAREHOUSE_COLUMN_IDS: WarehouseColumnId[] = [
  "forecastRegion",
  "qtyToSendFinal",
  "qtyToSendOwnStock",
  "avgSales",
]

export const ADMIN_ONLY_WAREHOUSE_COLUMN_IDS: Set<WarehouseColumnId> = new Set([
  "forecastRegion",
  "imaginaryOrders",
])

export const METRIC_TOOLTIP_COLUMN_IDS: Set<WarehouseColumnId> = new Set([
  "velocity",
  "forecastRegion",
  "forecastRegion2",
  "forecastTrend",
  "qtyToSendFinal",
  "qtyToSendFinal2",
  "qtyToSendTrend",
  "qtyToSendOwnStock",
  "qtyToSendOwnStock2",
  "qtyToSendTrendOwnStock",
])

export const REGION_HIDDEN_COLUMN_IDS: Set<WarehouseColumnId> = new Set([
  "logisticsCost",
  "logisticsCost2",
  "storageCostDaily",
  "acceptanceCost",
  "sendLocally",
])

export const WAREHOUSE_SUMMABLE_COLUMN_IDS: Set<WarehouseColumnId> = new Set([
  "orders",
  "localOrdersCount",
  "nonLocalOrdersCount",
  "sales",
  "inWayToClient",
  "inWayFromClient",
  "avgSales",
  "forecastRegion",
  "forecastRegion2",
  "forecastTrend",
  "imaginaryOrders",
  "stock",
  "qtyToSendFinal",
  "qtyToSendFinal2",
  "qtyToSendTrend",
  "qtyToSendOwnStock",
  "qtyToSendOwnStock2",
  "qtyToSendTrendOwnStock",
  "sendLocally",
  "reserve",
])

export const NON_SORTABLE_WAREHOUSE_COLUMN_IDS: Set<WarehouseColumnId> = new Set([
  "isActive",
  "lastSupplyCount",
])

export const EMPTY_SEND_LOCALLY_MAP: Map<string, number> = new Map()

export const WAREHOUSE_STICKY_COLUMN_WIDTHS: Record<"isActive" | "warehouseName", number> = {
  isActive: 72,
  warehouseName: 240,
}

export const WAREHOUSE_COLUMN_WIDTHS_STORAGE_KEY = "supplier-analytics-warehouse-subtable-column-widths"
export const MIN_WAREHOUSE_COLUMN_WIDTH = 64

export type PackerTask = {
  _id: string
  deadline: string
  warehouseId: string
  warehouseName: string
  ownWarehouseId: string
  ownWarehouseName: string
  supplierId: string
  supplierName?: string
  totalQuantity: number
  items: Array<{ nmId: number; size: string; quantity: number; deadline?: string }>
  isActive?: boolean
}

export type TaskListResponse = {
  data: PackerTask[]
  total: number
  page: number
  pageSize: number
}

export type StockPostingAvailability = {
  warehouseId: string
  quantity: number
}

export type AddToTaskState = {
  row: NmSummaryRow
  warehouse: WarehouseCount
  ownWarehouseId: string
  quantity: string
  deadline: string
  error: string | null
  isQuantityPristine?: boolean
}

export type DailyMetricKind =
  | "orders"
  | "sales"
  | "stock"
  | "localOrders"
  | "nonLocalOrders"
  | "incomingOrders"

export type DailyMetricsModalState = {
  row: NmSummaryRow
  metric: DailyMetricKind
  warehouseName?: string
  regionLabel?: string
  regionWarehouseNames?: string[]
  dateFrom: string
  dateTo: string

  initialDateFrom: string
  initialDateTo: string
  initialRows: NmSummaryDailyMetric[]

  nameToCanonical?: Record<string, string>

  incomingOrdersTotal?: number
}

export type WarehouseViewMode = "warehouses" | "regions"
