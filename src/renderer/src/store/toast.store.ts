import { create } from 'zustand'

export type ToastVariant = 'success' | 'info' | 'error'

export type Toast = {
  id: string
  variant: ToastVariant
  title: string
  description?: string
  /** ISO datetime de création — pour debug. */
  createdAt: string
}

type ToastStore = {
  toasts: Toast[]
  reset: () => void
  push: (t: Omit<Toast, 'id' | 'createdAt'>) => string
  dismiss: (id: string) => void
  dismissAll: () => void
}

const MAX_TOASTS = 4

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  reset() {
    set({ toasts: [] })
  },
  push(input) {
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`
    const toast: Toast = {
      id,
      variant: input.variant,
      title: input.title,
      description: input.description,
      createdAt: new Date().toISOString(),
    }
    const next = [...get().toasts, toast].slice(-MAX_TOASTS)
    set({ toasts: next })
    return id
  },
  dismiss(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) })
  },
  dismissAll() {
    set({ toasts: [] })
  },
}))
