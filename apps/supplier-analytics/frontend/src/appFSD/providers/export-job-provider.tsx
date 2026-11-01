"use client"
import * as React from "react"
import { projectApi, projectApiFile } from "@/src/shared/api"

export type ExportJobStatus = "pending" | "running" | "completed" | "failed" | "canceled"

export type ExportJobDocumentView = {
  index: number
  supplierId: string | null
  cabinetName: string
  fileName: string
  rowCount: number

  downloaded?: boolean
}

export type ExportJobMissing = {
  nmId: number
  techSize: string | null
  productName: string
  supplierArticle: string
  reason: string
}

export type ExportJobView = {
  id: string
  status: ExportJobStatus
  totalProducts: number
  processedProducts: number
  qtyField?: string
  documents: ExportJobDocumentView[]
  missing: ExportJobMissing[]
  error: string | null

  createdAt?: string | null
  finishedAt?: string | null
  expiresAt?: string | null
}

const STORAGE_KEY = "supplier-analytics-export-job-id"
const POLL_MS = 1800

const isActiveStatus = (status: ExportJobStatus) => status === "pending" || status === "running"

type LocalToast = { kind: "success" | "error" | "info"; text: string }

type ExportJobContextValue = {
  job: ExportJobView | null
  startExportJob: (job: ExportJobView) => void
  refresh: () => Promise<void>

  openHistory: () => void
}

const ExportJobContext = React.createContext<ExportJobContextValue | null>(null)

export function useExportJob() {
  const ctx = React.useContext(ExportJobContext)
  if (!ctx) throw new Error("useExportJob must be used within ExportJobProvider")
  return ctx
}

function triggerBlobDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function ExportJobProvider({ children }: { children: React.ReactNode }) {
  const [job, setJob] = React.useState<ExportJobView | null>(null)
  const [toast, setToast] = React.useState<LocalToast | null>(null)
  const [historyOpen, setHistoryOpen] = React.useState(false)
  const pollRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevStatusRef = React.useRef<ExportJobStatus | null>(null)

  const clearPoll = React.useCallback(() => {
    if (pollRef.current) {
      clearTimeout(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const applyJob = React.useCallback((next: ExportJobView) => {
    const prev = prevStatusRef.current
    prevStatusRef.current = next.status
    setJob(next)
    if (isActiveStatus(next.status)) {
      try { localStorage.setItem(STORAGE_KEY, next.id) } catch {}
    } else {
      try { localStorage.removeItem(STORAGE_KEY) } catch {}
    }

    if (prev && isActiveStatus(prev) && !isActiveStatus(next.status)) {
      if (next.status === "completed") {

        const hasUnresolvedBundles = next.missing.some((m) => m.reason === "bundle_unresolved")
        setToast(
          next.missing.length > 0
            ? {
                kind: "info",
                text: hasUnresolvedBundles
                  ? `Документ готов. Пропущено ${next.missing.length} товаров (наборы без состава / без баркода)`
                  : `Документ готов. Пропущено ${next.missing.length} товаров без баркода`,
              }
            : { kind: "success", text: "Документ поставки готов — можно скачать" },
        )
      } else if (next.status === "canceled") {
        setToast({ kind: "info", text: "Экспорт отменён" })
      } else if (next.status === "failed") {
        setToast({ kind: "error", text: "Не удалось сформировать экспорт" })
      }
    }
  }, [])

  const poll = React.useCallback(
    async (id: string) => {
      try {
        const next = await projectApi<ExportJobView>(`/supply-plan/export/jobs/${id}`)
        applyJob(next)
        if (isActiveStatus(next.status)) {
          pollRef.current = setTimeout(() => poll(id), POLL_MS)
        }
      } catch {

        pollRef.current = setTimeout(() => poll(id), POLL_MS * 2)
      }
    },
    [applyJob],
  )

  const startExportJob = React.useCallback(
    (next: ExportJobView) => {
      clearPoll()
      applyJob(next)
      if (isActiveStatus(next.status)) {
        pollRef.current = setTimeout(() => poll(next.id), POLL_MS)
      }
    },
    [applyJob, clearPoll, poll],
  )

  const refresh = React.useCallback(async () => {
    try {
      const res = await projectApi<{ data: ExportJobView[] }>("/supply-plan/export/jobs")
      const jobs = res.data ?? []
      const active = jobs.find((item) => isActiveStatus(item.status))
      let storedId: string | null = null
      try { storedId = localStorage.getItem(STORAGE_KEY) } catch {}
      const stored = storedId ? jobs.find((item) => item.id === storedId) : undefined
      const current = active ?? stored ?? null
      if (current) {
        clearPoll()
        prevStatusRef.current = current.status
        setJob(current)
        if (isActiveStatus(current.status)) {
          try { localStorage.setItem(STORAGE_KEY, current.id) } catch {}
          pollRef.current = setTimeout(() => poll(current.id), POLL_MS)
        }
      }
    } catch {

    }
  }, [clearPoll, poll])

  React.useEffect(() => {
    void refresh()
    return () => clearPoll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const dismiss = React.useCallback(() => {
    clearPoll()
    setJob(null)
    prevStatusRef.current = null
    try { localStorage.removeItem(STORAGE_KEY) } catch {}
  }, [clearPoll])

  const cancel = React.useCallback(async () => {
    if (!job) return
    try {
      await projectApi(`/supply-plan/export/jobs/${job.id}/cancel`, { method: "POST" })
    } catch {

    }
  }, [job])

  const consumeDoc = React.useCallback((docIndex: number) => {
    setJob((prev) => {
      if (!prev) return prev
      const documents = prev.documents.map((d) =>
        d.index === docIndex ? { ...d, downloaded: true } : d,
      )
      if (documents.every((d) => d.downloaded)) {
        prevStatusRef.current = null
        try { localStorage.removeItem(STORAGE_KEY) } catch {}
        return null
      }
      return { ...prev, documents }
    })
  }, [])

  const downloadOne = React.useCallback(
    async (docIndex: number) => {
      if (!job) return
      const { blob, fileName } = await projectApiFile(
        `/supply-plan/export/jobs/${job.id}/download?docIndex=${docIndex}`,
      )
      triggerBlobDownload(blob, fileName)
      consumeDoc(docIndex)
    },
    [job, consumeDoc],
  )

  const downloadAll = React.useCallback(async () => {
    if (!job) return

    for (const doc of job.documents.filter((d) => !d.downloaded)) {
      // eslint-disable-next-line no-await-in-loop
      const { blob, fileName } = await projectApiFile(
        `/supply-plan/export/jobs/${job.id}/download?docIndex=${doc.index}`,
      )
      triggerBlobDownload(blob, fileName)
      consumeDoc(doc.index)
    }
  }, [job, consumeDoc])

  const openHistory = React.useCallback(() => setHistoryOpen(true), [])

  const value = React.useMemo<ExportJobContextValue>(
    () => ({ job, startExportJob, refresh, openHistory }),
    [job, startExportJob, refresh, openHistory],
  )

  return (
    <ExportJobContext.Provider value={value}>
      {children}
      {job ? (
        <ExportProgressBanner
          job={job}
          onCancel={cancel}
          onDismiss={dismiss}
          onDownloadOne={downloadOne}
          onDownloadAll={downloadAll}
        />
      ) : null}
      {historyOpen ? <ExportHistoryModal onClose={() => setHistoryOpen(false)} /> : null}
      {toast ? <ExportToast toast={toast} onClose={() => setToast(null)} /> : null}
    </ExportJobContext.Provider>
  )
}

const QTY_FIELD_LABELS: Record<string, string> = {
  qtyToBuy: "К закупке",
  qtyToBuyTrend: "К закупке (Тренд)",
  qtyToSendFinal2: "Поставка",
  qtyToSendOwnStock2: "Поставка (собств. остаток)",
  qtyToSendTrend: "Поставка (Тренд)",
  qtyToSendTrendOwnStock: "Поставка (Тренд, собств. остаток)",
}

function formatHistoryDate(iso: string | null | undefined): string {
  if (!iso) return ""
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
}

function formatExpiresIn(iso: string | null | undefined): string | null {
  if (!iso) return null
  const ms = new Date(iso).getTime() - Date.now()
  if (!Number.isFinite(ms)) return null
  if (ms <= 0) return "истекает"
  const hours = Math.floor(ms / 3_600_000)
  if (hours < 1) return "исчезнет менее чем через час"
  return `исчезнет через ~${hours} ч`
}

function ExportHistoryModal({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [jobs, setJobs] = React.useState<ExportJobView[]>([])
  const [downloadingKey, setDownloadingKey] = React.useState<string | null>(null)
  const [downloadError, setDownloadError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const res = await projectApi<{ data: ExportJobView[] }>("/supply-plan/export/jobs")
        if (!alive) return

        setJobs((res.data ?? []).filter((j) => j.status === "completed" && j.documents.length > 0))
        setError(null)
      } catch {
        if (alive) setError("Не удалось загрузить историю экспортов.")
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const download = React.useCallback(async (jobId: string, docIndex: number) => {
    const key = `${jobId}:${docIndex}`
    setDownloadingKey(key)
    setDownloadError(null)
    try {
      const { blob, fileName } = await projectApiFile(
        `/supply-plan/export/jobs/${jobId}/download?docIndex=${docIndex}`,
      )
      triggerBlobDownload(blob, fileName)
    } catch {
      setDownloadError("Файл уже недоступен — история хранится 24 часа.")
    } finally {
      setDownloadingKey(null)
    }
  }, [])

  return (
    <div className="fixed inset-0 z-[350] flex items-center justify-center px-3">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-lg rounded-xl2 border border-border bg-panel p-4 shadow-glow">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-text">История экспортов</div>
          <button type="button" onClick={onClose} className="text-muted hover:text-text">
            ✕
          </button>
        </div>

        <div className="mt-3 max-h-[60vh] space-y-2 overflow-y-auto pr-1">
          {loading ? (
            <div className="py-6 text-center text-xs text-muted">Загружаем…</div>
          ) : error ? (
            <div className="py-6 text-center text-xs text-rose-600">{error}</div>
          ) : jobs.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted">
              История пуста — здесь появятся готовые документы экспорта.
            </div>
          ) : (
            jobs.map((item) => {
              const expires = formatExpiresIn(item.expiresAt)
              return (
                <div key={item.id} className="rounded-lg border border-border bg-surface/40 px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="font-medium text-text">
                      {QTY_FIELD_LABELS[item.qtyField ?? ""] ?? "Экспорт"}
                      <span className="ml-2 font-normal text-muted">{formatHistoryDate(item.finishedAt ?? item.createdAt)}</span>
                    </div>
                    {expires ? <div className="text-muted">{expires}</div> : null}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {item.documents.map((doc) => {
                      const key = `${item.id}:${doc.index}`
                      return (
                        <button
                          key={key}
                          type="button"
                          disabled={downloadingKey !== null}
                          onClick={() => void download(item.id, doc.index)}
                          className="rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-60"
                          title={doc.fileName}
                        >
                          {downloadingKey === key ? "Скачиваем…" : "Скачать"}
                          {doc.cabinetName ? `: ${doc.cabinetName}` : ""} ({doc.rowCount})
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {downloadError ? <div className="mt-2 text-xs text-rose-600">{downloadError}</div> : null}
      </div>
    </div>
  )
}

function ExportProgressBanner({
  job,
  onCancel,
  onDismiss,
  onDownloadOne,
  onDownloadAll,
}: {
  job: ExportJobView
  onCancel: () => void
  onDismiss: () => void
  onDownloadOne: (docIndex: number) => Promise<void>
  onDownloadAll: () => Promise<void>
}) {
  const active = isActiveStatus(job.status)
  const total = job.totalProducts || 0
  const processed = Math.min(job.processedProducts || 0, total || job.processedProducts || 0)
  const percent = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : active ? 0 : 100

  const pendingDocs = job.documents.filter((d) => !d.downloaded)

  const missingBundles = job.missing.filter((m) => m.reason === "bundle_unresolved").length
  const missingBarcodes = job.missing.length - missingBundles

  return (
    <div className="fixed inset-x-0 bottom-0 z-[300] flex justify-center px-3 pb-3 pointer-events-none">
      <div className="pointer-events-auto w-full max-w-3xl rounded-xl2 border border-border bg-panel shadow-glow px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-text">
            {active
              ? "Формируется документ поставки…"
              : job.status === "completed"
                ? "Документ поставки готов"
                : job.status === "canceled"
                  ? "Экспорт отменён"
                  : "Экспорт не завершён"}
          </div>
          <div className="flex items-center gap-2">
            {active ? (
              <button
                type="button"
                onClick={onCancel}
                className="rounded-lg border border-border px-2.5 py-1 text-xs text-muted hover:text-text hover:bg-surface"
              >
                Отменить
              </button>
            ) : (
              <button
                type="button"
                onClick={onDismiss}
                className="rounded-lg border border-border px-2.5 py-1 text-xs text-muted hover:text-text hover:bg-surface"
              >
                Скрыть
              </button>
            )}
          </div>
        </div>

        {active ? (
          <div className="mt-2">
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-300"
                style={{ width: `${percent}%` }}
              />
            </div>
            <div className="mt-1 text-xs text-muted">
              Подготовлено {processed}
              {total > 0 ? ` из ${total}` : ""} товаров{total > 0 ? ` (${percent}%)` : ""}
            </div>
          </div>
        ) : null}

        {job.status === "completed" ? (
          <div className="mt-2 space-y-2">
            {job.missing.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2 text-xs text-amber-600">
                <span>
                  {missingBundles > 0
                    ? `Пропущено ${job.missing.length} товаров: ${missingBundles} наборов с ` +
                      `неопределённым составом${missingBarcodes > 0 ? `, ${missingBarcodes} без баркода` : ""}.`
                    : `Пропущено ${job.missing.length} товаров — не привязан баркод.`}
                </span>
                {missingBarcodes > 0 ? (
                  <a
                    href="/supplier-analytics/local-products?noBarcode=1"
                    className="rounded-lg border border-border px-2.5 py-0.5 text-amber-700 hover:bg-surface"
                  >
                    Привязать баркоды
                  </a>
                ) : null}
              </div>
            ) : null}
            {pendingDocs.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                {pendingDocs.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => void onDownloadAll()}
                    className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                  >
                    Скачать все файлы ({pendingDocs.length})
                  </button>
                ) : null}
                {pendingDocs.map((doc) => (
                  <button
                    key={doc.index}
                    type="button"
                    onClick={() => void onDownloadOne(doc.index)}
                    className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/20"
                  >
                    Скачать{doc.cabinetName ? `: ${doc.cabinetName}` : ""} ({doc.rowCount})
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-xs text-muted">
                {job.missing.length > 0
                  ? missingBundles > 0
                    ? "Все подходящие товары пропущены (наборы без состава или без баркода)."
                    : "Все подходящие товары пропущены — у них не привязан баркод."
                  : "Нет товаров к отправке: по выбранным фильтрам/складам количество «Отправить» равно 0."}
              </div>
            )}
          </div>
        ) : null}

        {job.status === "failed" ? (
          <div className="mt-2 text-xs text-rose-600">
            {job.error === "too_many_restarts"
              ? "Экспорт несколько раз прерывался перезапуском сервера — запустите заново."
              : job.error === "interrupted_by_restart"
                ? "Экспорт прерван перезапуском сервера — запустите заново."
                : "Не удалось сформировать экспорт — попробуйте ещё раз."}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function ExportToast({ toast, onClose }: { toast: LocalToast; onClose: () => void }) {
  React.useEffect(() => {
    const timer = setTimeout(onClose, 6000)
    return () => clearTimeout(timer)
  }, [onClose])

  const tone =
    toast.kind === "success"
      ? "border-emerald-300 bg-emerald-50 text-emerald-800"
      : toast.kind === "error"
        ? "border-rose-300 bg-rose-50 text-rose-800"
        : "border-border bg-panel text-text"

  return (
    <div className="fixed right-3 top-3 z-[400] pointer-events-auto">
      <div className={`flex items-center gap-3 rounded-xl2 border px-4 py-2 text-sm shadow-glow ${tone}`}>
        <span>{toast.text}</span>
        <button type="button" onClick={onClose} className="text-current/70 hover:text-current">
          ✕
        </button>
      </div>
    </div>
  )
}
