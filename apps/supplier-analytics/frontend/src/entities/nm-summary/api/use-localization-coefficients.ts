import { useQuery } from "@tanstack/react-query"
import { projectApi } from "@/src/shared/api"

export type LocalizationCoefficientRow = {
  minPercent: number
  maxPercent: number
  ktr: number
  krp: number
  sortOrder?: number
}

export type LocalizationCoefficientValue = {
  ktr: number | null
  krp: number | null
}

type LocalizationCoefficientsResponse = {
  data: LocalizationCoefficientRow[]
}

export function resolveLocalizationCoefficientValue(
  percent: number | null | undefined,
  rows: Array<Pick<LocalizationCoefficientRow, "minPercent" | "maxPercent" | "ktr" | "krp">>,
): LocalizationCoefficientValue {
  throw new Error("Расчёт недоступен в публичном примере")
}

export function useLocalizationCoefficients() {
  return useQuery({
    queryKey: ["localization-coefficients"],
    queryFn: async () => {
      const response = await projectApi<LocalizationCoefficientsResponse>("/localization-coefficients")
      return response.data ?? []
    },
    staleTime: 5 * 60_000,
  })
}
