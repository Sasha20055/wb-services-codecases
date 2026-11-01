import { navItems, type RemoteNavItem } from "./navData"

export type { RemoteNavItem }

export async function getNav(): Promise<RemoteNavItem[]> {
  return navItems
}

export default function Nav() {
  return null
}

export function getIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <path d="M18 17V9" />
      <path d="M13 17V5" />
      <path d="M8 17v-3" />
    </svg>
  )
}
