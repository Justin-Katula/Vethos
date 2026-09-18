import { describe, it, expect } from 'vitest';
import { getAppCatalog } from './app-catalog';
import { isProtectedApp, isHostOrSubprocess, isNonUserSystemHelper } from '@main/blocking/system-guard';

describe('Vérification du filtrage précoce de sécurité', () => {
  it('isProtectedApp identifie correctement tous les outils d’administration et consoles système', () => {
    expect(isProtectedApp({ name: 'Registry Editor', exeName: 'regedit.exe' })).toBe(true);
    expect(isProtectedApp({ name: 'Services', exeName: 'services.msc' })).toBe(true);
    expect(isProtectedApp({ name: 'Windows Tools', exeName: 'control.exe' })).toBe(true);
    expect(isProtectedApp({ name: 'Resource Monitor', exeName: 'resmon.exe' })).toBe(true);
    expect(isProtectedApp({ name: 'Performance Monitor', exeName: 'perfmon.exe' })).toBe(true);
    expect(isProtectedApp({ name: 'System Configuration', exeName: 'msconfig.exe' })).toBe(true);
    expect(isProtectedApp({ name: 'Disk Cleanup', exeName: 'cleanmgr.exe' })).toBe(true);
    expect(isProtectedApp({ name: 'Task Manager', exeName: 'taskmgr.exe' })).toBe(true);
    expect(isProtectedApp({ name: 'Gestionnaire des tâches', exeName: 'taskmgr.exe' })).toBe(true);
    expect(isProtectedApp({ name: 'Windows PowerShell', exeName: 'powershell.exe' })).toBe(true);
    expect(isProtectedApp({ name: 'Command Prompt', exeName: 'cmd.exe' })).toBe(true);
  });

  it('isNonUserSystemHelper identifie correctement les pilotes, installateurs et outils d’arrière-plan', () => {
    expect(isNonUserSystemHelper('AMD Software', 'amd.exe')).toBe(true);
    expect(isNonUserSystemHelper('Realtek Audio Console', 'realtek.exe')).toBe(true);
    expect(isNonUserSystemHelper('Driver Easy', 'drivereasy.exe')).toBe(true);
    expect(isNonUserSystemHelper('IncrediBuild Agent Settings', 'agent.exe')).toBe(true);
    expect(isNonUserSystemHelper('Python install manager', 'setup.exe')).toBe(true);
    expect(isNonUserSystemHelper('Application Verifier (WOW)', 'appverif.exe')).toBe(true);
    expect(isNonUserSystemHelper('Windows Memory Diagnostic', 'mdsched.exe')).toBe(true);

    // Les vraies applications utilisateur ne doivent pas être filtrées
    expect(isNonUserSystemHelper('Steam', 'steam.exe')).toBe(false);
    expect(isNonUserSystemHelper('Discord', 'discord.exe')).toBe(false);
    expect(isNonUserSystemHelper('Notepad++', 'notepad++.exe')).toBe(false);
    expect(isNonUserSystemHelper('Battlefield 6', 'bf6.exe')).toBe(false);
    expect(isNonUserSystemHelper('Forza Horizon 6', 'forzahorizon6.exe')).toBe(false);
    expect(isNonUserSystemHelper('Epic Games Launcher', 'EpicGamesLauncher.exe')).toBe(false);
  });

  // Ce cas parcourt réellement la machine : registre, menu Démarrer, dossiers
  // d'installation. Les 5 secondes par défaut de vitest ne suffisent pas.
  it('getAppCatalog exclut totalement tout outil système protégé et tout composant d’arrière-plan', { timeout: 120_000 }, async () => {
    const apps = await getAppCatalog({ force: true });
    expect(apps.length).toBeGreaterThan(0);

    const forbiddenTerms = [
      'registry editor',
      'services',
      'windows tools',
      'resource monitor',
      'performance monitor',
      'system configuration',
      'disk cleanup',
      'computer management',
      'component services',
      'event viewer',
      'windows memory diagnostic',
      'amd software',
      'realtek audio console',
      'driver easy',
      'incredibuild',
      'task manager',
      'settings',
      'powershell',
      'command prompt',
      'terminal',
    ];

    for (const app of apps) {
      const lower = app.name.toLowerCase();
      for (const forbidden of forbiddenTerms) {
        expect(lower).not.toBe(forbidden);
      }
      expect(isProtectedApp({ name: app.name, exeName: app.exeName, targetPath: app.exePath })).toBe(false);
      expect(isHostOrSubprocess(app.exeName)).toBe(false);
      expect(isNonUserSystemHelper(app.name, app.exeName)).toBe(false);
    }
  });
});
