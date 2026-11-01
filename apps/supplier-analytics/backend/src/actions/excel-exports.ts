import mongoose, { Types } from "mongoose"
import { connectDB, getCollection } from "../db"
import type { SupplyExportRow, ExportQtyField, MissingBarcodeProduct } from "../lib/supply-plan"

const COLLECTION = "excelExports"
const GRIDFS_BUCKET = "excelExports"

export const EXPORT_HISTORY_LIMIT = 5
export const EXPORT_HISTORY_TTL_MS = 24 * 60 * 60 * 1000

export type ExportJobStatus = "pending" | "running" | "completed" | "failed" | "canceled"

export type ExportJobParams = {

  filters: Record<string, unknown>

  qtyField: ExportQtyField
  tariffMode: string
  periodSpanDays: number | null

  purchasePeriodDays?: number | null

  activeWarehouses: Record<string, string[]>

  excludedWarehouseNames?: string[]

  cabinetNames: Record<string, string>

  includeDateColumn?: boolean
  exportDate?: string | null

  includeNameColumn?: boolean
  includeStockColumn?: boolean

  dissolveBundles?: boolean
}

export type ExportJobDocumentMeta = {
  supplierId: string | null
  cabinetName: string
  fileId: string
  fileName: string
  rowCount: number

  downloaded?: boolean
}

export type ExportJobResumeState = {
  nextPage: number
  processedProducts: number

  rowsByCabinet: Array<{ supplierKey: string; rows: SupplyExportRow[] }>
  missing: MissingBarcodeProduct[]
}

export type ExportJobDoc = {
  _id: Types.ObjectId
  userId: string
  clientId: string
  supplierIds: string[]
  params: ExportJobParams
  status: ExportJobStatus
  totalProducts: number
  processedProducts: number
  documents: ExportJobDocumentMeta[]
  missing: MissingBarcodeProduct[]
  error: string | null
  cancelRequested: boolean

  attempts: number

  resume: ExportJobResumeState | null
  createdAt: Date
  updatedAt: Date
  startedAt: Date | null
  finishedAt: Date | null
}

function col() {
  return getCollection(COLLECTION)
}

function bucket() {
  return new mongoose.mongo.GridFSBucket(mongoose.connection.db!, { bucketName: GRIDFS_BUCKET })
}

export async function ensureExcelExportIndexes() {
  await connectDB()
  await col().createIndex({ userId: 1, clientId: 1, status: 1, createdAt: -1 })

  try {
    await col().dropIndex("finishedAt_1")
  } catch {

  }
}

export function serializeExportJob(doc: ExportJobDoc) {
  return {
    id: String(doc._id),
    status: doc.status,
    totalProducts: doc.totalProducts,
    processedProducts: doc.processedProducts,
    qtyField: doc.params?.qtyField,
    documents: (doc.documents ?? []).map((d, index) => ({
      index,
      supplierId: d.supplierId,
      cabinetName: d.cabinetName,
      fileName: d.fileName,
      rowCount: d.rowCount,
      downloaded: Boolean(d.downloaded),
    })),
    missing: doc.missing ?? [],
    error: doc.error ?? null,
    createdAt: doc.createdAt,
    finishedAt: doc.finishedAt,

    expiresAt: doc.finishedAt ? new Date(doc.finishedAt.getTime() + EXPORT_HISTORY_TTL_MS) : null,
  }
}

export async function createExportJob(input: {
  userId: string
  clientId: string
  supplierIds: string[]
  params: ExportJobParams
}): Promise<ExportJobDoc> {
  await connectDB()
  const now = new Date()
  const doc: ExportJobDoc = {
    _id: new Types.ObjectId(),
    userId: input.userId,
    clientId: input.clientId,
    supplierIds: input.supplierIds,
    params: input.params,
    status: "pending",
    totalProducts: 0,
    processedProducts: 0,
    documents: [],
    missing: [],
    error: null,
    cancelRequested: false,
    attempts: 0,
    resume: null,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    finishedAt: null,
  }
  await col().insertOne(doc as any)
  return doc
}

export async function findActiveExportJobForUser(userId: string, clientId: string) {
  await connectDB()
  return (await col().findOne({
    userId,
    clientId,
    status: { $in: ["pending", "running"] },
  })) as ExportJobDoc | null
}

export async function getExportJobById(id: string, userId: string, clientId: string) {
  if (!Types.ObjectId.isValid(id)) return null
  await connectDB()

  return (await col().findOne(
    { _id: new Types.ObjectId(id), userId, clientId },
    { projection: { resume: 0 } },
  )) as ExportJobDoc | null
}

export async function getExportJobForRunner(id: string, userId: string, clientId: string) {
  if (!Types.ObjectId.isValid(id)) return null
  await connectDB()
  return (await col().findOne({ _id: new Types.ObjectId(id), userId, clientId })) as ExportJobDoc | null
}

export async function listRecentExportJobsForUser(userId: string, clientId: string, limit = 10) {
  await connectDB()
  return (await col()
    .find({ userId, clientId }, { projection: { resume: 0 } })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray()) as ExportJobDoc[]
}

async function patch(id: Types.ObjectId, set: Record<string, unknown>) {
  await col().updateOne({ _id: id }, { $set: { ...set, updatedAt: new Date() } })
}

export async function setExportJobRunning(id: Types.ObjectId) {
  await patch(id, { status: "running", startedAt: new Date() })
}

export async function updateExportProgress(id: Types.ObjectId, processedProducts: number, totalProducts?: number) {
  const set: Record<string, unknown> = { processedProducts }
  if (typeof totalProducts === "number") set.totalProducts = totalProducts
  await patch(id, set)
}

export async function saveExportResumeState(id: Types.ObjectId, resume: ExportJobResumeState) {
  await patch(id, { resume, processedProducts: resume.processedProducts })
}

export async function markExportCompleted(
  id: Types.ObjectId,
  documents: ExportJobDocumentMeta[],
  missing: MissingBarcodeProduct[] = [],
) {

  await patch(id, { status: "completed", documents, missing, finishedAt: new Date(), resume: null })
}

export async function markExportFailed(id: Types.ObjectId, error: string) {
  await patch(id, { status: "failed", error, finishedAt: new Date(), resume: null })
}

export async function markExportCanceled(id: Types.ObjectId) {
  await patch(id, { status: "canceled", finishedAt: new Date(), resume: null })
}

export async function requestExportCancel(id: string, userId: string, clientId: string) {
  if (!Types.ObjectId.isValid(id)) return false
  await connectDB()
  const res = await col().updateOne(
    { _id: new Types.ObjectId(id), userId, clientId, status: { $in: ["pending", "running"] } },
    { $set: { cancelRequested: true, updatedAt: new Date() } },
  )
  return res.matchedCount > 0
}

export async function isExportCancelRequested(id: Types.ObjectId): Promise<boolean> {
  const doc = (await col().findOne({ _id: id }, { projection: { cancelRequested: 1 } })) as
    | { cancelRequested?: boolean }
    | null
  return Boolean(doc?.cancelRequested)
}

const MAX_EXPORT_RESTART_ATTEMPTS = 3

export async function claimInterruptedExportJobs(): Promise<
  Array<Pick<ExportJobDoc, "_id" | "userId" | "clientId">>
> {
  await connectDB()
  const jobs = (await col()
    .find({ status: { $in: ["pending", "running"] } }, { projection: { resume: 0 } })
    .toArray()) as ExportJobDoc[]

  const toRun: Array<Pick<ExportJobDoc, "_id" | "userId" | "clientId">> = []
  for (const job of jobs) {
    const attempts = (job.attempts ?? 0) + 1
    if (attempts > MAX_EXPORT_RESTART_ATTEMPTS) {
      await patch(job._id, { status: "failed", error: "too_many_restarts", finishedAt: new Date(), resume: null })
      continue
    }
    await patch(job._id, { status: "pending", attempts })
    toRun.push({ _id: job._id, userId: job.userId, clientId: job.clientId })
  }
  return toRun
}

export async function writeExportFileToGridFS(buffer: Buffer, fileName: string): Promise<Types.ObjectId> {
  await connectDB()
  const b = bucket()
  return await new Promise<Types.ObjectId>((resolve, reject) => {
    const stream = b.openUploadStream(fileName, { contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
    stream.on("error", reject)
    stream.on("finish", () => resolve(stream.id as Types.ObjectId))
    stream.end(buffer)
  })
}

export async function readExportFileFromGridFS(
  fileId: string,
): Promise<{ buffer: Buffer; fileName: string } | null> {
  if (!Types.ObjectId.isValid(fileId)) return null
  await connectDB()
  const b = bucket()
  const _id = new Types.ObjectId(fileId)
  const files = await b.find({ _id }).toArray()
  if (!files.length) return null
  const fileName = String(files[0].filename ?? "export.xlsx")
  const chunks: Buffer[] = []
  await new Promise<void>((resolve, reject) => {
    b.openDownloadStream(_id)
      .on("data", (chunk: Buffer) => chunks.push(chunk))
      .on("end", () => resolve())
      .on("error", reject)
  })
  return { buffer: Buffer.concat(chunks), fileName }
}

export async function deleteExportFileFromGridFS(fileId: string): Promise<void> {
  if (!Types.ObjectId.isValid(fileId)) return
  await connectDB()
  try {
    await bucket().delete(new Types.ObjectId(fileId))
  } catch {

  }
}

export async function markExportDocumentDownloaded(
  id: string,
  userId: string,
  clientId: string,
  docIndex: number,
): Promise<void> {
  if (!Types.ObjectId.isValid(id)) return
  await connectDB()
  await col().updateOne(
    { _id: new Types.ObjectId(id), userId, clientId },
    { $set: { [`documents.${docIndex}.downloaded`]: true, updatedAt: new Date() } },
  )
}

async function deleteExportJobWithFiles(job: Pick<ExportJobDoc, "_id" | "documents">): Promise<void> {
  for (const doc of job.documents ?? []) {
    await deleteExportFileFromGridFS(String(doc.fileId))
  }
  await col().deleteOne({ _id: job._id })
}

export async function enforceExportHistoryLimit(userId: string, clientId: string): Promise<void> {
  await connectDB()
  const jobs = (await col()
    .find({ userId, clientId }, { projection: { documents: 1, status: 1 } })
    .sort({ createdAt: -1 })
    .toArray()) as Array<Pick<ExportJobDoc, "_id" | "documents" | "status">>

  const excess = jobs
    .slice(EXPORT_HISTORY_LIMIT)
    .filter((job) => job.status !== "pending" && job.status !== "running")
  for (const job of excess) {
    await deleteExportJobWithFiles(job)
  }
}

export async function cleanupExpiredExportJobs(): Promise<number> {
  await connectDB()
  const now = Date.now()
  const expired = (await col()
    .find(
      {
        $or: [
          { finishedAt: { $lt: new Date(now - EXPORT_HISTORY_TTL_MS) } },
          { createdAt: { $lt: new Date(now - EXPORT_HISTORY_TTL_MS * 2) } },
        ],
      },
      { projection: { documents: 1 } },
    )
    .toArray()) as Array<Pick<ExportJobDoc, "_id" | "documents">>

  for (const job of expired) {
    await deleteExportJobWithFiles(job)
  }
  return expired.length
}
