import { IS_ADMIN_MODE } from "@/src/shared/config/admin-mode"

export type RemoteNavItem =
  | { type: "link"; label: string; to: string }
  | { type: "group"; label: string; children: RemoteNavItem[] }

export const navItems: RemoteNavItem[] = [
  {
    type: "group",
    label: "Аналитика поставщиков",
    children: [
      { type: "link", label: "Планирование поставок", to: "supplier-analytics/dashboard" },
      { type: "link", label: "Сводная информация", to: "supplier-analytics/summary" },
      { type: "link", label: "Локальные товары", to: "supplier-analytics/local-products" },

      ...(IS_ADMIN_MODE
        ? [{ type: "link" as const, label: "Задания", to: "supplier-analytics/packer-tasks" }]
        : []),

      ...(IS_ADMIN_MODE
        ? [{ type: "link" as const, label: "Регионы заказов", to: "supplier-analytics/locality-regions" }]
        : []),
      { type: "link", label: "Наши склады", to: "supplier-analytics/own-warehouses" },

      ...(IS_ADMIN_MODE
        ? [{ type: "link" as const, label: "Подвязка складов (врем.)", to: "supplier-analytics/warehouse-bindings" }]
        : []),
      { type: "link", label: "Настройки", to: "supplier-analytics/settings" },
    ],
  },
]