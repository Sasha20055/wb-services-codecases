// @ts-nocheck
"use client"

import * as React from "react"
import { projectApi, projectApiUrl } from "@/src/shared/api"

const STORAGE_KEY_PREFIX = "packer-tasks-active"
const STORAGE_SCOPE_KEY_PREFIX = "packer-tasks-active-scope"
const FORM_STORAGE_KEY_PREFIX = "packer-tasks-form-active"
const PRESENCE_SESSION_STORAGE_KEY = "supplier-analytics-packer-task-presence-session"
const PRESENCE_HEARTBEAT_INTERVAL_MS = 25_000

type PresenceSyncResponse = {
  ok: boolean
  taskIds?: string[]
}

function getStorageKey(userId: string) {
  return `${STORAGE_KEY_PREFIX}:${userId}`
}

function getFormStorageKey(userId: string) {
  return `${FORM_STORAGE_KEY_PREFIX}:${userId}`
}

function getScopeStorageKey(userId: string) {
  return `${STORAGE_SCOPE_KEY_PREFIX}:${userId}`
}

function loadActiveSet(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(getStorageKey(userId))
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((id: unknown) => typeof id === "string"))
  } catch {
    return new Set()
  }
}

function loadScopeMap(userId: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(getScopeStorageKey(userId))
    if (!raw) return {}

    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}

    return Object.fromEntries(
      Object.entries(parsed).flatMap(([taskId, scopeKey]) => {
        if (!taskId || typeof scopeKey !== "string" || !scopeKey) return []
        return [[taskId, scopeKey]]
      }),
    )
  } catch {
    return {}
  }
}

function normalizeTaskIds(value: unknown) {
  if (!Array.isArray(value)) return []

  return Array.from(
    new Set(value.filter((taskId): taskId is string => typeof taskId === "string" && Boolean(taskId))),
  )
}

function loadFormActiveMap(userId: string): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(getFormStorageKey(userId))
    if (!raw) return {}

    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}

    return Object.fromEntries(
      Object.entries(parsed).flatMap(([sessionId, taskIds]) => {
        if (!sessionId) return []

        const normalizedTaskIds = normalizeTaskIds(taskIds)
        return normalizedTaskIds.length > 0 ? [[sessionId, normalizedTaskIds]] : []
      }),
    )
  } catch {
    return {}
  }
}

function saveActiveSet(userId: string, activeSet: Set<string>) {
  try {
    localStorage.setItem(getStorageKey(userId), JSON.stringify([...activeSet]))
  } catch {

  }
}

function saveScopeMap(userId: string, scopeMap: Record<string, string>) {
  try {
    const normalizedEntries = Object.entries(scopeMap).flatMap(([taskId, scopeKey]) => {
      if (!taskId || !scopeKey) return []
      return [[taskId, scopeKey]]
    })

    if (normalizedEntries.length === 0) {
      localStorage.removeItem(getScopeStorageKey(userId))
      return
    }

    localStorage.setItem(getScopeStorageKey(userId), JSON.stringify(Object.fromEntries(normalizedEntries)))
  } catch {

  }
}

function removeScopeConflicts(
  scopeMap: Record<string, string>,
  scopeKey: string,
  taskIdToKeep: string,
) {
  const next = { ...scopeMap }

  Object.entries(next).forEach(([taskId, currentScopeKey]) => {
    if (taskId !== taskIdToKeep && currentScopeKey === scopeKey) {
      delete next[taskId]
    }
  })

  next[taskIdToKeep] = scopeKey
  return next
}

function saveFormActiveMap(userId: string, formActiveMap: Record<string, string[]>) {
  try {
    const normalizedEntries = Object.entries(formActiveMap).flatMap(([sessionId, taskIds]) => {
      if (!sessionId) return []

      const normalizedTaskIds = normalizeTaskIds(taskIds)
      return normalizedTaskIds.length > 0 ? [[sessionId, normalizedTaskIds]] : []
    })

    if (normalizedEntries.length === 0) {
      localStorage.removeItem(getFormStorageKey(userId))
      return
    }

    localStorage.setItem(getFormStorageKey(userId), JSON.stringify(Object.fromEntries(normalizedEntries)))
  } catch {

  }
}

function mergeActiveTaskIds(activeSet: Set<string>, formActiveMap: Record<string, string[]>) {
  const next = new Set(activeSet)

  Object.values(formActiveMap).forEach((taskIds) => {
    taskIds.forEach((taskId) => {
      next.add(taskId)
    })
  })

  return next
}

function createRandomSessionId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function getPresenceSessionId() {
  try {
    const existing = window.sessionStorage.getItem(PRESENCE_SESSION_STORAGE_KEY)
    if (existing) return existing

    const next = createRandomSessionId()
    window.sessionStorage.setItem(PRESENCE_SESSION_STORAGE_KEY, next)
    return next
  } catch {
    return createRandomSessionId()
  }
}

async function syncPresence(sessionId: string, taskIds: string[], keepalive = false) {
  return projectApi<PresenceSyncResponse>("/presence/packer-tasks/sync", {
    method: "POST",
    keepalive,
    timeoutMs: keepalive ? 3_000 : 10_000,
    body: JSON.stringify({ sessionId, taskIds }),
  })
}

function syncPresenceBestEffort(sessionId: string, taskIds: string[]) {
  void fetch(projectApiUrl("/presence/packer-tasks/sync"), {
    method: "POST",
    credentials: "include",
    keepalive: true,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sessionId, taskIds }),
  }).catch(() => {

  })
}

export function usePackerTaskActive(userId: string | undefined) {
  const [manualActiveSet, setManualActiveSet] = React.useState<Set<string>>(() => {
    if (!userId) return new Set()
    return loadActiveSet(userId)
  })
  const [manualScopeMap, setManualScopeMap] = React.useState<Record<string, string>>(() => {
    if (!userId) return {}
    return loadScopeMap(userId)
  })
  const [formActiveMap, setFormActiveMap] = React.useState<Record<string, string[]>>(() => {
    if (!userId) return {}
    return loadFormActiveMap(userId)
  })
  const sessionIdRef = React.useRef<string | null>(null)
  const presenceTaskIdsRef = React.useRef<string[]>([])
  const lastPresenceSyncSignatureRef = React.useRef<string>("")
  const manualScopeMapRef = React.useRef<Record<string, string>>(manualScopeMap)

  if (sessionIdRef.current == null && typeof window !== "undefined") {
    sessionIdRef.current = getPresenceSessionId()
  }

  React.useEffect(() => {
    manualScopeMapRef.current = manualScopeMap
  }, [manualScopeMap])

  React.useEffect(() => {
    if (!userId) {
      setManualActiveSet(new Set())
      setManualScopeMap({})
      setFormActiveMap({})
      return
    }

    setManualActiveSet(loadActiveSet(userId))
    setManualScopeMap(loadScopeMap(userId))
    setFormActiveMap(loadFormActiveMap(userId))
  }, [userId])

  React.useEffect(() => {
    if (!userId) return

    const onStorage = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage) return
      if (event.key === getStorageKey(userId)) {
        setManualActiveSet(loadActiveSet(userId))
      }
      if (event.key === getScopeStorageKey(userId)) {
        setManualScopeMap(loadScopeMap(userId))
      }
      if (event.key === getFormStorageKey(userId)) {
        setFormActiveMap(loadFormActiveMap(userId))
      }
    }

    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [userId])

  const activeSet = React.useMemo(
    () => mergeActiveTaskIds(manualActiveSet, formActiveMap),
    [formActiveMap, manualActiveSet],
  )

  const currentSessionFormTaskIds = React.useMemo(() => {
    const sessionId = sessionIdRef.current
    if (!sessionId) return []

    return normalizeTaskIds(formActiveMap[sessionId])
  }, [formActiveMap])

  const presenceTaskIds = React.useMemo(
    () => [...new Set([...manualActiveSet, ...currentSessionFormTaskIds])],
    [currentSessionFormTaskIds, manualActiveSet],
  )

  React.useEffect(() => {
    presenceTaskIdsRef.current = presenceTaskIds
  }, [presenceTaskIds])

  const syncActivePresence = React.useCallback(
    async (taskIds: string[], forceHeartbeat = false) => {
      if (!userId || !sessionIdRef.current) return

      const normalizedTaskIds = [...taskIds].sort()
      const signature = JSON.stringify(normalizedTaskIds)

      if (normalizedTaskIds.length === 0 && lastPresenceSyncSignatureRef.current === "") {
        return
      }

      if (!forceHeartbeat && signature === lastPresenceSyncSignatureRef.current) {
        return
      }

      try {
        await syncPresence(sessionIdRef.current, normalizedTaskIds)

        lastPresenceSyncSignatureRef.current = normalizedTaskIds.length === 0 ? "" : signature
      } catch {
        if (!forceHeartbeat) {
          lastPresenceSyncSignatureRef.current = ""
        }
      }
    },
    [userId],
  )

  React.useEffect(() => {
    if (!userId || !sessionIdRef.current) return
    void syncActivePresence(presenceTaskIds, false)
  }, [presenceTaskIds, syncActivePresence, userId])

  React.useEffect(() => {
    if (!userId || !sessionIdRef.current) return

    const heartbeatId = window.setInterval(() => {
      void syncActivePresence(presenceTaskIdsRef.current, true)
    }, PRESENCE_HEARTBEAT_INTERVAL_MS)

    const releaseCurrentTasks = () => {
      const sessionId = sessionIdRef.current

      if (userId && sessionId) {
        const nextFormActiveMap = loadFormActiveMap(userId)
        if (sessionId in nextFormActiveMap) {
          delete nextFormActiveMap[sessionId]
          saveFormActiveMap(userId, nextFormActiveMap)
          setFormActiveMap(nextFormActiveMap)
        }
      }

      if (!sessionId) return

      if (presenceTaskIdsRef.current.length === 0) return
      syncPresenceBestEffort(sessionId, [])
    }

    window.addEventListener("pagehide", releaseCurrentTasks)

    return () => {
      window.clearInterval(heartbeatId)
      window.removeEventListener("pagehide", releaseCurrentTasks)
    }
  }, [syncActivePresence, userId])

  const isActive = React.useCallback(
    (taskId: string) => activeSet.has(taskId),
    [activeSet],
  )

  const activate = React.useCallback(
    (taskId: string, scopeKey?: string) => {
      if (!userId) return

      if (scopeKey) {
        setManualScopeMap((prev) => {
          const next = removeScopeConflicts(prev, scopeKey, taskId)
          saveScopeMap(userId, next)
          return next
        })
      }

      setManualActiveSet((prev) => {
        const next = new Set(prev)

        if (scopeKey) {
          Object.entries(manualScopeMapRef.current).forEach(([activeTaskId, activeScopeKey]) => {
            if (activeTaskId !== taskId && activeScopeKey === scopeKey) {
              next.delete(activeTaskId)
            }
          })
        }

        next.add(taskId)
        saveActiveSet(userId, next)
        return next
      })
    },
    [userId],
  )

  const deactivate = React.useCallback(
    (taskId: string) => {
      if (!userId) return

      setManualScopeMap((prev) => {
        if (!(taskId in prev)) return prev
        const next = { ...prev }
        delete next[taskId]
        saveScopeMap(userId, next)
        return next
      })

      setManualActiveSet((prev) => {
        const next = new Set(prev)
        next.delete(taskId)
        saveActiveSet(userId, next)
        return next
      })
    },
    [userId],
  )

  const toggle = React.useCallback(
    (taskId: string, scopeKey?: string) => {
      if (!userId) return

      setManualActiveSet((prev) => {
        const next = new Set(prev)
        if (next.has(taskId)) {
          next.delete(taskId)
        } else {
          if (scopeKey) {
            Object.entries(manualScopeMapRef.current).forEach(([activeTaskId, activeScopeKey]) => {
              if (activeTaskId !== taskId && activeScopeKey === scopeKey) {
                next.delete(activeTaskId)
              }
            })
          }
          next.add(taskId)
        }
        saveActiveSet(userId, next)
        return next
      })

      setManualScopeMap((prev) => {
        if (!scopeKey) {
          if (!(taskId in prev)) return prev
          const next = { ...prev }
          delete next[taskId]
          saveScopeMap(userId, next)
          return next
        }

        if (manualActiveSet.has(taskId)) {
          if (!(taskId in prev)) return prev
          const next = { ...prev }
          delete next[taskId]
          saveScopeMap(userId, next)
          return next
        }

        const next = removeScopeConflicts(prev, scopeKey, taskId)
        saveScopeMap(userId, next)
        return next
      })
    },
    [manualActiveSet, userId],
  )

  const cleanup = React.useCallback(
    (existingIds: string[]) => {
      if (!userId) return
      const existingSet = new Set(existingIds)
      setManualActiveSet((prev) => {
        const next = new Set<string>()
        for (const id of prev) {
          if (existingSet.has(id)) next.add(id)
        }
        saveActiveSet(userId, next)
        return next
      })

      setManualScopeMap((prev) => {
        const next = Object.fromEntries(
          Object.entries(prev).filter(([taskId]) => existingSet.has(taskId)),
        )
        saveScopeMap(userId, next)
        return next
      })
    },
    [userId],
  )

  const syncTaskScopes = React.useCallback(
    (entries: Array<{ taskId: string; scopeKey?: string | null }>) => {
      if (!userId) return

      setManualScopeMap((prev) => {
        let changed = false
        const next = { ...prev }

        entries.forEach(({ taskId, scopeKey }) => {
          if (!taskId || !scopeKey) return
          if (next[taskId] === scopeKey) return
          next[taskId] = scopeKey
          changed = true
        })

        if (!changed) return prev
        saveScopeMap(userId, next)
        return next
      })
    },
    [userId],
  )

  const activateWhileFormOpen = React.useCallback(
    (taskId: string) => {
      const sessionId = sessionIdRef.current
      if (!userId || !sessionId || !taskId) return

      setFormActiveMap((prev) => {
        const currentTaskIds = normalizeTaskIds(prev[sessionId])
        if (currentTaskIds.includes(taskId)) return prev

        const next = {
          ...prev,
          [sessionId]: [...currentTaskIds, taskId],
        }

        saveFormActiveMap(userId, next)
        return next
      })
    },
    [userId],
  )

  const deactivateFormActivity = React.useCallback(
    (taskId: string) => {
      const sessionId = sessionIdRef.current
      if (!userId || !sessionId || !taskId) return

      setFormActiveMap((prev) => {
        const currentTaskIds = normalizeTaskIds(prev[sessionId])
        if (!currentTaskIds.includes(taskId)) return prev

        const nextTaskIds = currentTaskIds.filter((currentTaskId) => currentTaskId !== taskId)
        const next = { ...prev }

        if (nextTaskIds.length > 0) next[sessionId] = nextTaskIds
        else delete next[sessionId]

        saveFormActiveMap(userId, next)
        return next
      })
    },
    [userId],
  )

  return {
    isActive,
    activate,
    deactivate,
    toggle,
    cleanup,
    activeSet,
    activateWhileFormOpen,
    deactivateFormActivity,
    syncTaskScopes,
  }
}
