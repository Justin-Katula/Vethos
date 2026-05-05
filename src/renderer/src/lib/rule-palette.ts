import {
  Brain,
  Dumbbell,
  Code,
  Coffee,
  Music,
  Book,
  Briefcase,
  Heart,
  Bike,
  Moon,
  Sun,
  Zap,
  type LucideIcon,
} from 'lucide-react'

/** 12 couleurs cohérentes avec le thème sombre Nexus. */
export const PALETTE: string[] = [
  '#3b82f6', // blue-500
  '#06b6d4', // cyan-500
  '#10b981', // emerald-500
  '#84cc16', // lime-500
  '#eab308', // yellow-500
  '#f97316', // orange-500
  '#ef4444', // red-500
  '#ec4899', // pink-500
  '#a855f7', // purple-500
  '#6366f1', // indigo-500
  '#8b5cf6', // violet-500
  '#64748b', // slate-500
]

export const ICON_OPTIONS: Array<{ name: string; Icon: LucideIcon }> = [
  { name: 'Brain', Icon: Brain },
  { name: 'Dumbbell', Icon: Dumbbell },
  { name: 'Code', Icon: Code },
  { name: 'Coffee', Icon: Coffee },
  { name: 'Music', Icon: Music },
  { name: 'Book', Icon: Book },
  { name: 'Briefcase', Icon: Briefcase },
  { name: 'Heart', Icon: Heart },
  { name: 'Bike', Icon: Bike },
  { name: 'Moon', Icon: Moon },
  { name: 'Sun', Icon: Sun },
  { name: 'Zap', Icon: Zap },
]

const ICON_BY_NAME = new Map<string, LucideIcon>(
  ICON_OPTIONS.map(({ name, Icon }) => [name, Icon]),
)

export function iconByName(name: string | undefined | null): LucideIcon | null {
  if (!name) return null
  return ICON_BY_NAME.get(name) ?? null
}
