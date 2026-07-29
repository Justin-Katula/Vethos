# Plan B — Noyau logique du blocage

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construire toute la logique de décision du blocage — quand une session est active, quelles applications sont bloquées, laquelle est préexistante, combien de temps dure un déblocage, et si une justification est valable — en TypeScript pur, entièrement testable sans exécuter le sidecar natif.

**Architecture:** Quatre modules purs sans effet de bord, alimentés plus tard par le contrôleur. Chacun est une fonction de son entrée : aucun accès disque, aucun accès réseau sauf `deepseek.ts` dont le `fetch` est injectable. Le reste du Point 1 s'assemble autour d'eux.

**Tech Stack:** TypeScript strict, vitest.

**Spec de référence :** `docs/superpowers/specs/2026-07-28-vethos-blocking-design.md` — §7.1, §7.5, §8.4.

## Contexte d'exécution — à lire avant de commencer

**Smart App Control bloque le binaire natif non signé** sur la machine cible. Conséquences absolues pour ce plan :

- Ne jamais lancer `resources/sidecar/vethos-probe.exe` ni `native/vethos-probe/obj/test_json.exe`.
- Ne jamais lancer `npm run test:sidecar` (il exécute `test_json.exe`).
- Ne jamais lancer `scripts/sidecar-smoke.mjs` ni `scripts/sidecar-deathwatch-smoke.mjs`.
- `npm run build:sidecar` (compilation seule) reste autorisé mais n'est pas nécessaire ici.

Aucune tâche de ce plan n'a besoin du binaire : tout est du TypeScript pur.

## Global Constraints

- Modules **purs** : pas d'`import` d'Electron, pas d'accès disque, pas de minuterie. Le temps entre toujours en paramètre (`now`), jamais lu depuis `Date.now()` à l'intérieur.
- TypeScript strict avec `noUncheckedIndexedAccess: true` : tout accès indexé rend `T | undefined` et doit être gardé.
- Les valeurs `FILETIME` (`processCreatedAt`) sont des **chaînes décimales 64 bits**. Toute comparaison passe par `BigInt` — `Number()` perd de la précision au-delà de 2^53 et donnerait un verdict « préexistante » faux.
- Un déblocage ne se cumule ni ne se prolonge : l'échéance est **toujours** `now + durée`, jamais `échéancePrécédente + durée`.
- Durée de déblocage : **600 000 ms en production, 30 000 ms en développement**. Jamais d'autre valeur.
- L'IA refuse par défaut : toute erreur réseau, clé absente, réponse illisible ou HTTP non-OK produit `valid: false`. On ne débloque jamais par accident.
- Rien dans ce plan ne référence tâches, objectifs ou score de priorité.
- Commentaires et chaînes destinées à l'utilisateur en français.
- Un fichier de test voisin par module.

## Arborescence produite

```
src/main/blocking/
  unlock.ts        durée et échéance des déblocages temporaires   (pur)
  unlock.test.ts
  schedule.ts      quelle session devrait être active maintenant  (pur)
  schedule.test.ts
  session.ts       machine à états par application détectée       (pur)
  session.test.ts
  deepseek.ts      jugement IA de la justification (restauré)
  deepseek.test.ts
```

---

### Task 1 : Déblocages temporaires

Le module le plus petit et le plus contraint. Il porte à lui seul deux critères d'acceptation de la spec : la durée ne dépasse jamais 10 minutes, et un déblocage ne se renouvelle jamais tout seul.

**Files:**
- Create: `src/main/blocking/unlock.ts`
- Create: `src/main/blocking/unlock.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces:
  ```ts
  export const UNLOCK_MS_PROD: 600_000
  export const UNLOCK_MS_DEV: 30_000
  export type Unlock = { appId: string; until: number }
  export function unlockDurationMs(isPackaged: boolean): number
  export function grantUnlock(appId: string, now: number, isPackaged: boolean): Unlock
  export function isUnlocked(unlock: Unlock | undefined, now: number): boolean
  export function pruneExpired(unlocks: readonly Unlock[], now: number): Unlock[]
  ```
  Consommé par `session.ts` (Task 3) et par le contrôleur plus tard.

- [ ] **Step 1 : Écrire le test**

Créer `src/main/blocking/unlock.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import {
  grantUnlock,
  isUnlocked,
  pruneExpired,
  unlockDurationMs,
  UNLOCK_MS_DEV,
  UNLOCK_MS_PROD,
  type Unlock,
} from './unlock'

describe('unlockDurationMs', () => {
  it('vaut exactement 10 minutes en production', () => {
    expect(UNLOCK_MS_PROD).toBe(600_000)
    expect(unlockDurationMs(true)).toBe(600_000)
  })

  it('vaut exactement 30 secondes en développement', () => {
    expect(UNLOCK_MS_DEV).toBe(30_000)
    expect(unlockDurationMs(false)).toBe(30_000)
  })
})

describe('grantUnlock', () => {
  it("fixe l'échéance à maintenant plus la durée", () => {
    expect(grantUnlock('blender.exe', 1_000_000, true)).toEqual({
      appId: 'blender.exe',
      until: 1_600_000,
    })
  })

  it('utilise la durée courte en développement', () => {
    expect(grantUnlock('blender.exe', 1_000_000, false).until).toBe(1_030_000)
  })

  it("ne cumule jamais : un second octroi repart de maintenant, pas de l'échéance précédente", () => {
    // Le piege que la spec interdit explicitement. Si l'implementation faisait
    // `precedent.until + duree`, on obtiendrait 2_200_000 et l'utilisateur
    // pourrait prolonger indefiniment en re-soumettant.
    const premier = grantUnlock('blender.exe', 1_000_000, true)
    expect(premier.until).toBe(1_600_000)
    const second = grantUnlock('blender.exe', 1_100_000, true)
    expect(second.until).toBe(1_700_000)
    expect(second.until - 1_100_000).toBe(UNLOCK_MS_PROD)
  })

  it('ne dépasse jamais 10 minutes, quel que soit le moment', () => {
    for (const now of [0, 1, 999_999_999, Date.now()]) {
      const unlock = grantUnlock('x.exe', now, true)
      expect(unlock.until - now).toBe(UNLOCK_MS_PROD)
      expect(unlock.until - now).toBeLessThanOrEqual(600_000)
    }
  })
})

describe('isUnlocked', () => {
  const unlock: Unlock = { appId: 'blender.exe', until: 1_600_000 }

  it('est vrai avant échéance', () => {
    expect(isUnlocked(unlock, 1_599_999)).toBe(true)
  })

  it("est faux à l'échéance exacte — reblocage immédiat, pas de tolérance", () => {
    expect(isUnlocked(unlock, 1_600_000)).toBe(false)
  })

  it('est faux après échéance', () => {
    expect(isUnlocked(unlock, 1_600_001)).toBe(false)
  })

  it('est faux quand aucun déblocage n’existe', () => {
    expect(isUnlocked(undefined, 0)).toBe(false)
  })
})

describe('pruneExpired', () => {
  it('ne garde que les déblocages encore actifs', () => {
    const unlocks: Unlock[] = [
      { appId: 'a.exe', until: 500 },
      { appId: 'b.exe', until: 1_500 },
      { appId: 'c.exe', until: 1_000 },
    ]
    expect(pruneExpired(unlocks, 1_000).map((u) => u.appId)).toEqual(['b.exe'])
  })

  it('ne modifie pas le tableau reçu', () => {
    const unlocks: Unlock[] = [{ appId: 'a.exe', until: 500 }]
    pruneExpired(unlocks, 1_000)
    expect(unlocks).toHaveLength(1)
  })

  it('gère une liste vide', () => {
    expect(pruneExpired([], 1_000)).toEqual([])
  })
})
```

- [ ] **Step 2 : Lancer le test pour vérifier qu'il échoue**

```bash
npx vitest run src/main/blocking/unlock.test.ts
```

Attendu : ÉCHEC — `Failed to resolve import "./unlock"`.

- [ ] **Step 3 : Implémenter**

Créer `src/main/blocking/unlock.ts`. Écrire l'implémentation minimale qui satisfait les tests ci-dessus. Contraintes que le code doit respecter :

- `UNLOCK_MS_PROD` et `UNLOCK_MS_DEV` sont exportés comme constantes littérales.
- `grantUnlock` calcule **toujours** `now + unlockDurationMs(isPackaged)`. Il ne reçoit pas et ne consulte pas de déblocage antérieur — c'est structurellement ce qui empêche le cumul.
- `isUnlocked` utilise une comparaison stricte `now < unlock.until` pour que l'échéance exacte reble.
- `pruneExpired` renvoie un nouveau tableau via `filter`, sans muter l'entrée.
- Un commentaire d'en-tête en français explique pourquoi le non-cumul est structurel et non défendu par une garde.

- [ ] **Step 4 : Lancer le test pour vérifier qu'il passe**

```bash
npx vitest run src/main/blocking/unlock.test.ts
```

Attendu : `Tests 13 passed`.

- [ ] **Step 5 : Commit**

```bash
git add src/main/blocking/unlock.ts src/main/blocking/unlock.test.ts
git commit -m "feat(blocking): deblocages temporaires — 10 min en prod, 30 s en dev, jamais cumulables"
```

---

### Task 2 : Planification des sessions

Répond à la seule question dont dépend tout le reste : *selon les règles, une session devrait-elle être active maintenant ?* C'est la couture décrite au §3.3 de la spec — le futur moteur de planification se branchera derrière cette même signature.

**Files:**
- Create: `src/main/blocking/schedule.ts`
- Create: `src/main/blocking/schedule.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces:
  ```ts
  export type RecurringSlot = {
    id: string
    label: string
    daysOfWeek: number[]   // 0 = dimanche … 6 = samedi
    startMinute: number    // minutes depuis minuit, 0..1439
    endMinute: number      // si <= startMinute, le créneau franchit minuit
    appIds: string[]
  }
  export type ManualSession = { startedAt: number; endsAt: number; appIds: string[] }
  export type BlockingRules = { slots: RecurringSlot[]; manual: ManualSession | null }
  export type ActiveSession = { blockedAppIds: string[]; endsAt: number }
  export function minutesSinceMidnight(now: Date): number
  export function slotIsActiveAt(slot: RecurringSlot, now: Date): boolean
  export function activeSessionAt(rules: BlockingRules, now: Date): ActiveSession | null
  ```
  Consommé par le contrôleur et par `session.ts`.

- [ ] **Step 1 : Écrire le test**

Créer `src/main/blocking/schedule.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import {
  activeSessionAt,
  minutesSinceMidnight,
  slotIsActiveAt,
  type BlockingRules,
  type RecurringSlot,
} from './schedule'

function makeSlot(overrides: Partial<RecurringSlot> = {}): RecurringSlot {
  return {
    id: 's1',
    label: 'Matin',
    daysOfWeek: [1, 2, 3, 4, 5],
    startMinute: 9 * 60,
    endMinute: 12 * 60,
    appIds: ['blender.exe'],
    ...overrides,
  }
}

// 2026-07-29 est un mercredi (jour 3).
const mercredi = (h: number, m = 0): Date => new Date(2026, 6, 29, h, m, 0, 0)
const dimanche = (h: number, m = 0): Date => new Date(2026, 7, 2, h, m, 0, 0)

describe('minutesSinceMidnight', () => {
  it('compte les minutes depuis minuit', () => {
    expect(minutesSinceMidnight(mercredi(0, 0))).toBe(0)
    expect(minutesSinceMidnight(mercredi(9, 30))).toBe(570)
    expect(minutesSinceMidnight(mercredi(23, 59))).toBe(1439)
  })
})

describe('slotIsActiveAt', () => {
  it('est actif pendant le créneau, un jour concerné', () => {
    expect(slotIsActiveAt(makeSlot(), mercredi(10))).toBe(true)
  })

  it('est actif à la minute de début', () => {
    expect(slotIsActiveAt(makeSlot(), mercredi(9, 0))).toBe(true)
  })

  it("n'est plus actif à la minute de fin — bornes semi-ouvertes", () => {
    expect(slotIsActiveAt(makeSlot(), mercredi(12, 0))).toBe(false)
  })

  it('est inactif avant le créneau', () => {
    expect(slotIsActiveAt(makeSlot(), mercredi(8, 59))).toBe(false)
  })

  it('est inactif un jour non concerné', () => {
    expect(slotIsActiveAt(makeSlot(), dimanche(10))).toBe(false)
  })

  it('gère un créneau qui franchit minuit — soirée', () => {
    // 22h00 -> 02h00 : actif mercredi soir ET aux petites heures.
    const nuit = makeSlot({ startMinute: 22 * 60, endMinute: 2 * 60, daysOfWeek: [3] })
    expect(slotIsActiveAt(nuit, mercredi(23, 0))).toBe(true)
    expect(slotIsActiveAt(nuit, mercredi(1, 0))).toBe(true)
    expect(slotIsActiveAt(nuit, mercredi(12, 0))).toBe(false)
  })

  it('gère un créneau sans jour — jamais actif', () => {
    expect(slotIsActiveAt(makeSlot({ daysOfWeek: [] }), mercredi(10))).toBe(false)
  })
})

describe('activeSessionAt', () => {
  it('renvoie null quand aucune règle ne s’applique', () => {
    const rules: BlockingRules = { slots: [makeSlot()], manual: null }
    expect(activeSessionAt(rules, mercredi(15))).toBeNull()
  })

  it('renvoie null sans aucune règle', () => {
    expect(activeSessionAt({ slots: [], manual: null }, mercredi(10))).toBeNull()
  })

  it('renvoie la session du créneau actif', () => {
    const rules: BlockingRules = { slots: [makeSlot()], manual: null }
    const session = activeSessionAt(rules, mercredi(10))
    expect(session?.blockedAppIds).toEqual(['blender.exe'])
    expect(session?.endsAt).toBe(mercredi(12, 0).getTime())
  })

  it('renvoie la session manuelle en cours', () => {
    const rules: BlockingRules = {
      slots: [],
      manual: {
        startedAt: mercredi(14).getTime(),
        endsAt: mercredi(16).getTime(),
        appIds: ['chrome.exe'],
      },
    }
    const session = activeSessionAt(rules, mercredi(15))
    expect(session?.blockedAppIds).toEqual(['chrome.exe'])
    expect(session?.endsAt).toBe(mercredi(16).getTime())
  })

  it('ignore une session manuelle expirée', () => {
    const rules: BlockingRules = {
      slots: [],
      manual: {
        startedAt: mercredi(14).getTime(),
        endsAt: mercredi(16).getTime(),
        appIds: ['chrome.exe'],
      },
    }
    expect(activeSessionAt(rules, mercredi(17))).toBeNull()
  })

  it('ignore une session manuelle pas encore commencée', () => {
    const rules: BlockingRules = {
      slots: [],
      manual: {
        startedAt: mercredi(14).getTime(),
        endsAt: mercredi(16).getTime(),
        appIds: ['chrome.exe'],
      },
    }
    expect(activeSessionAt(rules, mercredi(13))).toBeNull()
  })

  it('fusionne créneau et session manuelle — union des apps, échéance la plus lointaine', () => {
    const rules: BlockingRules = {
      slots: [makeSlot()],
      manual: {
        startedAt: mercredi(9).getTime(),
        endsAt: mercredi(14).getTime(),
        appIds: ['chrome.exe'],
      },
    }
    const session = activeSessionAt(rules, mercredi(10))
    expect(session?.blockedAppIds.sort()).toEqual(['blender.exe', 'chrome.exe'])
    expect(session?.endsAt).toBe(mercredi(14).getTime())
  })

  it('dédoublonne une application présente dans les deux sources', () => {
    const rules: BlockingRules = {
      slots: [makeSlot()],
      manual: {
        startedAt: mercredi(9).getTime(),
        endsAt: mercredi(11).getTime(),
        appIds: ['blender.exe'],
      },
    }
    expect(activeSessionAt(rules, mercredi(10))?.blockedAppIds).toEqual(['blender.exe'])
  })

  it('fusionne plusieurs créneaux actifs simultanément', () => {
    const rules: BlockingRules = {
      slots: [
        makeSlot({ id: 's1', appIds: ['blender.exe'] }),
        makeSlot({ id: 's2', appIds: ['discord.exe'], endMinute: 11 * 60 }),
      ],
      manual: null,
    }
    const session = activeSessionAt(rules, mercredi(10))
    expect(session?.blockedAppIds.sort()).toEqual(['blender.exe', 'discord.exe'])
    // L'echeance retenue est la plus lointaine : la session ne se termine que
    // quand plus aucune regle ne s'applique.
    expect(session?.endsAt).toBe(mercredi(12).getTime())
  })
})
```

- [ ] **Step 2 : Lancer le test pour vérifier qu'il échoue**

```bash
npx vitest run src/main/blocking/schedule.test.ts
```

Attendu : ÉCHEC — `Failed to resolve import "./schedule"`.

- [ ] **Step 3 : Implémenter**

Créer `src/main/blocking/schedule.ts`. Points que l'implémentation doit respecter :

- Bornes **semi-ouvertes** `[startMinute, endMinute)` : la minute de fin n'est plus active.
- Franchissement de minuit : quand `endMinute <= startMinute`, le créneau est actif si `minute >= startMinute` **ou** `minute < endMinute`. Le jour de la semaine est évalué sur `now`, pas sur le jour de début.
- `activeSessionAt` collecte tous les créneaux actifs plus la session manuelle si `startedAt <= now < endsAt`, fait l'**union dédoublonnée** des `appIds`, et retient l'échéance **la plus lointaine**. Renvoie `null` si aucune source n'est active.
- L'échéance d'un créneau se calcule comme un horodatage absolu sur la date de `now` — attention au créneau franchissant minuit, dont la fin tombe le lendemain.
- Un commentaire d'en-tête en français rappelle que cette signature est la couture prévue pour le futur moteur de planification.

- [ ] **Step 4 : Lancer le test pour vérifier qu'il passe**

```bash
npx vitest run src/main/blocking/schedule.test.ts
```

Attendu : `Tests 18 passed`.

- [ ] **Step 5 : Commit**

```bash
git add src/main/blocking/schedule.ts src/main/blocking/schedule.test.ts
git commit -m "feat(blocking): planification — creneaux recurrents et session manuelle fusionnes"
```

---

### Task 3 : Machine à états par application

Porte la donnée critique du §7.1 : une application était-elle **déjà lancée avant** le début de la session, ou lancée **pendant** ? Ce fait conditionne l'avertissement de sauvegarde du bouton Fermer, et la spec exige qu'il soit établi à la détection, jamais reconstitué après coup.

**Files:**
- Create: `src/main/blocking/session.ts`
- Create: `src/main/blocking/session.test.ts`

**Interfaces:**
- Consumes: `Unlock`, `isUnlocked` de `./unlock` (Task 1).
- Produces:
  ```ts
  export type DetectedApp = {
    appId: string
    hwnd: string
    pid: number
    processCreatedAt: string   // FILETIME décimal
    preexisting: boolean
  }
  export type AppState =
    | { kind: 'blocked' }
    | { kind: 'unlocked'; until: number }
    | { kind: 'minimized' }
  export function isPreexisting(processCreatedAt: string, sessionStartedAtFileTime: string): boolean
  export function classifyDetection(args: {
    appId: string; hwnd: string; pid: number; processCreatedAt: string; sessionStartedAtFileTime: string
  }): DetectedApp
  export function deriveAppState(args: {
    app: DetectedApp; unlock: Unlock | undefined; minimized: boolean; now: number
  }): AppState
  export function needsSaveWarning(app: DetectedApp): boolean
  ```

- [ ] **Step 1 : Écrire le test**

Créer `src/main/blocking/session.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import {
  classifyDetection,
  deriveAppState,
  isPreexisting,
  needsSaveWarning,
  type DetectedApp,
} from './session'
import type { Unlock } from './unlock'

// FILETIME plausibles : ~1,33e17. Au-dela de Number.MAX_SAFE_INTEGER (9,007e15),
// donc toute comparaison doit passer par BigInt.
const AVANT = '133700000000000000'
const DEBUT = '133700000000005000'
const APRES = '133700000000009000'

function makeApp(overrides: Partial<DetectedApp> = {}): DetectedApp {
  return {
    appId: 'blender.exe',
    hwnd: '1000',
    pid: 42,
    processCreatedAt: AVANT,
    preexisting: true,
    ...overrides,
  }
}

describe('isPreexisting', () => {
  it('est vrai quand le processus a démarré avant la session', () => {
    expect(isPreexisting(AVANT, DEBUT)).toBe(true)
  })

  it('est faux quand le processus a démarré après le début de la session', () => {
    expect(isPreexisting(APRES, DEBUT)).toBe(false)
  })

  it("est faux quand le processus démarre exactement au début — on ne l'a pas eu avant", () => {
    expect(isPreexisting(DEBUT, DEBUT)).toBe(false)
  })

  it('ne perd pas de précision sur des FILETIME 64 bits', () => {
    // Ces deux valeurs ne different que d'une unite. Converties en Number
    // elles seraient EGALES (au-dela de 2^53), et le verdict serait faux.
    const a = '133700000000000001'
    const b = '133700000000000002'
    expect(Number(a) === Number(b)).toBe(true) // le piege, demontre
    expect(isPreexisting(a, b)).toBe(true)
    expect(isPreexisting(b, a)).toBe(false)
  })

  it('traite un processCreatedAt inconnu ("0") comme non préexistant', () => {
    // "0" est ce que le sidecar emet quand OpenProcess echoue. On ne peut
    // rien affirmer, donc on ne promet pas d'avertissement de sauvegarde.
    expect(isPreexisting('0', DEBUT)).toBe(false)
  })
})

describe('classifyDetection', () => {
  it('marque préexistante une application lancée avant la session', () => {
    const app = classifyDetection({
      appId: 'blender.exe',
      hwnd: '1000',
      pid: 42,
      processCreatedAt: AVANT,
      sessionStartedAtFileTime: DEBUT,
    })
    expect(app.preexisting).toBe(true)
    expect(app.appId).toBe('blender.exe')
  })

  it('marque nouvelle une application lancée pendant la session', () => {
    const app = classifyDetection({
      appId: 'chrome.exe',
      hwnd: '2000',
      pid: 43,
      processCreatedAt: APRES,
      sessionStartedAtFileTime: DEBUT,
    })
    expect(app.preexisting).toBe(false)
  })

  it('classe plusieurs applications en parallèle, chacune avec son propre statut', () => {
    const apps = [
      { appId: 'blender.exe', hwnd: '1', pid: 1, processCreatedAt: AVANT },
      { appId: 'chrome.exe', hwnd: '2', pid: 2, processCreatedAt: APRES },
      { appId: 'discord.exe', hwnd: '3', pid: 3, processCreatedAt: AVANT },
    ].map((a) => classifyDetection({ ...a, sessionStartedAtFileTime: DEBUT }))
    expect(apps.map((a) => a.preexisting)).toEqual([true, false, true])
  })
})

describe('deriveAppState', () => {
  const app = makeApp()

  it('est bloquée par défaut', () => {
    expect(deriveAppState({ app, unlock: undefined, minimized: false, now: 0 })).toEqual({
      kind: 'blocked',
    })
  })

  it('est débloquée pendant la validité du déblocage', () => {
    const unlock: Unlock = { appId: 'blender.exe', until: 1_000 }
    expect(deriveAppState({ app, unlock, minimized: false, now: 500 })).toEqual({
      kind: 'unlocked',
      until: 1_000,
    })
  })

  it('reble automatiquement à expiration — pas de prolongation silencieuse', () => {
    const unlock: Unlock = { appId: 'blender.exe', until: 1_000 }
    expect(deriveAppState({ app, unlock, minimized: false, now: 1_000 })).toEqual({
      kind: 'blocked',
    })
  })

  it('est minimisée quand elle est minimisée et toujours bloquée', () => {
    expect(deriveAppState({ app, unlock: undefined, minimized: true, now: 0 })).toEqual({
      kind: 'minimized',
    })
  })

  it('le déblocage prime sur la minimisation — une app débloquée redevient utilisable', () => {
    const unlock: Unlock = { appId: 'blender.exe', until: 1_000 }
    expect(deriveAppState({ app, unlock, minimized: true, now: 500 })).toEqual({
      kind: 'unlocked',
      until: 1_000,
    })
  })
})

describe('needsSaveWarning', () => {
  it('avertit pour une application préexistante — du travail peut être en cours', () => {
    expect(needsSaveWarning(makeApp({ preexisting: true }))).toBe(true)
  })

  it("n'avertit pas pour une application lancée pendant la session", () => {
    // L'utilisateur ne l'a jamais vue ni utilisee : il n'y a rien a perdre.
    expect(needsSaveWarning(makeApp({ preexisting: false }))).toBe(false)
  })
})
```

- [ ] **Step 2 : Lancer le test pour vérifier qu'il échoue**

```bash
npx vitest run src/main/blocking/session.test.ts
```

Attendu : ÉCHEC — `Failed to resolve import "./session"`.

- [ ] **Step 3 : Implémenter**

Créer `src/main/blocking/session.ts`. Points que l'implémentation doit respecter :

- `isPreexisting` compare via `BigInt`, jamais via `Number`. Un `processCreatedAt` égal à `'0'`, vide, ou non numérique renvoie `false` — on ne peut rien affirmer, donc on ne promet pas d'avertissement.
- L'ordre de priorité dans `deriveAppState` est : déblocage actif → `unlocked` ; sinon minimisé → `minimized` ; sinon `blocked`. Le déblocage prime, sinon une application débloquée resterait masquée.
- `needsSaveWarning` est exactement `app.preexisting`. Il existe comme fonction nommée pour que l'intention soit lisible au point d'appel et testée pour elle-même.
- Un commentaire d'en-tête en français explique pourquoi le statut préexistant est figé à la détection.

- [ ] **Step 4 : Lancer le test pour vérifier qu'il passe**

```bash
npx vitest run src/main/blocking/session.test.ts
```

Attendu : `Tests 15 passed`.

- [ ] **Step 5 : Commit**

```bash
git add src/main/blocking/session.ts src/main/blocking/session.test.ts
git commit -m "feat(blocking): machine a etats par application, statut preexistant fige a la detection"
```

---

### Task 4 : Jugement IA de la justification

**Infrastructure réutilisée, pas recréée.** La spec impose de localiser l'accès IA existant plutôt que d'en construire un nouveau. Il a été supprimé de `HEAD` avec le reste du blocage au commit `33c5d0c`, mais il est intact dans l'historique et c'est lui qu'on restaure :

- `git show d83994d:src/main/blocking/deepseek.ts` — 203 lignes
- `git show d83994d:src/main/blocking/deepseek.test.ts` — 156 lignes, 8 cas

La clé `DEEPSEEK_API_KEY` est toujours présente dans `.env`. C'est la seule clé d'API IA du dépôt.

**Files:**
- Create: `src/main/blocking/deepseek.ts` (restauré depuis git)
- Create: `src/main/blocking/deepseek.test.ts` (restauré depuis git)

**Interfaces:**
- Consumes: `log` de `@main/logging/setup`, le `fetch` global de Node.
- Produces:
  ```ts
  export type JustificationVerdict = { valid: boolean; reason: string }
  export type JudgeContext = { appName?: string }
  export function judgeJustification(text: string, context?: JudgeContext): Promise<JustificationVerdict>
  ```

- [ ] **Step 1 : Restaurer les deux fichiers depuis l'historique**

```bash
git show d83994d:src/main/blocking/deepseek.ts > src/main/blocking/deepseek.ts
git show d83994d:src/main/blocking/deepseek.test.ts > src/main/blocking/deepseek.test.ts
```

- [ ] **Step 2 : Lancer les tests restaurés**

```bash
npx vitest run src/main/blocking/deepseek.test.ts
```

Attendu : `Tests 8 passed`. Ces tests simulent `fetch` — **aucun appel réseau réel n'est effectué**.

Si un test échoue, ne pas le modifier pour le faire passer : c'est une divergence réelle entre le code restauré et l'environnement actuel. La diagnostiquer et la rapporter.

- [ ] **Step 3 : Vérifier que le refus par défaut tient**

Relire `deepseek.ts` et confirmer que **chacun** de ces chemins renvoie `valid: false` :

- clé d'API absente,
- justification de moins de 5 caractères,
- réponse HTTP non-OK,
- corps de réponse impossible à parser,
- délai de 15 s dépassé (`AbortError`),
- erreur réseau.

Si un seul de ces chemins peut renvoyer `valid: true`, c'est un défaut à corriger et à signaler : la spec exige qu'on ne débloque jamais par accident.

- [ ] **Step 4 : Vérifier la suite complète et le typecheck**

```bash
npx vitest run && npm run typecheck:node
```

- [ ] **Step 5 : Commit**

```bash
git add src/main/blocking/deepseek.ts src/main/blocking/deepseek.test.ts
git commit -m "feat(blocking): restaure le client DeepSeek pour le jugement des justifications"
```

---

## Ce que ce plan livre

Toute la logique de décision du blocage, testée sans dépendre du binaire natif :

- la durée d'un déblocage, structurellement non cumulable ;
- la réponse à « une session devrait-elle être active maintenant ? », avec créneaux récurrents et session manuelle ;
- le statut préexistant/nouveau figé à la détection, comparé en `BigInt` pour ne pas se tromper sur des FILETIME 64 bits ;
- le jugement IA de la justification, qui refuse par défaut.

## Ce que ce plan ne livre pas

- Le câblage de ces modules dans un contrôleur — il viendra avec la partie native.
- L'overlay, le masquage de barre des tâches, l'audio, les boutons — natifs, différés jusqu'à la signature du binaire.
- La zone de notification, le lancement au démarrage et l'horloge de réconciliation — dépendent d'Electron, pas testables en pur.
