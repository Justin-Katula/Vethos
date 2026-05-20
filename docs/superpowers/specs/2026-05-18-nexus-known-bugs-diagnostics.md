# Nexus — 3 bugs connus : diagnostic + plan de fix

## Contexte

Trois bugs constatés par l'utilisateur sur l'app installée v0.12.0 :
1. Bouton « Réparer » du service Windows : sans effet (le service ne s'installe pas).
2. Scan des apps installées : ne renvoie rien.
3. Scan de l'historique navigateur : aucune suggestion de sites.

Aucun ne peut être fixé en aveugle — il faut diagnostiquer sur la machine de
l'utilisateur. Ce document décrit la démarche pour chacun.

---

## Bug 1 : service Windows ne s'installe pas

### Symptôme
Clic sur « Réparer » dans la page Blocage → rien ne change. Pas d'UAC visible,
ou UAC accepté mais le service n'apparaît pas (`Get-Service NexusBlockingService`
introuvable).

### Hypothèse principale
Lot 1 P16 (spike node-windows) jamais vérifié sur une vraie machine.
`node-windows` échoue silencieusement à générer le wrapper du service.

### Diagnostic (étapes, en ordre)

**1. UAC apparaît-il après clic ?**
- Si **non** : `sudo-prompt` échoue. Inspecter
  `%APPDATA%\Nexus\logs\main.log`, chercher `elevated-install` ou
  `relaunchElevated`.
- Si **oui** : passer à 2.

**2. Une seconde instance Nexus.exe (élevée) démarre-t-elle brièvement ?**
- Gestionnaire des tâches → cherche une 2ᵉ `Nexus.exe` qui apparaît puis
  disparaît.
- Si non : le flag `--install-service` n'est pas correctement passé.
  Vérifier `relaunchElevated` dans `src/main/elevated-install.ts`.

**3. node-windows a-t-il généré le wrapper du service ?**
- Chemin :
  `%LOCALAPPDATA%\Programs\Nexus\resources\app.asar.unpacked\out\service\daemon\`
- Doit contenir `nexusblockingservice.exe` et `nexusblockingservice.xml`.
- Si vide : node-windows a échoué silencieusement. Causes courantes :
  - antivirus (Defender) qui bloque la création de l'exécutable ;
  - permissions insuffisantes sur `app.asar.unpacked` ;
  - Node introuvable côté node-windows (il en a besoin pour générer le wrapper).

**4. Le service est-il enregistré dans Windows ?**
- PowerShell : `Get-Service NexusBlockingService`
- Si « Service not found » → l'étape 3 a échoué.
- Si trouvé mais Status `Stopped` → install OK, démarrage qui échoue. Voir
  Event Viewer → Logs Windows → Application → filtrer sur NexusBlockingService.

**5. Lancer l'install manuellement** (bypass de l'UI) :

```powershell
& "$env:LOCALAPPDATA\Programs\Nexus\Nexus.exe" --install-service
```

Capturer la sortie complète. Si l'app quitte sans message → ajouter des
`log.info` dans `installService()` (`src/main/service-install.ts`) pour voir
où ça s'arrête. Recompiler/installer/relancer.

### Plan de fix (selon la cause)

**A — sudo-prompt échoue** :
- Ré-installer Nexus depuis l'installeur le plus récent.
- Vérifier que la signature de l'app est intacte (Windows refuse parfois
  d'élever un exécutable non signé).
- Long terme : signature de code Authenticode.

**B — node-windows ne génère pas le wrapper** :
- Vérifier antivirus / Defender → exception pour `Nexus.exe`.
- Si récurrent et bloquant : **basculer vers `winsw` direct**. Mini-projet
  (~3 tâches) :
  1. Inclure `WinSW.exe` (~700 KB, stable, open-source) dans le bundle via
     `extraResources` d'`electron-builder`.
  2. Générer le XML de service à la volée depuis l'app élevée.
  3. Appeler `WinSW.exe install` (et `start`) au lieu de node-windows.
  4. Retirer la dépendance `node-windows` de `package.json`.
  C'est un repli plus robuste car winsw ne dépend pas du runtime Node.

**C — Service installé mais ne démarre pas** :
- Vérifier que `ELECTRON_RUN_AS_NODE=1` est bien dans la conf XML du service
  (`<env name="ELECTRON_RUN_AS_NODE" value="1" />`).
- Vérifier que le chemin de `Nexus.exe` dans le XML est **absolu**.
- Tester manuellement : `Start-Service NexusBlockingService`. Si code 1066,
  l'exe plante au démarrage — voir les logs du service (chemin défini dans
  `src/service/engine-log.ts`).

### Pour Codex
Demande à l'utilisateur les sorties des étapes 1 à 5 dans l'ordre. À partir
de là, identifier la cause (A, B ou C) et appliquer le fix correspondant.
**Ne pas tenter d'autres fixes en aveugle.**

---

## Bug 2 : scan des apps installées ne marche pas

### Symptôme
Dans `ProfileEditor` (et plus tard dans le nouvel éditeur de distractions de
la couche 2), le scan d'apps ne renvoie rien.

### Code concerné
- `src/main/tracking/app-discovery.ts` — exécute un script PowerShell qui
  lit `HKLM`/`HKCU\Uninstall`.
- Exposé via `nexus.app.discoverInstalledApps()` (IPC).

### Diagnostic

**1. La méthode IPC est-elle appelée ?**
- DevTools (Ctrl+Shift+I, si activé en prod sinon en dev) → console → chercher
  l'appel à `discoverInstalledApps`.
- Si jamais appelée : c'est un bug UI (le bouton ne déclenche pas l'IPC).

**2. PowerShell s'exécute-t-il ?**
- Manuellement, dans PowerShell :
  ```powershell
  powershell.exe -ExecutionPolicy Bypass -Command `
    "Get-ItemProperty 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' | Select-Object DisplayName, InstallLocation, DisplayIcon -First 5"
  ```
- Si 0 résultat ou erreur : la requête registre échoue → vérifier les droits.

**3. Encodage de la sortie** :
- Si PowerShell renvoie de l'UTF-16 BOM mais lu en UTF-8 côté Node, le JSON
  plante au parse.
- Inspecter `app-discovery.ts` : le script doit forcer
  `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8` en première
  ligne.

**4. Logs main** :
- Ajouter `log.info('[app-discovery] start')` et
  `log.info('[app-discovery] count=' + apps.length)` dans `app-discovery.ts`.
- Recompiler, lancer, inspecter les logs.

### Fix probable
La cause typique est l'encodage. Forcer UTF-8 en sortie de PowerShell :

```ts
const PS_SCRIPT = `
  $OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  // … reste du script existant …
`
```

Et lire en UTF-8 côté Node. ~5 lignes, 1 commit.

Si ce n'est pas l'encodage : capturer/logger l'erreur réelle au lieu de
l'avaler, propager à l'UI.

### Pour Codex
Demande à l'utilisateur la sortie de l'étape 2 (PowerShell manuel) + les logs
de l'étape 4 après recompilation.

---

## Bug 3 : scan de l'historique navigateur

### Symptôme
Le setting « Scan historique navigateur » est ON, mais aucune suggestion de
sites n'apparaît.

### Code concerné
- `src/main/tracking/browser-history.ts` — lit les SQLite des navigateurs
  via regex sur le binaire (sans dépendance SQLite).
- Tracker périodique dans `src/main/tracking/site-tracker.ts` (toutes les 5 min).
- Stockage dans `nexus_discovered_sites.json`.

### Diagnostic

**1. Setting bien activé ?**
- Inspecter `%APPDATA%\Nexus\nexus_settings.json` →
  `browserHistoryScanEnabled: true` ?

**2. Les fichiers SQLite existent-ils ?**
- Chrome : `%LOCALAPPDATA%\Google\Chrome\User Data\Default\History`
- Edge : `%LOCALAPPDATA%\Microsoft\Edge\User Data\Default\History`
- Brave : `%LOCALAPPDATA%\BraveSoftware\Brave-Browser\User Data\Default\History`
- Firefox : `%APPDATA%\Mozilla\Firefox\Profiles\*\places.sqlite`
- Si aucun navigateur installé : rien à scanner, comportement normal.

**3. Le navigateur est-il ouvert ?**
- Si **oui** → Chrome/Edge/Brave **verrouillent** `History` en lecture
  exclusive. `fs.readFile` échoue silencieusement (le code attrape sans
  logger).
- **Cause la plus probable.** Tester : fermer complètement le navigateur,
  attendre 6 min, vérifier `nexus_discovered_sites.json`.

**4. Le tracker tourne-t-il ?**
- Ajouter un `log.info('[site-tracker] tick')` pour confirmer que le
  `setInterval` 5 min se déclenche bien.

### Fix probable

**Copier le fichier avant lecture** pour contourner le lock SQLite :

```ts
import * as os from 'node:os'
import * as path from 'node:path'
import { promises as fs } from 'node:fs'

async function readHistorySafely(historyPath: string): Promise<Buffer | null> {
  const tmp = path.join(os.tmpdir(), `nexus-history-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`)
  try {
    await fs.copyFile(historyPath, tmp)  // Windows : passe outre le lock partagé
    return await fs.readFile(tmp)
  } catch (err) {
    log.warn('[browser-history] read failed: ' + (err instanceof Error ? err.message : String(err)))
    return null
  } finally {
    await fs.unlink(tmp).catch(() => {})
  }
}
```

~15 lignes, intégrer dans la fonction de scan existante. Plus : logger les
erreurs au lieu de les avaler. 1 commit.

### Pour Codex
Demande à l'utilisateur si le navigateur est ouvert quand il a testé. Si oui,
fais le fix ci-dessus. Si non, demande l'étape 1 + l'étape 4 (logs).

---

## Ordre suggéré pour Codex

1. **Bug 1 d'abord** : sans le service, les couches 2-3 ne sont pas validables
   en bout de chaîne. Le diagnostic est manuel — Codex doit demander à
   l'utilisateur de suivre les étapes 1-5 et de **coller les sorties**.
2. **Bug 2 et Bug 3 en parallèle** : indépendants l'un de l'autre. Probablement
   des fixes courts (UTF-8 ; copier-puis-lire). Peuvent être faits en même
   temps que le bug 1.
3. **Ne pas implémenter la couche 3** tant que le bug 1 n'est pas résolu —
   sans service qui tourne, le smoke test final de la couche 3 est impossible.
4. **La couche 2 peut être implémentée même avec le bug 1 non résolu** — elle
   ne dépend pas du service qui tourne.

## Pour Codex (général)

Pour chaque bug, Codex doit :
- Demander à l'utilisateur de suivre les étapes de diagnostic numérotées et
  de **coller les sorties** ou captures.
- À partir des sorties, identifier la cause concrète.
- Appliquer le fix correspondant (un commit par bug, message clair).
- Pour le bug 1, prévoir une branche de repli `winsw`-direct si node-windows
  s'avère définitivement cassé sur la machine de l'utilisateur.
