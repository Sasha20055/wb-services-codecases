import { useAuth } from "@/src/features/auth/ui"
import { projectSseUrl } from "@/src/shared/api"
import { useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { markTokenInvalid, type TokenStatusReason } from "./token-status-store"

type LiveUpdateEntity = "packer-task" | "stock-transaction" | "stocks" | "supplier-token"

type LiveUpdatePayload = {
    entity?: LiveUpdateEntity
    reason?: string
}

type TaskPresenceUser = {
    userId: string
    userName: string
    sessionId: string
    lastSeenAt: string
}

type TaskPresenceSnapshotPayload = {
    entity?: "packer-task-presence"
    tasks?: Array<{
        supplierId: string
        taskId: string
        users: TaskPresenceUser[]
    }>
}

type TaskPresenceUpdatePayload = {
    entity?: "packer-task-presence"
    supplierId?: string
    taskId?: string
    users?: TaskPresenceUser[]
}

type TaskPresenceContextValue = {
    taskPresence: Record<string, TaskPresenceUser[]>
    getOtherTaskUsers: (taskId: string, currentUserId?: string) => TaskPresenceUser[]
}

const RETRY_BASE_MS = 1000
const RETRY_MAX_MS = 30_000
const FLUSH_DELAY_MS = 150

const WATCHDOG_INTERVAL_MS = 12_000
const WATCHDOG_TIMEOUT_MS = 40_000

const TaskPresenceContext = React.createContext<TaskPresenceContextValue | null>(null)

function normalizePresenceUsers(users: TaskPresenceUser[] | undefined) {
    const dedupedBySession = new Map<string, TaskPresenceUser>()

    for (const user of users ?? []) {
        if (!user?.sessionId || !user?.userId) continue
        dedupedBySession.set(user.sessionId, user)
    }

    return [...dedupedBySession.values()].sort((left, right) => left.userName.localeCompare(right.userName, "ru"))
}

export function useTaskPresence() {
    const ctx = React.useContext(TaskPresenceContext)
    if (!ctx) throw new Error("useTaskPresence must be used within LiveUpdatesProvider")
    return ctx
}

function invalidateManagedQueries(
    queryClient: ReturnType<typeof useQueryClient>,
    entities: Iterable<LiveUpdateEntity>,
) {
    const queryKeys = new Set<string>()

    for (const entity of entities) {
        if (entity === "packer-task") {

            queryKeys.add("packer-tasks")
            queryKeys.add("stock-postings")
            continue
        }

        if (entity === "stock-transaction") {
            queryKeys.add("stock-transactions")
            queryKeys.add("stock-postings")
            queryKeys.add("nm-summary")
            continue
        }

        if (entity === "stocks") {
            queryKeys.add("stocks")
            queryKeys.add("nm-summary")
            continue
        }

        if (entity === "supplier-token") {

            queryKeys.add("suppliers")
            queryKeys.add("own-warehouses-flat-all")
            queryKeys.add("nm-summary")
            queryKeys.add("stocks")
        }
    }

    for (const queryKey of queryKeys) {
        void queryClient.invalidateQueries({ queryKey: [queryKey] })
    }
}

export function LiveUpdatesProvider({ children }: { children: React.ReactNode }) {
    const { user, isLoading } = useAuth()
    const queryClient = useQueryClient()
    const [taskPresence, setTaskPresence] = React.useState<Record<string, TaskPresenceUser[]>>({})
    const eventSourceRef = React.useRef<EventSource | null>(null)
    const retryTimeoutRef = React.useRef<number | null>(null)
    const flushTimeoutRef = React.useRef<number | null>(null)
    const retryAttemptRef = React.useRef(0)
    const pendingEntitiesRef = React.useRef<Set<LiveUpdateEntity>>(new Set())
    const lastMessageAtRef = React.useRef(0)

    React.useEffect(() => {
        if (isLoading || !user?._id) return

        const clearRetry = () => {
            if (retryTimeoutRef.current != null) {
                window.clearTimeout(retryTimeoutRef.current)
                retryTimeoutRef.current = null
            }
        }

        const clearFlush = () => {
            if (flushTimeoutRef.current != null) {
                window.clearTimeout(flushTimeoutRef.current)
                flushTimeoutRef.current = null
            }
        }

        const flushPending = () => {
            clearFlush()

            if (pendingEntitiesRef.current.size === 0) return

            const pendingEntities = new Set(pendingEntitiesRef.current)
            pendingEntitiesRef.current.clear()
            invalidateManagedQueries(queryClient, pendingEntities)
        }

        const scheduleFlush = () => {
            if (flushTimeoutRef.current != null) return

            flushTimeoutRef.current = window.setTimeout(() => {
                flushPending()
            }, FLUSH_DELAY_MS)
        }

        const scheduleRetry = () => {
            clearRetry()
            const attempt = retryAttemptRef.current
            const exponentialDelay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * Math.pow(2, attempt))
            const jitter = Math.floor(Math.random() * 300)

            retryTimeoutRef.current = window.setTimeout(() => {
                retryAttemptRef.current += 1
                connect()
            }, exponentialDelay + jitter)
        }

        const connect = () => {
            eventSourceRef.current?.close()
            eventSourceRef.current = null

            lastMessageAtRef.current = Date.now()
            const wasRecovering = retryAttemptRef.current > 0
            const eventSource = new EventSource(projectSseUrl("/sse/live-updates"))
            eventSourceRef.current = eventSource

            eventSource.onopen = () => {
                lastMessageAtRef.current = Date.now()
                retryAttemptRef.current = 0
                clearRetry()

                if (wasRecovering) {
                    invalidateManagedQueries(queryClient, ["packer-task", "stock-transaction", "stocks"])
                }
            }

            eventSource.addEventListener("ping", () => {
                lastMessageAtRef.current = Date.now()
            })

            eventSource.addEventListener("live-update", (event) => {
                const payload = JSON.parse((event as MessageEvent).data) as LiveUpdatePayload
                if (!payload.entity) return

                if (payload.entity === "supplier-token") {

                    markTokenInvalid((payload.reason as TokenStatusReason) ?? "unauthorized")
                }

                pendingEntitiesRef.current.add(payload.entity)
                scheduleFlush()
            })

            eventSource.addEventListener("task-presence-snapshot", (event) => {
                const payload = JSON.parse((event as MessageEvent).data) as TaskPresenceSnapshotPayload

                React.startTransition(() => {
                    const nextState: Record<string, TaskPresenceUser[]> = {}

                    for (const task of payload.tasks ?? []) {
                        if (!task?.taskId) continue
                        nextState[task.taskId] = normalizePresenceUsers(task.users)
                    }

                    setTaskPresence(nextState)
                })
            })

            eventSource.addEventListener("task-presence-update", (event) => {
                const payload = JSON.parse((event as MessageEvent).data) as TaskPresenceUpdatePayload
                if (!payload.taskId) return

                React.startTransition(() => {
                    setTaskPresence((prev) => {
                        const nextUsers = normalizePresenceUsers(payload.users)
                        if (nextUsers.length === 0) {
                            if (!(payload.taskId! in prev)) return prev
                            const next = { ...prev }
                            delete next[payload.taskId!]
                            return next
                        }

                        return {
                            ...prev,
                            [payload.taskId]: nextUsers,
                        }
                    })
                })
            })

            eventSource.onerror = () => {
                eventSource.close()
                eventSourceRef.current = null
                scheduleRetry()
            }
        }

        const checkWatchdog = () => {
            const es = eventSourceRef.current
            if (!es) return

            if (Date.now() - lastMessageAtRef.current > WATCHDOG_TIMEOUT_MS) {
                es.close()
                eventSourceRef.current = null
                retryAttemptRef.current = 0
                connect()
            }
        }

        connect()
        const watchdogId = window.setInterval(checkWatchdog, WATCHDOG_INTERVAL_MS)

        return () => {
            window.clearInterval(watchdogId)
            clearRetry()
            clearFlush()
            pendingEntitiesRef.current.clear()
            retryAttemptRef.current = 0
            setTaskPresence({})
            eventSourceRef.current?.close()
            eventSourceRef.current = null
        }
    }, [isLoading, queryClient, user?._id])

    const taskPresenceValue = React.useMemo<TaskPresenceContextValue>(() => ({
        taskPresence,
        getOtherTaskUsers: (taskId: string, currentUserId?: string) => {
            const users = taskPresence[taskId] ?? []
            if (!currentUserId) return users

            const dedupedByUser = new Map<string, TaskPresenceUser>()
            for (const userPresence of users) {
                if (userPresence.userId === currentUserId) continue
                if (!dedupedByUser.has(userPresence.userId)) {
                    dedupedByUser.set(userPresence.userId, userPresence)
                }
            }

            return [...dedupedByUser.values()]
        },
    }), [taskPresence])

    return <TaskPresenceContext.Provider value={taskPresenceValue}>{children}</TaskPresenceContext.Provider>
}