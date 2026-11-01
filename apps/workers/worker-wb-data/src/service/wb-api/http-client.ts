import axios, { type AxiosInstance, type AxiosError } from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";
import https from "https";
import http from "http";

const PROXY_URL = process.env.PROXY_URL;

const DEFAULT_MIN_INTERVAL_MS = Number.parseInt(
  process.env.WB_MIN_REQUEST_INTERVAL_MS ?? "300",
  10
);
const STATISTICS_MIN_INTERVAL_MS = Number.parseInt(
  process.env.WB_STATISTICS_MIN_INTERVAL_MS ?? "1000",
  10
);
const STATISTICS_PAGINATED_MIN_INTERVAL_MS = Number.parseInt(
  process.env.WB_STATISTICS_PAGINATED_MIN_INTERVAL_MS ?? "60000",
  10
);
const ANALYTICS_STOCKS_REPORT_MIN_INTERVAL_MS = Number.parseInt(
  process.env.WB_ANALYTICS_STOCKS_REPORT_MIN_INTERVAL_MS ?? "20000",
  10
)
const COMMON_BOX_TARIFFS_MIN_INTERVAL_MS = Number.parseInt(
  process.env.WB_COMMON_BOX_TARIFFS_MIN_INTERVAL_MS ?? "1000",
  10,
)
const COMMON_PALLET_TARIFFS_MIN_INTERVAL_MS = Number.parseInt(
  process.env.WB_COMMON_PALLET_TARIFFS_MIN_INTERVAL_MS ?? "1000",
  10,
)
const COMMON_ACCEPTANCE_COEFFICIENTS_MIN_INTERVAL_MS = Number.parseInt(
  process.env.WB_COMMON_ACCEPTANCE_COEFFICIENTS_MIN_INTERVAL_MS ?? "10000",
  10,
)
const SUPPLIES_ACCEPTANCE_OPTIONS_MIN_INTERVAL_MS = Number.parseInt(
  process.env.WB_SUPPLIES_ACCEPTANCE_OPTIONS_MIN_INTERVAL_MS ?? "10000",
  10,
)
const PRICES_MIN_INTERVAL_MS = Number.parseInt(
  process.env.WB_PRICES_MIN_INTERVAL_MS ?? "700",
  10
);
const REQUEST_DEADLINE_MS = Number.parseInt(
  process.env.WB_REQUEST_DEADLINE_MS ?? "600000",
  10
);
const DEFAULT_429_RETRY_DELAY_MS = 90_000;

const RETRY_CODES = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 3;

export class WbAuthError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`[wb-api] ❌ Ошибка авторизации (${status}), токен невалиден или истёк`);
    this.name = "WbAuthError";
    this.status = status;
  }
}

export function isWbAuthError(err: unknown): err is WbAuthError {
  return err instanceof WbAuthError;
}

interface RetryOptions {}

const requestQueueByKey = new Map<string, Promise<void>>();
const nextAllowedAtByKey = new Map<string, number>();

const httpsAgent = new https.Agent({ keepAlive: true });
const httpAgent = new http.Agent({ keepAlive: true });

let proxyAgent: HttpsProxyAgent<string> | null = null;
if (PROXY_URL) {
  proxyAgent = new HttpsProxyAgent(PROXY_URL);

}

function createBaseClient(baseURL: string, token: string): AxiosInstance {
  const config: Record<string, unknown> = {
    baseURL: `https://${baseURL}`,
    timeout: 30_000,
    headers: {
      Authorization: token,
      "Content-Type": "application/json",
    },

    httpsAgent: proxyAgent || httpsAgent,
    httpAgent: proxyAgent || httpAgent,
    proxy: false,
  };

  return axios.create(config as any);
}

export async function wbGet<T>(
  baseURL: string,
  path: string,
  token: string,
  params?: Record<string, unknown>,
  signal?: AbortSignal,
  retryOptions?: RetryOptions,
  headers?: Record<string, string>
): Promise<T> {
  return scheduleRequest(baseURL, path, token, async () => {
    const client = createBaseClient(baseURL, token);
    return retryRequest(
      (timeoutMs) => client.get<T>(path, { params, timeout: timeoutMs, signal, headers }),
      signal,
      retryOptions
    );
  }, signal);
}

export async function wbGetPublic<T>(
  baseURL: string,
  path: string,
  params?: Record<string, unknown>,
  signal?: AbortSignal,
  retryOptions?: RetryOptions,
  headers?: Record<string, string>,
  queueToken = "public"
): Promise<T> {
  return scheduleRequest(baseURL, path, queueToken, async () => {
    const client = axios.create({
      baseURL: `https://${baseURL}`,
      timeout: 30_000,
      headers: {
        "Content-Type": "application/json",
      },
      httpsAgent: proxyAgent || httpsAgent,
      httpAgent: proxyAgent || httpAgent,
      proxy: false,
    });

    return retryRequest(
      (timeoutMs) => client.get<T>(path, { params, timeout: timeoutMs, signal, headers }),
      signal,
      retryOptions
    );
  }, signal);
}

export async function wbPost<T>(
  baseURL: string,
  path: string,
  token: string,
  body?: unknown,
  signal?: AbortSignal
): Promise<T> {
  return scheduleRequest(baseURL, path, token, async () => {
    const client = createBaseClient(baseURL, token);
    return retryRequest(
      (timeoutMs) => client.post<T>(path, body, { timeout: timeoutMs, signal }),
      signal
    );
  }, signal);
}

export async function wbGetRaw(
  url: string,
  signal?: AbortSignal,
  headers?: Record<string, string>
): Promise<string> {
  const client = axios.create({
    timeout: 30_000,
    headers: {
      "Content-Type": "application/json",
      ...(headers ?? {}),
    },
    httpsAgent: proxyAgent || httpsAgent,
    httpAgent: proxyAgent || httpAgent,
    proxy: false,
  });

  return retryRequest(
    (timeoutMs) => client.get<string>(url, { timeout: timeoutMs, signal, responseType: "text" }),
    signal
  );
}

export async function wbGetBytes(
  url: string,
  signal?: AbortSignal,
  headers?: Record<string, string>
): Promise<Uint8Array> {
  const client = axios.create({
    timeout: 30_000,
    headers: {
      "Content-Type": "application/json",
      ...(headers ?? {}),
    },
    httpsAgent: proxyAgent || httpsAgent,
    httpAgent: proxyAgent || httpAgent,
    proxy: false,
  });

  return retryRequest(
    async (timeoutMs) => {
      const response = await client.get<ArrayBuffer>(url, {
        timeout: timeoutMs,
        signal,
        responseType: "arraybuffer",
      });
      return {
        data: new Uint8Array(response.data),
        status: response.status,
      };
    },
    signal
  );
}

async function scheduleRequest<T>(
  baseURL: string,
  path: string,
  token: string,
  fn: () => Promise<T>,
  signal?: AbortSignal
): Promise<T> {
  const schedule = getScheduleConfig(baseURL, path, token);
  const queueKey = schedule.queueKey;
  const minIntervalMs = schedule.minIntervalMs;

  const prev = requestQueueByKey.get(queueKey) ?? Promise.resolve();
  let releaseCurrent: (() => void) | undefined;
  const current = new Promise<void>((resolve) => {
    releaseCurrent = resolve;
  });

  requestQueueByKey.set(queueKey, current);

  await prev.catch(() => undefined);

  try {
    if (signal?.aborted) {
      throw abortError();
    }

    const waitMs = Math.max(
      0,
      (nextAllowedAtByKey.get(queueKey) ?? 0) - Date.now()
    );

    if (waitMs > 0) {
      await sleep(waitMs, signal);
    }

    if (signal?.aborted) {
      throw abortError();
    }

    try {
      return await fn();
    } finally {
      nextAllowedAtByKey.set(queueKey, Date.now() + minIntervalMs);
    }
  } finally {
    releaseCurrent?.();
    if (requestQueueByKey.get(queueKey) === current) {
      requestQueueByKey.delete(queueKey);
    }
  }
}

function getScheduleConfig(baseURL: string, path: string, token: string) {
  if (isRateLimitedStatisticsPath(baseURL, path)) {
    return {
      queueKey: `${baseURL}:${token}:${path}`,
      minIntervalMs: Number.isFinite(STATISTICS_PAGINATED_MIN_INTERVAL_MS)
        ? Math.max(0, STATISTICS_PAGINATED_MIN_INTERVAL_MS)
        : 60_000,
    };
  }

  if (isRateLimitedAnalyticsStocksPath(baseURL, path)) {
    return {
      queueKey: `${baseURL}:${token}:${path}`,
      minIntervalMs: Number.isFinite(ANALYTICS_STOCKS_REPORT_MIN_INTERVAL_MS)
        ? Math.max(0, ANALYTICS_STOCKS_REPORT_MIN_INTERVAL_MS)
        : 20_000,
    }
  }

  if (isRateLimitedCommonBoxTariffsPath(baseURL, path)) {
    return {
      queueKey: `${baseURL}:${token}:${path}`,
      minIntervalMs: Number.isFinite(COMMON_BOX_TARIFFS_MIN_INTERVAL_MS)
        ? Math.max(0, COMMON_BOX_TARIFFS_MIN_INTERVAL_MS)
        : 1_000,
    }
  }

  if (isRateLimitedCommonAcceptanceCoefficientsPath(baseURL, path)) {
    return {
      queueKey: `${baseURL}:${token}:${path}`,
      minIntervalMs: Number.isFinite(COMMON_ACCEPTANCE_COEFFICIENTS_MIN_INTERVAL_MS)
        ? Math.max(0, COMMON_ACCEPTANCE_COEFFICIENTS_MIN_INTERVAL_MS)
        : 10_000,
    }
  }

  if (isRateLimitedCommonPalletTariffsPath(baseURL, path)) {
    return {
      queueKey: `${baseURL}:${token}:${path}`,
      minIntervalMs: Number.isFinite(COMMON_PALLET_TARIFFS_MIN_INTERVAL_MS)
        ? Math.max(0, COMMON_PALLET_TARIFFS_MIN_INTERVAL_MS)
        : 1_000,
    }
  }

  if (isRateLimitedSuppliesAcceptanceOptionsPath(baseURL, path)) {
    return {
      queueKey: `${baseURL}:${token}:${path}`,
      minIntervalMs: Number.isFinite(SUPPLIES_ACCEPTANCE_OPTIONS_MIN_INTERVAL_MS)
        ? Math.max(0, SUPPLIES_ACCEPTANCE_OPTIONS_MIN_INTERVAL_MS)
        : 10_000,
    }
  }

  return {
    queueKey: `${baseURL}:${token}`,
    minIntervalMs: getMinIntervalMs(baseURL),
  };
}

function getMinIntervalMs(baseURL: string): number {
  if (baseURL === "statistics-api.wildberries.ru") {
    return Number.isFinite(STATISTICS_MIN_INTERVAL_MS)
      ? Math.max(0, STATISTICS_MIN_INTERVAL_MS)
      : 0;
  }
  if (baseURL === "discounts-prices-api.wildberries.ru") {
    return Number.isFinite(PRICES_MIN_INTERVAL_MS)
      ? Math.max(0, PRICES_MIN_INTERVAL_MS)
      : 0;
  }

  return Number.isFinite(DEFAULT_MIN_INTERVAL_MS)
    ? Math.max(0, DEFAULT_MIN_INTERVAL_MS)
    : 0;
}

function isRateLimitedStatisticsPath(baseURL: string, path: string): boolean {
  if (baseURL !== "statistics-api.wildberries.ru") {
    return false;
  }

  return path === "/api/v1/supplier/sales"
    || path === "/api/v1/supplier/orders"
    || path === "/api/v1/supplier/stocks";
}

function isRateLimitedAnalyticsStocksPath(baseURL: string, path: string): boolean {
  if (baseURL !== "seller-analytics-api.wildberries.ru") {
    return false
  }

  return path === "/api/analytics/v1/stocks-report/wb-warehouses"
}

function isRateLimitedCommonBoxTariffsPath(baseURL: string, path: string): boolean {
  if (baseURL !== "common-api.wildberries.ru") {
    return false
  }

  return path === "/api/v1/tariffs/box"
}

function isRateLimitedCommonPalletTariffsPath(baseURL: string, path: string): boolean {
  if (baseURL !== "common-api.wildberries.ru") {
    return false
  }

  return path === "/api/v1/tariffs/pallet"
}

function isRateLimitedCommonAcceptanceCoefficientsPath(baseURL: string, path: string): boolean {
  if (baseURL !== "common-api.wildberries.ru") {
    return false
  }

  return path === "/api/tariffs/v1/acceptance/coefficients"
}

function isRateLimitedSuppliesAcceptanceOptionsPath(baseURL: string, path: string): boolean {
  if (baseURL !== "supplies-api.wildberries.ru") {
    return false
  }

  return path === "/api/v1/acceptance/options"
}

async function retryRequest<T>(
  fn: (timeoutMs: number) => Promise<{ data: T; status: number }>,
  signal?: AbortSignal,
  retryOptions?: RetryOptions
): Promise<T> {
  let lastError: Error | null = null;
  const startedAt = Date.now();
  const deadlineMs = Number.isFinite(REQUEST_DEADLINE_MS)
    ? Math.max(1, REQUEST_DEADLINE_MS)
    : 120_000;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (signal?.aborted) {
      throw abortError();
    }
    const elapsed = Date.now() - startedAt;
    const remaining = deadlineMs - elapsed;
    if (remaining <= 0) {
      throw new Error(`[wb-api] ⏱️ Превышен дедлайн запроса (${deadlineMs}ms)`);
    }

    try {
      const perAttemptTimeoutMs = Math.max(1, Math.min(30_000, remaining));
      const res = await fn(perAttemptTimeoutMs);
      return res.data;
    } catch (err) {
      const axiosErr = err as AxiosError;
      const status = axiosErr.response?.status;

      if (status === 401 || status === 403) {
        throw new WbAuthError(status);
      }

      if (status && RETRY_CODES.has(status)) {
        lastError = axiosErr;
        const delay = status === 429
          ? getRetryAfterDelayMs(axiosErr)
          : Math.min(1000 * 2 ** attempt, 30_000) + Math.random() * 500;
        const elapsedAfterError = Date.now() - startedAt;
        const remainingAfterError = deadlineMs - elapsedAfterError;
        if (remainingAfterError <= 0) {
          throw new Error(`[wb-api] ⏱️ Превышен дедлайн запроса (${deadlineMs}ms)`);
        }

        const boundedDelay = Math.min(delay, remainingAfterError);
        if (boundedDelay <= 0) {
          throw new Error(`[wb-api] ⏱️ Превышен дедлайн запроса (${deadlineMs}ms)`);
        }
        console.warn(
          `[wb-api] ⚠️ Ошибка ${status}, повтор ${attempt + 1}/${MAX_RETRIES} через ${Math.round(boundedDelay / 1000)}с`
        );
        await sleep(boundedDelay, signal);
        continue;
      }

      throw axiosErr;
    }
  }
  throw lastError ?? new Error("[wb-api] ❌ Все попытки исчерпаны, запрос не удался");
}

function getRetryAfterDelayMs(error: AxiosError): number {
  const headers = error.response?.headers;
  const retryAfterRaw =
    headers?.["x-ratelimit-retry"] ??
    headers?.["X-Ratelimit-Retry"] ??
    headers?.["retry-after"] ??
    headers?.["Retry-After"];

  const retryAfterValue = Array.isArray(retryAfterRaw) ? retryAfterRaw[0] : retryAfterRaw;
  const retryAfterSeconds = Number.parseFloat(String(retryAfterValue ?? ""));
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
    return Math.max(0, retryAfterSeconds * 1000);
  }

  return DEFAULT_429_RETRY_DELAY_MS;
}

function sleep(ms: number, signal?: AbortSignal) {
  if (!signal) return new Promise((r) => setTimeout(r, ms));
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(abortError());
    const t = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve(null);
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      signal.removeEventListener("abort", onAbort);
      reject(abortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function abortError() {
  const err = new Error("[wb-api] ⏱️ Запрос прерван (abort)");
  (err as any).name = "AbortError";
  return err;
}
