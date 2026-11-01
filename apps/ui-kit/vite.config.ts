import federation from "@originjs/vite-plugin-federation"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    federation({
      name: "ui",
      filename: "remoteEntry.js",
      exposes: {
        "./manifest": "./src/manifest.ts",
        "./styles": "./src/styles-init.ts",
        "./Badge": "./src/shared/ui/badge.tsx",
        "./Button": "./src/shared/ui/button.tsx",
        "./Card": "./src/shared/ui/card.tsx",
        "./Checkbox": "./src/shared/ui/checkbox.tsx",
        "./Chip": "./src/shared/ui/chip.tsx",
        "./ChipColor": "./src/shared/ui/chip-color.tsx",
        "./ChipsInput": "./src/shared/ui/chips-input.tsx",
        "./Combobox": "./src/shared/ui/combobox.tsx",
        "./Drawer": "./src/shared/ui/drawer.tsx",
        "./IconButton": "./src/shared/ui/icon-button.tsx",
        "./Input": "./src/shared/ui/input.tsx",
        "./Modal": "./src/shared/ui/modal.tsx",
        "./MultiCombobox": "./src/shared/ui/multi-combobox.tsx",
        "./Pagination": "./src/shared/ui/pagination.tsx",
        "./Select": "./src/shared/ui/select.tsx",
        "./Skeleton": "./src/shared/ui/skeleton.tsx",
        "./Switch": "./src/shared/ui/switch.tsx",
        "./TabFilter": "./src/shared/ui/tab-filter.tsx",
        "./TableComp": "./src/shared/ui/table-comp.tsx",
        "./Table": "./src/shared/ui/table.tsx",
        "./Textarea": "./src/shared/ui/textarea.tsx",
        "./Toast": "./src/shared/ui/toast.tsx",
        "./Tooltip": "./src/shared/ui/tooltip.tsx",
        "./TooltipIcon": "./src/shared/ui/tooltip-icon.tsx",
        "./Section": "./src/shared/ui/section.tsx",
        "./Field": "./src/shared/ui/field.tsx",
        "./SwitchComp": "./src/shared/ui/switch-comp.tsx",
        "./DateRangePicker": "./src/shared/ui/date-range-picker.tsx",
      },
      shared: ["react", "react-dom"],
    }),
  ],
  build: {
    target: "esnext",
  },
  server: {
    cors: true,
  },
})
