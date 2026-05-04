# Nexus — Sous-projet 1 : Fondation

**Date :** 2026-05-02
**Statut :** Design approuvé, prêt pour planification
**Sous-projet :** 1 / 6

## Contexte

Nexus est une application desktop Windows de productivité/focus inspirée d'Opal, à construire en 6 sous-projets indépendants :

1. **Fondation** ← *ce document*
2. Système de blocage (hosts / process kill / firewall + détection de dérive)
3. Interface principale (cercle 24h, sidebar, calendrier)
4. Système de niveaux + distribution du temps libre
5. Onboarding (emploi du temps + objectifs + apps déclarées)
6. Polish + persistance complète

Ce sous-projet livre uniquement le squelette technique : Electron + React + TypeScript démarrent, le thème sombre est posé, l'IPC et le stockage JSON fonctionnent bout en bout, l'installer Windows est buildable. **Aucune logique métier de Nexus ici.**

## Objectifs

- Avoir un terrain stable pour construire les 5 sous-projets suivants
- Poser dès le départ les fondations de la qualité visuelle 10-11/10 (thème, animations, typo) — pas de "shell brut" qu'on rhabillera plus tard
- Prouver que la chaîne main ↔ preload ↔ renderer ↔ stockage JSON fonctionne via une démo bout en bout

## Non-objectifs

Volontairement HORS scope de ce sous-projet :

- Logique de blocage (hosts, process, firewall) → Sous-projet 2
- Cercle 24h, calendrier → Sous-projet 3
- Math des niveaux et distribution du temps → Sous-projet 4
- Flow d'onboarding → Sous-projet 5
- Schémas JSON complets pour toutes les entités → Sous-projet 6 (ici on pose juste le mécanisme générique)

## Stack technique

| Domaine | Choix |
|---|---|
| Build | electron-vite |
| Packaging | electron-builder (cible Windows : NSIS installer + portable) |
| Langage | TypeScript en mode `strict` + `noUncheckedIndexedAccess` |
| UI | React 18 |
| Styling | Tailwind CSS v3.4 + variables CSS pour les tokens de thème |
| Animations | Framer Motion |
| State | Zustand (un store par domaine fonctionnel) |
| Routing | React Router v6 |
| Validation | Zod (schémas de données partagés main ↔ renderer) |
| Icônes | Lucide React |
| Typo | Inter (UI) + JetBrains Mono (chiffres, timers) — fontaines auto-hébergées via `@fontsource/*` (pas de CDN, pas de dépendance réseau au runtime) |
| IPC | `contextBridge` avec `contextIsolation: true`, `nodeIntegration: false` |

## Architecture

### Vue process

```
┌─ Main process (Node) ──────────────┐    ┌─ Renderer (React) ─────┐
│  • Lifecycle Electron              │    │  • UI                   │
│  • Storage (JSON atomique)         │◄──►│  • Zustand stores       │
│  • IPC handlers typés              │IPC │  • React Router         │
│  • [futur] hosts / process / fw    │    │  • Framer Motion        │
└────────────────────────────────────┘    └─────────────────────────┘
            ▲
            │ via preload (contextBridge)
            ▼
       API typée exposée au renderer
```

**Sécurité Electron :** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` côté renderer. Tout accès Node passe par le preload qui n'expose qu'une API allowlist.

### Structure de dossiers

```
nexus/
├─ src/
│  ├─ main/
│  │   ├─ index.ts                  # Création BrowserWindow, lifecycle
│  │   ├─ ipc/
│  │   │   ├─ index.ts              # Enregistrement des handlers
│  │   │   └─ storage.handlers.ts   # IPC pour le stockage
│  │   └─ storage/
│  │       ├─ index.ts              # API publique (read/write/exists)
│  │       └─ atomic.ts             # Écriture atomique (tmp + rename)
│  ├─ preload/
│  │   └─ index.ts                  # contextBridge.exposeInMainWorld('nexus', api)
│  ├─ renderer/
│  │   ├─ index.html
│  │   └─ src/
│  │       ├─ main.tsx              # Entry React
│  │       ├─ App.tsx               # Layout + Router
│  │       ├─ components/
│  │       │   ├─ Sidebar.tsx
│  │       │   ├─ Layout.tsx
│  │       │   └─ ui/               # primitives (Button, Card, etc.)
│  │       ├─ pages/                # placeholders pour ce sous-projet
│  │       │   ├─ HomePage.tsx
│  │       │   ├─ ObjectivesPage.tsx
│  │       │   ├─ PlanningPage.tsx
│  │       │   ├─ BlockingPage.tsx
│  │       │   └─ SettingsPage.tsx
│  │       ├─ store/                # zustand
│  │       │   └─ settings.store.ts # démo : stocke un setting via IPC
│  │       ├─ styles/
│  │       │   ├─ globals.css       # tokens CSS, reset, scrollbar custom
│  │       │   └─ fonts.css
│  │       └─ lib/
│  │           ├─ ipc.ts            # wrapper typé sur window.nexus
│  │           └─ cn.ts             # tailwind class merge
│  └─ shared/
│      ├─ ipc-channels.ts           # noms de canaux IPC (constantes typées)
│      └─ schemas.ts                # schémas Zod partagés
├─ electron.vite.config.ts
├─ tailwind.config.ts
├─ tsconfig.json
├─ tsconfig.node.json
├─ tsconfig.web.json
├─ electron-builder.yml
├─ .eslintrc.cjs
├─ .prettierrc
├─ package.json
└─ NEXUS_SPEC.md                    # vue d'ensemble, mise à jour à chaque sous-projet
```

### IPC — contrat

Un seul objet exposé au renderer via `contextBridge` : `window.nexus`.

```ts
// src/preload/index.ts (extrait conceptuel)
window.nexus = {
  storage: {
    read: <T>(key: string) => Promise<T | null>,
    write: <T>(key: string, data: T) => Promise<void>,
    exists: (key: string) => Promise<boolean>,
  },
  app: {
    getVersion: () => Promise<string>,
  },
}
```

Tous les canaux IPC sont nommés via constantes dans `src/shared/ipc-channels.ts` (jamais de strings magiques).

### Storage layer

- Tous les fichiers JSON vivent dans `app.getPath('userData')` (sur Windows : `%APPDATA%/nexus/`).
- Convention de nommage : `nexus_<domain>.json` (ex. `nexus_settings.json`).
- **Écriture atomique** :
  1. Sérialiser → écrire dans `<file>.tmp`
  2. `fs.rename(<file>.tmp, <file>)` → atomique sur NTFS
  3. Si crash en cours d'écriture → l'ancien fichier est intact
- **Lecture** : si le fichier n'existe pas → retourne `null` (pas d'erreur). Pas de défaut codé en dur ici — chaque domaine fournira son propre défaut au sous-projet 6.
- **Validation** : à la lecture, valider avec un schéma Zod si fourni. Si invalide → log + retourner `null` + écrire le fichier corrompu en `.bak`. Pas d'auto-réparation silencieuse.

### Thème — tokens CSS

```css
:root {
  /* Backgrounds — gradient subtil, pas un noir plat */
  --bg-base: #0a0a0c;
  --bg-base-gradient: radial-gradient(at 30% 0%, #12121a 0%, #0a0a0c 60%);
  --bg-elevated: #131318;
  --bg-card: #1a1a20;
  --bg-card-hover: #1f1f27;

  /* Borders */
  --border-subtle: rgba(255, 255, 255, 0.06);
  --border-strong: rgba(255, 255, 255, 0.12);

  /* Text */
  --text-primary: #f5f5f7;
  --text-secondary: #a1a1aa;
  --text-muted: #71717a;

  /* Accent */
  --accent: #6366f1;
  --accent-hover: #818cf8;
  --accent-glow: rgba(99, 102, 241, 0.2);

  /* Radii — généreux */
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 20px;
  --radius-xl: 28px;

  /* Shadows — superposées, douces */
  --shadow-card: 0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px rgba(0,0,0,0.4);
  --shadow-elevated: 0 1px 0 rgba(255,255,255,0.06) inset, 0 24px 48px rgba(0,0,0,0.5);

  /* Motion */
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --duration-fast: 150ms;
  --duration-normal: 250ms;
  --duration-slow: 400ms;
}
```

### Qualité visuelle 10-11/10 — exigences pour la fondation

Ces éléments DOIVENT être posés dès la fondation pour donner le ton :

- **Fond avec gradient radial subtil** (pas un noir plat) — visible mais pas envahissant
- **Sidebar avec indicateur actif animé** : pill qui glisse entre les items via `layoutId` de Framer Motion
- **Transitions de page** via `AnimatePresence` (fade + léger translate Y)
- **Backdrop blur** sur la sidebar (`backdrop-filter: blur(20px)`) avec un fond semi-transparent par-dessus le gradient
- **Scrollbar custom** : fine (6px), `rgba(255,255,255,0.1)`, arrondie, n'apparaît qu'au hover
- **Hover states** sur tout élément cliquable : transition 200ms, élévation subtile (légère bg-color shift + scale 1.01 si pertinent)
- **Typographie** : Inter pour l'UI, JetBrains Mono pour tout chiffre/timer/duration. Anti-aliasing activé. Tracking légèrement négatif sur les titres (`letter-spacing: -0.02em`)
- **Focus visible** custom : ring `--accent-glow` au lieu du ring navigateur par défaut
- **Boot UX** : la fenêtre s'ouvre déjà sombre (pas de flash blanc) — `backgroundColor: '#0a0a0c'` sur la `BrowserWindow`

### Démo bout en bout (critère d'acceptation principal)

La page **Paramètres** contient :
- Un champ texte "Nom d'utilisateur"
- Un bouton "Sauvegarder"
- Un texte "Dernière sauvegarde : ..." qui affiche le timestamp ISO du `savedAt` rechargé depuis le disque

Cycle complet :
1. Au montage de la page Paramètres, le store Zustand `settings` charge `nexus_settings.json` via IPC. Si le fichier n'existe pas, les champs sont vides.
2. User tape un nom → clique Sauvegarder
3. Renderer appelle `window.nexus.storage.write('settings', { username, savedAt: new Date().toISOString() })`
4. Preload forward vers main via IPC
5. Main valide via Zod, écrit atomiquement dans `nexus_settings.json`
6. Renderer met à jour le store Zustand → "Dernière sauvegarde" affiche le nouveau timestamp
7. Au redémarrage de l'app, le username ET le timestamp sont rechargés depuis le disque

Si cette démo fonctionne, la chaîne est bonne pour les 5 sous-projets suivants.

### Tests

- **Unit** (Vitest) : tests pour `storage/atomic.ts` couvrant : écriture nominale, lecture inexistante (retourne `null`), validation Zod ratée (retourne `null` + crée `.bak`), simulation de crash mid-write (le `.tmp` ne corrompt pas le fichier original).
- **Smoke** : un test qui vérifie que le bundle renderer monte React sans erreur (renderer-only, sans Electron).
- **E2E manuel** : la démo bout en bout décrite ci-dessus est exécutée à la main avant de marquer le sous-projet comme livré. Pas de framework E2E (Playwright/Spectron) à ce stade — overkill pour ce qu'on couvre.

### Fenêtre Electron

- Taille par défaut : 1280 × 800
- `frame: false` + `titleBarStyle: 'hidden'` + `titleBarOverlay` pour des contrôles Windows custom intégrés au design (à finaliser au sous-projet 3, mais on pose la config ici)
- `minWidth: 960`, `minHeight: 640`
- `backgroundColor: '#0a0a0c'` pour éviter le flash blanc

## Critères d'acceptation

1. `npm install && npm run dev` ouvre une fenêtre Electron avec HMR fonctionnel sur le renderer
2. Sidebar affiche 5 items (Accueil / Mes objectifs / Mon planning / Blocage / Paramètres) avec icônes Lucide
3. Cliquer sur un item change la page via React Router avec une transition fluide
4. L'indicateur actif glisse entre les items (animation `layoutId`)
5. Le thème sombre rend correctement : gradient radial visible, blur sur sidebar, scrollbar custom, typo Inter chargée
6. La démo IPC bout en bout fonctionne : sauvegarder un username persiste après redémarrage de l'app
7. `npm run build` produit `Nexus-Setup-0.1.0.exe` (NSIS) et un build portable
8. ESLint + Prettier passent sans erreur sur tout le code
9. `tsc --noEmit` passe sans erreur
10. `NEXUS_SPEC.md` existe à la racine et liste les 6 sous-projets avec ce sous-projet marqué comme livré

## Risques et mitigations

| Risque | Mitigation |
|---|---|
| Drift entre types côté main et renderer | Schémas Zod dans `src/shared/`, importés des deux côtés. Source unique de vérité. |
| Fichier JSON corrompu (crash en cours d'écriture) | Écriture atomique via `.tmp` + `rename`. Validation Zod à la lecture. Backup `.bak` si invalide. |
| Flash blanc au démarrage | `backgroundColor` sur la `BrowserWindow`, pas seulement en CSS. |
| Sécurité Electron | `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. Allowlist d'API explicite via preload. |
| Migration future Tailwind v4 | On commence en v3.4 (stable, mature). Migration possible plus tard, syntaxe de config simple à porter. |

## Ce que livre ce sous-projet

À la fin :
- Un repo Nexus initialisé (git), structuré comme décrit
- Une app Electron qui boot avec un thème sombre soigné, navigation animée entre 5 pages placeholder
- Un système de stockage JSON atomique prouvé via une démo dans la page Paramètres
- Un build Windows installable produit par `npm run build`
- Le ton visuel "10-11/10 inspiré Opal" est posé : tout sous-projet UI suivant héritera de ce socle
