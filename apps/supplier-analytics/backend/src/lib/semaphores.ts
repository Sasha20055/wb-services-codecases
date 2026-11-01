import { createSemaphore } from "../utils/concurrency-limit"
import { config } from "../config"

export const nmSummarySemaphore = createSemaphore(config.nmSummaryMaxConcurrency, {
  acquireTimeoutMs: 25_000,
  maxQueue: 100,
})

export const nmSummaryCompareSemaphore = createSemaphore(20, {
  acquireTimeoutMs: 25_000,
  maxQueue: 30,
})

export const exportJobLimiter = createSemaphore(20, {
  acquireTimeoutMs: 120_000,
  maxQueue: 1000,
})
