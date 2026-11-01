import { connectDB, getCollection } from "./db"
import { areSupplierRefsInitialSyncReady } from "./actions/sync-info"

type LiveUpdateEntity = "packer-task" | "stock-transaction" | "stocks" | "supplier-token"

type PackerTaskPresenceUser = {
  userId: string
  userName: string
  sessionId: string
  lastSeenAt: string
}

type PackerTaskPresenceSnapshot = {
  entity: "packer-task-presence"
  tasks: Array<{
    supplierId: string
    taskId: string
    users: PackerTaskPresenceUser[]
  }>
  changedAt: string
}

type PackerTaskPresenceUpdate = {
  entity: "packer-task-presence"
  supplierId: string
  taskId: string
  users: PackerTaskPresenceUser[]
  changedAt: string
}

type PackerTaskPresenceTask = {
  taskId: string
  supplierId: string
}

type LiveUpdatePayload = {
  entity: LiveUpdateEntity
  supplierId?: string
  entityId?: string

  reason?: string
  changedAt: string
}

type Subscriber = {
  supplierIds: Set<string>
  send: (event: string, data: unknown) => void
}

type PresenceSession = {
  key: string
  sessionId: string
  userId: string
  userName: string
  supplierIds: Set<string>
  taskIds: Set<string>
  lastSeenAtMs: number
}

type PresenceTaskRecord = {
  taskId: string
  supplierId: string
  sessionId: string
  userId: string
  userName: string
  lastSeenAtMs: number
}

const LIVE_UPDATE_EVENT = "live-update"
const TASK_PRESENCE_SNAPSHOT_EVENT = "task-presence-snapshot"
const TASK_PRESENCE_UPDATE_EVENT = "task-presence-update"
const HEARTBEAT_INTERVAL_MS = 25_000
const PACKER_TASK_PRESENCE_STALE_MS = 60_000
const WATCH_RESTART_DELAY_MS = 1_000

const STOCKS_READY_CACHE_TTL_READY_MS = 5 * 60_000
const STOCKS_READY_CACHE_TTL_PENDING_MS = 15_000
const stocksSupplierReadyCache = new Map<string, { ready: boolean; expiresAt: number }>()

const subscribers = new Map<number, Subscriber>()
const presenceSessions = new Map<string, PresenceSession>()
const presenceByTaskId = new Map<string, Map<string, PresenceTaskRecord>>()
const changeStreams: Array<{ close: () => Promise<void> | void }> = []

let nextSubscriberId = 1
let watchersPromise: Promise<void> | null = null
let presenceCleanupIntervalId: ReturnType<typeof setInterval> | null = null

function normalizeSupplierId(value: unknown) {
  if (!value) return ""
  if (typeof value === "string") return value
  if (typeof value === "object" && value !== null && "toString" in value) {
    return String(value.toString())
  }
  return ""
}

function normalizeSupplierIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []

  return Array.from(new Set(value.map((entry) => normalizeSupplierId(entry)).filter(Boolean)))
}

function publish(payload: Omit<LiveUpdatePayload, "changedAt"> & { changedAt?: string }) {
  const normalizedPayload: LiveUpdatePayload = {
    ...payload,
    changedAt: payload.changedAt ?? new Date().toISOString(),
  }

  for (const subscriber of subscribers.values()) {
    if (normalizedPayload.supplierId && !subscriber.supplierIds.has(normalizedPayload.supplierId)) {
      continue
    }
    subscriber.send(LIVE_UPDATE_EVENT, normalizedPayload)
  }
}

function createPresenceSessionKey(userId: string, sessionId: string) {
  return `${userId}:${sessionId}`
}

function toPresenceUsers(records: Iterable<PresenceTaskRecord>): PackerTaskPresenceUser[] {
  return [...records]
    .sort((left, right) => left.userName.localeCompare(right.userName, "ru"))
    .map((record) => ({
      userId: record.userId,
      userName: record.userName,
      sessionId: record.sessionId,
      lastSeenAt: new Date(record.lastSeenAtMs).toISOString(),
    }))
}

function removePresenceTaskRecord(taskId: string, sessionKey: string) {
  const taskRecords = presenceByTaskId.get(taskId)
  if (!taskRecords) return ""

  const existing = taskRecords.get(sessionKey)
  if (!existing) return ""

  taskRecords.delete(sessionKey)
  if (taskRecords.size === 0) {
    presenceByTaskId.delete(taskId)
  }

  return existing.supplierId
}

function publishTaskPresenceUpdate(taskId: string, supplierId: string) {
  if (!taskId || !supplierId) return

  const taskRecords = presenceByTaskId.get(taskId)
  const payload: PackerTaskPresenceUpdate = {
    entity: "packer-task-presence",
    supplierId,
    taskId,
    users: taskRecords ? toPresenceUsers(taskRecords.values()) : [],
    changedAt: new Date().toISOString(),
  }

  for (const subscriber of subscribers.values()) {
    if (!subscriber.supplierIds.has(supplierId)) continue
    subscriber.send(TASK_PRESENCE_UPDATE_EVENT, payload)
  }
}

function removePresenceSession(sessionKey: string) {
  const session = presenceSessions.get(sessionKey)
  if (!session) return

  const changedTaskIds = new Map<string, string>()
  for (const taskId of session.taskIds) {
    const supplierId = removePresenceTaskRecord(taskId, sessionKey)
    if (supplierId) {
      changedTaskIds.set(taskId, supplierId)
    }
  }

  presenceSessions.delete(sessionKey)

  for (const [taskId, supplierId] of changedTaskIds.entries()) {
    publishTaskPresenceUpdate(taskId, supplierId)
  }
}

function pruneStalePresenceSessions() {
  const staleBefore = Date.now() - PACKER_TASK_PRESENCE_STALE_MS
  const staleSessionKeys = [...presenceSessions.values()]
    .filter((session) => session.lastSeenAtMs < staleBefore)
    .map((session) => session.key)

  for (const sessionKey of staleSessionKeys) {
    removePresenceSession(sessionKey)
  }
}

function startPresenceCleanupLoop() {
  if (presenceCleanupIntervalId) return
  presenceCleanupIntervalId = setInterval(() => {
    pruneStalePresenceSessions()
  }, HEARTBEAT_INTERVAL_MS)
}

function buildTaskPresenceSnapshot(supplierIds: string[]): PackerTaskPresenceSnapshot {
  pruneStalePresenceSessions()

  const supplierScope = new Set(supplierIds)
  const tasks: PackerTaskPresenceSnapshot["tasks"] = []

  for (const [taskId, taskRecords] of presenceByTaskId.entries()) {
    const firstRecord = [...taskRecords.values()][0]
    if (!firstRecord || !supplierScope.has(firstRecord.supplierId)) continue

    tasks.push({
      supplierId: firstRecord.supplierId,
      taskId,
      users: toPresenceUsers(taskRecords.values()),
    })
  }

  return {
    entity: "packer-task-presence",
    tasks,
    changedAt: new Date().toISOString(),
  }
}

export function syncPackerTaskPresence(input: {
  sessionId: string
  userId: string
  userName: string
  supplierIds: string[]
  tasks: PackerTaskPresenceTask[]
}) {
  pruneStalePresenceSessions()

  const sessionKey = createPresenceSessionKey(input.userId, input.sessionId)
  const nextTaskIds = new Set(input.tasks.map((task) => task.taskId))
  const taskSupplierMap = new Map(input.tasks.map((task) => [task.taskId, task.supplierId]))
  const now = Date.now()

  const session = presenceSessions.get(sessionKey) ?? {
    key: sessionKey,
    sessionId: input.sessionId,
    userId: input.userId,
    userName: input.userName,
    supplierIds: new Set(input.supplierIds),
    taskIds: new Set<string>(),
    lastSeenAtMs: now,
  }

  session.userName = input.userName
  session.supplierIds = new Set(input.supplierIds)
  session.lastSeenAtMs = now

  const changedTaskIds = new Map<string, string>()

  for (const taskId of session.taskIds) {
    if (nextTaskIds.has(taskId)) continue
    const supplierId = removePresenceTaskRecord(taskId, sessionKey)
    if (supplierId) {
      changedTaskIds.set(taskId, supplierId)
    }
  }

  for (const task of input.tasks) {
    const existingTaskRecords = presenceByTaskId.get(task.taskId) ?? new Map<string, PresenceTaskRecord>()
    const previousRecord = existingTaskRecords.get(sessionKey)

    existingTaskRecords.set(sessionKey, {
      taskId: task.taskId,
      supplierId: task.supplierId,
      sessionId: input.sessionId,
      userId: input.userId,
      userName: input.userName,
      lastSeenAtMs: now,
    })
    presenceByTaskId.set(task.taskId, existingTaskRecords)

    if (
      !previousRecord ||
      previousRecord.supplierId !== task.supplierId ||
      previousRecord.userName !== input.userName
    ) {
      changedTaskIds.set(task.taskId, task.supplierId)
    }
  }

  session.taskIds = nextTaskIds

  if (nextTaskIds.size === 0) {
    presenceSessions.delete(sessionKey)
  } else {
    presenceSessions.set(sessionKey, session)
  }

  for (const [taskId, supplierId] of changedTaskIds.entries()) {
    publishTaskPresenceUpdate(taskId, supplierId || taskSupplierMap.get(taskId) || "")
  }
}

function subscribe(supplierIds: string[], send: Subscriber["send"]) {
  const id = nextSubscriberId++
  subscribers.set(id, {
    supplierIds: new Set(supplierIds),
    send,
  })

  return () => {
    subscribers.delete(id)
  }
}

async function shouldPublishStocksChange(change: any): Promise<boolean> {
  const refs = [
    normalizeSupplierId(change?.fullDocument?.supplierId),
    normalizeSupplierId(change?.fullDocument?.legacySupplierId),
  ].filter(Boolean)
  if (!refs.length) return false

  const cacheKey = refs.slice().sort().join("|")
  const now = Date.now()
  const cached = stocksSupplierReadyCache.get(cacheKey)

  let ready: boolean
  if (cached && cached.expiresAt > now) {
    ready = cached.ready
  } else {
    try {
      ready = await areSupplierRefsInitialSyncReady(refs)
    } catch (error) {

      console.error("[live-updates] stocks readiness check failed", error)
      ready = false
    }
    stocksSupplierReadyCache.set(cacheKey, {
      ready,
      expiresAt: now + (ready ? STOCKS_READY_CACHE_TTL_READY_MS : STOCKS_READY_CACHE_TTL_PENDING_MS),
    })
  }

  return !ready
}

function startCollectionWatch(
  collectionName: string,
  entity: LiveUpdateEntity,
  shouldPublish?: (change: any) => Promise<boolean>,
) {
  const changeStream = getCollection(collectionName).watch([], {
    fullDocument: "updateLookup",
  }) as any

  let restartScheduled = false
  const scheduleRestart = () => {
    if (restartScheduled) return
    restartScheduled = true
    setTimeout(() => {
      startCollectionWatch(collectionName, entity, shouldPublish)
    }, WATCH_RESTART_DELAY_MS)
  }

  changeStreams.push(changeStream)

  changeStream.on("change", (change: any) => {
    if (!["insert", "update", "replace"].includes(String(change?.operationType ?? ""))) {
      return
    }

    const supplierIds = normalizeSupplierIds(change?.fullDocument?.supplierIds)
    const singleSupplierId = normalizeSupplierId(change?.fullDocument?.supplierId)
    const effectiveSupplierIds = supplierIds.length
      ? supplierIds
      : (singleSupplierId ? [singleSupplierId] : [])
    if (!effectiveSupplierIds.length) return

    const emit = () => {
      for (const supplierId of effectiveSupplierIds) {
        publish({
          entity,
          supplierId,
          entityId: change?.documentKey?._id?.toString(),
        })
      }
    }

    if (!shouldPublish) {
      emit()
      return
    }

    void shouldPublish(change)
      .then((allowed) => {
        if (allowed) emit()
      })
      .catch((error) => {
        console.error(`[live-updates] ${collectionName} gate error`, error)
        emit()
      })
  })

  changeStream.on("error", (error: unknown) => {
    console.error(`[live-updates] ${collectionName} change stream error`, error)
    scheduleRestart()
  })

  changeStream.on("close", () => {
    scheduleRestart()
  })
}

async function ensureWatchersStarted() {
  if (!watchersPromise) {
    watchersPromise = (async () => {
      await connectDB()
      startPresenceCleanupLoop()
      startCollectionWatch("packerTasks", "packer-task")
      startCollectionWatch("stockTransactions", "stock-transaction")
      startCollectionWatch("flatStockTransactions", "stock-transaction")

      startCollectionWatch("stocks", "stocks", shouldPublishStocksChange)
    })().catch((error) => {
      watchersPromise = null
      throw error
    })
  }

  await watchersPromise
}

export function publishSupplierLiveUpdates(entity: LiveUpdateEntity, supplierIds: string[]) {
  const uniqueSupplierIds = Array.from(new Set(supplierIds.filter(Boolean)))
  for (const supplierId of uniqueSupplierIds) {
    publish({ entity, supplierId })
  }
}

export function publishSupplierTokenStatus(supplierIds: string[], reason: string) {
  const uniqueSupplierIds = Array.from(new Set(supplierIds.filter(Boolean)))
  for (const supplierId of uniqueSupplierIds) {
    publish({ entity: "supplier-token", supplierId, reason })
  }
}

export async function createLiveUpdatesResponse(request: Request, supplierIds: string[]) {
  await ensureWatchersStarted()
  const encoder = new TextEncoder()

  let closeStream: (() => void) | null = null

  return new Response(
    new ReadableStream({
      start(controller) {
        let closed = false
        let heartbeatId: ReturnType<typeof setInterval> | null = null

        const abortListener = () => {
          safeClose()
        }

        const send = (event: string, data: unknown) => {
          if (closed) return
          try {
            controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
          } catch {
            safeClose()
          }
        }

        const unsubscribe = subscribe(supplierIds, send)

        const safeClose = () => {
          if (closed) return
          closed = true
          if (heartbeatId) {
            clearInterval(heartbeatId)
            heartbeatId = null
          }
          unsubscribe()
          request.signal.removeEventListener("abort", abortListener)
          try {
            controller.close()
          } catch {

          }
        }
        closeStream = safeClose

        send("connected", { ok: true })
        send(TASK_PRESENCE_SNAPSHOT_EVENT, buildTaskPresenceSnapshot(supplierIds))
        heartbeatId = setInterval(() => {
          send("ping", { ts: new Date().toISOString() })
        }, HEARTBEAT_INTERVAL_MS)
        request.signal.addEventListener("abort", abortListener, { once: true })
      },
      cancel() {

        closeStream?.()
      },
    }),
    {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    },
  )
}