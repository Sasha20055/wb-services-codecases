import * as React from "react"
import {
  createBrowserRouter,
  isRouteErrorResponse,
  Navigate,
  RouterProvider,
  useRouteError,
  type RouteObject,
} from "react-router-dom"
import { ShellLayout } from "./ShellLayout"
import { AuthProvider } from "./auth/AuthProvider"
import {
  fetchProjects,
  importRemoteModule,
  loadProjectRoutes,
  loadRemoteEntry,
  registerUIComponents,
  type ProjectDTO,
} from "./lib/projectsLoader"
import Home from "./pages/Home"
import LoginPage from "./pages/Login"
import OrganizationsPage from "./pages/Organizations"
import SubscriptionRequiredPage from "./pages/SubscriptionRequired"

export const ProjectsContext = React.createContext<ProjectDTO[]>([])

function normalizeChildren(children: RouteObject[]): RouteObject[] {
  return children.map((r) => {
    const next: RouteObject = { ...r }
    if (typeof next.path === "string") next.path = next.path.replace(/^\//, "")
    if (Array.isArray(next.children)) next.children = normalizeChildren(next.children)
    return next
  })
}

function ErrorRedirect() {
  const err = useRouteError()
  if (isRouteErrorResponse(err) && err.status === 401) {
    return <Navigate to="/" replace />
  }
  if (err instanceof Error && err.message.includes("Failed to fetch dynamically imported module")) {
    return <Navigate to="/" replace />
  }
  return <Navigate to="/" replace />
}

async function loadAllRemoteRoutes(projects: ProjectDTO[]): Promise<RouteObject[]> {
  const routeArrays = await Promise.all(
    projects
      .filter((p) => p.type === "project" && p.frontend.basePath)
      .map(async (p) => {
        try {
          const routes = await loadProjectRoutes(p)
          return normalizeChildren(routes)
        } catch {
          return []
        }
      }),
  )
  return routeArrays.flat()
}

function BootError() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        padding: 32,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div style={{ maxWidth: 420, textAlign: "center" }}>
        <h1 style={{ fontSize: 20, margin: "0 0 12px" }}>Ошибка загрузки</h1>
        <button
          onClick={() => location.reload()}
          style={{
            padding: "8px 20px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            background: "#fff",
            cursor: "pointer",
            fontSize: 14,
          }}
        >
          Попробовать снова
        </button>
      </div>
    </div>
  )
}

export function App() {
  const [router, setRouter] = React.useState<ReturnType<typeof createBrowserRouter> | null>(null)
  const [projects, setProjects] = React.useState<ProjectDTO[]>([])
  const [error, setError] = React.useState(false)

  React.useEffect(() => {
    let active = true

      ; (async () => {

        const allProjects = await fetchProjects()
        if (!active) return

        if (allProjects.length === 0) {
          console.error("[shell] Пустой список проектов от API")
          setError(true)
          return
        }

        setProjects(allProjects)

        const systemModules = allProjects.filter((p) => p.type === "system" && p.frontend.remoteUrl)
        const systemResults = await Promise.allSettled(
          systemModules.map((p) => loadRemoteEntry(p.frontend.remoteUrl, p.frontend.remoteName)),
        )

        const failedSystem = systemModules.filter((_, i) => systemResults[i].status === "rejected")
        if (failedSystem.length > 0) {
          console.error(
            "[shell] Не загрузились системные модули:",
            failedSystem.map((p) => p.slug),
          )
          setError(true)
          return
        }

        await Promise.all(
          systemModules.map((p) =>
            importRemoteModule(p.frontend.remoteName, "./styles").catch((err) =>
              console.warn(`[shell] Не удалось загрузить стили "${p.slug}":`, err),
            ),
          ),
        )

        const uiProject = systemModules.find((p) => p.frontend.remoteName === "ui")
        if (uiProject) {
          await registerUIComponents(uiProject)
        }

        const projectModules = allProjects.filter((p) => p.type === "project" && p.frontend.remoteUrl)
        await Promise.all(
          projectModules.map((p) =>
            loadRemoteEntry(p.frontend.remoteUrl, p.frontend.remoteName).catch((err) =>
              console.warn(`[shell] Не удалось загрузить remote "${p.slug}":`, err),
            ),
          ),
        )

        const remoteRoutes = await loadAllRemoteRoutes(allProjects)

        const nextRouter = createBrowserRouter([
          {
            element: <ShellLayout />,
            errorElement: <ErrorRedirect />,
            children: [
              { path: "/", element: <Home /> },
              { path: "/organizations", element: <OrganizationsPage /> },
              { path: "/login", element: <LoginPage /> },
              { path: "/subscription-required", element: <SubscriptionRequiredPage /> },
              { path: "*", element: <Navigate to="/" replace /> },
              ...remoteRoutes,
            ],
          },
        ])

        if (active) setRouter(nextRouter)
      })()

    return () => {
      active = false
    }
  }, [])

  if (error) return <BootError />
  if (!router)
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        Загрузка приложения...
      </div>
    )

  return (
    <ProjectsContext.Provider value={projects}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </ProjectsContext.Provider>
  )
}
