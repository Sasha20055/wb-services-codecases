import Card, { CardContent, CardHeader } from "./card.tsx"

export function Section({
  title,
  children,
  right,
  id,
  className,
}: {
  title: React.ReactNode
  children: React.ReactNode
  right?: React.ReactNode
  id?: string
  className?: string
}) {
  return (
    <Card id={id}>
      <CardHeader className="flex items-center justify-between">
        {title}
        {right}
      </CardHeader>
      <CardContent className={`space-y-4 ${className}`}>{children}</CardContent>
    </Card>
  )
}
