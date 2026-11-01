import { describe, expect, test } from "bun:test"
import { calculateEma } from "../apps/supplier-analytics/frontend/src/entities/nm-summary/lib/forecast-trend"
import { computeQtyToBuy } from "../apps/supplier-analytics/frontend/src/entities/nm-summary/lib/qty-to-buy"
import { buildWarehouseRows } from "../apps/supplier-analytics/frontend/src/pagesFSD/dashboard/lib/forecast"
import { computeQtyToBuy as backendQtyToBuy } from "../apps/supplier-analytics/backend/src/lib/supply-plan/qty-to-buy"

describe("Публичные заглушки расчётов", () => {
  for (const calculate of [calculateEma, computeQtyToBuy, buildWarehouseRows, backendQtyToBuy]) {
    test(`${calculate.name} не раскрывает расчёт`, () => {
      expect(() => calculate()).toThrow("Расчёт недоступен в публичном примере")
    })
  }
})
