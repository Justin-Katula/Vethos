import { create } from 'zustand'
import { vethos } from '@/lib/ipc'
import {
  REGISTRY_CATEGORIES,
  type RegistryItem,
  type RegistryState,
  type RegistryCategory,
} from '@shared/schemas'
import { assertStorageWrite } from '@/lib/storage-write'
import {
  normalizeStorageUserId,
  resolveStorageUserId,
  storageUserIdFromState,
} from './scoped-storage'

type AddItemInput = Omit<
  RegistryItem,
  'id' | 'createdAt' | 'classified' | 'demoted' | 'usefulFor' | 'usageCount' | 'lastSeenAt'
> & {
  usageCount?: number
  lastSeenAt?: string
}

type ClassifyInput = {
  itemId: string
  usefulFor: { objectives: string[]; standaloneTasks: string[] }
}

type DiscoveredAppInput = {
  name: string
  exeName: string
  packageId?: string
  source?: string
  hasExecutablePath?: boolean
  iconDataUrl?: string
}

type State = {
  items: RegistryItem[]
  loaded: boolean
  userId: string | null
  appsLastScannedAt: string | null
  appsScanVersion: number
  setUserId: (userId?: string | null) => void
  reset: () => void
  load: (userId?: string) => Promise<void>
  /** Ajoute un item nouvellement détecté (classified=false). */
  observeItem: (input: AddItemInput) => Promise<RegistryItem>
  /** Synchronise toutes les entrées réellement renvoyées par Windows. */
  syncDiscoveredApps: (apps: DiscoveredAppInput[]) => Promise<void>
  /** Incrémente l'usageCount + met à jour lastSeenAt. */
  incrementUsage: (itemId: string) => Promise<void>
  /** Classifie un item (irréversible, D11). Refuse si déjà classifié. */
  classifyItem: (input: ClassifyInput) => Promise<void>
  /** Ajoute des associations supplémentaires (additif uniquement). */
  addUsefulFor: (input: ClassifyInput) => Promise<void>
  /** Démote one-way (D11). Refuse si déjà demoted. */
  demoteItem: (itemId: string) => Promise<void>
  /** Classifie les applications et sites du registre spécifiquement pour une tâche active */
  classifyRegistryForTask: (taskTitle: string, contextNotes: string, taskId: string) => Promise<void>
  /** Classifie les applications et sites du registre spécifiquement pour un objectif */
  classifyRegistryForObjective: (objectiveName: string, objectiveDescription: string, objectiveId: string) => Promise<void>
}

function hasUserSignal(item: RegistryItem): boolean {
  return (
    item.demoted ||
    item.usageCount > 0 ||
    (item.usefulFor?.objectives?.length ?? 0) > 0 ||
    (item.usefulFor?.standaloneTasks?.length ?? 0) > 0
  )
}

async function persist(
  items: RegistryItem[],
  userId?: string,
  appsLastScannedAt?: string | null,
  appsScanVersion?: number,
): Promise<void> {
  const state: RegistryState = {
    items,
    ...(appsLastScannedAt ? { appsLastScannedAt } : {}),
    ...(appsScanVersion ? { appsScanVersion } : {}),
  }
  const result = await vethos.storage.write<RegistryState>('registry', state, userId)
  assertStorageWrite(result, 'registry')
}

function normalizeExecutableName(value: string): string | undefined {
  const normalized = value.trim().replace(/^.*[\\/]/u, '').toLowerCase()
  return normalized.endsWith('.exe') && normalized !== 'unknown.exe' ? normalized : undefined
}

function discoveredIdentifier(app: DiscoveredAppInput): string {
  const packageId = app.packageId?.trim().toLowerCase()
  if (packageId) return `installed:${packageId}`
  return `installed:${(app.source ?? 'windows').toLowerCase()}:${app.name.trim().toLowerCase()}`
}

function isNameSimilar(nameA: string, nameB: string): boolean {
  const cleanA = nameA.toLowerCase().replace(/[^a-z0-9]/g, '')
  const cleanB = nameB.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (!cleanA || !cleanB) return false
  if (cleanA === cleanB) return true
  if (cleanA.includes(cleanB) || cleanB.includes(cleanA)) return true

  // Acronym check (e.g. "cod" vs "Call of Duty")
  const getAcronym = (name: string): string => {
    const parts = name
      .toLowerCase()
      .split(/[^a-z0-9]+/g)
      .filter(Boolean)
    if (parts.length < 2) return ''
    return parts.map((w) => w[0]).join('')
  }
  const acrA = getAcronym(nameA)
  const acrB = getAcronym(nameB)
  if (acrA && acrA === cleanB) return true
  if (acrB && acrB === cleanA) return true
  if (acrA && acrB && acrA === acrB) return true

  // Fuzzy prefix check to handle encoding corruptions (e.g., callofdutyr vs callofdutyar)
  const minLength = Math.min(cleanA.length, cleanB.length)
  if (minLength >= 6) {
    if (cleanA.startsWith(cleanB) && cleanA.length - cleanB.length <= 2) return true
    if (cleanB.startsWith(cleanA) && cleanB.length - cleanA.length <= 2) return true
  }

  return false
}

const REGISTRY_CATEGORY_SET = new Set<string>(REGISTRY_CATEGORIES)
export const CURRENT_APP_SCAN_VERSION = 7

const DEFAULT_STATE = {
  items: [],
  loaded: false,
  userId: null,
  appsLastScannedAt: null,
  appsScanVersion: 0,
}

export const useRegistryStore = create<State>((set, get) => {
  let subscribed = false

  const persistItems = (items: RegistryItem[], userId?: string): Promise<void> =>
    persist(items, userId, get().appsLastScannedAt, get().appsScanVersion)

  function subscribeToRegistryEvents(): void {
    if (subscribed) return
    subscribed = true
    if (vethos.registry?.onItemObserved) {
      vethos.registry.onItemObserved(async (item) => {
        const userId = storageUserIdFromState(get())
        if (!userId) return
        await get().observeItem(item)
      })
    }
  }

  return {
    ...DEFAULT_STATE,

    setUserId(rawUserId) {
      const userId = normalizeStorageUserId(rawUserId) ?? null
      if (get().userId === userId) return
      set({ ...DEFAULT_STATE, userId })
    },

    reset() {
      set({ ...DEFAULT_STATE })
    },

    async load(rawUserId) {
      const userId = resolveStorageUserId(rawUserId, get())
      if (!userId) {
        get().reset()
        return
      }
      const normalizedUserId = userId ?? null
      if (get().userId !== normalizedUserId) {
        set({ ...DEFAULT_STATE, userId: normalizedUserId })
      }
      subscribeToRegistryEvents()

      const stored = await vethos.storage.read<RegistryState>('registry', userId)
      const currentItems = stored?.items ?? []

      const appsLastScannedAt = stored?.appsLastScannedAt ?? null
      const appsScanVersion = stored?.appsScanVersion ?? 0
      set({
        items: currentItems,
        loaded: true,
        userId: normalizedUserId,
        appsLastScannedAt,
        appsScanVersion,
      })
      if (!stored) {
        await persistItems(currentItems, userId)
      }
    },

    async observeItem(input) {
      const userId = storageUserIdFromState(get())
      const inputIdentifier = input.identifier.toLowerCase()
      const existing = get().items.find((i) => {
        if (i.kind !== input.kind) return false
        if (i.identifier.toLowerCase() === inputIdentifier) return true
        return i.kind === 'app' && i.executableName?.toLowerCase() === inputIdentifier
      })
      const now = new Date().toISOString()
      if (existing) {
        const lastSeenMs = new Date(existing.lastSeenAt).getTime()
        // Increment only if last seen > 60 seconds ago to avoid spamming disk writes
        if (Date.now() - lastSeenMs > 60_000) {
          const items = get().items.map((i) =>
            i.id === existing.id
              ? { ...i, usageCount: (i.usageCount ?? 0) + 1, lastSeenAt: now }
              : i,
          )
          set({ items })
          await persistItems(items, userId)
          return { ...existing, usageCount: (existing.usageCount ?? 0) + 1, lastSeenAt: now }
        }
        return existing
      }
      const item: RegistryItem = {
        id: crypto.randomUUID(),
        kind: input.kind,
        identifier: input.identifier,
        executableName: input.executableName,
        blockable: input.blockable,
        displayName: input.displayName,
        usageCount: input.usageCount ?? 1,
        lastSeenAt: now,
        classified: true,
        demoted: false,
        usefulFor: { objectives: [], standaloneTasks: [] },
        category: 'Other',
        createdAt: now,
      }

      if (item.kind === 'app') {
        try {
          const mapping = await vethos.coach.categorizeApps({
            apps: [{ name: item.displayName, exeName: item.identifier }],
          })
          const mappingData = 'data' in mapping ? mapping.data : mapping as unknown as Record<string, string>
          const cat = mappingData[item.identifier.toLowerCase()]
          if (cat) {
            item.category = cat as RegistryCategory
          }
        } catch (err) {
          console.error('[registry-store] Error categorizing single app:', err)
        }
      }

      const items = [...get().items, item]
      set({ items })
      await persistItems(items, userId)
      return item
    },

    async syncDiscoveredApps(apps) {
      const userId = storageUserIdFromState(get())
      if (!userId || apps.length === 0) return
      const now = new Date().toISOString()
      let items = get().items.slice()
      const seenItemIds = new Set<string>()
      const needsCategory = new Map<string, RegistryItem>()

      for (const app of apps) {
        const name = app.name.trim()
        if (!name) continue
        const executableName = normalizeExecutableName(app.exeName)
        const blockable = Boolean(app.hasExecutablePath && executableName)
        const identifier = discoveredIdentifier(app)
        const target = executableName?.toLowerCase()
        const normalizedName = name.toLowerCase()
        const existingIndex = items.findIndex((item) => {
          if (item.kind !== 'app') return false
          if (item.identifier.toLowerCase() === identifier.toLowerCase()) return true
          // Migration des anciennes entrées qui utilisaient directement le
          // processus comme identité. Le nom doit aussi correspondre afin que
          // deux applications distinctes partageant le même .exe ne fusionnent pas.
          if (!target || !isNameSimilar(item.displayName, name)) return false
          return (item.executableName ?? item.identifier).toLowerCase() === target
        })

        if (existingIndex >= 0) {
          const existing = items[existingIndex]!
          const updated: RegistryItem = {
            ...existing,
            identifier,
            displayName: name,
            iconDataUrl: app.iconDataUrl ?? existing.iconDataUrl,
            lastSeenAt: now,
            executableName: blockable ? executableName : undefined,
            blockable,
          }
          items[existingIndex] = updated
          seenItemIds.add(updated.id)
          if (!updated.category) needsCategory.set(updated.identifier.toLowerCase(), updated)
          continue
        }

        const item: RegistryItem = {
          id: crypto.randomUUID(),
          kind: 'app',
          identifier,
          executableName: blockable ? executableName : undefined,
          blockable,
          displayName: name,
          iconDataUrl: app.iconDataUrl,
          usageCount: 0,
          lastSeenAt: now,
          classified: false,
          demoted: false,
          usefulFor: { objectives: [], standaloneTasks: [] },
          createdAt: now,
        }
        items.push(item)
        seenItemIds.add(item.id)
        needsCategory.set(item.identifier.toLowerCase(), item)
      }

      // Une application sans signal utilisateur qui n'existe plus dans le
      // scan Windows n'est pas conservée comme une fausse entrée préenregistrée.
      items = items.filter(
        (item) => item.kind !== 'app' || seenItemIds.has(item.id) || hasUserSignal(item),
      )

      // Afficher d'abord tout l'inventaire réel. La catégorisation distante ne
      // doit jamais retarder l'apparition des applications dans la page.
      if (storageUserIdFromState(get()) !== userId) return
      set({ items, appsLastScannedAt: now, appsScanVersion: CURRENT_APP_SCAN_VERSION })
      await persist(items, userId, now, CURRENT_APP_SCAN_VERSION)

      const categoryMapping: Record<string, string> = {}
      const pending = [...needsCategory.values()]
      const batches: RegistryItem[][] = []
      for (let index = 0; index < pending.length; index += 40) {
        batches.push(pending.slice(index, index + 40))
      }
      const results = await Promise.allSettled(
        batches.map((batch) =>
          vethos.coach.categorizeApps({
            apps: batch.map((item) => ({
              name: item.displayName,
              exeName: item.identifier,
            })),
          }),
        ),
      )
      for (const result of results) {
        if (result.status === 'rejected') {
          console.error('[registry-store] Error categorizing discovered apps:', result.reason)
          continue
        }
        const mappingData = result.value && 'data' in result.value ? result.value.data : result.value as unknown as Record<string, string>
        for (const [identifier, category] of Object.entries(mappingData ?? {})) {
          if (REGISTRY_CATEGORY_SET.has(category)) {
            categoryMapping[identifier.toLowerCase()] = category
          }
        }
      }

      const latestItems = get().items.map((item) => {
        if (item.kind !== 'app' || item.category || !seenItemIds.has(item.id)) return item
        const category = categoryMapping[item.identifier.toLowerCase()] ?? 'Other'
        return { ...item, category: category as RegistryCategory }
      })

      if (storageUserIdFromState(get()) !== userId) return
      set({ items: latestItems })
      await persist(latestItems, userId, now, CURRENT_APP_SCAN_VERSION)
    },

    async incrementUsage(itemId) {
      const userId = storageUserIdFromState(get())
      const items = get().items.map((i) =>
        i.id === itemId
          ? { ...i, usageCount: i.usageCount + 1, lastSeenAt: new Date().toISOString() }
          : i,
      )
      set({ items })
      await persistItems(items, userId)
    },

    async classifyItem({ itemId, usefulFor }) {
      const userId = storageUserIdFromState(get())
      const item = get().items.find((i) => i.id === itemId)
      if (!item) throw new Error('Registry item introuvable')
      if (item.classified) throw new Error('Item déjà classifié — anti-sabotage (D11)')
      const items = get().items.map((i) =>
        i.id === itemId ? { ...i, classified: true, usefulFor } : i,
      )
      set({ items })
      await persistItems(items, userId)
    },

    async addUsefulFor({ itemId, usefulFor }) {
      const userId = storageUserIdFromState(get())
      const item = get().items.find((i) => i.id === itemId)
      if (!item) throw new Error('Registry item introuvable')
      if (item.demoted) throw new Error('Item démontré — pas d’ajout possible (D11)')
      const merged = {
        objectives: Array.from(new Set([...item.usefulFor.objectives, ...usefulFor.objectives])),
        standaloneTasks: Array.from(
          new Set([...item.usefulFor.standaloneTasks, ...usefulFor.standaloneTasks]),
        ),
      }
      const items = get().items.map((i) =>
        i.id === itemId ? { ...i, classified: true, usefulFor: merged } : i,
      )
      set({ items })
      await persistItems(items, userId)
    },

    async demoteItem(itemId) {
      const userId = storageUserIdFromState(get())
      const item = get().items.find((i) => i.id === itemId)
      if (!item) throw new Error('Registry item introuvable')
      if (item.demoted) throw new Error('Item déjà démontré — irréversible (D11)')
      const items = get().items.map((i) =>
        i.id === itemId ? { ...i, classified: true, demoted: true } : i,
      )
      set({ items })
      await persistItems(items, userId)
    },

    async classifyRegistryForTask(taskTitle, contextNotes, taskId) {
      const userId = storageUserIdFromState(get())
      const syncedItems = get().items
      const apps = syncedItems.filter((i) => i.kind === 'app' || i.kind === 'site')
      if (apps.length === 0) return

      const currentUsefulIds = syncedItems
        .filter((i) => i.usefulFor.standaloneTasks.includes(taskId))
        .map((i) => i.identifier)

      try {
        const coachResult = await vethos.coach.classifyAppsForTask({
          taskTitle,
          contextNotes,
          apps: apps.map((a) => ({ identifier: a.identifier, displayName: a.displayName })),
          currentUsefulApps: currentUsefulIds,
        })

        const mapping = 'data' in coachResult ? coachResult.data : coachResult as unknown as Record<string, 'useful' | 'distraction' | 'neutral'>
        if (!('decision' in coachResult) || coachResult.decision === 'use_result') {
          const items = get().items.map((item) => {
            const role = mapping[item.identifier.toLowerCase()]
            const isUseful = role === 'useful'
            const currentTasks = item.usefulFor.standaloneTasks || []
            const exists = currentTasks.includes(taskId)

            let nextTasks = [...currentTasks]
            if (isUseful && !exists) {
              nextTasks.push(taskId)
            } else if (!isUseful && exists) {
              nextTasks = nextTasks.filter((id) => id !== taskId)
            }

            return {
              ...item,
              classified: isUseful ? true : item.classified,
              usefulFor: {
                ...item.usefulFor,
                standaloneTasks: nextTasks,
              },
            }
          })

          set({ items })
          await persistItems(items, userId)
        }
      } catch (err) {
        console.error('[registry-store] classifyRegistryForTask failed', err)
      }
    },

    async classifyRegistryForObjective(objectiveName, objectiveDescription, objectiveId) {
      const userId = storageUserIdFromState(get())
      const syncedItems = get().items
      const apps = syncedItems.filter((i) => i.kind === 'app' || i.kind === 'site')
      if (apps.length === 0) return

      const currentUsefulIds = syncedItems
        .filter((i) => i.usefulFor.objectives.includes(objectiveId))
        .map((i) => i.identifier)

      try {
        const coachResult = await vethos.coach.classifyAppsForObjective({
          objectiveName,
          objectiveDescription,
          apps: apps.map((a) => ({ identifier: a.identifier, displayName: a.displayName })),
          currentUsefulApps: currentUsefulIds,
        })

        const mapping = 'data' in coachResult ? coachResult.data : coachResult as unknown as Record<string, 'useful' | 'distraction' | 'neutral'>
        if (!('decision' in coachResult) || coachResult.decision === 'use_result') {
          const items = get().items.map((item) => {
            const role = mapping[item.identifier.toLowerCase()]
            const isUseful = role === 'useful'
            const currentObjectives = item.usefulFor.objectives || []
            const exists = currentObjectives.includes(objectiveId)

            let nextObjectives = [...currentObjectives]
            if (isUseful && !exists) {
              nextObjectives.push(objectiveId)
            } else if (!isUseful && exists) {
              nextObjectives = nextObjectives.filter((id) => id !== objectiveId)
            }

            return {
              ...item,
              classified: isUseful ? true : item.classified,
              usefulFor: {
                ...item.usefulFor,
                objectives: nextObjectives,
              },
            }
          })

          set({ items })
          await persistItems(items, userId)
        }
      } catch (err) {
        console.error('[registry-store] classifyRegistryForObjective failed', err)
      }
    },
  }
})
