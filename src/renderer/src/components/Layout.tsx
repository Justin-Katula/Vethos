import { useEffect, useMemo, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { Sidebar } from './Sidebar'
import { RelaxationOverlay } from './RelaxationOverlay'
import { FallingPattern } from './ui/FallingPattern'
import { localDateKey, usePlacement } from '@/lib/use-placement'
import { useWorkBlockAutomation } from '@/lib/use-work-block-automation'
import { useRestModeStore } from '@/store/rest-mode.store'
import { useScheduleStore } from '@/store/schedule.store'
import { CoachPrompt } from './coach/CoachPrompt'
import { SessionClosurePanel } from './session/SessionClosurePanel'
import { useSessionV2Runtime } from '@/lib/use-session-v2-runtime'

export function Layout() {
  const location = useLocation()
  const [now, setNow] = useState(() => new Date())
  const activeUntil = useRestModeStore((s) => s.activeUntil)
  const clearExpired = useRestModeStore((s) => s.clearExpired)

  useEffect(() => {
    const id = setInterval(() => {
      const next = new Date()
      setNow(next)
      clearExpired(next.getTime())
    }, 30_000)
    clearExpired(Date.now())
    return () => clearInterval(id)
  }, [clearExpired])

  const todayStr = localDateKey(now)
  const { blocks } = usePlacement(now, todayStr, { todayStartMinute: 0 })
  useWorkBlockAutomation(now, blocks)
  useSessionV2Runtime()
  const currentMinute = now.getHours() * 60 + now.getMinutes()
  const rules = useScheduleStore((s) => s.rules)
  const entries = useScheduleStore((s) => s.entries)
  const ruleById = useMemo(() => new Map(rules.map((rule) => [rule.id, rule])), [rules])
  const currentDay = (now.getDay() + 6) % 7
  const plannedSleepActive = useMemo(
    () =>
      entries.some((entry) => {
        if (entry.dayOfWeek !== currentDay) return false
        if (entry.startMinute > currentMinute || currentMinute >= entry.endMinute) return false
        return ruleById.get(entry.ruleId)?.categoryType === 'sleep'
      }),
    [currentDay, currentMinute, entries, ruleById],
  )
  const plannedRestActive = useMemo(
    () =>
      blocks.some(
        (block) =>
          block.kind === 'break' &&
          block.date === todayStr &&
          block.startMinute <= currentMinute &&
          currentMinute < block.endMinute,
      ),
    [blocks, todayStr, currentMinute],
  )
  const triggeredRestActive = activeUntil !== null && activeUntil > now.getTime()
  const restModeActive = plannedSleepActive || plannedRestActive || triggeredRestActive

  return (
    <div className="relative flex h-screen w-screen overflow-hidden bg-bg-base">
      <FallingPattern
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0"
        color="rgba(216, 216, 216, 0.38)"
        backgroundColor="var(--bg-base)"
        blurIntensity="0.6em"
        density={1}
        style={{
          maskImage: 'radial-gradient(ellipse at center, transparent 0%, black 72%)',
          WebkitMaskImage: 'radial-gradient(ellipse at center, transparent 0%, black 72%)',
        }}
      />
      <RelaxationOverlay isActive={restModeActive} />
      <CoachPrompt />
      <SessionClosurePanel />
      <div className="relative z-10 flex h-full w-full">
        <Sidebar />
        <main className="relative flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            <div key={location.pathname} className="h-full">
              <Outlet />
            </div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  )
}
