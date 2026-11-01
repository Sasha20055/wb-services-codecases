export const parseMultiSelectValue = (value: any): string[] => {
  if (Array.isArray(value)) {
    return value.filter((v) => v !== "" && v != null)
  }

  if (typeof value === "string" && value.includes(",")) {
    return value
      .split(",")
      .map((v) => v.trim())
      .filter((v) => v)
  }

  if (typeof value === "string" && value.trim()) {
    return [value]
  }

  return []
}
