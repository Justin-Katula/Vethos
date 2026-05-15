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

/** Palette arc-en-ciel pour objectifs et règles utilisateur. */
export const PALETTE: string[] = [
  '#E74C3C',
  '#E67E22',
  '#F1C40F',
  '#27AE60',
  '#1ABC9C',
  '#5DADE2',
  '#8E44AD',
  '#E91E63',
  '#795548',
  '#607D8B',
  '#34495E',
  '#00D1FF',
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
