import type { Plugin } from "vite"

export function uiProxyPlugin(): Plugin {
  return {
    name: "ui-proxy",
    enforce: "pre",
    apply: "build",

    resolveId(source: string) {
      if (source.startsWith("ui/")) {
        return `\0ui-proxy:${source}`
      }
    },

    load(id: string) {
      if (!id.startsWith("\0ui-proxy:ui/")) return

      const name = id.replace("\0ui-proxy:ui/", "")

      return `
const mod = window.__UI__?.['${name}'];
if (!mod) throw new Error('[ui-proxy] Компонент "${name}" не найден в window.__UI__. Shell не загрузил ui-kit?');
const _default = mod.default ?? mod;
export default _default;
export const { ${getCommonExports(name)} } = mod;
`
    },
  }
}

function getCommonExports(name: string): string {
  const map: Record<string, string> = {
    Button: "Button",
    Badge: "Badge",
    Card: "Card, CardContent, CardHeader",
    Checkbox: "Checkbox",
    Chip: "Chip",
    ChipsInput: "ChipsInput",
    Combobox: "ComboBox",
    Drawer: "Drawer",
    IconButton: "IconButton",
    Input: "Input",
    Modal: "Modal",
    MultiCombobox: "MultiComboBox",
    Pagination: "Pagination",
    Select: "Select",
    Skeleton: "Skeleton",
    Switch: "Switch",
    TabFilter: "TabFilter",
    TableComp: "Table, THead, TBody, TR, TH, TD",
    Table: "Table",
    Textarea: "Textarea",
    Toast: "Toast",
    Tooltip: "Tooltip",
    TooltipIcon: "TooltipIcon",
    Section: "Section",
    Field: "Field",
    SwitchComp: "SwitchComp",
    DateRangePicker: "DateRangePicker",
  }
  return map[name] ?? ""
}
