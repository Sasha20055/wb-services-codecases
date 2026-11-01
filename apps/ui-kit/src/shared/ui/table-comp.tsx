import * as React from "react"
import { cn } from "../lib/cn"
export function Table({ className, ...props }: React.HTMLAttributes<HTMLTableElement>) {
  return <table className={cn("w-full border-separate border-spacing-0", className)} {...props} />
}
export function THead(props: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead {...props} />
}
export function TBody(props: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} />
}
export function TR({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("group", className)} {...props} />
}
export function TH({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "text-nowrap sticky top-0 z-10 bg-panel/80 px-0 py-0 text-center text-[10px] font-semibold text-muted backdrop-blur border-b border-border md:text-[14px]",
        className,
      )}
      {...props}
    />
  )
}
export function TD({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn("border-b border-border px-0 py-0 group-hover:bg-surface/60", className)}
      {...props}
    />
  )
}

export default Table
