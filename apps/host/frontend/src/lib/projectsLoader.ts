import type { ComponentType } from "react"
import type { RouteObject } from "react-router-dom"
import { apiFetch } from "./api"

const REMOTE_ENTRY_CACHE_KEY = "mf_entry_v=1"

export type ProjectDTO = {
  slug: string
  name: string
  type: "project" | "system"
  requiredScopes?: string[]
  frontend: {
    remoteUrl: string
    remoteName: string
    exposes: string[]
    widgetRoute?: string
    basePath?: string
  }
  backend: {
    url?: string
  }
}

export type HomeWidgetRenderProps = {
  hasCabinets: boolean
  hasActiveBotSubscription: boolean
  project: ProjectDTO
}

export type HomeWidgetDefinition = {
  id: string
  title?: string
  order?: number
  component: ComponentType<HomeWidgetRenderProps>
}

export type HomeWidgetModule = {
  getHomeWidget?: () => Promise<HomeWidgetDefinition | null> | HomeWidgetDefinition | null
  default?:
    | HomeWidgetDefinition
    | {
        getHomeWidget?: () => Promise<HomeWidgetDefinition | null> | HomeWidgetDefinition | null
      }
}

export async function fetchProjects(): Promise<ProjectDTO[]> {
  const res = await apiFetch("/api/main/projects")
  if (!res.ok) {
    console.error("[projectsLoader] Ошибка загрузки проектов:", res.status)
    return []
  }
  return res.json()
}

const containerCache = new Map<string, any>()

async function getShareScope() {
  const [react, reactDom, reactRouterDom, jsxRuntime, jsxDevRuntime, reactDomClient, reactDataSheetGrid] = await Promise.all([
    import("react"),
    import("react-dom"),
    import("react-router-dom"),
    import("react/jsx-runtime"),
    import("react/jsx-dev-runtime"),
    import("react-dom/client"),
    import("react-datasheet-grid"),
  ])

  const wrap = (mod: any, version = "0") => ({
    [version]: { get: () => () => mod, loaded: 1 },
  })

  return {
    react: wrap(react, react.version ?? "19"),
    "react-dom": wrap(reactDom),
    "react/jsx-runtime": wrap(jsxRuntime),
    "react/jsx-dev-runtime": wrap(jsxDevRuntime),
    "react-dom/client": wrap(reactDomClient),
    "react-datasheet-grid": wrap(reactDataSheetGrid),
    "react-router-dom": wrap(reactRouterDom),
  }
}

let shareScopePromise: Promise<any> | null = null
function ensureShareScope() {
  if (!shareScopePromise) shareScopePromise = getShareScope()
  return shareScopePromise
}

function withRemoteEntryCacheKey(url: string) {
  const [base, hash = ""] = url.split("#", 2)
  const separator = base.includes("?") ? "&" : "?"

  if (base.includes("mf_entry_v=")) {
    return url
  }

  return `${base}${separator}${REMOTE_ENTRY_CACHE_KEY}${hash ? `#${hash}` : ""}`
}

export async function loadRemoteEntry(url: string, remoteName: string): Promise<void> {
  if (containerCache.has(remoteName)) return

  const container = await import(/* @vite-ignore */ withRemoteEntryCacheKey(url))

  if (typeof container.init === "function") {
    const scope = await ensureShareScope()
    await container.init(scope)
  }

  containerCache.set(remoteName, container)
}

export async function importRemoteModule(remoteName: string, exposedPath: string): Promise<any> {
  const container = containerCache.get(remoteName)
  if (!container) {
    throw new Error(`Remote container "${remoteName}" не найден`)
  }

  const factory = await container.get(exposedPath)
  return factory()
}

export async function registerUIComponents(project: ProjectDTO): Promise<void> {
  const container = containerCache.get(project.frontend.remoteName)
  if (!container) {
    console.error("[shell] UI контейнер не найден, window.__UI__ не создан")
    return
  }

  let componentNames: string[] = []
  try {
    const manifestFactory = await container.get("./manifest")
    const manifest = manifestFactory()
    componentNames = manifest.components ?? []
  } catch {
    console.warn("[shell] ./manifest не найден в ui-kit, window.__UI__ не создан")
    return
  }

  const entries = await Promise.all(
    componentNames.map(async (name) => {
      try {
        const factory = await container.get(`./${name}`)
        return [name, factory()] as const
      } catch (err) {
        console.warn(`[shell] Не удалось загрузить UI компонент "${name}":`, err)
        return null
      }
    }),
  )

  const uiMap: Record<string, any> = {}
  for (const entry of entries) {
    if (entry) uiMap[entry[0]] = entry[1]
  }

  ;(window as any).__UI__ = uiMap
  console.log(
    `[shell] Зарегистрировано ${Object.keys(uiMap).length} UI компонентов в window.__UI__`,
  )
}

async function getProjectExposes(project: ProjectDTO): Promise<string[]> {
  const container = containerCache.get(project.frontend.remoteName)
  if (!container) return project.frontend.exposes ?? []

  try {
    const factory = await container.get("./manifest")
    const manifest = factory()
    return manifest.exposes ?? []
  } catch {

    return project.frontend.exposes ?? []
  }
}

export async function loadProjectRoutes(project: ProjectDTO): Promise<RouteObject[]> {
  try {
    await loadRemoteEntry(project.frontend.remoteUrl, project.frontend.remoteName)

    const exposes = await getProjectExposes(project)
    if (!exposes.includes("./routes")) return []

    const mod = await importRemoteModule(project.frontend.remoteName, "./routes")
    const getRoutes = mod?.getRoutes ?? mod?.default?.getRoutes ?? mod?.default

    if (typeof getRoutes !== "function") return []

    const routes = await getRoutes()
    return Array.isArray(routes) ? routes : []
  } catch (err) {
    console.error(`[projectsLoader] Ошибка загрузки routes для "${project.slug}":`, err)
    return []
  }
}

export async function loadProjectNav(project: ProjectDTO): Promise<any[]> {
  try {
    await loadRemoteEntry(project.frontend.remoteUrl, project.frontend.remoteName)

    const exposes = await getProjectExposes(project)
    if (!exposes.includes("./Nav")) return []

    const mod = await importRemoteModule(project.frontend.remoteName, "./Nav")
    const getNav = mod?.getNav ?? mod?.default?.getNav ?? mod?.default

    if (typeof getNav !== "function") return []

    const nav = await getNav()
    return Array.isArray(nav) ? nav : []
  } catch (err) {
    console.error(`[projectsLoader] Ошибка загрузки Nav для "${project.slug}":`, err)
    return []
  }
}

export async function loadProjectIcon(project: ProjectDTO): Promise<any | null> {
  try {
    await loadRemoteEntry(project.frontend.remoteUrl, project.frontend.remoteName)

    const exposes = await getProjectExposes(project)
    if (!exposes.includes("./Nav")) return null

    const mod = await importRemoteModule(project.frontend.remoteName, "./Nav")
    const getIcon = mod?.getIcon ?? mod?.default?.getIcon

    if (typeof getIcon === "function") {
      return getIcon()
    }

    return null
  } catch (err) {
    console.error(`[projectsLoader] Ошибка загрузки Icon для "${project.slug}":`, err)
    return null
  }
}

export async function loadProjectHomeWidget(project: ProjectDTO): Promise<HomeWidgetDefinition | null> {
  const widgetRoute = project.frontend.widgetRoute?.trim()
  if (!widgetRoute) return null

  try {
    await loadRemoteEntry(project.frontend.remoteUrl, project.frontend.remoteName)

    const mod = (await importRemoteModule(project.frontend.remoteName, widgetRoute)) as HomeWidgetModule
    const getHomeWidget = mod?.getHomeWidget ?? (mod?.default && 'getHomeWidget' in mod.default ? mod.default.getHomeWidget : undefined)

    if (typeof getHomeWidget === "function") {
      const widget = await getHomeWidget()
      return widget && typeof widget === "object" ? widget : null
    }

    const widget = mod?.default
    if (widget && typeof widget === "object" && "component" in widget) {
      return widget as HomeWidgetDefinition
    }

    return null
  } catch (err) {
    console.error(`[projectsLoader] Ошибка загрузки Home widget для "${project.slug}":`, err)
    return null
  }
}
