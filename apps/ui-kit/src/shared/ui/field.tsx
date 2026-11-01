export function Field({
  label,
  children,
  hint,
}: {
  label: React.ReactNode
  children: React.ReactNode
  hint?: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted">{label}</span>
        {hint}
      </div>
      {children}
    </div>
  )
}
