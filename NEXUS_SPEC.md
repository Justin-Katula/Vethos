# Nexus — Spec d'ensemble

Application desktop Windows de productivité/focus de pointe.

Stack : Electron 30 + React 18 + TypeScript + Tailwind 3.4 + Framer Motion + Zustand.

## Refonte V2/V3 - remise sur le droit chemin

Statut : typecheck Node/Web vert, lint vert, Vitest vert. Banque accumulée retirée. Calcul quotidien du temps libre branché (`free-time-calculator`). Réconciliation niveau 0 + notifications natives de tâches (auto-rescue, force-3, dégradation, accomplie) opérationnelles via IPC `tasks:notify`. P16 a déplacé le blocage dans un vrai service Windows ; reste le watchdog sidecar P14 niveau 2.

- **Source de vérité** : le temps libre est recalculé depuis le planning, puis distribué selon les niveaux et deadlines aux objectifs et aux tâches actives.
- **Stockage** : objectifs, stats et historique de blocage sont séparés dans `nexus_objectives.json`, `nexus_stats.json` et `nexus_blocking_history.json`; les anciens états sont migrés au démarrage.
- **Planning** : les règles portent `categoryType` (`sleep`, `school`, `work`, `commitment`, `free`, `custom`) et les gaps de préparation / transition sommeil sont exclus.
- **Objectifs et tâches** : les deadlines sont stockées; les tâches niveau `0` sortent de la distribution normale et sont réconciliées au boot (deadline < 1 j → force 3, 2-6 j → remontée à 1, > 7 j → reste à 0, passée → accomplie); la dégradation par pool `0.5` est appliquée via `applySessionDegradation`.
- **Onboarding et UI** : onboarding sans étape Apps, saisie directe du planning sur la semaine, engagements protégés, niveaux `3-7`, alerte couleurs CIEDE2000 `< 5`, cercle 24h cliquable et rafraîchi chaque seconde.
- **Blocage** : règles de session 4h / 6h / 2 jours au démarrage et en session active, notifications natives Electron, hosts/firewall conservés, AppLocker ajouté en audit/enforcement selon le mode strict, fallback process-kill si AppLocker est indisponible. Le runtime de blocage vit dans `NexusBlockingService` (service Windows SYSTEM), l'UI relaie via named pipe.
- **Scanner local** : scan registre des apps installé dans l'éditeur de profil; domaines navigateur découverts proposés à la blacklist après opt-in.
- **Honnêteté UI** : les toggles sans effet runtime (`antiBypass`, `autoSave`) ne sont plus exposés; le statut hosts/firewall lit l'état réel au lieu de retourner `ok` en dur.
- **Validation** : typecheck Node/Web, lint et Vitest passent localement.

## P16 — Service Windows de blocage

Architecture livrée : le blocage ne s'exécute plus dans le process UI. Le main Electron expose les IPC renderer habituels, mais relaie les commandes vers `NexusBlockingService` via `\\.\pipe\NexusServiceBridge`. Le service démarre au boot Windows en compte SYSTEM, auto-redémarre via `node-windows`, et exécute `out/service/index.js` avec le binaire Electron en mode Node (`ELECTRON_RUN_AS_NODE=1`).

Cycle de vie :

- Installation/réparation : `Nexus.exe --install-service`, lancé directement ou via le bouton « Réparer » de l'UI. L'élévation UAC est ponctuelle via `sudo-prompt`.
- Désinstallation : `Nexus.exe --uninstall-service`.
- Données : les fichiers de blocage sont migrés vers `C:\ProgramData\Nexus`; le service durcit ce dossier par ACL (SYSTEM + Administrateurs en écriture, utilisateurs en lecture).
- UI : l'application n'est plus packagée avec `requireAdministrator`. Service absent ou pipe injoignable → bandeau dans Blocage, démarrage de session désactivé, notification native « service indisponible ».

Dépannage rapide :

- Vérifier l'état : `Get-Service NexusBlockingService`.
- Vérifier le compte : `sc.exe qc NexusBlockingService` doit afficher `LocalSystem`.
- Vérifier le pipe : le fichier spécial `\\.\pipe\NexusServiceBridge` doit répondre quand le service tourne.
- Réparer : relancer Nexus puis utiliser « Réparer », ou exécuter `Nexus.exe --install-service`.

## Sous-projets

| #   | Sous-projet                                                        | Statut                                            | Spec                                                                                                  |
| --- | ------------------------------------------------------------------ | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1   | Fondation (scaffold + thème + IPC + storage)                       | ✅ Livré                                          | [2026-05-02-nexus-foundation-design.md](docs/superpowers/specs/2026-05-02-nexus-foundation-design.md) |
| 2   | Système de blocage (hosts / process / firewall + détection dérive) | ✅ Livré (v0.2.0-blocking)                        | [2026-05-04-nexus-blocking-design.md](docs/superpowers/specs/2026-05-04-nexus-blocking-design.md)     |
| 3   | Interface principale (cercle 24h, calendrier, tableau couleurs)    | ✅ Livré (v0.3.0-interface)                       | [2026-05-05-nexus-interface-design.md](docs/superpowers/specs/2026-05-05-nexus-interface-design.md)   |
| 4   | Système de niveaux + distribution du temps libre                   | ✅ Refondu (Tâches, multiplicateurs, dégradation) | [2026-05-05-nexus-levels-design.md](docs/superpowers/specs/2026-05-05-nexus-levels-design.md)         |
| 5   | Onboarding (emploi du temps + objectifs)                           | ✅ Refondu V2 (sans étape Apps)                   | [2026-05-05-nexus-onboarding-design.md](docs/superpowers/specs/2026-05-05-nexus-onboarding-design.md) |
| 6   | Polish + persistance complète (tous les `nexus_*.json`)            | ✅ Livré (v0.6.0-polish)                          | [2026-05-05-nexus-polish-design.md](docs/superpowers/specs/2026-05-05-nexus-polish-design.md)         |

## Conventions

- **Stockage** : tous les JSON dans `app.getPath('userData')`, nommés `nexus_<key>.json`
- **Sécurité Electron** : `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`
- **Tests** : Vitest pour les modules main critiques (storage, blocking logic)
- **Qualité visuelle** : 10-11/10 — chaque UI ajoutée doit hériter du ton posé en sous-projet 1
- **Mise à jour** : ce fichier est mis à jour à la fin de chaque sous-projet
