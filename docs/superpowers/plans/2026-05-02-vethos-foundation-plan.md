# Vethos — Sous-projet 1 : Fondation — Plan d'implémentation

> **Pour les agents :** SOUS-SKILL REQUISE : utiliser superpowers:subagent-driven-development (recommandé) ou superpowers:executing-plans pour exécuter ce plan tâche par tâche. Les étapes utilisent la syntaxe checkbox (`- [ ]`).

**Goal :** Livrer un squelette Electron + React + TypeScript prêt à recevoir les 5 sous-projets suivants, avec thème sombre soigné, IPC sécurisé, stockage JSON atomique, et installer Windows buildable.

**Architecture :** Process Electron main (Node) qui gère le lifecycle, le stockage JSON et expose une API typée au renderer via un preload utilisant `contextBridge`. Renderer = React 18 + Vite avec HMR, navigation animée via React Router + Framer Motion, état via Zustand. Sécurité Electron stricte (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`).

**Tech Stack :** Electron 30+, electron-vite, electron-builder (NSIS), TypeScript strict, React 18, React Router v6, Zustand 4, Tailwind CSS v3.4, Framer Motion, Lucide React, Zod, Vitest, ESLint + Prettier.

**Spec source :** `docs/superpowers/specs/2026-05-02-vethos-foundation-design.md`

---

## Vue d'ensemble des fichiers à créer

| Fichier | Responsabilité |
|---|---|
| `package.json` | Dépendances, scripts |
| `tsconfig.json` | Config TS racine (project references) |
| `tsconfig.node.json` | Config TS pour main + preload |
| `tsconfig.web.json` | Config TS pour renderer |
| `electron.vite.config.ts` | Config build des 3 process |
| `tailwind.config.ts` | Config Tailwind |
| `postcss.config.js` | Config PostCSS pour Tailwind |
| `electron-builder.yml` | Config packaging Windows |
| `.eslintrc.cjs` | Lint rules |
| `.prettierrc` | Formatting |
| `.gitignore` | |
| `src/main/index.ts` | Entry main + BrowserWindow |
| `src/main/storage/atomic.ts` | Écriture/lecture atomique JSON |
| `src/main/storage/index.ts` | API publique storage avec validation Zod |
| `src/main/storage/atomic.test.ts` | Tests Vitest pour atomic |
| `src/main/ipc/index.ts` | Enregistrement de tous les handlers IPC |
| `src/main/ipc/storage.handlers.ts` | Handlers IPC pour storage |
| `src/preload/index.ts` | API exposée au renderer via contextBridge |
| `src/preload/index.d.ts` | Types pour `window.vethos` |
| `src/shared/ipc-channels.ts` | Constantes des canaux IPC |
| `src/shared/schemas.ts` | Schémas Zod partagés |
| `src/renderer/index.html` | Entry HTML |
| `src/renderer/src/main.tsx` | Bootstrap React |
| `src/renderer/src/App.tsx` | Router + layout racine |
| `src/renderer/src/components/Layout.tsx` | Layout avec sidebar + zone de page |
| `src/renderer/src/components/Sidebar.tsx` | Sidebar avec indicateur actif animé |
| `src/renderer/src/components/PageTransition.tsx` | Wrapper Framer Motion pour transitions |
| `src/renderer/src/pages/HomePage.tsx` | Placeholder Accueil |
| `src/renderer/src/pages/ObjectivesPage.tsx` | Placeholder Mes objectifs |
| `src/renderer/src/pages/PlanningPage.tsx` | Placeholder Mon planning |
| `src/renderer/src/pages/BlockingPage.tsx` | Placeholder Blocage |
| `src/renderer/src/pages/SettingsPage.tsx` | Démo bout-en-bout (settings) |
| `src/renderer/src/store/settings.store.ts` | Zustand store pour settings |
| `src/renderer/src/styles/globals.css` | Reset + tokens CSS + scrollbar |
| `src/renderer/src/styles/fonts.css` | Imports @fontsource |
| `src/renderer/src/lib/ipc.ts` | Wrapper typé sur window.vethos |
| `src/renderer/src/lib/cn.ts` | Utilitaire merge classes Tailwind |
| `VETHOS_SPEC.md` | Tracker des 6 sous-projets |

---

## Task 1 : Init du projet et arborescence

**Files :**
- Create : `package.json`, `.gitignore`, `.editorconfig`

- [ ] **Step 1 : Créer le répertoire et init git**

```bash
cd C:/Users/obedi/Vethos
git init
```

Expected : `Initialized empty Git repository in C:/Users/obedi/Vethos/.git/`

- [ ] **Step 2 : Créer `.gitignore`**

```gitignore
node_modules/
out/
dist/
release/
*.log
.DS_Store
.vscode/
.idea/
.env
.env.local
coverage/
*.tsbuildinfo
vethos-data-dev/
```

- [ ] **Step 3 : Créer `package.json`**

```json
{
  "name": "vethos",
  "version": "0.1.0",
  "private": true,
  "description": "Vethos — application desktop de focus",
  "main": "out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build && electron-builder --win",
    "build:unpack": "electron-vite build && electron-builder --win --dir",
    "typecheck:node": "tsc --noEmit -p tsconfig.node.json",
    "typecheck:web": "tsc --noEmit -p tsconfig.web.json",
    "typecheck": "npm run typecheck:node && npm run typecheck:web",
    "lint": "eslint . --ext .ts,.tsx",
    "format": "prettier --write \"src/**/*.{ts,tsx,css}\"",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 4 : Créer `.editorconfig`**

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true
```

- [ ] **Step 5 : Commit**

```bash
git add .
git commit -m "chore: init Vethos repo with package.json and gitignore"
```

---

## Task 2 : Installer toutes les dépendances

**Files :** `package.json` (modifié par npm)

- [ ] **Step 1 : Installer Electron + build tools**

```bash
npm install --save-dev electron@^30.0.0 electron-vite@^2.3.0 electron-builder@^24.13.0 vite@^5.2.0
```

Expected : installation sans erreur, `node_modules/` créé

- [ ] **Step 2 : Installer TypeScript et types**

```bash
npm install --save-dev typescript@^5.4.0 @types/node@^20.12.0 @types/react@^18.2.0 @types/react-dom@^18.2.0 @vitejs/plugin-react@^4.2.0
```

- [ ] **Step 3 : Installer React et libs renderer**

```bash
npm install react@^18.3.0 react-dom@^18.3.0 react-router-dom@^6.23.0 zustand@^4.5.0 framer-motion@^11.0.0 lucide-react@^0.378.0 clsx@^2.1.0 tailwind-merge@^2.3.0 zod@^3.23.0
```

- [ ] **Step 4 : Installer fontsource (polices auto-hébergées)**

```bash
npm install @fontsource/inter@^5.0.0 @fontsource/jetbrains-mono@^5.0.0
```

- [ ] **Step 5 : Installer Tailwind**

```bash
npm install --save-dev tailwindcss@^3.4.0 postcss@^8.4.0 autoprefixer@^10.4.0
```

- [ ] **Step 6 : Installer ESLint + Prettier**

```bash
npm install --save-dev eslint@^8.57.0 @typescript-eslint/parser@^7.7.0 @typescript-eslint/eslint-plugin@^7.7.0 eslint-plugin-react@^7.34.0 eslint-plugin-react-hooks@^4.6.0 prettier@^3.2.0 eslint-config-prettier@^9.1.0
```

- [ ] **Step 7 : Installer Vitest**

```bash
npm install --save-dev vitest@^1.5.0 @vitest/ui@^1.5.0
```

- [ ] **Step 8 : Vérifier que `npm install` ne plante pas**

```bash
npm install
```

Expected : `up to date` ou installation propre, pas d'audit critique bloquant

- [ ] **Step 9 : Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install all dependencies (electron, react, tailwind, vitest, etc.)"
```

---

## Task 3 : Configuration TypeScript

**Files :**
- Create : `tsconfig.json`, `tsconfig.node.json`, `tsconfig.web.json`

- [ ] **Step 1 : Créer `tsconfig.json` (racine, project references)**

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.web.json" }
  ]
}
```

- [ ] **Step 2 : Créer `tsconfig.node.json` (main + preload)**

```json
{
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "target": "ES2022",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "types": ["node", "electron-vite/node"],
    "baseUrl": ".",
    "paths": {
      "@main/*": ["src/main/*"],
      "@shared/*": ["src/shared/*"]
    }
  },
  "include": ["src/main/**/*", "src/preload/**/*", "src/shared/**/*"]
}
```

- [ ] **Step 3 : Créer `tsconfig.web.json` (renderer)**

```json
{
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "useDefineForClassFields": true,
    "types": ["vite/client"],
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/renderer/src/*"],
      "@shared/*": ["src/shared/*"]
    }
  },
  "include": ["src/renderer/**/*", "src/shared/**/*", "src/preload/index.d.ts"]
}
```

- [ ] **Step 4 : Vérifier que `tsc` compile sans erreur (sans fichier source encore, ne doit rien produire mais pas planter)**

```bash
npx tsc --build
```

Expected : pas d'erreur (les `include` pointent vers des dossiers vides, ce qui est OK)

- [ ] **Step 5 : Commit**

```bash
git add tsconfig.json tsconfig.node.json tsconfig.web.json
git commit -m "chore: add TypeScript config (strict, project references for main/web)"
```

---

## Task 4 : Configuration electron-vite

**Files :**
- Create : `electron.vite.config.ts`

- [ ] **Step 1 : Créer `electron.vite.config.ts`**

```ts
import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@main': resolve('src/main'),
        '@shared': resolve('src/shared'),
      },
    },
    build: {
      outDir: 'out/main',
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
      },
    },
    build: {
      outDir: 'out/preload',
    },
  },
  renderer: {
    root: 'src/renderer',
    plugins: [react()],
    resolve: {
      alias: {
        '@': resolve('src/renderer/src'),
        '@shared': resolve('src/shared'),
      },
    },
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: resolve('src/renderer/index.html'),
      },
    },
    server: {
      port: 5173,
    },
  },
})
```

- [ ] **Step 2 : Commit**

```bash
git add electron.vite.config.ts
git commit -m "chore: add electron-vite config with path aliases"
```

---

## Task 5 : Configuration Tailwind + tokens CSS

**Files :**
- Create : `tailwind.config.ts`, `postcss.config.js`, `src/renderer/src/styles/globals.css`, `src/renderer/src/styles/fonts.css`

- [ ] **Step 1 : Créer `tailwind.config.ts`**

```ts
import type { Config } from 'tailwindcss'

export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'bg-base': 'var(--bg-base)',
        'bg-elevated': 'var(--bg-elevated)',
        'bg-card': 'var(--bg-card)',
        'bg-card-hover': 'var(--bg-card-hover)',
        'border-subtle': 'var(--border-subtle)',
        'border-strong': 'var(--border-strong)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-muted': 'var(--text-muted)',
        accent: 'var(--accent)',
        'accent-hover': 'var(--accent-hover)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        elevated: 'var(--shadow-elevated)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      transitionTimingFunction: {
        out: 'var(--ease-out)',
      },
    },
  },
  plugins: [],
} satisfies Config
```

- [ ] **Step 2 : Créer `postcss.config.js`**

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 3 : Créer `src/renderer/src/styles/fonts.css`**

```css
@import '@fontsource/inter/400.css';
@import '@fontsource/inter/500.css';
@import '@fontsource/inter/600.css';
@import '@fontsource/inter/700.css';
@import '@fontsource/jetbrains-mono/400.css';
@import '@fontsource/jetbrains-mono/500.css';
```

- [ ] **Step 4 : Créer `src/renderer/src/styles/globals.css`**

```css
@import './fonts.css';

@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    /* Backgrounds */
    --bg-base: #0a0a0c;
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

    /* Accent (indigo) */
    --accent: #6366f1;
    --accent-hover: #818cf8;
    --accent-glow: rgba(99, 102, 241, 0.2);

    /* Radii */
    --radius-sm: 8px;
    --radius-md: 12px;
    --radius-lg: 20px;
    --radius-xl: 28px;

    /* Shadows */
    --shadow-card: inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 8px 24px rgba(0, 0, 0, 0.4);
    --shadow-elevated: inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 24px 48px rgba(0, 0, 0, 0.5);

    /* Motion */
    --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
    --duration-fast: 150ms;
    --duration-normal: 250ms;
    --duration-slow: 400ms;
  }

  html, body, #root {
    height: 100%;
    margin: 0;
    padding: 0;
  }

  body {
    background: radial-gradient(at 30% 0%, #12121a 0%, #0a0a0c 60%);
    background-attachment: fixed;
    color: var(--text-primary);
    font-family: 'Inter', system-ui, sans-serif;
    font-feature-settings: 'cv02', 'cv03', 'cv04', 'cv11';
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility;
    overflow: hidden;
    user-select: none;
  }

  /* Scrollbar custom */
  ::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  ::-webkit-scrollbar-track {
    background: transparent;
  }
  ::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.08);
    border-radius: 999px;
    transition: background var(--duration-fast) var(--ease-out);
  }
  ::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.16);
  }

  /* Focus visible */
  :focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
    border-radius: var(--radius-sm);
  }

  /* Sélection texte */
  ::selection {
    background: var(--accent-glow);
    color: var(--text-primary);
  }

  /* Titres : tracking serré */
  h1, h2, h3, h4 {
    letter-spacing: -0.02em;
  }

  /* Texte sélectionnable dans les inputs */
  input, textarea {
    user-select: text;
  }
}
```

- [ ] **Step 5 : Commit**

```bash
git add tailwind.config.ts postcss.config.js src/renderer/src/styles/
git commit -m "style: add Tailwind config, CSS tokens, fonts, scrollbar"
```

---

## Task 6 : ESLint et Prettier

**Files :**
- Create : `.eslintrc.cjs`, `.prettierrc`, `.prettierignore`, `.eslintignore`

- [ ] **Step 1 : Créer `.eslintrc.cjs`**

```js
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['@typescript-eslint', 'react', 'react-hooks'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'prettier',
  ],
  settings: {
    react: { version: 'detect' },
  },
  rules: {
    'react/react-in-jsx-scope': 'off',
    'react/prop-types': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/explicit-module-boundary-types': 'off',
  },
}
```

- [ ] **Step 2 : Créer `.prettierrc`**

```json
{
  "semi": false,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "arrowParens": "always"
}
```

- [ ] **Step 3 : Créer `.prettierignore` et `.eslintignore`**

`.prettierignore` :
```
node_modules
out
dist
release
package-lock.json
```

`.eslintignore` :
```
node_modules
out
dist
release
*.config.ts
*.config.js
```

- [ ] **Step 4 : Commit**

```bash
git add .eslintrc.cjs .prettierrc .prettierignore .eslintignore
git commit -m "chore: add ESLint and Prettier config"
```

---

## Task 7 : Canaux IPC partagés et schémas Zod

**Files :**
- Create : `src/shared/ipc-channels.ts`, `src/shared/schemas.ts`

- [ ] **Step 1 : Créer `src/shared/ipc-channels.ts`**

```ts
export const IPC_CHANNELS = {
  STORAGE_READ: 'storage:read',
  STORAGE_WRITE: 'storage:write',
  STORAGE_EXISTS: 'storage:exists',
  APP_GET_VERSION: 'app:getVersion',
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
```

- [ ] **Step 2 : Créer `src/shared/schemas.ts`**

```ts
import { z } from 'zod'

/**
 * Clés autorisées pour le stockage.
 * Chaque clé correspond à un fichier vethos_<key>.json sur disque.
 * Ajouter ici toute nouvelle entité à persister.
 */
export const STORAGE_KEYS = ['settings'] as const
export type StorageKey = (typeof STORAGE_KEYS)[number]
export const StorageKeySchema = z.enum(STORAGE_KEYS)

/** Settings persistés (démo bout-en-bout du sous-projet 1). */
export const SettingsSchema = z.object({
  username: z.string().max(100).optional(),
  savedAt: z.string().datetime().optional(),
})
export type Settings = z.infer<typeof SettingsSchema>

/** Map clé → schéma. Utilisé par le storage pour valider à la lecture. */
export const STORAGE_SCHEMAS = {
  settings: SettingsSchema,
} as const satisfies Record<StorageKey, z.ZodTypeAny>
```

- [ ] **Step 3 : Vérifier que ça type-check**

```bash
npx tsc --noEmit -p tsconfig.node.json
```

Expected : pas d'erreur

- [ ] **Step 4 : Commit**

```bash
git add src/shared/
git commit -m "feat(shared): add IPC channels and Zod schemas (settings)"
```

---

## Task 8 : Storage atomic — TDD

**Files :**
- Create : `src/main/storage/atomic.ts`, `src/main/storage/atomic.test.ts`
- Create : `vitest.config.ts`

- [ ] **Step 1 : Créer `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/main/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@main': resolve('src/main'),
      '@shared': resolve('src/shared'),
    },
  },
})
```

- [ ] **Step 2 : Écrire le test qui échoue (`src/main/storage/atomic.test.ts`)**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { atomicWrite, atomicRead } from './atomic'

describe('atomic storage', () => {
  let dir: string

  beforeEach(async () => {
    dir = await fs.mkdtemp(join(tmpdir(), 'vethos-test-'))
  })

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('writes and reads back JSON data', async () => {
    const file = join(dir, 'data.json')
    await atomicWrite(file, { hello: 'world' })
    const result = await atomicRead<{ hello: string }>(file)
    expect(result).toEqual({ hello: 'world' })
  })

  it('returns null when file does not exist', async () => {
    const result = await atomicRead<unknown>(join(dir, 'missing.json'))
    expect(result).toBeNull()
  })

  it('overwrites existing data atomically', async () => {
    const file = join(dir, 'data.json')
    await atomicWrite(file, { v: 1 })
    await atomicWrite(file, { v: 2 })
    const result = await atomicRead<{ v: number }>(file)
    expect(result).toEqual({ v: 2 })
  })

  it('does not leave .tmp files after successful write', async () => {
    const file = join(dir, 'data.json')
    await atomicWrite(file, { ok: true })
    const entries = await fs.readdir(dir)
    expect(entries.filter((e) => e.endsWith('.tmp'))).toHaveLength(0)
  })

  it('preserves the original file if rename fails (simulated)', async () => {
    const file = join(dir, 'data.json')
    await atomicWrite(file, { v: 'original' })
    // Simule un .tmp orphelin (crash après écriture, avant rename)
    await fs.writeFile(`${file}.tmp`, '{"v":"corrupted"}')
    // Le fichier original ne doit pas être affecté
    const result = await atomicRead<{ v: string }>(file)
    expect(result).toEqual({ v: 'original' })
  })
})
```

- [ ] **Step 3 : Lancer le test, vérifier qu'il échoue**

```bash
npx vitest run src/main/storage/atomic.test.ts
```

Expected : FAIL avec "Cannot find module './atomic'"

- [ ] **Step 4 : Implémenter `src/main/storage/atomic.ts`**

```ts
import { promises as fs } from 'node:fs'
import { dirname } from 'node:path'

/**
 * Écrit `data` en JSON dans `filePath` de façon atomique.
 * Stratégie : écrire dans `<filePath>.tmp` puis `rename` (atomique sur NTFS).
 * Si le process crash entre les deux, le fichier original reste intact.
 */
export async function atomicWrite<T>(filePath: string, data: T): Promise<void> {
  await fs.mkdir(dirname(filePath), { recursive: true })
  const tmpPath = `${filePath}.tmp`
  const json = JSON.stringify(data, null, 2)
  await fs.writeFile(tmpPath, json, 'utf8')
  await fs.rename(tmpPath, filePath)
}

/**
 * Lit `filePath` et le parse comme JSON.
 * Retourne `null` si le fichier n'existe pas.
 * Lève une erreur si le JSON est invalide (à gérer par l'appelant).
 */
export async function atomicRead<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, 'utf8')
    return JSON.parse(content) as T
  } catch (err) {
    if (isNoEntryError(err)) {
      return null
    }
    throw err
  }
}

function isNoEntryError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === 'ENOENT'
}
```

- [ ] **Step 5 : Relancer les tests, vérifier qu'ils passent**

```bash
npx vitest run src/main/storage/atomic.test.ts
```

Expected : 5 tests PASSED

- [ ] **Step 6 : Commit**

```bash
git add vitest.config.ts src/main/storage/atomic.ts src/main/storage/atomic.test.ts
git commit -m "feat(storage): atomic JSON write/read with tmp+rename strategy"
```

---

## Task 9 : Storage public API avec validation Zod

**Files :**
- Create : `src/main/storage/index.ts`, `src/main/storage/storage.test.ts`

- [ ] **Step 1 : Écrire le test qui échoue (`src/main/storage/storage.test.ts`)**

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createStorage } from './index'

describe('storage with Zod validation', () => {
  let dir: string

  beforeEach(async () => {
    dir = await fs.mkdtemp(join(tmpdir(), 'vethos-store-'))
  })

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('writes and reads valid settings', async () => {
    const storage = createStorage(dir)
    await storage.write('settings', { username: 'obed', savedAt: '2026-05-02T10:00:00.000Z' })
    const result = await storage.read('settings')
    expect(result).toEqual({ username: 'obed', savedAt: '2026-05-02T10:00:00.000Z' })
  })

  it('returns null when no file exists yet', async () => {
    const storage = createStorage(dir)
    const result = await storage.read('settings')
    expect(result).toBeNull()
  })

  it('exists() reflects file presence', async () => {
    const storage = createStorage(dir)
    expect(await storage.exists('settings')).toBe(false)
    await storage.write('settings', { username: 'a' })
    expect(await storage.exists('settings')).toBe(true)
  })

  it('returns null and creates .bak when file is invalid', async () => {
    const storage = createStorage(dir)
    const file = join(dir, 'vethos_settings.json')
    await fs.writeFile(file, '{"username": 123}', 'utf8') // type invalide
    const result = await storage.read('settings')
    expect(result).toBeNull()
    expect(await fs.readFile(`${file}.bak`, 'utf8')).toBe('{"username": 123}')
  })

  it('rejects writes that fail Zod validation', async () => {
    const storage = createStorage(dir)
    // username dépasse 100 chars
    const longName = 'x'.repeat(200)
    await expect(storage.write('settings', { username: longName })).rejects.toThrow()
  })
})
```

- [ ] **Step 2 : Lancer le test, vérifier qu'il échoue**

```bash
npx vitest run src/main/storage/storage.test.ts
```

Expected : FAIL — module './index' n'existe pas encore

- [ ] **Step 3 : Implémenter `src/main/storage/index.ts`**

```ts
import { join } from 'node:path'
import { promises as fs } from 'node:fs'
import { atomicRead, atomicWrite } from './atomic'
import { STORAGE_SCHEMAS, type StorageKey } from '@shared/schemas'
import type { z } from 'zod'

export type Storage = ReturnType<typeof createStorage>

type SchemaFor<K extends StorageKey> = (typeof STORAGE_SCHEMAS)[K]
type ValueFor<K extends StorageKey> = z.infer<SchemaFor<K>>

/**
 * Crée une instance de storage rattachée à un répertoire de base.
 * En production : `app.getPath('userData')`.
 * En test : un tmpdir.
 */
export function createStorage(baseDir: string) {
  const fileFor = (key: StorageKey) => join(baseDir, `vethos_${key}.json`)

  return {
    async read<K extends StorageKey>(key: K): Promise<ValueFor<K> | null> {
      const filePath = fileFor(key)
      const raw = await atomicRead<unknown>(filePath)
      if (raw === null) return null

      const schema = STORAGE_SCHEMAS[key]
      const parsed = schema.safeParse(raw)
      if (!parsed.success) {
        // Sauvegarde le fichier corrompu en .bak et retourne null.
        // Pas de réparation auto : le caller décide.
        await fs.copyFile(filePath, `${filePath}.bak`).catch(() => undefined)
        return null
      }
      return parsed.data as ValueFor<K>
    },

    async write<K extends StorageKey>(key: K, data: ValueFor<K>): Promise<void> {
      const schema = STORAGE_SCHEMAS[key]
      // Throw si invalide — protège contre des bugs dans le main process.
      schema.parse(data)
      await atomicWrite(fileFor(key), data)
    },

    async exists(key: StorageKey): Promise<boolean> {
      try {
        await fs.access(fileFor(key))
        return true
      } catch {
        return false
      }
    },
  }
}
```

- [ ] **Step 4 : Relancer les tests**

```bash
npx vitest run src/main/storage/
```

Expected : tous les tests storage PASSED

- [ ] **Step 5 : Commit**

```bash
git add src/main/storage/index.ts src/main/storage/storage.test.ts
git commit -m "feat(storage): public API with Zod validation, .bak on corruption"
```

---

## Task 10 : Handlers IPC pour le storage

**Files :**
- Create : `src/main/ipc/storage.handlers.ts`, `src/main/ipc/index.ts`

- [ ] **Step 1 : Créer `src/main/ipc/storage.handlers.ts`**

```ts
import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import { StorageKeySchema, type StorageKey } from '@shared/schemas'
import type { Storage } from '@main/storage'

export function registerStorageHandlers(storage: Storage): void {
  ipcMain.handle(IPC_CHANNELS.STORAGE_READ, async (_event, rawKey: unknown) => {
    const key = StorageKeySchema.parse(rawKey) as StorageKey
    return storage.read(key)
  })

  ipcMain.handle(IPC_CHANNELS.STORAGE_WRITE, async (_event, rawKey: unknown, data: unknown) => {
    const key = StorageKeySchema.parse(rawKey) as StorageKey
    // La validation du payload est faite par storage.write via le schéma de la clé.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await storage.write(key, data as any)
  })

  ipcMain.handle(IPC_CHANNELS.STORAGE_EXISTS, async (_event, rawKey: unknown) => {
    const key = StorageKeySchema.parse(rawKey) as StorageKey
    return storage.exists(key)
  })
}
```

- [ ] **Step 2 : Créer `src/main/ipc/index.ts`**

```ts
import { ipcMain, app } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import type { Storage } from '@main/storage'
import { registerStorageHandlers } from './storage.handlers'

export function registerAllIpcHandlers(storage: Storage): void {
  registerStorageHandlers(storage)

  ipcMain.handle(IPC_CHANNELS.APP_GET_VERSION, () => app.getVersion())
}
```

- [ ] **Step 3 : Vérifier le typecheck**

```bash
npx tsc --noEmit -p tsconfig.node.json
```

Expected : pas d'erreur

- [ ] **Step 4 : Commit**

```bash
git add src/main/ipc/
git commit -m "feat(ipc): main process handlers for storage and app version"
```

---

## Task 11 : Main process entry point

**Files :**
- Create : `src/main/index.ts`

- [ ] **Step 1 : Créer `src/main/index.ts`**

```ts
import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { createStorage } from './storage'
import { registerAllIpcHandlers } from './ipc'

const isDev = !app.isPackaged

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#0a0a0c', // évite le flash blanc au démarrage
    show: false, // affichée seulement après ready-to-show
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0a0a0c',
      symbolColor: '#a1a1aa',
      height: 36,
    },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  win.once('ready-to-show', () => {
    win.show()
  })

  // Liens externes : ouvrir dans le navigateur, pas dans Electron
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

app.whenReady().then(() => {
  // Sécurité : empêche les apps multiples dans certains cas extrêmes
  app.setAppUserModelId('com.vethos.app')

  const storage = createStorage(app.getPath('userData'))
  registerAllIpcHandlers(storage)

  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

- [ ] **Step 2 : Vérifier le typecheck**

```bash
npx tsc --noEmit -p tsconfig.node.json
```

Expected : pas d'erreur

- [ ] **Step 3 : Commit**

```bash
git add src/main/index.ts
git commit -m "feat(main): create BrowserWindow with strict security flags and dark backgroundColor"
```

---

## Task 12 : Preload — contextBridge

**Files :**
- Create : `src/preload/index.ts`, `src/preload/index.d.ts`

- [ ] **Step 1 : Créer `src/preload/index.ts`**

```ts
import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import type { StorageKey } from '@shared/schemas'

const api = {
  storage: {
    read: <T>(key: StorageKey): Promise<T | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.STORAGE_READ, key),
    write: <T>(key: StorageKey, data: T): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.STORAGE_WRITE, key, data),
    exists: (key: StorageKey): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.STORAGE_EXISTS, key),
  },
  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_VERSION),
  },
}

contextBridge.exposeInMainWorld('vethos', api)

export type VethosApi = typeof api
```

- [ ] **Step 2 : Créer `src/preload/index.d.ts`**

```ts
import type { VethosApi } from './index'

declare global {
  interface Window {
    vethos: VethosApi
  }
}

export {}
```

- [ ] **Step 3 : Vérifier le typecheck**

```bash
npm run typecheck
```

Expected : pas d'erreur

- [ ] **Step 4 : Commit**

```bash
git add src/preload/
git commit -m "feat(preload): expose typed vethos API to renderer via contextBridge"
```

---

## Task 13 : Renderer entry — HTML, bootstrap React, lib utilitaires

**Files :**
- Create : `src/renderer/index.html`, `src/renderer/src/main.tsx`, `src/renderer/src/lib/cn.ts`, `src/renderer/src/lib/ipc.ts`

- [ ] **Step 1 : Créer `src/renderer/index.html`**

```html
<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:;" />
    <title>Vethos</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2 : Créer `src/renderer/src/lib/cn.ts`**

```ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
```

- [ ] **Step 3 : Créer `src/renderer/src/lib/ipc.ts`**

```ts
/**
 * Wrapper typé sur window.vethos.
 * Permet d'importer une API testable plutôt que d'accéder à window directement.
 */
import type { VethosApi } from '../../../preload/index'

export const vethos: VethosApi = window.vethos
```

- [ ] **Step 4 : Créer `src/renderer/src/main.tsx`**

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import './styles/globals.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>,
)
```

> Note : on utilise `HashRouter` plutôt que `BrowserRouter` car en production l'app est servie via `file://` et `BrowserRouter` ne fonctionne pas correctement dans ce cas.

- [ ] **Step 5 : Commit**

```bash
git add src/renderer/index.html src/renderer/src/main.tsx src/renderer/src/lib/
git commit -m "feat(renderer): bootstrap React with HashRouter, cn helper, ipc wrapper"
```

---

## Task 14 : Sidebar avec indicateur actif animé

**Files :**
- Create : `src/renderer/src/components/Sidebar.tsx`

- [ ] **Step 1 : Créer `src/renderer/src/components/Sidebar.tsx`**

```tsx
import { NavLink, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Home, Target, Calendar, Shield, Settings } from 'lucide-react'
import { cn } from '@/lib/cn'

type NavItem = {
  to: string
  label: string
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Accueil', Icon: Home },
  { to: '/objectives', label: 'Mes objectifs', Icon: Target },
  { to: '/planning', label: 'Mon planning', Icon: Calendar },
  { to: '/blocking', label: 'Blocage', Icon: Shield },
  { to: '/settings', label: 'Paramètres', Icon: Settings },
]

export function Sidebar() {
  const { pathname } = useLocation()

  return (
    <aside
      className={cn(
        'flex w-60 shrink-0 flex-col gap-1 px-3 py-6',
        'border-r border-border-subtle',
        'bg-bg-elevated/60 backdrop-blur-2xl',
      )}
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="px-3 pb-6">
        <h1 className="text-lg font-semibold tracking-tight">Vethos</h1>
        <p className="text-xs text-text-muted">Focus, par design.</p>
      </div>

      <nav
        className="flex flex-col gap-1"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {NAV_ITEMS.map(({ to, label, Icon }) => {
          const isActive = to === '/' ? pathname === '/' : pathname.startsWith(to)
          return (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={cn(
                'group relative flex items-center gap-3 rounded-md px-3 py-2.5',
                'text-sm font-medium transition-colors duration-200 ease-out',
                isActive ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary',
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="sidebar-active-pill"
                  className="absolute inset-0 rounded-md bg-bg-card"
                  style={{ boxShadow: 'var(--shadow-card)' }}
                  transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-3">
                <Icon size={18} strokeWidth={1.75} />
                {label}
              </span>
            </NavLink>
          )
        })}
      </nav>

      <div className="mt-auto px-3 text-xs text-text-muted">v0.1.0</div>
    </aside>
  )
}
```

- [ ] **Step 2 : Vérifier le typecheck**

```bash
npm run typecheck:web
```

Expected : pas d'erreur

- [ ] **Step 3 : Commit**

```bash
git add src/renderer/src/components/Sidebar.tsx
git commit -m "feat(ui): sidebar with animated active pill (Framer Motion layoutId)"
```

---

## Task 15 : Layout, transitions de page, et 4 placeholders

**Files :**
- Create : `src/renderer/src/components/Layout.tsx`, `src/renderer/src/components/PageTransition.tsx`
- Create : `src/renderer/src/pages/HomePage.tsx`, `ObjectivesPage.tsx`, `PlanningPage.tsx`, `BlockingPage.tsx`

- [ ] **Step 1 : Créer `src/renderer/src/components/PageTransition.tsx`**

```tsx
import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="h-full"
    >
      {children}
    </motion.div>
  )
}
```

- [ ] **Step 2 : Créer `src/renderer/src/components/Layout.tsx`**

```tsx
import { Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { Sidebar } from './Sidebar'

export function Layout() {
  const location = useLocation()

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar />
      <main className="relative flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          <div key={location.pathname} className="h-full">
            <Outlet />
          </div>
        </AnimatePresence>
      </main>
    </div>
  )
}
```

- [ ] **Step 3 : Créer un placeholder réutilisable de page**

Créer `src/renderer/src/components/PagePlaceholder.tsx` :

```tsx
import { PageTransition } from './PageTransition'

type Props = {
  title: string
  subtitle: string
}

export function PagePlaceholder({ title, subtitle }: Props) {
  return (
    <PageTransition>
      <div className="flex h-full flex-col px-12 pt-16">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-2 text-sm text-text-secondary">{subtitle}</p>
        </header>
        <div className="rounded-lg border border-border-subtle bg-bg-card p-8 shadow-card">
          <p className="text-text-muted">À venir dans un prochain sous-projet.</p>
        </div>
      </div>
    </PageTransition>
  )
}
```

- [ ] **Step 4 : Créer les 4 pages placeholder**

`src/renderer/src/pages/HomePage.tsx` :
```tsx
import { PagePlaceholder } from '@/components/PagePlaceholder'
export default function HomePage() {
  return <PagePlaceholder title="Accueil" subtitle="Le cercle 24h apparaîtra ici (sous-projet 3)." />
}
```

`src/renderer/src/pages/ObjectivesPage.tsx` :
```tsx
import { PagePlaceholder } from '@/components/PagePlaceholder'
export default function ObjectivesPage() {
  return <PagePlaceholder title="Mes objectifs" subtitle="Liste des objectifs avec leurs niveaux 1-10." />
}
```

`src/renderer/src/pages/PlanningPage.tsx` :
```tsx
import { PagePlaceholder } from '@/components/PagePlaceholder'
export default function PlanningPage() {
  return <PagePlaceholder title="Mon planning" subtitle="Calendrier semaine et mois — vue colorée par charge." />
}
```

`src/renderer/src/pages/BlockingPage.tsx` :
```tsx
import { PagePlaceholder } from '@/components/PagePlaceholder'
export default function BlockingPage() {
  return <PagePlaceholder title="Blocage" subtitle="Configuration des sites/apps bloqués (sous-projet 2)." />
}
```

- [ ] **Step 5 : Commit**

```bash
git add src/renderer/src/components/Layout.tsx src/renderer/src/components/PageTransition.tsx src/renderer/src/components/PagePlaceholder.tsx src/renderer/src/pages/HomePage.tsx src/renderer/src/pages/ObjectivesPage.tsx src/renderer/src/pages/PlanningPage.tsx src/renderer/src/pages/BlockingPage.tsx
git commit -m "feat(ui): layout, page transitions, 4 placeholder pages"
```

---

## Task 16 : Settings store + page de démo bout-en-bout

**Files :**
- Create : `src/renderer/src/store/settings.store.ts`, `src/renderer/src/pages/SettingsPage.tsx`

- [ ] **Step 1 : Créer `src/renderer/src/store/settings.store.ts`**

```ts
import { create } from 'zustand'
import { vethos } from '@/lib/ipc'
import type { Settings } from '@shared/schemas'

type SettingsState = {
  username: string
  savedAt: string | null
  loaded: boolean
  load: () => Promise<void>
  save: (username: string) => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set) => ({
  username: '',
  savedAt: null,
  loaded: false,

  async load() {
    const data = await vethos.storage.read<Settings>('settings')
    set({
      username: data?.username ?? '',
      savedAt: data?.savedAt ?? null,
      loaded: true,
    })
  },

  async save(username: string) {
    const savedAt = new Date().toISOString()
    await vethos.storage.write<Settings>('settings', { username, savedAt })
    set({ username, savedAt })
  },
}))
```

- [ ] **Step 2 : Créer `src/renderer/src/pages/SettingsPage.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import { PageTransition } from '@/components/PageTransition'
import { useSettingsStore } from '@/store/settings.store'
import { cn } from '@/lib/cn'

export default function SettingsPage() {
  const { username, savedAt, loaded, load, save } = useSettingsStore()
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (loaded) setDraft(username)
  }, [loaded, username])

  const dirty = draft !== username

  const handleSave = async () => {
    setSaving(true)
    try {
      await save(draft)
    } finally {
      setSaving(false)
    }
  }

  return (
    <PageTransition>
      <div className="flex h-full flex-col px-12 pt-16">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">Paramètres</h1>
          <p className="mt-2 text-sm text-text-secondary">
            Démo bout-en-bout : ces données sont persistées dans <code className="font-mono text-xs">vethos_settings.json</code>.
          </p>
        </header>

        <div className="max-w-md rounded-lg border border-border-subtle bg-bg-card p-6 shadow-card">
          <label className="block text-xs font-medium uppercase tracking-wider text-text-muted">
            Nom d'utilisateur
          </label>
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className={cn(
              'mt-2 w-full rounded-md border border-border-subtle bg-bg-base px-3 py-2',
              'text-sm text-text-primary outline-none transition-colors duration-200',
              'focus:border-accent focus:ring-2 focus:ring-accent/30',
            )}
            placeholder="Ton prénom"
          />

          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || saving}
            className={cn(
              'mt-4 inline-flex items-center gap-2 rounded-md px-4 py-2',
              'text-sm font-medium transition-all duration-200 ease-out',
              dirty && !saving
                ? 'bg-accent text-white hover:bg-accent-hover'
                : 'cursor-not-allowed bg-bg-card-hover text-text-muted',
            )}
          >
            <Save size={16} strokeWidth={2} />
            {saving ? 'Sauvegarde...' : 'Sauvegarder'}
          </button>

          {savedAt && (
            <p className="mt-4 font-mono text-xs text-text-muted">
              Dernière sauvegarde : {new Date(savedAt).toLocaleString('fr-FR')}
            </p>
          )}
        </div>
      </div>
    </PageTransition>
  )
}
```

- [ ] **Step 3 : Vérifier le typecheck**

```bash
npm run typecheck
```

Expected : pas d'erreur

- [ ] **Step 4 : Commit**

```bash
git add src/renderer/src/store/ src/renderer/src/pages/SettingsPage.tsx
git commit -m "feat(settings): store + page demonstrating end-to-end IPC + persistence"
```

---

## Task 17 : App.tsx — wire le router

**Files :**
- Create : `src/renderer/src/App.tsx`

- [ ] **Step 1 : Créer `src/renderer/src/App.tsx`**

```tsx
import { Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import HomePage from './pages/HomePage'
import ObjectivesPage from './pages/ObjectivesPage'
import PlanningPage from './pages/PlanningPage'
import BlockingPage from './pages/BlockingPage'
import SettingsPage from './pages/SettingsPage'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="/objectives" element={<ObjectivesPage />} />
        <Route path="/planning" element={<PlanningPage />} />
        <Route path="/blocking" element={<BlockingPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  )
}
```

- [ ] **Step 2 : Vérifier le typecheck**

```bash
npm run typecheck
```

Expected : pas d'erreur

- [ ] **Step 3 : Lancer l'app en dev**

```bash
npm run dev
```

Expected :
- Une fenêtre Electron s'ouvre, déjà sombre (pas de flash blanc)
- Sidebar à gauche avec 5 items et la pill animée qui glisse en cliquant
- Transitions de page fluides (fade + translate)
- Page Paramètres : taper un nom, cliquer Sauvegarder, fermer l'app, relancer → le nom est rechargé et le timestamp affiché

- [ ] **Step 4 : Commit**

```bash
git add src/renderer/src/App.tsx
git commit -m "feat(renderer): wire router with all 5 pages"
```

---

## Task 18 : electron-builder + build de l'installer Windows

**Files :**
- Create : `electron-builder.yml`
- Create : `build/icon.ico` (placeholder, à remplacer plus tard)

- [ ] **Step 1 : Créer `electron-builder.yml`**

```yaml
appId: com.vethos.app
productName: Vethos
directories:
  output: release
  buildResources: build

files:
  - 'out/**/*'
  - '!**/.vscode/*'
  - '!**/{.DS_Store,.git,.gitkeep,.gitignore,.npmrc,.eslintrc.cjs,.prettierrc}'
  - '!**/{README.md,docs}'

asar: true

win:
  target:
    - target: nsis
      arch:
        - x64
    - target: portable
      arch:
        - x64
  artifactName: ${productName}-Setup-${version}.${ext}

nsis:
  oneClick: false
  perMachine: false
  allowToChangeInstallationDirectory: true
  deleteAppDataOnUninstall: false
  createDesktopShortcut: true
  createStartMenuShortcut: true
  shortcutName: Vethos

publish: null
```

- [ ] **Step 2 : Préparer `build/`**

```bash
mkdir -p build
```

> Note : `electron-builder` peut générer une icône par défaut si `build/icon.ico` est absent — c'est OK pour ce sous-projet. Une vraie icône sera ajoutée plus tard.

- [ ] **Step 3 : Build l'app**

```bash
npm run build
```

Expected :
- `out/main/`, `out/preload/`, `out/renderer/` produits
- `release/Vethos-Setup-0.1.0.exe` produit
- `release/Vethos-0.1.0.exe` (portable) produit

Si erreur d'icône, ajouter dans `electron-builder.yml` sous `win:` :
```yaml
  icon: false
```
puis relancer.

- [ ] **Step 4 : Lancer l'installer une fois pour vérifier**

Lancer `release/Vethos-Setup-0.1.0.exe`, l'installer s'ouvre, on peut installer, l'app installée se lance correctement.

Désinstaller après le test pour ne pas polluer.

- [ ] **Step 5 : Commit**

```bash
git add electron-builder.yml build/
git commit -m "chore(build): electron-builder config for NSIS + portable Windows"
```

---

## Task 19 : VETHOS_SPEC.md — tracker des sous-projets

**Files :**
- Create : `VETHOS_SPEC.md`

- [ ] **Step 1 : Créer `VETHOS_SPEC.md`**

```markdown
# Vethos — Spec d'ensemble

Application desktop Windows de productivité/focus de pointe.

Stack : Electron 30 + React 18 + TypeScript + Tailwind 3.4 + Framer Motion + Zustand.

## Sous-projets

| # | Sous-projet | Statut | Spec |
|---|---|---|---|
| 1 | Fondation (scaffold + thème + IPC + storage) | ✅ Livré | [2026-05-02-vethos-foundation-design.md](docs/superpowers/specs/2026-05-02-vethos-foundation-design.md) |
| 2 | Système de blocage (hosts / process / firewall + détection dérive) | ⬜ À spec | — |
| 3 | Interface principale (cercle 24h, calendrier, tableau couleurs) | ⬜ À spec | — |
| 4 | Système de niveaux + distribution du temps libre | ⬜ À spec | — |
| 5 | Onboarding (emploi du temps + objectifs + apps déclarées) | ⬜ À spec | — |
| 6 | Polish + persistance complète (tous les `vethos_*.json`) | ⬜ À spec | — |

## Conventions

- **Stockage** : tous les JSON dans `app.getPath('userData')`, nommés `vethos_<key>.json`
- **Sécurité Electron** : `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`
- **Tests** : Vitest pour les modules main critiques (storage, blocking logic)
- **Qualité visuelle** : 10-11/10 — chaque UI ajoutée doit hériter du ton posé en sous-projet 1
- **Mise à jour** : ce fichier est mis à jour à la fin de chaque sous-projet
```

- [ ] **Step 2 : Commit**

```bash
git add VETHOS_SPEC.md
git commit -m "docs: add VETHOS_SPEC.md tracker for the 6 sub-projects"
```

---

## Task 20 : Vérification finale — tout doit passer

- [ ] **Step 1 : Linter**

```bash
npm run lint
```

Expected : 0 erreur

- [ ] **Step 2 : Typecheck complet**

```bash
npm run typecheck
```

Expected : 0 erreur

- [ ] **Step 3 : Tests**

```bash
npm test
```

Expected : tous les tests storage PASSED

- [ ] **Step 4 : Démo bout-en-bout (manuel)**

Suivre la checklist de la spec :

1. `npm run dev` → fenêtre Electron s'ouvre, déjà sombre
2. Sidebar : 5 items avec icônes Lucide, indicateur actif (pill) glisse entre items
3. Cliquer chaque item → transition fluide vers la page
4. Page Paramètres : taper un nom → Sauvegarder → timestamp s'affiche
5. Fermer l'app, relancer → nom et timestamp rechargés depuis le disque
6. Vérifier que `%APPDATA%/vethos/vethos_settings.json` existe et contient le bon JSON

- [ ] **Step 5 : Build de production**

```bash
npm run build
```

Expected : `release/Vethos-Setup-0.1.0.exe` produit, exécutable

- [ ] **Step 6 : Tag de version**

```bash
git tag v0.1.0-foundation
```

---

## Critères d'acceptation finaux (rappel de la spec)

1. ✅ `npm run dev` ouvre Electron avec HMR
2. ✅ Sidebar 5 items + navigation animée
3. ✅ Thème sombre soigné (gradient, blur, scrollbar custom)
4. ✅ Démo IPC bout-en-bout (settings persiste)
5. ✅ `npm run build` produit un installer Windows
6. ✅ ESLint et tsc passent
7. ✅ Tests Vitest passent
8. ✅ `VETHOS_SPEC.md` à la racine documente les 6 sous-projets

---

## Ce qui reste explicitement HORS scope

- Logique de blocage (hosts/process/firewall) → Sous-projet 2
- Cercle 24h, calendrier, tableau de couleurs → Sous-projet 3
- Math des niveaux 1-10, distribution temps libre → Sous-projet 4
- Onboarding (emploi du temps, objectifs) → Sous-projet 5
- Schémas JSON pour toutes les autres entités (`vethos_tasks.json`, `vethos_objectives.json`, etc.) → Sous-projet 6
