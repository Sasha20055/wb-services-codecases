export class ConcurrencyLimitError extends Error {
  constructor(public readonly reason: "timeout" | "overloaded") {
    super(`concurrency_limit_${reason}`)
    this.name = "ConcurrencyLimitError"
  }
}

type Waiter = {
  resolve: () => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout> | null
}

export type Semaphore = {
  run: <T>(fn: () => Promise<T>) => Promise<T>
  stats: () => { active: number; queued: number; limit: number }
}

export function createSemaphore(
  maxConcurrent: number,
  opts: { acquireTimeoutMs?: number; maxQueue?: number } = {},
): Semaphore {
  const limit = Math.max(1, Math.trunc(maxConcurrent))
  let active = 0
  const queue: Waiter[] = []

  const admitNext = () => {
    if (active >= limit) return
    const next = queue.shift()
    if (!next) return
    if (next.timer) clearTimeout(next.timer)
    active++
    next.resolve()
  }

  const acquire = async (): Promise<void> => {

    if (active < limit) {
      active++
      return
    }
    if (opts.maxQueue != null && queue.length >= opts.maxQueue) {

      throw new ConcurrencyLimitError("overloaded")
    }
    await new Promise<void>((resolve, reject) => {
      const waiter: Waiter = { resolve, reject, timer: null }
      if (opts.acquireTimeoutMs != null) {
        waiter.timer = setTimeout(() => {
          const index = queue.indexOf(waiter)
          if (index >= 0) queue.splice(index, 1)
          reject(new ConcurrencyLimitError("timeout"))
        }, opts.acquireTimeoutMs)
      }
      queue.push(waiter)
    })
  }

  const release = () => {
    active = Math.max(0, active - 1)
    admitNext()
  }

  return {
    async run<T>(fn: () => Promise<T>): Promise<T> {
      await acquire()
      try {
        return await fn()
      } finally {
        release()
      }
    },
    stats: () => ({ active, queued: queue.length, limit }),
  }
}
