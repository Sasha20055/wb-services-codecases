import * as React from "react"
import Providers from "@/src/appFSD/providers/providers"
import DashboardPage from "@/src/pagesFSD/dashboard/ui/Dashboard"
import LocalityRegionsPage from "@/src/pagesFSD/locality-regions/ui/LocalityRegions"
import OwnWarehousesPage from "@/src/pagesFSD/own-warehouses/ui/OwnWarehouses"
import SummaryInfoPage from "@/src/pagesFSD/summary-info/ui/SummaryInfo"
import type { RouteObject } from "react-router-dom"
import { Navigate, Outlet, Route, Routes } from "react-router-dom"

import { IS_ADMIN_MODE } from "@/src/shared/config/admin-mode"

import "react-datasheet-grid/dist/style.css"
import "@/src/appFSD/styles/globals.css"

import PackerTasksPage from "./pagesFSD/packer-tasks/PackerTasks"
import LocalProductsPage from "./pagesFSD/local-products/LocalProducts"
import SettingsPage from "./pagesFSD/settings/ui/Settings"

import WarehouseBindingsPage from "./pagesFSD/warehouse-bindings/ui/WarehouseBindings"

const PackerTaskFormPage = React.lazy(() =>
  import("./pagesFSD/packer-tasks/PackerTaskFormPage").then((module) => ({
    default: module.PackerTaskFormPage,
  })),
)

function FormPageFallback() {
  return <div className="p-6 text-sm text-muted">Загрузка формы...</div>
}

function withFormSuspense(element: React.ReactNode) {
  return <React.Suspense fallback={<FormPageFallback />}>{element}</React.Suspense>
}

function RootLayout() {
  return (
    <div data-app="r-supplier-analytics">
      <Outlet />
    </div>
  )
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<RootLayout />}>
        <Route path="/" element={<Navigate to="/supplier-analytics/dashboard" replace />} />
        <Route path="/supplier-analytics/dashboard" element={<DashboardPage />} />
        <Route path="/supplier-analytics/summary" element={<SummaryInfoPage />} />
        <Route path="/supplier-analytics/local-products" element={<LocalProductsPage />} />
        {                                     }
        {IS_ADMIN_MODE && (
          <>
            <Route path="/supplier-analytics/packer-tasks" element={<PackerTasksPage />} />
            <Route
              path="/supplier-analytics/packer-tasks/create"
              element={withFormSuspense(<PackerTaskFormPage />)}
            />
            <Route
              path="/supplier-analytics/packer-tasks/:id"
              element={withFormSuspense(<PackerTaskFormPage />)}
            />
          </>
        )}
        <Route path="/supplier-analytics/own-warehouses" element={<OwnWarehousesPage />} />
        {                                             }
        {IS_ADMIN_MODE && (
          <Route path="/supplier-analytics/locality-regions" element={<LocalityRegionsPage />} />
        )}
        {                                                                                               }
        {IS_ADMIN_MODE && (
          <Route path="/supplier-analytics/warehouse-bindings" element={<WarehouseBindingsPage />} />
        )}
        <Route path="/supplier-analytics/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  )
}

function RemoteProvidersLayout() {
  return (
    <Providers>
      <div data-app="r-supplier-analytics">
        <Outlet />
      </div>
    </Providers>
  )
}

export function getRoutes(): RouteObject[] {
  return [
    {
      element: <RemoteProvidersLayout />,
      children: [
        { path: "supplier-analytics/dashboard", element: <DashboardPage /> },
        { path: "supplier-analytics/summary", element: <SummaryInfoPage /> },
        { path: "supplier-analytics/local-products", element: <LocalProductsPage /> },

        ...(IS_ADMIN_MODE
          ? [
              { path: "supplier-analytics/packer-tasks", element: <PackerTasksPage /> },
              {
                path: "supplier-analytics/packer-tasks/create",
                element: withFormSuspense(<PackerTaskFormPage />),
              },
              {
                path: "supplier-analytics/packer-tasks/:id",
                element: withFormSuspense(<PackerTaskFormPage />),
              },
            ]
          : []),
        { path: "supplier-analytics/own-warehouses", element: <OwnWarehousesPage /> },

        ...(IS_ADMIN_MODE
          ? [{ path: "supplier-analytics/locality-regions", element: <LocalityRegionsPage /> }]
          : []),

        ...(IS_ADMIN_MODE
          ? [{ path: "supplier-analytics/warehouse-bindings", element: <WarehouseBindingsPage /> }]
          : []),
        { path: "supplier-analytics/settings", element: <SettingsPage /> },
        { path: "*", element: <Navigate to="supplier-analytics/dashboard" replace /> },
      ],
    },
  ]
}
