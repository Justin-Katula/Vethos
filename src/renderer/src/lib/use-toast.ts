import { useToastStore } from '@/store/toast.store'

type ToastInput = string | { title: string; description?: string }

function normalize(input: ToastInput): { title: string; description?: string } {
  if (typeof input === 'string') return { title: input }
  return input
}

export function useToast() {
  const push = useToastStore((s) => s.push)
  return {
    success(input: ToastInput): string {
      return push({ variant: 'success', ...normalize(input) })
    },
    info(input: ToastInput): string {
      return push({ variant: 'info', ...normalize(input) })
    },
    error(input: ToastInput): string {
      return push({ variant: 'error', ...normalize(input) })
    },
  }
}
