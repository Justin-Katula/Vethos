# Vethos — Sous-projet 4 : Niveaux + distribution du temps libre

**Date :** 2026-05-05
**Sous-projet :** 4 / 6
**Dépend de :** sous-projets 1, 2, 3 ✅

## 1. Objectif

Transformer le travail concentré en **progression mesurable** et **temps libre mérité**.

Chaque session de blocage complétée crédite (a) un **objectif** rattaché à la règle (gain d'XP, niveau 1→10) et (b) une **banque de temps libre** que l'utilisateur peut dépenser explicitement quand il « consomme » du loisir.

## 2. Principes

- **Le travail = l'XP.** Pas d'XP sans session de blocage qui se termine normalement.
- **Le temps libre est mérité, pas donné.** La banque commence à 0 et ne se remplit qu'avec des sessions complétées.
- **Idempotence des crédits.** Une même session ne peut jamais créditer deux fois — on stocke un curseur du dernier `sessionId` traité.
- **Conversion fixe.** 1 min de focus complétée = 1 min d'XP + 0.5 min de temps libre. (Ratio paramétrable plus tard.)
- **Niveaux fixes 1→10.** Seuils en minutes cumulées, croissance super-linéaire.
- **Visuel 11/10.** Niveau = anneau de progression coloré + chiffre central. Banque = compteur grand format avec mini-graphe heatmap des 7 derniers jours.

## 3. Architecture

### 3.1 Modèles (`src/shared/schemas.ts`)

```ts
export const ObjectiveSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(60),
  description: z.string().max(500).optional(),
  color: z.string().regex(HEX_COLOR_REGEX),
  icon: z.string().min(1).max(40).optional(),
  linkedRuleIds: z.array(z.string().uuid()),
  xpMinutes: z.number().int().min(0),
  createdAt: z.string().datetime(),
})

export const FreeTimeEntrySchema = z.object({
  id: z.string().uuid(),
  at: z.string().datetime(),
  deltaMinutes: z.number().int(),     // > 0 = crédit, < 0 = débit
  reason: z.string().max(200),
})

export const FreeTimeBankSchema = z.object({
  balanceMinutes: z.number().int().min(0),
  entries: z.array(FreeTimeEntrySchema).max(500),
})

export const LevelsStateSchema = z.object({
  objectives: z.array(ObjectiveSchema),
  freeTime: FreeTimeBankSchema,
  /** ID de la dernière session de blocage déjà créditée. Garantit l'idempotence. */
  lastProcessedSessionId: z.string().uuid().nullable(),
})
```

`STORAGE_KEYS` étendu à `'levels'`.

### 3.2 Système de niveaux (pur)

`src/renderer/src/lib/levels.ts` :

```ts
export const LEVEL_THRESHOLDS_MIN = [
  0, 600, 1500, 3000, 5000, 8000, 12000, 18000, 26000, 36000, 50000,
] // 11 valeurs : index = niveau (1..10) → seuil minimum, [10] = +∞ effectif

export type LevelInfo = {
  level: number               // 1..10
  currentLevelStart: number   // minutes au début du niveau
  nextLevelStart: number      // minutes au début du niveau suivant (cap à 50000 si max)
  progress: number            // 0..1 vers le niveau suivant ; 1 si niveau 10
  isMax: boolean
}

export function getLevelInfo(xpMinutes: number): LevelInfo
```

### 3.3 Crédit des sessions (pur)

`src/renderer/src/lib/credit-engine.ts` :

```ts
export type CreditInputs = {
  history: BlockingHistoryEntry[]      // tri ASC par endedAt
  rules: TimeRule[]
  objectives: Objective[]
  lastProcessedSessionId: string | null
  freeTimeRatio?: number               // défaut 0.5
}

export type CreditOutputs = {
  objectiveDeltas: Map<string, number>   // objId → +xpMinutes
  freeTimeDelta: number                  // total à ajouter
  freeTimeEntries: FreeTimeEntry[]       // log
  newCursorSessionId: string | null      // dernier sessionId traité
}

export function computeCredits(inputs: CreditInputs): CreditOutputs
```

Règles précises :
- On ignore toute entrée avec `completedNormally === false`.
- On résout : session.profileId → règles avec `linkedProfileId === profileId` → objectifs avec ce ruleId dans `linkedRuleIds`.
- Si plusieurs objectifs matchent le même profil, le crédit XP est **réparti à parts égales** (chaque objectif reçoit `duration / N`).
- La banque reçoit `duration * 0.5` (une seule fois par session, pas multipliée par N).
- `newCursorSessionId` = sessionId de la dernière entrée historique consommée (même si sans match, pour avancer le curseur et éviter de la rescanner).

### 3.4 Store renderer (`useLevelsStore`)

```ts
type LevelsStore = {
  loaded: boolean
  objectives: Objective[]
  freeTime: FreeTimeBank
  lastProcessedSessionId: string | null

  load: () => Promise<void>
  saveObjective: (draft: Partial<Objective> & { name: string; color: string }) => Promise<Objective>
  deleteObjective: (id: string) => Promise<void>
  spendFreeTime: (minutes: number, reason: string) => Promise<void>      // débit
  /** Réconcilie le store avec le BlockingState.history actuel (idempotent). */
  reconcileWithHistory: (history: BlockingHistoryEntry[], rules: TimeRule[]) => Promise<void>
}
```

Persistance via storage générique sous `vethos_levels.json`.

### 3.5 Auto-réconciliation

Dans `BlockingPage` ou `App` au montage : abonnement à `BlockingState.history` (via `useBlockingStore`). À chaque changement, appeler `reconcileWithHistory`. Le moteur étant idempotent, un appel inutile n'a aucun effet.

## 4. Composants UI

### 4.1 `LevelRing` (atom)

Anneau SVG 64–128px : track gris + arc coloré (progress 0–1) + chiffre central (niveau 1–10). Étoile dorée si niveau 10.

### 4.2 `ObjectiveCard`

Card cliquable :
- En-tête : couleur barre + icône + nom + niveau (LevelRing 56px à droite).
- Sous-titre : description tronquée.
- Footer : "X min cette semaine" (calculé depuis history × ruleIds liés).

### 4.3 `ObjectiveEditor` (slide-in)

Pattern identique aux autres éditeurs :
- name, description (textarea), color (palette), icon (grille).
- Multi-select `linkedRuleIds` (chips cochables des `TimeRule` existants).
- Save / Cancel / Delete (avec confirm).

### 4.4 `FreeTimeWidget` (HomePage, à droite du cercle 24h)

- Grand compteur `02h45` avec animation au crédit.
- Sous-ligne : `+25 min cette semaine`.
- Mini-heatmap 7 jours : barres verticales colorées d'intensité proportionnelle au crédit du jour.
- Bouton "Dépenser…" → ouvre `SpendDialog`.

### 4.5 `SpendDialog`

Modal léger :
- Choix rapide : 15 min / 30 min / 1h / 2h / Custom (input).
- Champ raison (préfixé "Pause", "Loisir", libre).
- Refus si `balance < requested`.

### 4.6 Page `ObjectivesPage`

- Header titre + bouton "Nouvel objectif".
- Grille de `ObjectiveCard` (1/2/3 colonnes responsive).
- Empty state : message + CTA "Créer mon premier objectif".

### 4.7 Intégration `HomePage`

Le `FreeTimeWidget` remplace ou se positionne à côté de la liste "Programme du jour". On passe en layout 3 colonnes : cercle 24h | programme du jour | free time.

Sur petites largeurs : empilement vertical.

## 5. Tests Vitest

Modules purs :

`src/renderer/src/lib/levels.test.ts`
- xp = 0 → level 1, progress 0
- xp = 599 → level 1, progress ≈ 1
- xp = 600 → level 2, progress 0
- xp = 50000 → level 10, isMax true, progress 1
- xp = 100000 → idem (clamping)
- xp = 9000 → level 6 (8000..12000), progress 0.25

`src/renderer/src/lib/credit-engine.test.ts`
- pas d'entrée → tout vide, cursor null
- entrée non terminée normalement → ignorée mais cursor avance
- session liée à 1 objectif → +duration XP + duration*0.5 free time
- session liée à 2 objectifs → duration/2 XP chacun + duration*0.5 free time (UNE seule fois)
- session sans match → cursor avance, rien n'est crédité
- cursor déjà au-delà → rien

## 6. Démo bout-en-bout (acceptance)

1. Créer une règle "Travail deep" (couleur bleue) liée au profile de blocage "Étude".
2. Créer un objectif "Maîtriser TS" (couleur violette, lié à la règle "Travail deep").
3. Niveau affiché = 1, progress 0.
4. Démarrer une session "Étude" de 30 minutes, attendre la fin (ou simuler via test E2E manuel).
5. Retour à HomePage : compteur free time = 15 min, objectif "Maîtriser TS" = 30 XP minutes (niveau 1, progress = 30/600).
6. Recommencer → cumul augmente.
7. Si une session est interrompue (Stop forcé) → aucune XP créditée.
8. Cliquer "Dépenser 15 min" → balance retombe à 0.
9. Reload app → tout persisté.
10. Niveau 10 atteint après 50 000 min cumulées (vérification via setter test).

## 7. Critères d'acceptation

1. ✅ typecheck / lint / test / build verts
2. ✅ ≥ 12 tests purs sur levels + credit-engine
3. ✅ Idempotence vérifiée (relancer reconcile ne double pas les crédits)
4. ✅ Une session non terminée normalement n'apporte aucune XP
5. ✅ Niveau plafonné à 10 même au-delà de 50 000 min
6. ✅ Banque jamais négative (refus côté store si débit > balance)
7. ✅ Free time widget animé au crédit
8. ✅ VETHOS_SPEC.md mis à jour, tag `v0.4.0-levels`

## 8. Hors scope

- Système de quêtes / défis hebdomadaires → polish (sous-projet 6)
- Notifications natives Windows à la montée de niveau → polish
- Réglage du ratio de conversion via Paramètres → polish
- Apps déclarées (utilisées hors blocage pour gain plus faible) → sous-projet 5/6
- Onboarding qui propose un premier objectif → sous-projet 5
