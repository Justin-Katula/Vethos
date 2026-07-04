import { AlertTriangle } from 'lucide-react'

export function ExecutionPreviewWarningList({ warnings }: { warnings: string[] }) {
  const uniqueWarnings = [...new Set(warnings ?? [])]
  if (uniqueWarnings.length === 0) return null

  return (
    <div className="flex flex-col gap-1 rounded-md border border-yellow-500/20 bg-yellow-500/5 px-3 py-2">
      {uniqueWarnings.map((w) => (
        <div key={w} className="flex items-start gap-2 text-xs text-yellow-200/90">
          <AlertTriangle size={12} className="mt-0.5 shrink-0 opacity-70" />
          <span>{w}</span>
        </div>
      ))}
    </div>
  )
}
