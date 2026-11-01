import * as React from "react"
import { Link, Navigate, Outlet, useLocation } from "react-router-dom"
import "./App.css"
import { fetchProjects, loadProjectNav, loadProjectIcon } from "./lib/projectsLoader"
import { useAuth } from "./auth/AuthProvider"
import type { SidebarChild, SidebarItem } from "./sidebar/models/types.ts"
import { Sidebar } from "./sidebar/ui/sidebar"

type RemoteNavItem =
  | { type: "link"; label: string; to: string }
  | { type: "group"; label: string; children: RemoteNavItem[] }

export function ShellLayout() {
  const { pathname } = useLocation()
  const { user, activeClient, setActiveClient } = useAuth()
  const [remoteNavs, setRemoteNavs] = React.useState<Record<string, { items: RemoteNavItem[]; icon?: React.ReactNode }>>({})
  const [mobileOpen, setMobileOpen] = React.useState(false)

  const isPublicLanding = pathname === "/login"
  const isSubscriptionPage = pathname === "/subscription-required"
  const hasRestrictedSubscription =
    user && user.botSubscriptionStatus === "inactive" && !user.hasBotSubscription
  const canOpenWithoutSubscription =
    pathname === "/" || pathname === "/subscription-required" || pathname.startsWith("/suppliers")

  React.useEffect(() => {
    let active = true
      ; (async () => {
        const projects = await fetchProjects()
        const projectsWithNav = projects.filter(
          (p) => p.type === "project" && p.frontend.exposes.includes("./Nav"),
        )

        const results = await Promise.all(
          projectsWithNav.map(async (p) => ({
            slug: p.slug,
            items: await loadProjectNav(p),
            icon: await loadProjectIcon(p),
          })),
        )

        if (!active) return

        const next: Record<string, { items: RemoteNavItem[]; icon?: React.ReactNode }> = {}
        for (const res of results) next[res.slug] = { items: res.items, icon: res.icon }
        setRemoteNavs(next)
      })()

    return () => {
      active = false
    }
  }, [])

  const toHref = (basePath: string, to: string) => `${basePath}/${to}`.replace(/\/+/g, "/")

  const mapRemoteNav = (
    items: RemoteNavItem[] | undefined,
    basePath: string,
    icon: React.ReactNode,
  ): SidebarItem[] => {
    if (!items) return []
    return items.map((item) => {
      if (item.type === "link") {
        return { label: item.label, icon, href: toHref(basePath, item.to) }
      }

      const children: SidebarChild[] = item.children
        .filter((child): child is Extract<RemoteNavItem, { type: "link" }> => child.type === "link")
        .map((child) => ({
          label: child.label,
          href: toHref(basePath, child.to),
        }))

      return { label: item.label, icon, children }
    })
  }

  const navItems = React.useMemo<SidebarItem[]>(() => {
    const items: SidebarItem[] = [
      { label: "Главная", icon: <HomeIcon />, href: "/" },
      { label: "Организации", icon: <OrganizationIcon />, href: "/organizations" },
    ]

    for (const navData of Object.values(remoteNavs)) {
      items.push(...mapRemoteNav(navData.items, "", navData.icon))
    }
    return items
  }, [remoteNavs])

  if (hasRestrictedSubscription && !canOpenWithoutSubscription) {
    return <Navigate to="/subscription-required" replace />
  }

  if (!hasRestrictedSubscription && isSubscriptionPage) {
    return <Navigate to="/" replace />
  }

  if (isPublicLanding) {
    return (
      <main className="landing-shell">
        <Outlet />
      </main>
    )
  }

  return (
    <div className="shell">
      <header className="header">
        <div className="header-left">
          <button
            className="menuButton"
            onClick={() => setMobileOpen(true)}
            aria-label="Открыть меню"
          >
            ☰
          </button>
          <div className="brand">SuperSeller</div>
        </div>
        {user?.clients && user.clients.length > 0 ? (
          <div className="header-right" style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
            <Link
              to="/organizations"
              className="subscription-secondary-link"
              style={{ padding: "8px 12px", borderRadius: 10, fontSize: 14 }}
            >
              Управление
            </Link>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
              <span>Организация</span>
              <select
                value={activeClient?._id ?? ""}
                onChange={(event) => {
                  const nextValue = event.target.value || null
                  void setActiveClient(nextValue)
                }}
                style={{ minWidth: 220, borderRadius: 8, border: "1px solid #d1d5db", padding: "6px 10px" }}
              >
                {user.clients.map((client) => (
                  <option key={client._id} value={client._id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
      </header>

      <Sidebar
        items={navItems}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}

function OrganizationIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M4 20v-7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7" />
      <path d="M9 11V6a3 3 0 0 1 6 0v5" />
      <path d="M3 20h18" />
    </svg>
  )
}

function HomeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M3 11l9-7 9 7" />
      <path d="M5 10v10h14V10" />
    </svg>
  )
}
