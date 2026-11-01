"use client"

import * as React from "react"
import { Button } from "./button"
import { Tooltip } from "./tooltip"

export function TooltipIcon({ content }: { content: string }) {
  return (
    <Tooltip
      content={
        <div className={`w-[300px] break-words whitespace-normal text-sm leading-relaxed`}>
          {content}
        </div>
      }
    >
      <Button
        size="sm"
        variant="ghost"
        className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
      >
        ?
      </Button>
    </Tooltip>
  )
}

export default TooltipIcon
