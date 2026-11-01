declare module "feedback/Nav" {
  export type RemoteNavItem =
    | { type: "link"; label: string; to: string }
    | { type: "group"; label: string; children: RemoteNavItem[] }
  export function getNav(): Promise<RemoteNavItem[]>
  const Component: React.ComponentType
  export default Component
}

declare module "feedback/routes" {
  import type { RouteObject } from "react-router-dom"
  export function getRoutes(): RouteObject[]
}

declare module "feedback/HomeWidget" {
  import type { HomeWidgetDefinition } from "../lib/projectsLoader"

  export function getHomeWidget(): Promise<HomeWidgetDefinition | null>
}

declare module "r-suppliers/Nav" {
  export type RemoteNavItem =
    | { type: "link"; label: string; to: string }
    | { type: "group"; label: string; children: RemoteNavItem[] }
  export function getNav(): Promise<RemoteNavItem[]>
  const Component: React.ComponentType
  export default Component
}

declare module "r-suppliers/routes" {
  import type { RouteObject } from "react-router-dom"
  export function getRoutes(): RouteObject[]
}

declare module "ui/Card" {
  import type { ComponentType } from "react"
  const Card: ComponentType<any>
  export default Card
}
declare module "ui/Button" {
  import type { ComponentType } from "react"
  const Button: ComponentType<any>
  export default Button
}
declare module "ui/Badge" {
  import type { ComponentType } from "react"
  const Badge: ComponentType<any>
  export default Badge
}
declare module "ui/Section" {
  import type { ComponentType } from "react"
  export const Section: ComponentType<any>
}
declare module "ui/Chip" {
  import type { ComponentType } from "react"
  const Chip: ComponentType<any>
  export default Chip
}
