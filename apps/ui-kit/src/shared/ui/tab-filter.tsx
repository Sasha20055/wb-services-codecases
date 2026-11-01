"use client"

import * as React from "react"
import { cn } from "../lib/cn"

type TabFilterType = {
  label?: string
  isShowMobile?: boolean
  activeTab: string
  onTabChange: (value: string) => void
  tabs: Array<{ label: string; value: string }>
}

interface TabFilterProps {
  filter: TabFilterType
}

export function TabFilter({ filter }: TabFilterProps) {
  return (
    <div className={cn("min-w-0 basis-full", filter.isShowMobile ? "" : "hidden md:block")}>
      {filter.label && <label className="mb-1 block text-[10px] md:text-sm">{filter.label}</label>}
      <div className="flex flex-wrap gap-1">
        {filter.tabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => filter.onTabChange(tab.value)}
            className={cn(
              "px-3 py-2 text-[10px] rounded-lg border transition-colors md:text-sm",
              filter.activeTab === tab.value
                ? "bg-accent text-white border-accent"
                : "bg-surface border-border hover:bg-surface-hover text-text",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export default TabFilter
