import mongoose from "mongoose"
import { getCollection } from "../analytics-db"
import { rssMb } from "../../utils/mem"

const BATCH_SIZE = 20_000

const VERBOSE_SYNC_LOG = process.env.WB_VERBOSE_SYNC_LOG !== "0"

function buildSupplierIdRefs(supplierId: unknown, legacySupplierId?: unknown): Array<string | mongoose.Types.ObjectId> {
  const refs: Array<string | mongoose.Types.ObjectId> = []
  const seen = new Set<string>()

  const pushRef = (value: unknown) => {
    const normalized = String(value ?? "").trim()
    if (!normalized) return

    const stringKey = `string:${normalized}`
    if (!seen.has(stringKey)) {
      seen.add(stringKey)
      refs.push(normalized)
    }

    if (!mongoose.Types.ObjectId.isValid(normalized)) return

    const objectId = new mongoose.Types.ObjectId(normalized)
    const objectKey = `objectId:${objectId.toHexString()}`
    if (!seen.has(objectKey)) {
      seen.add(objectKey)
      refs.push(objectId)
    }
  }

  pushRef(supplierId)
  pushRef(legacySupplierId)

  return refs
}

function buildSupplierIdFilter(supplierId: unknown, legacySupplierId?: unknown) {
  const refs = buildSupplierIdRefs(supplierId, legacySupplierId)
  if (refs.length === 1) return refs[0]
  return { $in: refs }
}

async function bulkWriteInBatches(
  colName: string,
  items: Record<string, unknown>[],
  toOp: (item: Record<string, unknown>) => Record<string, unknown> | null
): Promise<number> {
  if (items.length === 0) return 0
  const col = getCollection(colName)
  let total = 0
  const sliceCount = Math.ceil(items.length / BATCH_SIZE)

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE)
    const ops = batch.map(toOp).filter(Boolean) as Record<string, unknown>[]
    if (ops.length === 0) continue
    if (VERBOSE_SYNC_LOG) {
      console.log(
        `[db/${colName}] слайс ${Math.floor(i / BATCH_SIZE) + 1}/${sliceCount}: пишу ${ops.length} оп. (всего ${items.length}, rss=${rssMb()}MB)`,
      )
    }
    const result = await col.bulkWrite(ops as any, { ordered: false })
    total += (result.upsertedCount ?? 0) + (result.modifiedCount ?? 0)
  }

  return total
}

export async function bulkUpsertSales(
  items: Record<string, unknown>[],
  supplierId: string,
  legacySupplierId?: string,
): Promise<number> {

  const canonicalSupplierId = String(supplierId ?? "").trim()
  const legacy = String(legacySupplierId ?? "").trim()
  return bulkWriteInBatches("sales", items, (s) => {
    if (!s.srid) return null
    const {
      supplierId: _sid,
      legacySupplierId: _legacy,
      brand: _b,
      category: _c,
      subject: _s,
      oblastOkrugName: _o,
      regionName: _r,
      countryName: _cn,
      ...rest
    } = s
    return {
      updateOne: {
        filter: { srid: s.srid },
        update: {
          $set: {
            ...rest,
            supplierId: canonicalSupplierId,
            ...(legacy ? { legacySupplierId: legacy } : {}),
          },
        },
        upsert: true,
      },
    }
  })
}

export async function bulkUpsertStocks(items: Record<string, unknown>[]): Promise<number> {
  return bulkWriteInBatches("stocks", items, (s) => {
    const stockKey = buildStockRowKey(s)
    if (!stockKey) return null
    const { supplierId, legacySupplierId, brand: _b, category: _c, subject: _s, ...rest } = s
    const canonicalSupplierId = String(supplierId ?? "").trim()
    return {
      updateOne: {
        filter: {
          supplierId: buildSupplierIdFilter(canonicalSupplierId, legacySupplierId),
          stockKey,
        },
        update: {
          $set: {
            ...rest,
            stockKey,
            nmId: s.nmId,
            warehouseName: s.warehouseName,
            supplierId: canonicalSupplierId,
          },
        },
        upsert: true,
      },
    }
  })
}

export async function replaceStocksSnapshot(
  supplierId: string,
  items: Record<string, unknown>[],
  legacySupplierId?: string,
): Promise<{ upserted: number; deleted: number }> {
  const canonicalSupplierId = String(supplierId ?? "").trim()
  const stockKeys = Array.from(
    new Set(items.map((item) => buildStockRowKey(item)).filter((key): key is string => Boolean(key))),
  )

  const upserted = await bulkUpsertStocks(items)
  const col = getCollection("stocks")
  const supplierIdFilter = buildSupplierIdFilter(canonicalSupplierId, legacySupplierId)

  const deleteFilter: Record<string, unknown> = {
    supplierId: supplierIdFilter,
  }

  if (stockKeys.length > 0) {
    deleteFilter.stockKey = { $nin: stockKeys }
  }

  const result = await col.deleteMany(deleteFilter)
  return {
    upserted,
    deleted: result.deletedCount ?? 0,
  }
}

function buildStockRowKey(item: Record<string, unknown>): string | null {
  const nmId = normalizeKeyPart(item.nmId)
  const warehouseId = normalizeKeyPart(item.warehouseId)
  const warehouseName = normalizeKeyPart(item.warehouseName)
  const chrtId = normalizeKeyPart(item.chrtId)
  const barcode = normalizeKeyPart(item.barcode)
  const techSize = normalizeKeyPart(item.techSize)
  const wbSize = normalizeKeyPart(item.wbSize)

  if (!nmId) return null

  const warehousePart = warehouseId || warehouseName
  if (!warehousePart) return null

  const sizePart = chrtId || barcode || techSize || wbSize || "single"
  return `nm:${nmId}|warehouse:${warehousePart}|size:${sizePart}`
}

function normalizeKeyPart(value: unknown): string {
  return String(value ?? "").trim()
}

function normalizeOrderRegionName(value: unknown): string | null {
  const normalized = String(value ?? "").trim()
  return normalized.length > 0 ? normalized : null
}

const STOCK_HISTORY_TS_COLLECTION = "stockHistoryTs"
let stockHistoryTsReady: Promise<void> | null = null

async function ensureStockHistoryTsCollection(): Promise<void> {
  if (!stockHistoryTsReady) {
    stockHistoryTsReady = (async () => {
      const db = mongoose.connection.db
      if (!db) throw new Error("mongoose connection has no db handle")
      const existing = await db.listCollections({ name: STOCK_HISTORY_TS_COLLECTION }).toArray()
      if (existing.length === 0) {
        await db.createCollection(STOCK_HISTORY_TS_COLLECTION, {
          timeseries: { timeField: "date", metaField: "meta", granularity: "hours" },
        })
      }
      await getCollection(STOCK_HISTORY_TS_COLLECTION)
        .createIndex({ "meta.supplierId": 1, "meta.nmId": 1, date: 1 }, { name: "meta_supplier_nm_date" })
        .catch(() => undefined)
    })().catch((error) => {
      stockHistoryTsReady = null
      throw error
    })
  }
  return stockHistoryTsReady
}

type StockHistorySeriesDoc = {
  nmId: unknown
  supplierId: string
  warehouseName: string
  techSize: string
  days: Map<string, number>
}

const stockHistoryTsDay = (day: string) => new Date(`${day}T00:00:00.000Z`)

async function syncStockHistoryTs(docs: StockHistorySeriesDoc[]): Promise<number> {
  await ensureStockHistoryTsCollection()
  const ts = getCollection(STOCK_HISTORY_TS_COLLECTION)

  const deleteOps = docs
    .filter((doc) => doc.days.size > 0)
    .map((doc) => ({
      deleteMany: {
        filter: {
          "meta.nmId": doc.nmId,
          "meta.supplierId": doc.supplierId,
          "meta.warehouseName": doc.warehouseName,
          "meta.techSize": doc.techSize,
          date: { $in: Array.from(doc.days.keys()).map(stockHistoryTsDay) },
        },
      },
    }))
  for (let i = 0; i < deleteOps.length; i += BATCH_SIZE) {
    await ts.bulkWrite(deleteOps.slice(i, i + BATCH_SIZE) as never[], { ordered: false })
  }

  const inserts = docs.flatMap((doc) =>
    Array.from(doc.days.entries())
      .filter(([, quantity]) => quantity > 0)
      .map(([day, quantity]) => ({
        date: stockHistoryTsDay(day),
        meta: {
          nmId: doc.nmId,
          supplierId: doc.supplierId,
          warehouseName: doc.warehouseName,
          techSize: doc.techSize,
        },
        quantity,
      })),
  )
  for (let i = 0; i < inserts.length; i += BATCH_SIZE) {
    await ts.insertMany(inserts.slice(i, i + BATCH_SIZE), { ordered: false })
  }

  return inserts.length
}

export async function bulkUpsertStockHistory(items: Record<string, unknown>[]): Promise<number> {
  if (items.length === 0) return 0

  const grouped = new Map<string, StockHistorySeriesDoc>()

  for (const item of items) {
    if (!item.nmId || !item.date || !item.warehouseName) continue

    const canonicalSupplierId = String(item.supplierId ?? "").trim()
    const warehouseName = String(item.warehouseName ?? "").trim()
    const techSize = String(item.techSize ?? "").trim()
    const date = normalizeStockHistoryDay(item.date)
    if (!canonicalSupplierId || !warehouseName || !date) continue

    const key = `${String(item.nmId)}::${canonicalSupplierId}::${warehouseName}::${techSize}`
    const quantity = Math.max(0, Math.trunc(toFiniteNumber(item.quantity) ?? 0))

    const bucket = grouped.get(key) ?? {
      nmId: item.nmId,
      supplierId: canonicalSupplierId,
      warehouseName,
      techSize,
      days: new Map<string, number>(),
    }

    bucket.days.set(date, quantity)
    grouped.set(key, bucket)
  }

  const docs = Array.from(grouped.values())
  if (docs.length === 0) return 0

  return await syncStockHistoryTs(docs)
}

function normalizeStockHistoryDay(value: unknown): string | null {
  const normalized = String(value ?? "").trim()
  const match = normalized.match(/^(\d{4}-\d{2}-\d{2})/)
  return match?.[1] ?? null
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  const normalized = String(value ?? "").replace(/,/g, ".").trim()
  if (!normalized) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

export async function bulkUpsertSupplies(items: Record<string, unknown>[]): Promise<number> {
  return bulkWriteInBatches("supplies", items, (s) => {
    const supplyID = normalizeSupplyIdentity(s.supplyID)
    if (supplyID === null) return null

    const { supplierId, legacySupplierId, supplyID: _sID, preorderID: _pID, ...rest } = s
    const canonicalSupplierId = String(supplierId ?? "").trim()
    const filter = {
      supplyID,
      supplierId: buildSupplierIdFilter(canonicalSupplierId, legacySupplierId),
    }

    const setPayload: Record<string, unknown> = {
      ...rest,
      supplierId: canonicalSupplierId,
      supplyID,
    }

    const preorderID = normalizeSupplyIdentity(s.preorderID)
    if (preorderID !== null) {
      setPayload.preorderID = preorderID
    }

    const updateDoc: Record<string, unknown> = { $set: setPayload }

    return {
      updateOne: {
        filter,
        update: updateDoc,
        upsert: true,
      },
    }
  })
}

function normalizeSupplyIdentity(value: unknown): string | number | null {
  if (value === null || value === undefined) return null
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null
    return value > 0 ? value : null
  }
  const asString = String(value).trim()
  if (asString.length === 0) return null

  const asNumber = Number(asString)
  if (Number.isFinite(asNumber) && asNumber <= 0) {
    return null
  }

  return asString
}

export async function bulkUpsertOrders(
  items: Record<string, unknown>[],
  supplierId: string,
  legacySupplierId?: string,
): Promise<number> {

  const canonicalSupplierId = String(supplierId ?? "").trim()
  const legacy = String(legacySupplierId ?? "").trim()
  return bulkWriteInBatches("orders", items, (o) => {
    if (!o.srid) return null
    const { supplierId: _sid, legacySupplierId: _legacy, brand: _b, category: _c, subject: _s, ...rest } = o
    const regionName = normalizeOrderRegionName(o.regionName ?? o.oblast)
    return {
      updateOne: {
        filter: { srid: o.srid },
        update: {
          $set: {
            ...rest,
            supplierId: canonicalSupplierId,
            ...(legacy ? { legacySupplierId: legacy } : {}),
            ...(regionName ? { regionName } : {}),
          },
        },
        upsert: true,
      },
    }
  })
}

function saleFlagFromSaleId(saleId: unknown): number | null {
  const prefix = String(saleId ?? "").trim().charAt(0).toUpperCase()
  if (prefix === "R") return 2
  if (prefix === "S") return 1
  return null
}

type SaleFlagMaps = {
  byNmGNumber: Map<string, { nmId: number; gNumber: string; flag: number }>
  byNmGNumberTechSize: Map<string, { nmId: number; gNumber: string; techSize: string; flag: number }>
}

function collectSaleFlagMaps(
  sales: Array<{ nmId?: unknown; gNumber?: unknown; techSize?: unknown; saleID?: unknown }>,
): SaleFlagMaps {
  const byNmGNumber = new Map<string, { nmId: number; gNumber: string; flag: number }>()
  const byNmGNumberTechSize = new Map<
    string,
    { nmId: number; gNumber: string; techSize: string; flag: number }
  >()
  for (const sale of sales) {
    const nmId = Number(sale.nmId)
    const gNumber = String(sale.gNumber ?? "").trim()
    const flag = saleFlagFromSaleId(sale.saleID)
    if (!Number.isFinite(nmId) || !gNumber || flag == null) continue
    const allKey = `${nmId}::${gNumber}`
    const existingAll = byNmGNumber.get(allKey)
    if (!existingAll || flag > existingAll.flag) byNmGNumber.set(allKey, { nmId, gNumber, flag })
    const techSize = String(sale.techSize ?? "")
    const sameKey = `${allKey}::${techSize}`
    const existing = byNmGNumberTechSize.get(sameKey)
    if (!existing || flag > existing.flag) {
      byNmGNumberTechSize.set(sameKey, { nmId, gNumber, techSize, flag })
    }
  }
  return { byNmGNumber, byNmGNumberTechSize }
}

async function applySaleFlagMapsToOrders(maps: SaleFlagMaps): Promise<number> {
  const ops: Record<string, unknown>[] = []
  for (const { nmId, gNumber, flag } of maps.byNmGNumber.values()) {
    ops.push({ updateMany: { filter: { gNumber, nmId }, update: { $max: { saleFlagAll: flag } } } })
  }
  for (const { nmId, gNumber, techSize, flag } of maps.byNmGNumberTechSize.values()) {
    ops.push({
      updateMany: { filter: { gNumber, nmId, techSize }, update: { $max: { saleFlagSame: flag } } },
    })
  }
  if (!ops.length) return 0
  const col = getCollection("orders")
  let total = 0
  for (let i = 0; i < ops.length; i += BATCH_SIZE) {
    const result = await col.bulkWrite(ops.slice(i, i + BATCH_SIZE) as any, { ordered: false })
    total += result.modifiedCount ?? 0
  }
  return total
}

export async function updateOrdersSaleFlagsFromSales(
  salesItems: Record<string, unknown>[],
): Promise<number> {
  return applySaleFlagMapsToOrders(collectSaleFlagMaps(salesItems as any))
}

export async function applySaleFlagsForNewOrders(
  orderItems: Record<string, unknown>[],
): Promise<number> {
  const gNumbers = Array.from(
    new Set(orderItems.map((o) => String(o.gNumber ?? "").trim()).filter(Boolean)),
  )
  if (!gNumbers.length) return 0
  let total = 0
  const salesCol = getCollection("sales")
  for (let i = 0; i < gNumbers.length; i += BATCH_SIZE) {
    const chunk = gNumbers.slice(i, i + BATCH_SIZE)
    const sales = await salesCol
      .find({ gNumber: { $in: chunk } })
      .project({ nmId: 1, gNumber: 1, techSize: 1, saleID: 1 })
      .toArray()
    if (sales.length) total += await applySaleFlagMapsToOrders(collectSaleFlagMaps(sales as any))
  }
  return total
}

export async function bulkUpdateOrdersIsLocal(
  updates: Array<{ srid: string; isLocal: boolean | null }>,
): Promise<number> {
  return bulkWriteInBatches("orders", updates as unknown as Record<string, unknown>[], (u) => {
    const srid = String((u as { srid?: unknown }).srid ?? "").trim()
    if (!srid) return null
    const isLocal = (u as { isLocal?: unknown }).isLocal
    if (isLocal === true || isLocal === false) {
      return { updateOne: { filter: { srid }, update: { $set: { isLocal } } } }
    }
    return { updateOne: { filter: { srid }, update: { $unset: { isLocal: "" } } } }
  })
}

export async function bulkUpsertPrices(items: Record<string, unknown>[]): Promise<number> {
  return bulkWriteInBatches("prices", items, (p) => {
    const nmId = p.nmId ?? p.nmID
    if (!nmId) return null
    const { supplierId, legacySupplierId, productPrice: _pp, spp: _spp, realPrice: _rp, ...rest } = p
    const canonicalSupplierId = String(supplierId ?? "").trim()
    return {
      updateOne: {
        filter: { nmId, supplierId: buildSupplierIdFilter(canonicalSupplierId, legacySupplierId) },
        update: {
          $set: { ...rest, nmId, supplierId: canonicalSupplierId },
          $unset: { nmID: "", price: "", productPrice: "", spp: "", realPrice: "" },
        },
        upsert: true,
      },
    }
  })
}

export async function bulkUpsertProductDetails(items: Record<string, unknown>[]): Promise<number> {
  return bulkWriteInBatches("productDetails", items, (p) => {
    const nmId = p.nmId ?? p.nmID
    if (!nmId) return null
    const { supplierId, legacySupplierId, ...rest } = p
    const canonicalSupplierId = String(supplierId ?? "").trim()
    return {
      updateOne: {
        filter: { nmId, supplierId: buildSupplierIdFilter(canonicalSupplierId, legacySupplierId) },
        update: {
          $set: { ...rest, nmId, supplierId: canonicalSupplierId },
          $unset: { productPrice: "" },
        },
        upsert: true,
      },
    }
  })
}

export async function deletePricesByNmIds(
  supplierId: string,
  nmIds: number[],
  legacySupplierId?: string,
): Promise<number> {
  if (nmIds.length === 0) return 0
  const col = getCollection("prices")
  const result = await col.deleteMany({
    supplierId: buildSupplierIdFilter(supplierId, legacySupplierId),
    nmId: { $in: nmIds },
  })
  return result.deletedCount ?? 0
}

export async function clearProductDetailsRealPriceByNmIds(
  supplierId: string,
  nmIds: number[],
  legacySupplierId?: string,
): Promise<number> {
  if (nmIds.length === 0) return 0
  const col = getCollection("productDetails")
  const result = await col.updateMany(
    { supplierId: buildSupplierIdFilter(supplierId, legacySupplierId), nmId: { $in: nmIds } },
    { $set: { realPrice: null }, $unset: { productPrice: "" } },
  )
  return result.modifiedCount ?? 0
}

export async function syncProductDetailsAdvertState(
  supplierId: string,
  activeNmIds: number[],
  legacySupplierId?: string,
): Promise<number> {
  const col = getCollection("productDetails")
  const supplierIdFilter = buildSupplierIdFilter(supplierId, legacySupplierId)

  await col.updateMany({ supplierId: supplierIdFilter }, { $set: { isAdvert: false } })

  if (activeNmIds.length === 0) return 0

  const result = await col.updateMany(
    { supplierId: supplierIdFilter, nmId: { $in: activeNmIds } },
    { $set: { isAdvert: true } },
  )

  return result.modifiedCount ?? 0
}

const WAREHOUSE_META_FIELDS = [
  "name",
  "address",
  "workTime",
  "isActive",
  "isTransitActive",
  "acceptsQR",
] as const

export async function bulkUpsertWarehouses(items: Record<string, unknown>[]): Promise<number> {
  return bulkWriteInBatches("warehouses", items, (w) => {
    if (!w.warehouseId) return null
    const canonicalSupplierId = String(w.supplierId ?? "").trim()
    const setFields: Record<string, unknown> = { warehouseId: w.warehouseId }
    for (const field of WAREHOUSE_META_FIELDS) {
      if (w[field] !== undefined) setFields[field] = w[field]
    }
    return {
      updateOne: {
        filter: { warehouseId: w.warehouseId },
        update: {
          $set: setFields,
          ...(canonicalSupplierId ? { $addToSet: { supplierIds: canonicalSupplierId } } : {}),
        },
        upsert: true,
      },
    }
  })
}

const WAREHOUSE_TARIFF_FIELDS = [
  "boxTariffsDate",
  "boxTariffsValidTill",
  "geoName",
  "logisticsBaseTariff",
  "logisticsAdditionalLiterTariff",
  "logisticsCoefficient",
  "storageBaseTariff",
  "storageAdditionalLiterTariff",
  "storageCoefficient",
  "acceptanceCoefficient",
  "acceptanceCoefficientDate",
  "palletLogisticsBaseTariff",
  "palletLogisticsAdditionalLiterTariff",
  "palletLogisticsCoefficient",
  "palletStorageBaseTariff",
  "palletStorageCoefficient",
] as const

export async function bulkUpsertWarehouseDetails(items: Record<string, unknown>[]): Promise<number> {
  return bulkWriteInBatches("warehouseDetails", items, (w) => {
    if (!w.warehouseId) return null
    const canonicalSupplierId = String(w.supplierId ?? "").trim()
    if (!canonicalSupplierId) return null

    const setFields: Record<string, unknown> = {
      supplierId: canonicalSupplierId,
      warehouseId: w.warehouseId,
    }
    for (const field of WAREHOUSE_TARIFF_FIELDS) {
      if (w[field] !== undefined) setFields[field] = w[field]
    }
    return {
      updateOne: {
        filter: {
          warehouseId: w.warehouseId,
          supplierId: buildSupplierIdFilter(canonicalSupplierId, w.legacySupplierId),
        },
        update: { $set: setFields },
        upsert: true,
      },
    }
  })
}

export async function ensureWarehouseBindingsForWarehouses(
  items: Record<string, unknown>[],
): Promise<number> {
  if (items.length === 0) return 0

  const uniqueWarehouses = new Map<string, { warehouseId: number; name: string }>()

  for (const item of items) {
    const warehouseId = Number(item.warehouseId)
    const name = String(item.name ?? "").trim()
    if (!Number.isFinite(warehouseId) || !name) continue

    const key = String(warehouseId)
    if (uniqueWarehouses.has(key)) continue
    uniqueWarehouses.set(key, {
      warehouseId,
      name,
    })
  }

  if (uniqueWarehouses.size === 0) return 0

  const now = new Date()
  const bindings = await getCollection("warehouseBindings").bulkWrite(
    Array.from(uniqueWarehouses.values()).map((warehouse) => ({
      updateOne: {
        filter: {
          warehouseId: warehouse.warehouseId,
        },
        update: {
          $set: {
            name: warehouse.name,
            updatedAt: now,
          },
          $setOnInsert: {
            warehouseId: warehouse.warehouseId,
            alias: [],
            createdAt: now,
          },
        },
        upsert: true,
      },
    })),
    { ordered: false },
  )

  return bindings.upsertedCount ?? 0
}
