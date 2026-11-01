import { Types } from "mongoose"
import { getNmSummaryWithPagination } from "./nm-summary"
import { getWarehousesWithPagination } from "./warehouses"
import { getSettings } from "./settings"
import { getAllLocalProducts } from "./local-products"
import { buildSupplyExportWorkbook } from "./supply-export"
import {
  buildWarehouseRows,
  buildSupplyExportDocuments,
  buildBarcodeResolver,
  buildBundleResolver,
  buildMandatoryWarehouseInfo,
  calcSupplyPlanTotalsForRow,
  computeFilterActiveWarehouseIds,
  computeQtyToBuy,
  normalizeWarehouseLookupKey,
  type BundleResolver,
  type NmSummaryRow as CanonicalNmSummaryRow,
  type WarehouseCount,
  type SupplyExportRow,
  type MissingBarcodeProduct,
} from "../lib/supply-plan"
import { nmSummarySemaphore, exportJobLimiter } from "../lib/semaphores"
import { ConcurrencyLimitError } from "../utils/concurrency-limit"
import {
  type ExportJobDoc,
  type ExportJobDocumentMeta,
  getExportJobForRunner,
  setExportJobRunning,
  updateExportProgress,
  saveExportResumeState,
  markExportCompleted,
  markExportFailed,
  markExportCanceled,
  isExportCancelRequested,
  writeExportFileToGridFS,
} from "./excel-exports"

const EXPORT_PAGE_SIZE = 40
const EXPORT_PAGE_DELAY_MS = 100
const BUSY_RETRY_DELAY_MS = 3000
const BUSY_MAX_RETRIES = 200

const RESUME_CHECKPOINT_EVERY_PAGES = 5

const COLUMN_LABELS: Record<string, string> = {
  qtyToSendFinal2: "Отправить без учета собст. остатков",
  qtyToSendOwnStock2: "Отправить с учетом собст. остатков",
  qtyToSendTrend: "Отправить (Тренд) без учета собст. остатков",
  qtyToSendTrendOwnStock: "Отправить (Тренд) с учетом собст. остатков",
  qtyToBuy: "К закупке",
  qtyToBuyTrend: "К закупке Тренд",
}

const TREND_QTY_FIELDS = new Set(["qtyToSendTrend", "qtyToSendTrendOwnStock", "qtyToBuyTrend"])

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const sumCounts = (items?: WarehouseCount[]): number =>
  (items ?? []).reduce((sum, item) => sum + (Number(item?.count) || 0), 0)

type WbWarehouseMaps = {
  idsByName: Map<string, string>
  regionsByName: Map<string, string>
  regionsById: Map<string, string>
  macroByName: Map<string, string>
  macroById: Map<string, string>

  canonicalNameById: Map<string, string>
}

function buildWbWarehouseMaps(warehouses: any[]): WbWarehouseMaps {
  const idsByName = new Map<string, string>()
  const regionsByName = new Map<string, string>()
  const regionsById = new Map<string, string>()
  const macroByName = new Map<string, string>()
  const macroById = new Map<string, string>()
  const canonicalNameById = new Map<string, string>()

  for (const wh of warehouses ?? []) {
    const supplierId = String(wh?.supplierId ?? "")
    const region = String(wh?.region ?? "").trim()
    const macroRegion = String(wh?.macroRegion ?? "").trim()
    const canonicalName = String(wh?.name ?? "").trim()
    if (wh?._id && canonicalName && !canonicalNameById.has(String(wh._id))) {
      canonicalNameById.set(String(wh._id), canonicalName)
    }
    const names = [wh?.name, ...(Array.isArray(wh?.alias) ? wh.alias : [])]

    for (const name of names) {
      const normalized = normalizeWarehouseLookupKey(String(name ?? ""))
      if (!normalized) continue
      const key = supplierId ? `${supplierId}::${normalized}` : ""
      if (supplierId && wh?._id && !idsByName.has(key)) idsByName.set(key, String(wh._id))
      if (supplierId && region && !regionsByName.has(key)) regionsByName.set(key, region)
      if (supplierId && macroRegion && !macroByName.has(key)) macroByName.set(key, macroRegion)
    }

    if (region) {
      if (wh?._id && !regionsById.has(String(wh._id))) regionsById.set(String(wh._id), region)
      if (wh?.warehouseId && !regionsById.has(String(wh.warehouseId))) regionsById.set(String(wh.warehouseId), region)
    }
    if (macroRegion) {
      if (wh?._id && !macroById.has(String(wh._id))) macroById.set(String(wh._id), macroRegion)
      if (wh?.warehouseId && !macroById.has(String(wh.warehouseId))) macroById.set(String(wh.warehouseId), macroRegion)
    }
  }

  return { idsByName, regionsByName, regionsById, macroByName, macroById, canonicalNameById }
}

function getPeriodSpanDays(dateFrom?: unknown, dateTo?: unknown): number | null {
  const from = String(dateFrom ?? "")
  const to = String(dateTo ?? "")
  if (!from || !to) return null
  const f = new Date(`${from.slice(0, 10)}T00:00:00.000Z`)
  const t = new Date(`${to.slice(0, 10)}T00:00:00.000Z`)
  if (!Number.isFinite(f.getTime()) || !Number.isFinite(t.getTime()) || t < f) return null
  return Math.floor((t.getTime() - f.getTime()) / (24 * 60 * 60 * 1000)) + 1
}

async function fetchPageThrottled(
  job: ExportJobDoc,
  page: number,
): Promise<{ data: CanonicalNmSummaryRow[]; total: number; hasMore?: boolean }> {
  const query: Record<string, unknown> = {
    ...job.params.filters,
    page: String(page),
    pageSize: String(EXPORT_PAGE_SIZE),

    flatSizes: "1",

    ...(TREND_QTY_FIELDS.has(String(job.params.qtyField)) ? {} : { skipTrend: "1" }),
  }
  for (let attempt = 0; attempt <= BUSY_MAX_RETRIES; attempt++) {
    if (await isExportCancelRequested(job._id)) throw new ExportCanceledError()
    try {
      const result = await exportJobLimiter.run(() =>
        nmSummarySemaphore.run(() =>
          getNmSummaryWithPagination(query, job.supplierIds, { userId: job.userId, clientId: job.clientId }, { maxPageSize: EXPORT_PAGE_SIZE }),
        ),
      )
      return {
        data: result.data as unknown as CanonicalNmSummaryRow[],
        total: result.total,
        hasMore: result.hasMore,
      }
    } catch (error) {
      if (error instanceof ConcurrencyLimitError) {

        await delay(BUSY_RETRY_DELAY_MS)
        continue
      }
      throw error
    }
  }
  throw new Error("export_page_busy_timeout")
}

class ExportCanceledError extends Error {
  constructor() {
    super("export_canceled")
  }
}

async function loadAllWbWarehouses(job: ExportJobDoc, userId: string, clientId: string): Promise<any[]> {
  const allWarehouses: any[] = []
  for (let whPage = 1; whPage <= 200; whPage++) {
    const res = (await getWarehousesWithPagination(
      { supplierId: job.supplierIds.join(","), pageSize: "100", page: String(whPage) },
      job.supplierIds,
      { userId, clientId },
    )) as { data?: any[]; total?: number }
    const pageRows = res.data ?? []
    allWarehouses.push(...pageRows)
    const total = typeof res.total === "number" ? res.total : allWarehouses.length
    if (pageRows.length === 0 || allWarehouses.length >= total) break
  }
  return allWarehouses
}

function buildExportActivityResolvers(
  params: ExportJobDoc["params"],
  idsByName: Map<string, string>,
): {
  resolveActive: (row: CanonicalNmSummaryRow) => Set<string>
  resolveWhitelist: ((row: CanonicalNmSummaryRow) => Set<string> | null) | undefined
} {
  const filterWarehouseNames = String((params.filters as Record<string, unknown>)?.warehouseName ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)
  const filterWarehouseNameKeys = new Set(filterWarehouseNames.map(normalizeWarehouseLookupKey))

  const activeKey = (row: CanonicalNmSummaryRow) => `${row.nmId}::${row.techSize ?? ""}`

  const lookupExplicit = (row: CanonicalNmSummaryRow) =>
    params.activeWarehouses?.[activeKey(row)] ?? params.activeWarehouses?.[`${row.nmId}::`]

  const resolveActive = (row: CanonicalNmSummaryRow) => {
    const explicit = lookupExplicit(row)
    if (explicit) return new Set(explicit)
    if (filterWarehouseNames.length > 0) {
      return computeFilterActiveWarehouseIds(row, filterWarehouseNameKeys, idsByName)
    }
    return new Set<string>()
  }

  const resolveWhitelist =
    filterWarehouseNames.length > 0
      ? (row: CanonicalNmSummaryRow) =>
          lookupExplicit(row)
            ? null
            : computeFilterActiveWarehouseIds(row, filterWarehouseNameKeys, idsByName)
      : undefined

  return { resolveActive, resolveWhitelist }
}

type PurchasePendingItem = {
  supplierKey: string
  supplierId: string
  nmId: number
  chrtId: number | null
  techSize: string | null
  productName: string
  displayName: string
  supplierArticle: string
  barcode: string | null
  article: string | null
  hasLocalProduct: boolean
  stock: number
  ownStock: number
  inTransit: number
  inWayFromClient: number
  inWayToClient: number
  trueVelocity: number
  buyoutPercent: number | null

  trendStrength: number | null
}

type PurchaseTrendContext = {
  maps: ReturnType<typeof buildWbWarehouseMaps>
  resolveActive: (row: CanonicalNmSummaryRow) => Set<string>
  periodSpanDays: number | null
}

async function accumulatePurchaseExport(
  job: ExportJobDoc,
  objId: Types.ObjectId,
  resolveBarcode: (nmId: number, chrtId: number | null) => { barcode: string | null; article: string | null; hasLocalProduct: boolean },

  resolveBundle: BundleResolver | null,
  trend: PurchaseTrendContext | null,
): Promise<{ rowsByCabinet: Map<string, SupplyExportRow[]>; missing: MissingBarcodeProduct[] }> {
  throw new Error("Расчёт недоступен в публичном примере")
}

export async function runExportJob(jobId: string, userId: string, clientId: string): Promise<void> {
  let objId: Types.ObjectId | undefined
  try {
    const job = await getExportJobForRunner(jobId, userId, clientId)
    if (!job || job.status !== "pending") return
    objId = job._id
    await setExportJobRunning(objId)

    const { params } = job
    const isPurchase = params.qtyField === "qtyToBuy" || params.qtyField === "qtyToBuyTrend"
    const periodSpanDays = params.periodSpanDays ?? getPeriodSpanDays(params.filters.dateFrom, params.filters.dateTo)

    const localProducts = await getAllLocalProducts(
      { userId, clientId },
      {},
      job.supplierIds.length > 0 ? { supplierIds: job.supplierIds } : undefined,
    )
    const resolveBarcode = buildBarcodeResolver(localProducts as any)

    let rowsByCabinet: Map<string, SupplyExportRow[]>
    let missing: MissingBarcodeProduct[]

    if (isPurchase) {

      const resolveBundle = params.dissolveBundles ? buildBundleResolver(localProducts as any) : null

      let trendContext: PurchaseTrendContext | null = null
      if (params.qtyField === "qtyToBuyTrend") {
        const maps = buildWbWarehouseMaps(await loadAllWbWarehouses(job, userId, clientId))
        const { resolveActive } = buildExportActivityResolvers(params, maps.idsByName)
        trendContext = { maps, resolveActive, periodSpanDays }
      }
      const result = await accumulatePurchaseExport(job, objId, resolveBarcode, resolveBundle, trendContext)
      rowsByCabinet = result.rowsByCabinet
      missing = result.missing
    } else {

      const allWarehouses = await loadAllWbWarehouses(job, userId, clientId)
      const maps = buildWbWarehouseMaps(allWarehouses)
      const emptyTariffs = new Map() as any

      const userSettings = await getSettings(job.userId)
      const customMandatoryNames = Array.isArray((userSettings as { mandatoryWarehouses?: unknown }).mandatoryWarehouses)
        ? ((userSettings as { mandatoryWarehouses: string[] }).mandatoryWarehouses)
        : null
      const regionByPlainName = new Map<string, string>()
      for (const wh of allWarehouses) {
        const nameKey = normalizeWarehouseLookupKey(String(wh?.name ?? ""))
        const region = String(wh?.region ?? "").trim()
        if (nameKey && region && !regionByPlainName.has(nameKey)) regionByPlainName.set(nameKey, region)
      }
      const mandatoryWarehouseInfo = customMandatoryNames
        ? buildMandatoryWarehouseInfo(
            customMandatoryNames.map((name) => ({
              name,
              region: regionByPlainName.get(normalizeWarehouseLookupKey(name)) ?? null,
            })),
          )
        : undefined

      const { resolveActive, resolveWhitelist } = buildExportActivityResolvers(params, maps.idsByName)

      const excludedWarehouseNames = params.excludedWarehouseNames?.length
        ? new Set(params.excludedWarehouseNames)
        : undefined

      const computeWarehouseRows = (row: CanonicalNmSummaryRow) =>
        buildWarehouseRows(
          row,
          maps.idsByName,
          maps.regionsByName,
          maps.regionsById,
          maps.macroByName,
          maps.macroById,
          emptyTariffs,
          periodSpanDays,
          resolveActive(row),
          (params.tariffMode as any) ?? "box",
          [],
          "warehouses",
          mandatoryWarehouseInfo,
        )

      const accRowsByCabinet = new Map<string, SupplyExportRow[]>()
      const missingByKey = new Map<string, MissingBarcodeProduct>()

      let page = 1
      let processed = 0
      let total = 0

      if (job.resume) {
        page = job.resume.nextPage
        processed = job.resume.processedProducts
        total = job.totalProducts
        for (const { supplierKey, rows } of job.resume.rowsByCabinet) accRowsByCabinet.set(supplierKey, rows)
        for (const m of job.resume.missing) missingByKey.set(`${m.nmId}::${m.techSize ?? ""}`, m)
        await updateExportProgress(objId, total > 0 ? Math.min(processed, total) : processed, total)
      }

      let pagesSinceCheckpoint = 0
      while (true) {
        const result = await fetchPageThrottled(job, page)
        if (page === 1) {
          total = result.total
          await updateExportProgress(objId, 0, total)
        }
        const rows = result.data
        if (!rows.length) break

        const built = buildSupplyExportDocuments({
          products: rows,
          computeWarehouseRows,
          qtyField: params.qtyField as Exclude<typeof params.qtyField, "qtyToBuy" | "qtyToBuyTrend">,
          getActiveWarehouseIds: resolveActive,
          getWarehouseWhitelist: resolveWhitelist,
          excludedWarehouseNames,
          resolveBarcode,
          canonicalWarehouseNameById: maps.canonicalNameById,
        })
        for (const doc of built.documents) {
          const key = doc.supplierId ?? ""
          const bucket = accRowsByCabinet.get(key) ?? []
          bucket.push(...doc.rows)
          accRowsByCabinet.set(key, bucket)
        }
        for (const m of built.missing) {
          const k = `${m.nmId}::${m.techSize ?? ""}`
          if (!missingByKey.has(k)) missingByKey.set(k, m)
        }

        processed += rows.length
        await updateExportProgress(objId, total > 0 ? Math.min(processed, total) : processed, total)

        const hasMore = result.hasMore ?? rows.length >= EXPORT_PAGE_SIZE
        if (!hasMore) break
        page += 1

        if (++pagesSinceCheckpoint >= RESUME_CHECKPOINT_EVERY_PAGES) {
          pagesSinceCheckpoint = 0
          await saveExportResumeState(objId, {
            nextPage: page,
            processedProducts: processed,
            rowsByCabinet: Array.from(accRowsByCabinet, ([supplierKey, rows]) => ({ supplierKey, rows })),
            missing: Array.from(missingByKey.values()),
          })
        }
        await delay(EXPORT_PAGE_DELAY_MS)
      }

      rowsByCabinet = accRowsByCabinet

      missing = Array.from(missingByKey.values())
    }

    const columnLabel = COLUMN_LABELS[params.qtyField] ?? params.qtyField
    const documents: ExportJobDocumentMeta[] = []
    for (const [supplierKey, rows] of rowsByCabinet) {
      if (!rows.length) continue
      const cabinetName = params.cabinetNames?.[supplierKey] || supplierKey || ""
      const exported = await buildSupplyExportWorkbook(rows, {
        columnLabel,
        cabinetName,
        includeDateColumn: params.includeDateColumn,
        dateStamp: params.exportDate ?? undefined,
        includeNameColumn: params.includeNameColumn,
        includeStockColumn: params.includeStockColumn,
        ...(isPurchase
          ? {
              omitWarehouse: true,
              includeArticleColumn: true,
              fileBaseName: params.qtyField === "qtyToBuyTrend" ? "К закупке Тренд WB" : "К закупке WB",
              sheetName: params.qtyField === "qtyToBuyTrend" ? "К закупке Тренд" : "К закупке",
            }
          : {}),
      })
      const fileId = await writeExportFileToGridFS(exported.data, exported.fileName)
      documents.push({
        supplierId: supplierKey === "" ? null : supplierKey,
        cabinetName,
        fileId: String(fileId),
        fileName: exported.fileName,
        rowCount: rows.length,
      })
    }

    await markExportCompleted(objId, documents, missing)
  } catch (error) {
    if (error instanceof ExportCanceledError) {
      if (objId) await markExportCanceled(objId)
      return
    }
    const message = error instanceof Error ? error.message : String(error)
    console.error("[excel-export-runner] job failed:", message)
    if (objId) await markExportFailed(objId, message)
  }
}
