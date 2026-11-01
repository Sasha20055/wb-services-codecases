export type WarehouseCount = {
  warehouseName: string
  warehouseId?: string | null
  count: number
}

export type SupplyWarehouseHistoryEntry = {
  date: string

  supplyDate?: string | null
  count: number
  supplyId?: number | null
  statusId?: number | null
  sent?: number
  accepted?: number
  readyForSale?: number
}

export type SupplyWarehouseCount = WarehouseCount & {
  date?: string | null
  entries?: SupplyWarehouseHistoryEntry[]
}

export type LocalityRegionCount = {
  regionName: string
  ordersCount: number
  isLocal: boolean
  macroRegion?: string | null
}

export type NmSummaryTrendWarehouseOrders = {

  warehouseName: string

  orders: number[]
}

export type NmSummaryTrendPeriods = {
  daysCount: number
  periodCount: number

  warehouses: NmSummaryTrendWarehouseOrders[]
}

export type LocalizationCoefficientValue = {
  ktr: number | null
  krp: number | null
}

export type WarehouseLocalizationCoefficient = {
  warehouseName: string
  ktr: number | null
  krp: number | null
}

export type SizePlanCount = {
  size: string
  count: number
}

export type WarehouseSupplyPlan = {
  warehouseName: string
  warehouseId?: string | null
  forecast: number
  qtyToSend: number
  logisticsCost?: number | null
  storageCostDaily?: number | null
  acceptanceCost?: number | null
  sizePlan: SizePlanCount[]
}

export type NmSummaryVelocityWarehouse = {
  warehouseName: string
  orders: number
  daysWithStock: number
  velocity: number
}

export type NmSummaryVelocityDetails = {
  periodDays: number
  orders: number
  daysWithStock: number
  daysWithoutStock: number
  warehouseBreakdown: NmSummaryVelocityWarehouse[]
}

export type NmSummaryDailyMetric = {
  date: string
  orders: number
  sales: number
  stock: number
  hasStock: boolean

  localOrders?: number
  nonLocalOrders?: number
  incomingOrders?: number
}

export type NmSummaryDailyMetricWarehouse = {
  warehouseName: string
  rows: NmSummaryDailyMetric[]
}

export type NmSummaryCompareDisplayMode = "absolute" | "percent"

export type NmSummaryComparison = {
  suppliesSentLastDate: number
  localOrdersPercent: number | null
  localOrdersPercentWeighted: number | null
  localizationCoefficients: LocalizationCoefficientValue
  localizationCoefficientsByWarehouse: WarehouseLocalizationCoefficient[]
  localOrdersPercentByWarehouse: WarehouseCount[]
  leastLocalizedWarehouse: { warehouseName: string; percent: number } | null
  buyoutPercent: number | null
  buyoutPercentByWarehouse: WarehouseCount[]
  ordersByWarehouse: WarehouseCount[]
  salesByWarehouse: WarehouseCount[]
  avgSalesByWarehouse: WarehouseCount[]
  stockTotal: WarehouseCount[]
  trueVelocity: number
  velocityDetails: NmSummaryVelocityDetails
  forecastTotal: number
  qtyToSend: number
  qtyToBuy: number
  forecastByWarehouse: WarehouseCount[]
  qtyToSendByWarehouse: WarehouseCount[]
  turnoverDays: number | null
  suppliesByWarehouse: SupplyWarehouseCount[]
  logisticsCost: number | null
  storageCostDaily: number | null
  acceptanceCost: number | null
  acceptanceQuantity: number | null
  inTransit: number
  inTransitByWarehouse: WarehouseCount[]
}

export type NmSummaryRow = {
  nmId: number

  techSize: string | null

  chrtId: number | null
  supplierArticle: string
  productName: string

  photoTmUrl?: string | null
  photoZoomUrl?: string | null

  color?: string | null
  category: string
  isAdvert: boolean
  supplierId: string | null
  suppliesSentLastDate: number
  localOrdersPercent: number | null
  localOrdersPercentWeighted: number | null
  localizationCoefficients: LocalizationCoefficientValue
  localizationCoefficientsByWarehouse: WarehouseLocalizationCoefficient[]
  localOrdersPercentByWarehouse: WarehouseCount[]
  leastLocalizedWarehouse: { warehouseName: string; percent: number } | null
  buyoutPercent: number | null
  buyoutPercentByWarehouse: WarehouseCount[]
  ordersByWarehouse: WarehouseCount[]
  salesByWarehouse: WarehouseCount[]
  inWayToClientByWarehouse: WarehouseCount[]
  inWayFromClientByWarehouse: WarehouseCount[]
  avgSalesByWarehouse: WarehouseCount[]
  stockTotal: WarehouseCount[]
  ownStockTotal: number
  trueVelocity: number
  velocityDetails: NmSummaryVelocityDetails
  dailyMetrics: NmSummaryDailyMetric[]
  dailyMetricsByWarehouse: NmSummaryDailyMetricWarehouse[]
  forecastTotal: number
  qtyToSend: number
  qtyToBuy: number

  trendPeriods?: NmSummaryTrendPeriods | null
  forecastByWarehouse: WarehouseCount[]
  qtyToSendByWarehouse: WarehouseCount[]
  sendPlanBySize: SizePlanCount[]
  warehouseSupplyPlan: WarehouseSupplyPlan[]
  productVolumeLiters: number | null
  priceCurrent: number | null
  realPrice: number | null
  logisticsCost: number | null
  storageCostDaily: number | null
  acceptanceCost: number | null
  acceptanceQuantity: number | null
  acceptanceQuantityByWarehouse: WarehouseCount[]
  inTransit: number
  inTransitByWarehouse: WarehouseCount[]
  feedbacks: number | null
  rating: number | null
  lastSupplyDate: string | null
  suppliesByWarehouse: SupplyWarehouseCount[]
  localOrdersByRegionPerWarehouse: Record<string, LocalityRegionCount[]>
  comparison?: NmSummaryComparison | null
  heavyMetricsLoaded?: boolean
  localProductId?: string | null
  localProductTitle?: string | null
  localProductVendorCode?: string | null
  localProductType?: string | null

  wbApiCompare?: WbApiCompareMetrics | null

  wbApiComparePending?: boolean

  sizeRows?: NmSummaryRow[]

  isSizeSubRow?: boolean
}

export type WbApiCompareMetrics = {
  orderSpeed: number | null
  buyoutPercent: number | null
  localizationPercent: number | null
}

export type NmSummaryResponse = {
  data: NmSummaryRow[]
  total: number

  hasMore?: boolean
  page: number
  pageSize: number
  profile?: {
    enabled: true
    totalDurationMs: number
    memoryDeltaMb: number | null
    cache?: {
      pageWindow?: "hit" | "miss"
      primaryRows?: "hit" | "miss"
      compareRows?: "hit" | "miss"
    }
    counters: Record<string, number>
    steps: Array<{
      name: string
      durationMs: number
      meta?: Record<string, number | string | boolean | null>
    }>
  }
}

export type NmSummaryHeavyRow = Pick<
  NmSummaryRow,
  | "nmId"
  | "supplierId"
  | "trueVelocity"
  | "velocityDetails"
  | "forecastTotal"
  | "qtyToSend"
  | "qtyToBuy"
  | "forecastByWarehouse"
  | "qtyToSendByWarehouse"
  | "sendPlanBySize"
  | "warehouseSupplyPlan"
  | "heavyMetricsLoaded"
> & {
  comparison?: Pick<
    NmSummaryComparison,
    | "trueVelocity"
    | "velocityDetails"
    | "forecastTotal"
    | "qtyToSend"
    | "qtyToBuy"
    | "forecastByWarehouse"
    | "qtyToSendByWarehouse"
    | "turnoverDays"
  > | null
}

export type NmSummaryHeavyResponse = {
  data: NmSummaryHeavyRow[]
}

export type NmSummaryQueryParams = {
  page: number
  pageSize: number
  sortBy: string
  sortDir: "asc" | "desc"
  includeHeavy?: string
  profile?: string
  nmId?: string[]
  q: string
  dateFrom: string
  dateTo: string
  compareFrom?: string
  compareTo?: string
  supplierArticle: string[]
  productName: string[]
  category: string[]
  warehouseName: string[]
  ownWarehouseId: string[]
  supplierId: string[]
  localProductGroup: string[]
}
