# Nexus — Sous-projet 3 : Interface principale (cercle 24h + calendrier + règles)

**Date :** 2026-05-05
**Sous-projet :** 3 / 6
**Dépend de :** sous-projet 1 (fondation) ✅, sous-projet 2 (blocage) ✅
**Référence visuelle :** `Logo/Logo et interface.png`

## 1. Objectif

Donner à Nexus son cœur visuel : un **cercle 24h** qui montre la journée colorée selon les règles définies, un **calendrier hebdomadaire** drag-and-drop pour poser les blocs de temps, et un **tableau de règles** pour gérer la palette (couleur + label + lien optionnel vers un profil de blocage).

## 2. Principes

- **Une décision = une couleur.** L'utilisateur n'écrit jamais une heure. Il dessine sur le calendrier, et le cercle 24h affiche le résultat en direct.
- **La règle est la source.** Toutes les couleurs viennent du `RuleTable`. On ne saisit pas une couleur dans une entrée de planning : on lui assigne une règle.
- **Le cercle est vivant.** Curseur animé, segment courant pulsé, countdown jusqu'au prochain changement.
- **Visuel 11/10.** SVG plein vectoriel, motion fluide, pas de canvas pixelisé.
- **Pas de couplage avec le blocage automatique.** Une règle PEUT pointer vers un profil de blocage (`linkedProfileId`), mais cela ne déclenche rien automatiquement (réservé sous-projet 4 ou 6).

## 3. Architecture

### 3.1 Modèles (étendus dans `src/shared/schemas.ts`)

```ts
// TimeRule — un libellé + une couleur + optionnellement un profil de blocage lié
export const TimeRuleSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  icon: z.string().min(1).max(40).optional(),       // nom lucide (ex. 'Brain', 'Dumbbell')
  linkedProfileId: z.string().uuid().nullable(),     // optionnel, vers BlockingProfile
  createdAt: z.string().datetime(),
})
export type TimeRule = z.infer<typeof TimeRuleSchema>

// ScheduleEntry — un bloc hebdomadaire récurrent
export const ScheduleEntrySchema = z.object({
  id: z.string().uuid(),
  ruleId: z.string().uuid(),
  dayOfWeek: z.number().int().min(0).max(6),         // 0 = lundi
  startMinute: z.number().int().min(0).max(1439),    // minutes since 00:00 (exclusif fin de journée)
  endMinute: z.number().int().min(1).max(1440),      // > startMinute, peut == 1440
  createdAt: z.string().datetime(),
})
export type ScheduleEntry = z.infer<typeof ScheduleEntrySchema>

export const ScheduleStateSchema = z.object({
  rules: z.array(TimeRuleSchema),
  entries: z.array(ScheduleEntrySchema),
})
export type ScheduleState = z.infer<typeof ScheduleStateSchema>
```

`STORAGE_KEYS` étendu à `['settings', 'blocking', 'blocking_active', 'schedule']`.

### 3.2 Invariants

- `endMinute > startMinute` (pas de bloc traversant minuit ; deux blocs séparés sinon).
- Pas de chevauchement entre deux entrées du même `dayOfWeek` (validation côté store + UI empêche le drag de superposer).
- Si on supprime une `TimeRule`, ses `ScheduleEntry` associées sont supprimées (cascade) après confirmation.

### 3.3 IPC

Pas de nouveau canal IPC. Le store renderer utilise `nexus.storage.read('schedule')` / `write('schedule', state)` déjà exposé.

### 3.4 État renderer (`useScheduleStore`)

```ts
type ScheduleStore = {
  loaded: boolean
  rules: TimeRule[]
  entries: ScheduleEntry[]
  load: () => Promise<void>
  saveRule: (draft: Partial<TimeRule> & { name: string; color: string }) => Promise<TimeRule>
  deleteRule: (id: string) => Promise<void>     // cascade entries
  saveEntry: (draft: Partial<ScheduleEntry> & { ruleId: string; dayOfWeek: number; startMinute: number; endMinute: number }) => Promise<ScheduleEntry>
  deleteEntry: (id: string) => Promise<void>
  // sélecteurs
  getCurrentEntry: (now: Date) => { entry: ScheduleEntry; rule: TimeRule } | null
  getNextChange: (now: Date) => { atMinuteOfWeek: number; rule: TimeRule | null } | null
}
```

Persistance : tout changement déclenche `storage.write('schedule', { rules, entries })` (sérialisation atomique déjà fournie par sous-projet 1).

## 4. Composants UI

### 4.1 `TimeCircle` (HomePage centerpiece)

SVG 480×480 :
- Anneau extérieur : 24 marques d'heure (subtiles, plus visibles à 0/6/12/18).
- Anneau intérieur : un arc coloré par `ScheduleEntry` du jour courant. Couleur = rule.color, gradient radial subtil.
- Curseur : ligne fine + petit cercle rotatif positionnée à l'heure courante. Re-render toutes les 10s pour fluidité.
- Centre : grande horloge `HH:MM` en font-mono, sous laquelle le `rule.name` courant et le countdown `MM:SS jusqu'au changement`.
- Si pas de règle courante : centre affiche "Temps libre" + couleur grise.
- Hover sur un arc → tooltip `rule.name · HHh — HHh`.
- Au montage : animation de "balayage" du curseur depuis 0h vers l'heure courante (1.2s).

### 4.2 `WeekCalendar` (PlanningPage)

Grille 7 colonnes × tranches de 30min (48 lignes), de 0h à 24h.
- En-têtes colonne : Lun, Mar, Mer, Jeu, Ven, Sam, Dim (semaine commence lundi).
- Lignes : marques toutes les heures (label `06h`, `12h`...), demi-heures plus pâles.
- Chaque entrée → un rectangle absolu coloré dans la colonne, avec `rule.name` et durée affichés si la hauteur le permet.
- **Drag-create** : `mousedown` sur une cellule vide ouvre un fantôme qui suit le curseur jusqu'à `mouseup` ; à la fin, ouvre `EntryQuickPicker` au-dessus pour choisir la règle. Si annulé, fantôme disparaît.
- **Drag-resize** : poignée haute / basse de chaque bloc, redimensionne en pas de 15min, snap aux limites des autres blocs.
- **Click sur bloc** : ouvre menu inline (changer règle / supprimer).
- Snap : 15min.
- Rejet de chevauchement (visuellement : flash rouge sur les bords pendant le drag, refus au drop).

### 4.3 `RuleTable` (PlanningPage, en haut)

Liste horizontale scrollable de cards :
- Chaque card : pastille couleur ronde + nom + nombre d'entrées hebdo + petit lock icon si `linkedProfileId` non null.
- Card "+ Nouvelle règle" en fin → ouvre `RuleEditor`.
- Click sur card → ouvre `RuleEditor` en mode édition.

### 4.4 `RuleEditor` (slide-in panel droite, comme `ProfileEditor` du sous-projet 2)

- Champ `name` (max 40).
- Picker `color` : palette préréglée (12 couleurs cohérentes avec le thème) + champ hex libre.
- Champ `icon` : sélection parmi ~12 icônes lucide (Brain, Dumbbell, Code, Coffee, Music, Book, Briefcase, Heart, Bike, Moon, Sun, Zap).
- Select `linkedProfileId` : null par défaut + liste des `BlockingProfile` existants.
- Boutons Sauvegarder / Annuler / Supprimer (avec confirm si entrées associées).

### 4.5 `EntryQuickPicker` (popup ancré au bloc fantôme)

Lors d'un drag-create :
- Affiche les règles existantes en chips colorées + "Nouvelle règle…".
- Click chip = crée l'entrée et ferme.
- Esc = annule.

### 4.6 Intégration sidebar

Ajout du **logo Nexus** en haut de la `Sidebar` (réutilisation de `Logo/Logo et interface.png` extraction du wordmark, OU recréation SVG inline si l'asset n'est pas exploitable). Décision implémentation : SVG inline pour rester maître du rendu (pas de raster).

## 5. Comportements clés

### 5.1 Calcul de l'entrée courante

```ts
function getCurrentEntry(state: ScheduleState, now: Date): { entry; rule } | null {
  const dow = (now.getDay() + 6) % 7  // JS: dim=0 → on veut lun=0
  const minute = now.getHours() * 60 + now.getMinutes()
  const entry = state.entries.find(
    (e) => e.dayOfWeek === dow && e.startMinute <= minute && minute < e.endMinute
  )
  if (!entry) return null
  const rule = state.rules.find((r) => r.id === entry.ruleId)
  return rule ? { entry, rule } : null
}
```

### 5.2 Détection du prochain changement

Itère sur les entrées triées par `(dayOfWeek, startMinute)` à partir de maintenant ; trouve la prochaine borne (début ou fin d'entrée). Si fin de semaine, repart au lundi.

### 5.3 Snap & validation drag

- Snap = 15min (multiple de 15 sur start/end).
- Min durée = 15min.
- Validation chevauchement avant `saveEntry` : `entries.some(e => e.id !== draft.id && e.dayOfWeek === draft.dayOfWeek && !(e.endMinute <= draft.startMinute || e.startMinute >= draft.endMinute))` → throw.

## 6. Tests Vitest

Modules purs uniquement (les composants visuels passent par démo manuelle) :
- `src/renderer/src/lib/schedule-selectors.test.ts` :
  - getCurrentEntry retourne null hors plage
  - getCurrentEntry retourne entrée + règle quand dans la plage
  - getNextChange : prochaine fin si on est dedans, prochain début si on est dehors, wrap au lundi suivant
  - hasOverlap : détecte chevauchements / accepte adjacence
  - snapTo15 : 0 → 0, 7 → 0, 8 → 15, 22 → 15, 23 → 30
- `src/renderer/src/lib/format-time.test.ts` :
  - minuteToHHMM : 0 → '00:00', 90 → '01:30', 1439 → '23:59'
  - durationLabel : 30 → '30 min', 90 → '1h30', 60 → '1h'

## 7. Démo bout-en-bout (acceptance)

1. Lancer Nexus → HomePage : cercle 24h vide affichant "Temps libre" et l'heure.
2. Aller sur Mon planning → cliquer "+ Nouvelle règle", créer "Travail deep" (couleur bleue), "Sport" (rouge), "Pause" (verte).
3. Drag-create lundi 9h → 12h : `EntryQuickPicker` s'ouvre, choisir Travail deep. Bloc bleu apparaît.
4. Drag-create lundi 14h → 15h : Sport. Drag-create lundi 12h → 13h : Pause.
5. Tenter drag-create lundi 11h → 13h (chevauchement) → refus visuel.
6. Resize bloc Sport à 16h : passe à 14h-16h.
7. Click bloc Pause → menu inline → Supprimer.
8. Retour HomePage : si on est lundi entre 9h et 12h, le cercle affiche un arc bleu et le centre indique "Travail deep" + countdown vers 12h.
9. Reload app → règles + entrées persistées.
10. Supprimer la règle Sport → confirmation cascade → l'entrée du lundi disparaît aussi.

## 8. Critères d'acceptation

1. ✅ `npm run typecheck` vert
2. ✅ `npm run lint` vert
3. ✅ `npm run test` vert (incluant nouveaux tests purs)
4. ✅ `npm run build` vert
5. ✅ Cercle 24h s'anime en montage et met à jour le curseur en temps réel
6. ✅ Drag-create + drag-resize sur le calendrier avec snap 15min
7. ✅ Tableau de règles avec édition/suppression/cascade
8. ✅ Aucune entrée ne peut chevaucher une autre du même jour
9. ✅ Persistance complète après reload
10. ✅ Logo Nexus en haut de la sidebar
11. ✅ Visuel 11/10 cohérent avec le sous-projet 2 (motion, gradients, glow)
12. ✅ NEXUS_SPEC.md mis à jour, tag `v0.3.0-interface` posé

## 9. Hors scope

- Vue mensuelle / agenda calendaire avec dates spécifiques (récurrent hebdo seulement)
- Override d'un jour spécifique (ex. férié) → sous-projet 6
- Déclenchement automatique d'une session de blocage à l'entrée d'une plage liée → sous-projet 4 ou 6
- Synchronisation Google Calendar / iCal → hors scope projet
- Système de niveaux 1-10 → sous-projet 4
- Onboarding guidé pour saisir l'emploi du temps → sous-projet 5
