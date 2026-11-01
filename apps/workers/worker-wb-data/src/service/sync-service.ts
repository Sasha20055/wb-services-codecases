import pLimit from "p-limit"
import {
  getAvailableDataTypes,
  hasAnyUsableToken,
  resolveTokenByScope,
  type DataType,
} from "./token-resolver"
import * as mainApi from "./main-api"
import { handleSyncAuthError } from "./token-health"
import { getAllSyncInfo, updateSyncInfo, type SyncInfo } from "../db/repos/sync-info.repo"
import {
  bulkUpsertSales,
  bulkUpsertStocks,
  replaceStocksSnapshot,
  bulkUpsertStockHistory,
  bulkUpsertSupplies,
  bulkUpsertOrders,
  bulkUpdateOrdersIsLocal,
  updateOrdersSaleFlagsFromSales,
  applySaleFlagsForNewOrders,
  bulkUpsertPrices,
  bulkUpsertWarehouses,
  bulkUpsertWarehouseDetails,
  bulkUpsertProductDetails,
  ensureWarehouseBindingsForWarehouses,
  clearProductDetailsRealPriceByNmIds,
  deletePricesByNmIds,
  syncProductDetailsAdvertState,
} from "../db/repos/data.repo"
import { computeOrdersLocalityLocal } from "./order-locality"
import {
  fetchProductsBasicPrices,
  fetchProductsVariantMeta,
  enrichProductsWithVariantMeta,
  fetchProductsDetailDataWithFallback,
  fetchProductsIterator,
  type ProductDetailPatch,
  type WbPrice,
} from "./wb-api/products-api"
import {
  buildProductAcceptanceSummary,
  fetchAcceptanceOptions,
  type AcceptanceOptionsRequestItem,
  type ProductAcceptanceWarehouseOption,
  type ProductAcceptanceSummary,
} from "./wb-api/supplies-api"
import { fetchActiveAdvertNmIds } from "./wb-api/adverts-api"
import { processSalesBatches, fetchSalesDay } from "./wb-api/sales-api"
import { processOrdersBatches, fetchOrdersDay, type StatisticsBatchProgress } from "./wb-api/orders-api"
import { fetchAllStocks, type WbStock } from "./wb-api/stocks-api"
import { streamStockHistoryDailyCsv, type WbStockHistoryDaily } from "./wb-api/stock-history-api"
import { rssMb } from "../utils/mem"
import {
  fetchSupplies,
  fetchSupplyDetailForSupply,
  fetchSupplyGoodsForSupply,
  type WbSupply,
} from "./wb-api/supplies-api"
import { fetchWarehouses, type WbWarehouse } from "./wb-api/warehouses-api"
import { fetchWarehouseTariffSnapshots } from "./wb-api/warehouse-tariffs-api"

type WarehouseTariffsResult = Awaited<ReturnType<typeof fetchWarehouseTariffSnapshots>>

interface SupplierToken {
  _id: string
  value: string
  scope: { name: string; enabled: boolean }[]
  expressionTime?: string
}

type SyncSupplier = { _id: string; sid?: string; tokens: SupplierToken[] }

function getSupplierSyncRef(supplier: SyncSupplier): string {
  return mainApi.getSupplierRef({ _id: supplier._id, sid: supplier.sid ?? "" })
}

const SUPPLIER_DATATYPE_CONCURRENCY = Number.parseInt(
  process.env.WB_SUPPLIER_DATATYPE_CONCURRENCY ?? "5",
  10
)
const SUPPLIER_SYNC_TIMEOUT_MS = Number.parseInt(
  process.env.WB_SUPPLIER_SYNC_TIMEOUT_MS ?? "600000",
  10
)
const WB_STATISTICS_SYNC_TIMEOUT_MS = Number.parseInt(
  process.env.WB_STATISTICS_SYNC_TIMEOUT_MS ?? "900000",
  10
)
const SUPPLIES_GOODS_REQUEST_INTERVAL_MS = Number.parseInt(
  process.env.WB_SUPPLIES_GOODS_REQUEST_INTERVAL_MS ?? "2000",
  10
)
const WB_STATISTICS_INITIAL_DAYS = Number.parseInt(
  process.env.WB_STATISTICS_INITIAL_DAYS ?? "90",
  10
)

const WB_SUPPLIES_INITIAL_DAYS = Number.parseInt(
  process.env.WB_SUPPLIES_INITIAL_DAYS ?? "90",
  10
)
const WB_SUPPLIES_REFRESH_DAYS = Number.parseInt(
  process.env.WB_SUPPLIES_REFRESH_DAYS ?? "30",
  10
)

const IS_LOCAL_MODE = String(process.env.isLocalMode ?? "").trim().toLowerCase() === "true"

const STOCK_HISTORY_MIN_INTERVAL_MS = Number.parseInt(
  process.env.WB_STOCK_HISTORY_MIN_INTERVAL_MS ?? String(3 * 60 * 60 * 1000),
  10
)
const IGNORED_WAREHOUSE_NAMES = new Set(["Остальные склады"])

const suppliesGoodsSyncInFlight = new Map<string, Promise<void>>()

function getEmptyWarehouseTariffsResult(): WarehouseTariffsResult {
  return {
    snapshots: new Map(),
    debug: {
      boxByName: new Map(),
      acceptanceByWarehouseId: new Map(),
    },
  }
}

function normalizeWarehouseLookupName(value: unknown): string {
  return String(value ?? "").trim().toLocaleLowerCase()
}

function formatWarehouseTariffSample(items: Array<{ warehouseId?: string; warehouseName: string }>): string {
  return items
    .map((item) => {
      const name = item.warehouseName || "<empty>"
      return item.warehouseId ? `${item.warehouseId}:${name}` : name
    })
    .join(", ")
}

function collectWarehouseTariffDiagnostics(
  warehouses: WbWarehouse[],
  warehouseTariffsResult: WarehouseTariffsResult,
) {
  const warehouseNames = new Set<string>()
  let boxMatchedCount = 0
  let acceptanceMatchedCount = 0
  let bothMatchedCount = 0

  const missingBoxSamples: Array<{ warehouseId: string; warehouseName: string }> = []
  const missingAcceptanceSamples: Array<{ warehouseId: string; warehouseName: string }> = []

  for (const warehouse of warehouses) {
    const warehouseId = String(warehouse.ID)
    const normalizedName = normalizeWarehouseLookupName(warehouse.name)
    if (normalizedName) warehouseNames.add(normalizedName)

    const hasBoxTariff = Boolean(warehouseTariffsResult.debug.boxByName.get(normalizedName))
    const hasAcceptanceTariff = Boolean(
      warehouseTariffsResult.debug.acceptanceByWarehouseId.get(warehouseId),
    )

    if (hasBoxTariff) {
      boxMatchedCount += 1
    } else if (missingBoxSamples.length < 10) {
      missingBoxSamples.push({ warehouseId, warehouseName: warehouse.name })
    }

    if (hasAcceptanceTariff) {
      acceptanceMatchedCount += 1
    } else if (missingAcceptanceSamples.length < 10) {
      missingAcceptanceSamples.push({ warehouseId, warehouseName: warehouse.name })
    }

    if (hasBoxTariff && hasAcceptanceTariff) bothMatchedCount += 1
  }

  const boxTariffOnlySamples = Array.from(warehouseTariffsResult.debug.boxByName.keys())
    .filter((name) => !warehouseNames.has(name))
    .slice(0, 10)
    .map((name) => ({ warehouseName: name }))

  return {
    boxTariffEntries: warehouseTariffsResult.debug.boxByName.size,
    acceptanceTariffEntries: warehouseTariffsResult.debug.acceptanceByWarehouseId.size,
    boxMatchedCount,
    acceptanceMatchedCount,
    bothMatchedCount,
    noTariffMatchCount: warehouses.length - Math.max(boxMatchedCount, acceptanceMatchedCount),
    missingBoxSamples,
    missingAcceptanceSamples,
    boxTariffOnlySamples,
  }
}

function getDefaultDateFrom(): string {
  const safeDays = Number.isFinite(WB_STATISTICS_INITIAL_DAYS)
    ? Math.max(1, WB_STATISTICS_INITIAL_DAYS)
    : 30
  const d = new Date()
  d.setDate(d.getDate() - safeDays)
  return d.toISOString().split("T")[0]
}

function getDefaultDateTimeFrom(): string {
  const d = new Date()
  d.setDate(d.getDate() - 7)
  return d.toISOString()
}

function daysAgoDateString(days: number, fallback: number): string {
  const safeDays = Number.isFinite(days) ? Math.max(1, days) : fallback
  const d = new Date()
  d.setDate(d.getDate() - safeDays)
  return d.toISOString().split("T")[0]
}

function getSuppliesDateFrom(hasCursor: boolean): string {
  return hasCursor
    ? daysAgoDateString(WB_SUPPLIES_REFRESH_DAYS, 30)
    : daysAgoDateString(WB_SUPPLIES_INITIAL_DAYS, 90)
}

function getStockHistoryDefaultDateFrom(): string {
  const days = Number.parseInt(process.env.WB_STOCK_HISTORY_INITIAL_DAYS ?? "90", 10)
  const safeDays = Number.isFinite(days) ? Math.max(1, days) : 90
  const d = new Date()
  d.setDate(d.getDate() - safeDays)
  return d.toISOString().split("T")[0]
}

function getTodayDateString(): string {
  return new Date().toISOString().split("T")[0]
}

const WB_STATISTICS_INCREMENTAL_MAX_GAP_DAYS = Number.parseInt(
  process.env.WB_STATISTICS_INCREMENTAL_MAX_GAP_DAYS ?? "14",
  10
)

function getStatisticsBackfillStartDate(): string {
  const safeDays = Number.isFinite(WB_STATISTICS_INITIAL_DAYS) ? Math.max(1, WB_STATISTICS_INITIAL_DAYS) : 90
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - safeDays)
  return d.toISOString().split("T")[0]
}

function addDayString(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().split("T")[0]
}

function subDayString(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().split("T")[0]
}

function isCursorFresh(lastChangeDate: string | undefined): boolean {
  if (!lastChangeDate) return false
  const ts = new Date(lastChangeDate).getTime()
  if (!Number.isFinite(ts)) return false
  const maxGap = Number.isFinite(WB_STATISTICS_INCREMENTAL_MAX_GAP_DAYS)
    ? Math.max(1, WB_STATISTICS_INCREMENTAL_MAX_GAP_DAYS)
    : 14
  return (Date.now() - ts) / 86_400_000 <= maxGap
}

type WarehouseRecord = { warehouseName?: string; lastChangeDate?: string }

async function syncStatisticsType(opts: {
  dataType: DataType
  supplierId: string
  legacySupplierId?: string
  tokenValue: string
  syncInfo: SyncInfo | undefined
  signal?: AbortSignal
  fetchDay: (token: string, day: string, signal?: AbortSignal) => Promise<WarehouseRecord[]>
  processBatches: (
    token: string,
    dateFrom: string,
    onBatch: (batch: WarehouseRecord[], progress: StatisticsBatchProgress) => Promise<void>,
    signal?: AbortSignal
  ) => Promise<StatisticsBatchProgress>
  bulkUpsert: (items: Record<string, unknown>[], supplierId: string, legacySupplierId?: string) => Promise<number>
}): Promise<void> {
  const { dataType, supplierId, legacySupplierId, tokenValue, syncInfo, signal, fetchDay, processBatches, bulkUpsert } = opts
  const today = getTodayDateString()

  const wouldBackfill =
    syncInfo?.backfillDone !== true &&
    (syncInfo?.backfillDone === false ||
      syncInfo?.backfillDate != null ||
      !isCursorFresh(syncInfo?.lastChangeDate))

  if (IS_LOCAL_MODE && wouldBackfill) {
    console.log(
      `[синк] 🏠 ${supplierId}/${dataType}: локальный режим — стартовая загрузка flag=0 по левой дате (без подённого бэкфилла)`
    )
  }
  const needsBackfill = !IS_LOCAL_MODE && wouldBackfill

  if (needsBackfill) {

    const frozenCursor = syncInfo?.lastChangeDate || new Date().toISOString()

    const backfillInProgress = syncInfo?.backfillDone === false

    const floorDate =
      backfillInProgress && syncInfo?.backfillFloorDate
        ? syncInfo.backfillFloorDate
        : backfillInProgress && syncInfo?.backfillDate
          ? addDayString(syncInfo.backfillDate)
          : getStatisticsBackfillStartDate()

    if (!backfillInProgress || !syncInfo?.backfillFloorDate) {
      await updateSyncInfo({
        supplierId,
        legacySupplierId,
        type: dataType,
        lastSyncAt: new Date().toISOString(),
        lastChangeDate: frozenCursor,
        backfillDone: false,
        backfillFloorDate: floorDate,
        status: "syncing",
      })
    }

    let day =
      backfillInProgress && syncInfo?.backfillFloorDate && syncInfo?.backfillDate
        ? subDayString(syncInfo.backfillDate)
        : today
    console.log(
      `[синк] 🗓️ ${supplierId}/${dataType}: бэкфилл flag=1 по дням от ${day} вниз до ${floorDate}`
    )

    while (day >= floorDate) {
      if (signal?.aborted) throw new Error("aborted")

      const dayRecords = await fetchDay(tokenValue, day, signal)
      const filtered = filterIgnoredWarehouseRecords(dayRecords)
      if (filtered.length > 0) {
        console.log(
          `[синк] 💾 ${supplierId}/${dataType}: бэкфилл ${day} — пишу ${filtered.length}/${dayRecords.length} (rss=${rssMb()}MB)…`
        )
        await bulkUpsert(filtered as unknown as Record<string, unknown>[], supplierId, legacySupplierId)
      }
      logIgnoredWarehouseRecords(supplierId, dataType, dayRecords.length, filtered.length)

      await updateSyncInfo({
        supplierId,
        legacySupplierId,
        type: dataType,
        lastSyncAt: new Date().toISOString(),
        backfillDate: day,
        lastChangeDate: frozenCursor,
        status: "syncing",
      })
      day = subDayString(day)
    }

    await updateSyncInfo({
      supplierId,
      legacySupplierId,
      type: dataType,
      lastSyncAt: new Date().toISOString(),
      backfillDone: true,
      lastChangeDate: frozenCursor,
      status: "done",
    })
    console.log(`[синк] ✅ ${supplierId}/${dataType}: бэкфилл за период завершён, дальше инкремент flag=0`)
    return
  }

  const localStartupBackfill = IS_LOCAL_MODE && wouldBackfill

  if (localStartupBackfill && syncInfo?.backfillDone !== false) {
    await updateSyncInfo({
      supplierId,
      legacySupplierId,
      type: dataType,
      lastSyncAt: new Date().toISOString(),
      backfillDone: false,
      status: "syncing",
    })
  }
  const dateFrom = localStartupBackfill
    ? getStatisticsBackfillStartDate()
    : syncInfo?.lastChangeDate || getDefaultDateFrom()
  const progress = await processBatches(
    tokenValue,
    dateFrom,
    async (batch, batchProgress) => {
      const filtered = filterIgnoredWarehouseRecords(batch)
      if (filtered.length > 0) {
        console.log(
          `[синк] 💾 ${supplierId}/${dataType}: стр.${batchProgress.page} — пишу ${filtered.length}/${batch.length} записей (rss=${rssMb()}MB)…`
        )
        await bulkUpsert(filtered as unknown as Record<string, unknown>[], supplierId, legacySupplierId)
      }
      logIgnoredWarehouseRecords(supplierId, dataType, batch.length, filtered.length)
      console.log(
        `[синк] 📦 ${supplierId}/${dataType}: batch=${filtered.length}/${batch.length} сохранён (rss=${rssMb()}MB)`
      )

      await updateSyncInfo({
        supplierId,
        type: dataType,
        lastSyncAt: new Date().toISOString(),
        lastChangeDate: batchProgress.lastChangeDate,
        status: "syncing",
      })
    },
    signal
  )

  await updateSyncInfo({
    supplierId,
    type: dataType,
    lastSyncAt: new Date().toISOString(),
    lastChangeDate: progress.total > 0 ? progress.lastChangeDate : new Date().toISOString(),
    status: "done",

    ...(localStartupBackfill ? { backfillDone: true, backfillDate: today } : {}),
  })
  if (progress.total > 0) {
    console.log(`[синк] ✅ ${supplierId}/${dataType}: загружено ${progress.total}`)
  }
}

async function enrichOrdersLocality(
  items: Record<string, unknown>[],
  supplierId: string,
): Promise<void> {
  try {
    const orders = items
      .map((o) => ({
        srid: String((o as { srid?: unknown }).srid ?? "").trim(),
        supplierId,
        warehouseName: (o as { warehouseName?: unknown }).warehouseName as string | undefined,
        regionName: (o as { regionName?: unknown }).regionName as string | undefined,
        oblast: (o as { oblast?: unknown }).oblast as string | undefined,
      }))
      .filter((o) => o.srid)
    if (!orders.length) return

    const CHUNK = 1000
    for (let i = 0; i < orders.length; i += CHUNK) {
      const chunk = orders.slice(i, i + CHUNK)

      const results = await computeOrdersLocalityLocal(chunk)
      if (results.length) await bulkUpdateOrdersIsLocal(results)
    }
  } catch (err: any) {
    console.warn(`[синк] ⚠️ ${supplierId}/orders: обогащение isLocal пропущено — ${err?.message ?? err}`)
  }
}

function getSyncTimeoutMs(dataType: DataType): number {

  if (dataType === "stockHistory") {
    return 900_000
  }

  const isStatisticsDataType = dataType === "sales" || dataType === "orders" || dataType === "stocks"
  const configuredTimeout = isStatisticsDataType
    ? WB_STATISTICS_SYNC_TIMEOUT_MS
    : SUPPLIER_SYNC_TIMEOUT_MS

  return Number.isFinite(configuredTimeout)
    ? Math.max(1, configuredTimeout)
    : isStatisticsDataType
      ? 900_000
      : 120_000
}

export const ALL_DATA_TYPES: DataType[] = [
  "products",
  "sales",
  "stocks",
  "stockHistory",
  "supplies",
  "orders",
  "warehouses",
]

const typeLocks = new Set<string>()

const supplierTypeLocks = new Set<string>()

function supplierTypeLockKey(supplierRef: string, dataType: string): string {
  return `${supplierRef}|${dataType}`
}

async function markSyncError(
  supplierId: string,
  dataType: DataType,
  message: string,
  legacySupplierId?: string,
): Promise<void> {
  try {
    await updateSyncInfo({
      supplierId,
      legacySupplierId,
      type: dataType,
      lastSyncAt: new Date().toISOString(),
      status: "error",
      error: message,
    })
  } catch {

  }
}

export function hasUsableDataTypes(supplier: SyncSupplier): boolean {
  //@ts-ignore
  return hasAnyUsableToken(supplier.tokens)
}

export function isSyncTypeLocked(dataType: string) {
  return typeLocks.has(dataType)
}

export async function triggerSyncForType(
  dataType: DataType,
  suppliers: SyncSupplier[],
  isCancelled?: () => boolean
): Promise<boolean> {
  if (typeLocks.has(dataType)) {
    console.log(`[синк] ⏭️ Синк типа ${dataType} уже выполняется воркером, пропускаю...`)
    return false
  }
  typeLocks.add(dataType)

  try {
    if (dataType === "products") {
      return await triggerProductsSync(suppliers, isCancelled)
    }

    const timeoutMs = getSyncTimeoutMs(dataType)

    const conc = Number.isFinite(SUPPLIER_DATATYPE_CONCURRENCY)
      ? Math.max(1, SUPPLIER_DATATYPE_CONCURRENCY)
      : 5
    const limit = pLimit(conc)
    const sharedWarehouseTariffsPromise: Promise<WarehouseTariffsResult> | null =
      dataType === "warehouses"
        ? (() => {
            const warehouseToken = suppliers
              .map((supplier) => {
                const tokens = supplier.tokens
                //@ts-ignore
                const available = getAvailableDataTypes(tokens)
                return available.find((item) => item.dataType === "warehouses")?.token.value
              })
              .find((value): value is string => Boolean(value))

            if (!warehouseToken) return null

            return fetchWarehouseTariffSnapshots(warehouseToken).catch((err: any) => {
              console.warn(
                `[синк] ⚠️ warehouses/shared-tariffs: не удалось получить общие тарифы складов — ${err.message}`
              )
              return getEmptyWarehouseTariffsResult()
            })
          })()
        : null

    const tasks = suppliers.map((supplier) =>
      limit(() =>
        syncSupplierDataType(supplier, dataType, {
          timeoutMs,
          sharedWarehouseTariffsPromise,
          isCancelled,
        }),
      ),
    )

    await Promise.all(tasks)
    return true
  } finally {
    typeLocks.delete(dataType)
  }
}

async function syncSupplierDataType(
  supplier: SyncSupplier,
  dataType: DataType,
  opts: {
    timeoutMs: number
    sharedWarehouseTariffsPromise?: Promise<WarehouseTariffsResult> | null
    isCancelled?: () => boolean
  },
): Promise<void> {
  const supplierId = getSupplierSyncRef(supplier)
  if (opts.isCancelled?.()) {
    console.log(`[синк] 🛑 ${supplierId}/${dataType}: пропуск (остановка воркера)`)
    return
  }

  const tokens = supplier.tokens
  //@ts-ignore
  const available = getAvailableDataTypes(tokens)
  const hasType = available.find((a) => a.dataType === dataType)
  if (!hasType) return

  const lockKey = supplierTypeLockKey(supplierId, dataType)
  if (supplierTypeLocks.has(lockKey)) {
    console.log(`[синк] ⏭️ ${supplierId}/${dataType}: уже синкается другим путём, пропускаю`)
    return
  }
  supplierTypeLocks.add(lockKey)

  try {
    console.log(`[синк] 🚀 ${supplierId}: начинаю синхронизацию [${dataType}]`)

    const allSyncInfos = await getAllSyncInfo(supplierId, supplier._id)
    const syncInfo = allSyncInfos.find((info) => info.type === dataType)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => {
      controller.abort()
    }, opts.timeoutMs)

    try {
      await syncDataType(
        supplierId,
        dataType,
        hasType.token.value,
        syncInfo,
        supplier._id,
        controller.signal,
        opts.sharedWarehouseTariffsPromise,
      )
    } catch (err: any) {
      if (controller.signal.aborted) {
        console.error(`[синк] ⏱️ ${supplierId}/${dataType}: прервано по таймауту (${opts.timeoutMs}ms)`)
        return
      }

      if (await handleSyncAuthError(err, supplier, hasType.token._id)) {
        console.error(`[синк] 🔑 ${supplierId}/${dataType}: токен отозван (401/403) — отбракован`)
        await markSyncError(supplierId, dataType, "токен отозван WB (401/403)", supplier._id)
        return
      }
      console.error(`[синк] ❌ ${supplierId}/${dataType}: ошибка — ${err.message}`)
      await markSyncError(supplierId, dataType, String(err?.message ?? err), supplier._id)
    } finally {
      clearTimeout(timeoutId)
    }
  } finally {
    supplierTypeLocks.delete(lockKey)
  }
}

const IMMEDIATE_SYNC_DATA_TYPES: DataType[] = [
  "products",
  "stocks",
  "warehouses",
  "supplies",
  "sales",
  "orders",
  "stockHistory",
]

export async function triggerSyncForSupplier(
  supplier: SyncSupplier,
  isCancelled?: () => boolean,
): Promise<void> {
  const supplierId = getSupplierSyncRef(supplier)

  const frozen: SyncSupplier = { ...supplier, tokens: [...supplier.tokens] }
  console.log(`[синк] 🆕 ${supplierId}: немедленная синхронизация нового кабинета — старт`)

  if (isCancelled?.()) {
    console.log(`[синк] 🛑 ${supplierId}: немедленная синхронизация прервана`)
    return
  }

  try {
    await triggerProductsSync([frozen], isCancelled)
  } catch (err: any) {
    console.error(
      `[синк] ❌ ${supplierId}/products: ошибка немедленной синхронизации — ${err?.message ?? err}`,
    )
  }

  const restTypes = IMMEDIATE_SYNC_DATA_TYPES.filter((type) => type !== "products")
  await Promise.all(
    restTypes.map(async (dataType) => {
      if (isCancelled?.()) return
      try {
        await syncSupplierDataType(frozen, dataType, {
          timeoutMs: getSyncTimeoutMs(dataType),
          isCancelled,
        })
      } catch (err: any) {
        console.error(
          `[синк] ❌ ${supplierId}/${dataType}: ошибка немедленной синхронизации — ${err?.message ?? err}`,
        )
      }
    }),
  )

  if (isCancelled?.()) {
    console.log(`[синк] 🛑 ${supplierId}: немедленная синхронизация прервана`)
    return
  }

  console.log(`[синк] ✅ ${supplierId}: немедленная синхронизация нового кабинета завершена`)
}

interface SupplierProductsPhase1Result {
  supplierId: string
  legacySupplierId?: string
  nmIds: number[]
  acceptanceItems: AcceptanceOptionsRequestItem[]
  productTokenValue: string
  acceptanceTokenValue?: string
  pricesTokenValue?: string
  advertsTokenValue?: string
  maxCursorUpdatedAt: string
  total: number
}

async function triggerProductsSync(
  suppliers: SyncSupplier[],
  isCancelled?: () => boolean,
): Promise<boolean> {
  const timeoutMs = Number.isFinite(SUPPLIER_SYNC_TIMEOUT_MS)
    ? Math.max(1, SUPPLIER_SYNC_TIMEOUT_MS)
    : 120_000

  const conc = Number.isFinite(SUPPLIER_DATATYPE_CONCURRENCY)
    ? Math.max(1, SUPPLIER_DATATYPE_CONCURRENCY)
    : 5
  const limit = pLimit(conc)

  const phase1Results: SupplierProductsPhase1Result[] = []

  await Promise.all(
    suppliers.map((supplier) =>
      limit(async () => {
        const supplierId = getSupplierSyncRef(supplier)
        if (isCancelled?.()) {
          console.log(`[синк] 🛑 ${supplierId}/products: пропуск (остановка воркера)`)
          return
        }

        const tokens = supplier.tokens
        //@ts-ignore
        const available = getAvailableDataTypes(tokens)
        const hasType = available.find((a) => a.dataType === "products")
        if (!hasType) return
        const advertsToken = resolveTokenByScope(tokens, "adverts")
        const pricesToken = resolveTokenByScope(tokens, "prices")
        const acceptanceToken = resolveTokenByScope(tokens, "supplies")

        console.log(`[синк] 🚀 ${supplierId}: начинаю синхронизацию [products] (phase 1 — список товаров)`)

        const allSyncInfos = await getAllSyncInfo(supplierId, supplier._id)
        const syncInfo = allSyncInfos.find((info) => info.type === "products")
        const lastChangeDate = syncInfo?.lastChangeDate
        const syncUpdatedAt = syncInfo?.lastSyncAt || lastChangeDate

        await updateSyncInfo({
          supplierId,
          legacySupplierId: supplier._id,
          type: "products",
          lastSyncAt: new Date().toISOString(),
          status: "syncing",
          ...(lastChangeDate ? { lastChangeDate } : {}),
          ...(syncInfo?.lastRrdId !== undefined ? { lastRrdId: syncInfo.lastRrdId } : {}),
        })

        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

        try {
          let total = 0
          const syncedNmIds = new Set<number>()
          const acceptanceItemsByBarcode = new Map<string, AcceptanceOptionsRequestItem>()
          let maxCursorUpdatedAt = lastChangeDate || getDefaultDateTimeFrom()

          for await (const { products, cursorUpdatedAt } of fetchProductsIterator(
            hasType.token.value,
            supplierId,
            syncUpdatedAt,
            controller.signal,
          )) {
            if (controller.signal.aborted) throw new Error("aborted")
            if (products.length > 0) {
              let productsToSave = products

              if (pricesToken?.value) {
                try {
                  const variantsByNmId = await fetchProductsVariantMeta(
                    pricesToken.value,
                    products.map((product) => product.nmId).filter((nmId): nmId is number => Number.isFinite(nmId)),
                    controller.signal,
                  )
                  productsToSave = enrichProductsWithVariantMeta(products, variantsByNmId)
                } catch (err: any) {
                  console.warn(
                    `[синк] ⚠️ ${supplierId}/products: не удалось обогатить sizes chrtId через prices API — ${err.message}`,
                  )
                }
              }

              await mainApi.bulkUpsertProducts(productsToSave)
              total += productsToSave.length
              for (const product of productsToSave) {
                if (typeof product.nmId === "number") {
                  syncedNmIds.add(product.nmId)
                }
                for (const acceptanceItem of collectAcceptanceRequestItems(product)) {
                  acceptanceItemsByBarcode.set(acceptanceItem.barcode, acceptanceItem)
                }
              }
              console.log(
                `[синк] 📦 ${supplierId}/products: сохранено пачку из ${productsToSave.length} (всего ${total})`,
              )
            }
            if (cursorUpdatedAt) {
              maxCursorUpdatedAt = cursorUpdatedAt
            }
          }

          const dbNmIds = await mainApi.getSupplierProductNmIds(supplierId)
          for (const nmId of dbNmIds) {
            if (Number.isFinite(nmId) && nmId > 0) {
              syncedNmIds.add(nmId)
            }
          }

          phase1Results.push({
            supplierId,
            legacySupplierId: supplier._id,
            nmIds: Array.from(syncedNmIds),
            acceptanceItems: [...acceptanceItemsByBarcode.values()],
            productTokenValue: hasType.token.value,
            acceptanceTokenValue: acceptanceToken?.value,
            pricesTokenValue: pricesToken?.value,
            advertsTokenValue: advertsToken?.value,
            maxCursorUpdatedAt,
            total,
          })
        } catch (err: any) {
          if (controller.signal.aborted) {
            console.error(`[синк] ⏱️ ${supplierId}/products: прервано по таймауту (${timeoutMs}ms)`)
          } else if (await handleSyncAuthError(err, supplier, hasType.token._id)) {
            console.error(`[синк] 🔑 ${supplierId}/products: токен отозван (401/403) — отбракован`)
            await markSyncError(supplierId, "products", "токен отозван WB (401/403)", supplier._id)
          } else {
            console.error(`[синк] ❌ ${supplierId}/products: ошибка phase 1 — ${err.message}`)
            await markSyncError(supplierId, "products", String(err?.message ?? err), supplier._id)
          }
        } finally {
          clearTimeout(timeoutId)
        }
      }),
    ),
  )

  const allNmIds = new Set<number>()
  for (const result of phase1Results) {
    for (const nmId of result.nmIds) {
      allNmIds.add(nmId)
    }
  }

  let detailPatches = new Map<number, ProductDetailPatch>()
  let detailPricedNmIds = new Set<number>()
  let detailLoaded = false

  if (allNmIds.size > 0) {
    try {
      console.log(`[синк] 🔍 products/detail: запрашиваю данные для ${allNmIds.size} уникальных nmIds`)
      const result = await fetchProductsDetailDataWithFallback(Array.from(allNmIds))
      detailPatches = result.patches
      detailPricedNmIds = result.pricedNmIds
      detailLoaded = true
      console.log(
        `[синк] ✅ products/detail: получено ${detailPatches.size} patches, ${detailPricedNmIds.size} realPrices`,
      )
    } catch (err: any) {
      console.error(`[синк] ❌ products/detail: ошибка батч-запроса — ${err.message}`)
    }
  }

  for (const result of phase1Results) {
    const supplierNmIdSet = new Set(result.nmIds)
    const supplierAcceptanceItems = await resolveSupplierAcceptanceItems(result)
    const acceptanceSummaryByNmId: Map<number, ProductAcceptanceSummary> = supplierAcceptanceItems.length > 0
      ? await syncAcceptanceOptionsForSupplier(result, supplierAcceptanceItems)
      : new Map<number, ProductAcceptanceSummary>()

    if (supplierNmIdSet.size > 0 && (detailPatches.size > 0 || acceptanceSummaryByNmId.size > 0)) {
      const supplierDetailItems: Record<string, unknown>[] = []
      const nmIdsForDetails = new Set<number>([
        ...Array.from(detailPatches.keys()),
        ...Array.from(acceptanceSummaryByNmId.keys()),
      ])

      for (const nmId of nmIdsForDetails) {
        if (!supplierNmIdSet.has(nmId)) continue
        const patch = detailPatches.get(nmId)
        const acceptanceSummary = acceptanceSummaryByNmId.get(nmId)
        supplierDetailItems.push({
          nmId,
          supplierId: result.supplierId,
          legacySupplierId: result.legacySupplierId,
          ...(typeof patch?.rating === "number" ? { rating: patch.rating } : {}),
          ...(typeof patch?.feedbacks === "number" ? { feedbacks: patch.feedbacks } : {}),
          ...(typeof patch?.realPrice === "number" ? { realPrice: patch.realPrice } : {}),
          ...(acceptanceSummary
            ? {
                acceptanceQuantity: acceptanceSummary.acceptanceQuantity,
                acceptanceOptionsByWarehouse: acceptanceSummary.acceptanceOptionsByWarehouse.map((item: ProductAcceptanceWarehouseOption) => ({
                  warehouseId: item.warehouseId,
                  warehouseName: item.warehouseName,
                  quantity: item.quantity,
                })),
                acceptanceRequestBarcodes: acceptanceSummary.acceptanceRequestBarcodes,
                acceptanceUpdatedAt: new Date().toISOString(),
              }
            : {}),
        })
      }

      if (supplierDetailItems.length > 0) {
        await bulkUpsertProductDetails(supplierDetailItems)
        console.log(
          `[синк] ⭐💬 ${result.supplierId}/products: productDetails обновлены для ${supplierDetailItems.length} товаров`,
        )
      } else {
        console.warn(`[синк] ⚠️ ${result.supplierId}/products: detail API не вернул данных`)
      }

      if (detailLoaded) {
        const nmIdsWithoutRealPrice = result.nmIds.filter((nmId) => !detailPricedNmIds.has(nmId))
        if (nmIdsWithoutRealPrice.length > 0) {
          const clearedCount = await clearProductDetailsRealPriceByNmIds(
            result.supplierId,
            nmIdsWithoutRealPrice,
            result.legacySupplierId,
          )
          console.log(
            `[синк] 🧹 ${result.supplierId}/products: realPrice очищен у ${clearedCount} товаров`,
          )
        }

        if (result.pricesTokenValue) {
          try {
            const basicPrices = await fetchProductsBasicPrices(
              result.pricesTokenValue,
              result.nmIds,
            )
            const supplierPrices = Array.from(basicPrices.values())
              .filter((price) => detailPricedNmIds.has(price.nmId))
              .map((price) => ({
                ...price,
                supplierId: result.supplierId,
                legacySupplierId: result.legacySupplierId,
              }) as Record<string, unknown>)

            if (supplierPrices.length > 0) {
              await bulkUpsertPrices(supplierPrices)
              console.log(
                `[синк] 💸 ${result.supplierId}/products: prices сохранены (${supplierPrices.length})`,
              )
            } else {
              console.log(`[синк] ℹ️ ${result.supplierId}/products: prices для сохранения отсутствуют`)
            }

            const nmIdsWithPersistedPrices = new Set(supplierPrices.map((item) => Number(item.nmId)))
            const nmIdsToDelete = result.nmIds.filter((nmId) => !nmIdsWithPersistedPrices.has(nmId))
            if (nmIdsToDelete.length > 0) {
              const deletedCount = await deletePricesByNmIds(result.supplierId, nmIdsToDelete, result.legacySupplierId)
              console.log(
                `[синк] 🗑️ ${result.supplierId}/products: prices удалены у ${deletedCount} товаров`,
              )
            }
          } catch (err: any) {
            console.error(
              `[синк] ❌ ${result.supplierId}/products: ошибка basic prices API — ${err.message}`,
            )
          }
        } else {
          console.warn(
            `[синк] ⚠️ ${result.supplierId}/products: нет токена со scope "prices", синхронизация цен пропущена`,
          )
        }
      }
    }

    if (result.advertsTokenValue) {
      try {
        const activeAdvertNmIds = await fetchActiveAdvertNmIds(result.advertsTokenValue)
        const updatedCount = await syncProductDetailsAdvertState(
          result.supplierId,
          Array.from(activeAdvertNmIds),
          result.legacySupplierId,
        )
        console.log(
          `[синк] 📣 ${result.supplierId}/products: isAdvert синхронизирован (active=${activeAdvertNmIds.size}, updated=${updatedCount})`,
        )
      } catch (err: any) {
        console.error(
          `[синк] ❌ ${result.supplierId}/products: ошибка isAdvert — ${err.message}`,
        )
      }
    } else {
      console.warn(
        `[синк] ⚠️ ${result.supplierId}/products: нет токена со scope "adverts", обновление isAdvert пропущено`,
      )
    }

    if (result.total > 0) {
      console.log(`[синк] ✅ ${result.supplierId}/products: Всего загружено ${result.total}`)
    }

    await updateSyncInfo({
      supplierId: result.supplierId,
      legacySupplierId: result.legacySupplierId,
      type: "products",
      lastSyncAt: new Date().toISOString(),
      status: "done",
      lastChangeDate: result.maxCursorUpdatedAt,
    })
  }

  return true
}

async function resolveSupplierAcceptanceItems(
  result: SupplierProductsPhase1Result,
): Promise<AcceptanceOptionsRequestItem[]> {
  if (result.acceptanceItems.length > 0) {
    return result.acceptanceItems
  }

  const products = await mainApi.queryProducts([result.supplierId], result.nmIds)
  const deduped = new Map<string, AcceptanceOptionsRequestItem>()
  for (const product of products) {
    for (const item of collectAcceptanceRequestItems(product)) {
      deduped.set(item.barcode, item)
    }
  }

  return [...deduped.values()]
}

async function syncAcceptanceOptionsForSupplier(
  result: SupplierProductsPhase1Result,
  items: AcceptanceOptionsRequestItem[],
): Promise<Map<number, ProductAcceptanceSummary>> {
  if (!result.acceptanceTokenValue) {
    console.warn(
      `[синк] ⚠️ ${result.supplierId}/products: нет токена со scope "supplies", acceptance options пропущены`,
    )
    return new Map<number, ProductAcceptanceSummary>()
  }

  try {
    const responseItems = await fetchAcceptanceOptions(result.acceptanceTokenValue, items)
    const summaryByNmId = buildProductAcceptanceSummary(items, responseItems)
    console.log(
      `[синк] 📥 ${result.supplierId}/products: acceptance options обновлены для ${summaryByNmId.size} товаров (rows=${responseItems.length}, requested=${items.length})`,
    )
    return summaryByNmId
  } catch (err: any) {
    console.error(
      `[синк] ❌ ${result.supplierId}/products: ошибка acceptance options — ${err?.message ?? err}`,
    )
    return new Map<number, ProductAcceptanceSummary>()
  }
}

function collectAcceptanceRequestItems(
  product: { nmId?: unknown; nmID?: unknown; sizes?: Array<{ skus?: unknown }> },
): AcceptanceOptionsRequestItem[] {
  const nmId = Number(product?.nmId ?? product?.nmID)
  if (!Number.isFinite(nmId) || nmId <= 0) return []

  const deduped = new Map<string, AcceptanceOptionsRequestItem>()
  for (const size of product?.sizes ?? []) {
    for (const sku of Array.isArray(size?.skus) ? size.skus : []) {
      const barcode = String(sku ?? "").trim()
      if (!barcode) continue
      deduped.set(barcode, { barcode, quantity: 1, nmId })
    }
  }

  return [...deduped.values()]
}

async function syncDataType(
  supplierId: string,
  dataType: DataType,
  tokenValue: string,
  syncInfo: SyncInfo | undefined,
  legacySupplierId?: string,
  signal?: AbortSignal,
  sharedWarehouseTariffsPromise?: Promise<WarehouseTariffsResult> | null,
): Promise<void> {
  if (signal?.aborted) {
    throw new Error("aborted")
  }

  if (dataType === "stockHistory") {
    const lastSyncAtMs = syncInfo?.lastSyncAt ? Date.parse(syncInfo.lastSyncAt) : NaN
    if (Number.isFinite(lastSyncAtMs) && Date.now() - lastSyncAtMs < STOCK_HISTORY_MIN_INTERVAL_MS) {
      const nextInMin = Math.ceil((STOCK_HISTORY_MIN_INTERVAL_MS - (Date.now() - lastSyncAtMs)) / 60000)
      console.log(
        `[синк] ⏳ ${supplierId}/stockHistory: пропуск — синхронизировано недавно (лимит WB 20 отчётов/сутки), следующий запуск через ~${nextInMin} мин`
      )
      return
    }
  }

  console.log(`[синк] ▶ ${supplierId}/${dataType}: запрашиваю данные у WB API… (rss=${rssMb()}MB)`)
  const lastChangeDate = syncInfo?.lastChangeDate

  await updateSyncInfo({
    supplierId,
    legacySupplierId,
    type: dataType,
    lastSyncAt: new Date().toISOString(),
    status: "syncing",
    ...(lastChangeDate ? { lastChangeDate } : {}),
    ...(syncInfo?.lastRrdId !== undefined ? { lastRrdId: syncInfo.lastRrdId } : {}),
  })

  switch (dataType) {
    case "sales": {
      await syncStatisticsType({
        dataType,
        supplierId,
        legacySupplierId,
        tokenValue,
        syncInfo,
        signal,
        fetchDay: fetchSalesDay,
        processBatches: processSalesBatches,
        bulkUpsert: async (items, sid, legacy) => {
          const written = await bulkUpsertSales(items, sid, legacy)

          try {
            await updateOrdersSaleFlagsFromSales(items)
          } catch (err: any) {
            console.warn(`[синк] ⚠️ ${sid}/sales: обновление saleFlag заказов пропущено — ${err?.message ?? err}`)
          }
          return written
        },
      })
      break
    }

    case "stocks": {
      const snapshotStartedAt = new Date().toISOString()
      const stocks = await fetchAllStocks(tokenValue, lastChangeDate || getDefaultDateFrom(), signal)
      const filteredStocks = filterIgnoredWarehouseRecords(stocks)
      const mapped = filteredStocks.map(
        (stock: WbStock) => ({ ...stock, supplierId, legacySupplierId }) as Record<string, unknown>,
      )

      const result = await replaceStocksSnapshot(supplierId, mapped, legacySupplierId)

      logIgnoredWarehouseRecords(supplierId, dataType, stocks.length, filteredStocks.length)
      console.log(
        `[синк] ✅ ${supplierId}/stocks: snapshot=${filteredStocks.length}, upserted=${result.upserted}, deleted=${result.deleted}`,
      )

      await updateSyncInfo({
        supplierId,
        type: dataType,
        lastSyncAt: new Date().toISOString(),
        lastChangeDate: snapshotStartedAt,
        status: "done",
      })
      break
    }

    case "stockHistory": {
      const dateFrom = lastChangeDate || getStockHistoryDefaultDateFrom()
      const dateTo = getTodayDateString()

      let totalCount = 0
      let keptCount = 0
      let maxDate = dateFrom

      await streamStockHistoryDailyCsv(
        tokenValue,
        { dateFrom, dateTo, afterDate: lastChangeDate || null },
        async (entries: WbStockHistoryDaily[]) => {
          totalCount += entries.length
          for (const item of entries) {
            if (item.date > maxDate) maxDate = item.date
          }

          const filtered = filterIgnoredWarehouseRecords(entries)
          if (filtered.length === 0) return

          keptCount += filtered.length
          console.log(
            `[синк] 💾 ${supplierId}/stockHistory: пишу чанк ${filtered.length} (всего ${keptCount}, rss=${rssMb()}MB)…`
          )
          const mapped = filtered.map(
            (item: WbStockHistoryDaily) =>
              ({ ...item, supplierId, legacySupplierId }) as Record<string, unknown>,
          )
          await bulkUpsertStockHistory(mapped)
        },
        { signal },
      )

      if (totalCount > 0) {
        logIgnoredWarehouseRecords(supplierId, dataType, totalCount, keptCount)
        console.log(`[синк] ✅ ${supplierId}/stockHistory: загружено ${keptCount}`)

        await updateSyncInfo({
          supplierId,
          type: dataType,
          lastSyncAt: new Date().toISOString(),
          lastChangeDate: maxDate,
          status: "done",
        })
      } else {
        await updateSyncInfo({
          supplierId,
          type: dataType,
          lastSyncAt: new Date().toISOString(),
          lastChangeDate: dateTo,
          status: "done",
        })
      }
      break
    }

    case "supplies": {

      const dateFrom = getSuppliesDateFrom(Boolean(lastChangeDate))
      const supplies = await fetchSupplies(tokenValue, dateFrom, signal)
      if (supplies.length > 0) {
        const mapped = supplies.map((s: WbSupply) => ({ ...s, supplierId, legacySupplierId }) as Record<string, unknown>)
        await bulkUpsertSupplies(mapped)
        console.log(`[синк] ✅ ${supplierId}/supplies: загружено ${supplies.length}`)
        startSuppliesGoodsSyncInBackground(supplierId, tokenValue, supplies, legacySupplierId)

        const maxDate = getMaxSupplyDateCursor(supplies, dateFrom)
        await updateSyncInfo({
          supplierId,
          type: dataType,
          lastSyncAt: new Date().toISOString(),
          ...(maxDate ? { lastChangeDate: maxDate } : {}),
          status: "done",
        })
      } else {
        await updateSyncInfo({
          supplierId,
          type: dataType,
          lastSyncAt: new Date().toISOString(),
          ...(lastChangeDate ? { lastChangeDate } : {}),
          status: "done",
        })
      }
      break
    }
function startSuppliesGoodsSyncInBackground(
  supplierId: string,
  tokenValue: string,
  supplies: WbSupply[],
  legacySupplierId?: string,
) {
  if (suppliesGoodsSyncInFlight.has(supplierId)) {
    console.log(`[синк] ⏭️ ${supplierId}/supplies-goods: уже выполняется в фоне`)
    return
  }

  const GOODS_BATCH_FLUSH_SIZE = 10

  const task = (async () => {
    const requestIntervalMs = Number.isFinite(SUPPLIES_GOODS_REQUEST_INTERVAL_MS)
      ? Math.max(0, SUPPLIES_GOODS_REQUEST_INTERVAL_MS)
      : 2000

    console.log(
      `[синк] 🧵 ${supplierId}/supplies-goods: фоновая синхронизация запущена (${supplies.length} поставок)`
    )

    let patches: Record<string, unknown>[] = []
    let totalFlushed = 0

    for (let index = 0; index < supplies.length; index++) {
      const supply = supplies[index]
      const hasSupplyId = isValidSupplyIdentity(supply.supplyID)
      const hasPreorderId = isValidSupplyIdentity(supply.preorderID)

      if (!hasSupplyId && !hasPreorderId) {
        continue
      }

      const detail = await fetchSupplyDetailForSupply(supply, tokenValue)
      if (requestIntervalMs > 0) {
        await sleep(requestIntervalMs)
      }

      const goods = await fetchSupplyGoodsForSupply(supply, tokenValue)
      patches.push({
        ...(detail ?? {}),
        supplierId,
        legacySupplierId,
        supplyID: supply.supplyID,
        preorderID: supply.preorderID,
        goods,
      })

      if (patches.length >= GOODS_BATCH_FLUSH_SIZE) {
        await bulkUpsertSupplies(patches)
        totalFlushed += patches.length
        console.log(
          `[синк] 📦 ${supplierId}/supplies-goods: записано ${totalFlushed}/${supplies.length}`
        )
        patches = []
      }

      if (index < supplies.length - 1 && requestIntervalMs > 0) {
        await sleep(requestIntervalMs)
      }
    }

    if (patches.length > 0) {
      await bulkUpsertSupplies(patches)
      totalFlushed += patches.length
    }

    console.log(
      `[синк] ✅ ${supplierId}/supplies-goods: фоновая синхронизация завершена (обновлено ${totalFlushed})`
    )
  })()

  suppliesGoodsSyncInFlight.set(supplierId, task)
  void task
    .catch((err: any) => {
      console.error(
        `[синк] ❌ ${supplierId}/supplies-goods: ошибка фоновой синхронизации — ${err?.message ?? err}`
      )
    })
    .finally(() => {
      suppliesGoodsSyncInFlight.delete(supplierId)
    })
}

    case "orders": {
      await syncStatisticsType({
        dataType,
        supplierId,
        legacySupplierId,
        tokenValue,
        syncInfo,
        signal,
        fetchDay: fetchOrdersDay,
        processBatches: processOrdersBatches,
        bulkUpsert: async (items, sid, legacy) => {
          const written = await bulkUpsertOrders(items, sid, legacy)

          await enrichOrdersLocality(items, sid)

          try {
            await applySaleFlagsForNewOrders(items)
          } catch (err: any) {
            console.warn(`[синк] ⚠️ ${sid}/orders: подтяжка saleFlag пропущена — ${err?.message ?? err}`)
          }
          return written
        },
      })
      break
    }

    case "warehouses": {
      const [warehouses, warehouseTariffsResult] = await Promise.all([
        fetchWarehouses(tokenValue, signal),
        (sharedWarehouseTariffsPromise ?? fetchWarehouseTariffSnapshots(tokenValue, signal)).catch((err: any) => {
          console.warn(`[синк] ⚠️ ${supplierId}/warehouses: не удалось получить тарифы складов — ${err.message}`)
          return getEmptyWarehouseTariffsResult()
        }),
      ])
      const warehouseTariffs = warehouseTariffsResult.snapshots
      if (warehouses.length > 0) {
        const diagnostics = collectWarehouseTariffDiagnostics(warehouses, warehouseTariffsResult)

        console.log(
          `[синк] 📦 ${supplierId}/warehouses: wbWarehouses=${warehouses.length}, boxTariffs=${diagnostics.boxTariffEntries}, acceptanceTariffs=${diagnostics.acceptanceTariffEntries}, boxMatched=${diagnostics.boxMatchedCount}, acceptanceMatched=${diagnostics.acceptanceMatchedCount}, bothMatched=${diagnostics.bothMatchedCount}, noTariffMatch=${diagnostics.noTariffMatchCount}`,
        )

        if (diagnostics.missingBoxSamples.length > 0) {
          console.warn(
            `[синк] ⚠️ ${supplierId}/warehouses: нет box/storage match для ${warehouses.length - diagnostics.boxMatchedCount} складов. Примеры: ${formatWarehouseTariffSample(diagnostics.missingBoxSamples)}`,
          )
        }

        if (diagnostics.missingAcceptanceSamples.length > 0) {
          console.warn(
            `[синк] ⚠️ ${supplierId}/warehouses: нет acceptance match для ${warehouses.length - diagnostics.acceptanceMatchedCount} складов. Примеры: ${formatWarehouseTariffSample(diagnostics.missingAcceptanceSamples)}`,
          )
        }

        if (diagnostics.boxTariffOnlySamples.length > 0) {
          console.warn(
            `[синк] ⚠️ ${supplierId}/warehouses: box/storage тарифы без совпадения со складами WB. Примеры: ${formatWarehouseTariffSample(diagnostics.boxTariffOnlySamples)}`,
          )
        }

        const mapped = warehouses.map((w: WbWarehouse) => {
          const tariffById = warehouseTariffs.get(String(w.ID))
          const tariffByName = warehouseTariffs.get(normalizeWarehouseLookupName(w.name))

          const result = {
            warehouseId: w.ID,
            name: w.name,
            address: w.address,
            workTime: w.workTime,
            isActive: w.isActive,
            isTransitActive: w.isTransitActive,
            acceptsQR: w.acceptsQR,
            ...tariffById,
            ...tariffByName,
            supplierId,
            legacySupplierId,
          } as Record<string, unknown>

          return result
        })
        await bulkUpsertWarehouses(mapped)
        await bulkUpsertWarehouseDetails(mapped)
        await ensureWarehouseBindingsForWarehouses(mapped)
        console.log(`[синк] ✅ ${supplierId}/warehouses: загружено ${warehouses.length}`)
      }
      await updateSyncInfo({
        supplierId,
        type: dataType,
        lastSyncAt: new Date().toISOString(),
        lastChangeDate: new Date().toISOString(),
        status: "done",
      })
      break
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getSupplyDateCursor(supply: WbSupply): string | null {
  const candidate = [supply.createDate, supply.createdAt]
    .find((value) => typeof value === "string" && value.trim().length > 0)

  if (!candidate) {
    return null
  }

  const parsed = Date.parse(candidate)
  if (!Number.isFinite(parsed)) {
    return null
  }

  return new Date(parsed).toISOString()
}

function filterIgnoredWarehouseRecords<T extends { warehouseName?: string }>(items: T[]): T[] {
  return items.filter((item) => !isIgnoredWarehouseName(item.warehouseName))
}

function isIgnoredWarehouseName(warehouseName: string | undefined): boolean {
  if (typeof warehouseName !== "string") return false
  return IGNORED_WAREHOUSE_NAMES.has(warehouseName.trim())
}

function logIgnoredWarehouseRecords(
  supplierId: string,
  dataType: DataType,
  totalCount: number,
  keptCount: number,
) {
  const ignoredCount = totalCount - keptCount
  if (ignoredCount <= 0) return

  console.log(
    `[синк] 🚫 ${supplierId}/${dataType}: пропущено ${ignoredCount} записей с warehouseName из игнор-листа`,
  )
}

function getMaxSupplyDateCursor(supplies: WbSupply[], initial?: string): string | undefined {
  let maxDate = initial
  for (const supply of supplies) {
    const current = getSupplyDateCursor(supply)
    if (!current) continue

    if (!maxDate || current > maxDate) {
      maxDate = current
    }
  }

  return maxDate
}

function isValidSupplyIdentity(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === "number") return Number.isFinite(value) && value > 0

  const text = String(value).trim()
  if (text.length === 0 || text.toLowerCase() === "null" || text.toLowerCase() === "undefined") return false

  const asNumber = Number(text)
  if (Number.isFinite(asNumber)) {
    return asNumber > 0
  }

  return true
}
