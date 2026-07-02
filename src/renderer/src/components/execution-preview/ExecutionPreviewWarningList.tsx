import { AlertTriangle } from 'lucide-react'

export function ExecutionPreviewWarningList({ warnings }: { warnings: string[] }) {
  if (!warnings || warnings.length === 0) return null

  return (
    <div className="flex flex-col gap-1 rounded-md border border-yellow-500/20 bg-yellow-500/5 px-3 py-2">
      {warnings.map((w, i) => (
        <div key={i} className="flex items-start gap-2 text-xs text-yellow-200/90">
          <AlertTriangle size={12} className="mt-0.5 shrink-0 opacity-70" />
          <span>{w}</span>
        </div>
      ))}
    </div>
  )
}
