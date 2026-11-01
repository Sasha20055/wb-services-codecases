import * as mainApi from "./main-api"
import { notifyTokenStatus, type TokenStatusReason } from "./analytics-api"
import { isWbAuthError } from "./wb-api/http-client"

const invalidatedTokenIds = new Set<string>()

interface SupplierLike {
  _id: string
  sid?: string
  tokens: { _id: string; value: string; expressionTime?: string }[]
}

function isExpired(expressionTime?: string): boolean {
  if (!expressionTime) return false
  const ts = new Date(expressionTime).getTime()
  if (!Number.isFinite(ts)) return false
  return ts <= Date.now()
}

export async function invalidateToken(
  supplier: SupplierLike,
  tokenId: string,
  reason: TokenStatusReason,
): Promise<void> {
  if (!tokenId) return
  if (invalidatedTokenIds.has(tokenId)) return
  invalidatedTokenIds.add(tokenId)

  const supplierRef = mainApi.getSupplierRef({ _id: supplier._id, sid: supplier.sid ?? "" })

  const supplierIds = Array.from(
    new Set([supplierRef, supplier._id, supplier.sid].filter(Boolean) as string[]),
  )

  try {
    await mainApi.deleteSupplierToken(supplierRef, tokenId)
    console.log(`[токены] 🗑 Удалён невалидный токен ${tokenId} кабинета ${supplierRef} (${reason})`)
    await notifyTokenStatus(supplierIds, reason)
  } catch (err: any) {

    invalidatedTokenIds.delete(tokenId)
    console.error(`[токены] ❌ Не удалось удалить токен ${tokenId}: ${err?.message ?? err}`)
  }
}

export async function checkExpiredTokens(suppliers: SupplierLike[]): Promise<void> {
  const tasks: Promise<void>[] = []
  for (const supplier of suppliers) {
    for (const token of supplier.tokens ?? []) {
      if (isExpired(token.expressionTime)) {
        tasks.push(invalidateToken(supplier, token._id, "expired"))
      }
    }
  }
  if (tasks.length > 0) {
    await Promise.allSettled(tasks)
  }
}

export async function handleSyncAuthError(
  err: unknown,
  supplier: SupplierLike,
  tokenId: string,
): Promise<boolean> {
  if (!isWbAuthError(err)) return false
  await invalidateToken(supplier, tokenId, "unauthorized")
  return true
}
