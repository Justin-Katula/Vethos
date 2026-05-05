# Nexus — Spec d'ensemble

Application desktop Windows de productivité/focus inspirée d'Opal.

Stack : Electron 30 + React 18 + TypeScript + Tailwind 3.4 + Framer Motion + Zustand.

## Sous-projets

| # | Sous-projet | Statut | Spec |
|---|---|---|---|
| 1 | Fondation (scaffold + thème + IPC + storage) | ✅ Livré | [2026-05-02-nexus-foundation-design.md](docs/superpowers/specs/2026-05-02-nexus-foundation-design.md) |
| 2 | Système de blocage (hosts / process / firewall + détection dérive) | ✅ Livré (v0.2.0-blocking) | [2026-05-04-nexus-blocking-design.md](docs/superpowers/specs/2026-05-04-nexus-blocking-design.md) |
| 3 | Interface principale (cercle 24h, calendrier, tableau couleurs) | ✅ Livré (v0.3.0-interface) | [2026-05-05-nexus-interface-design.md](docs/superpowers/specs/2026-05-05-nexus-interface-design.md) |
| 4 | Système de niveaux + distribution du temps libre | ⬜ À spec | — |
| 5 | Onboarding (emploi du temps + objectifs + apps déclarées) | ⬜ À spec | — |
| 6 | Polish + persistance complète (tous les `nexus_*.json`) | ⬜ À spec | — |

## Conventions

- **Stockage** : tous les JSON dans `app.getPath('userData')`, nommés `nexus_<key>.json`
- **Sécurité Electron** : `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`
- **Tests** : Vitest pour les modules main critiques (storage, blocking logic)
- **Qualité visuelle** : 10-11/10 — chaque UI ajoutée doit hériter du ton posé en sous-projet 1
- **Mise à jour** : ce fichier est mis à jour à la fin de chaque sous-projet
