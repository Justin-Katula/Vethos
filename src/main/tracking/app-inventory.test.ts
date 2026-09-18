import { describe, it, expect } from 'vitest';
import {
  buildAppRecordId,
  normalizeAppPath,
  recordActiveProcess,
} from './app-inventory';
import { resolveProcessOwnership } from '@main/blocking/system-guard';

describe('AppInventory Management', () => {
  describe('Internal App Identity (buildAppRecordId)', () => {
    it('generates stable canonical IDs for Win32 executables', () => {
      const id1 = buildAppRecordId('C:\\Users\\obedi\\AppData\\Local\\Discord\\app-1.0.9168\\Discord.exe');
      const id2 = buildAppRecordId('c:\\users\\obedi\\appdata\\local\\discord\\app-1.0.9168\\discord.exe');
      expect(id1).toBe(id2);
      expect(id1.startsWith('win32:')).toBe(true);
    });

    it('generates distinct IDs for different apps sharing the same exe basename', () => {
      const idA = buildAppRecordId('C:\\Games\\GameA\\game.exe');
      const idB = buildAppRecordId('C:\\Games\\GameB\\game.exe');
      expect(idA).not.toBe(idB);
      expect(idA).toContain('gamea');
      expect(idB).toContain('gameb');
    });

    it('generates PWA IDs for chrome_proxy with parsing path', () => {
      const id = buildAppRecordId(
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome_proxy.exe',
        'Chrome._crx_eeafbgiggjafhno.UserData.Profile3'
      );
      expect(id.startsWith('pwa:')).toBe(true);
      expect(id).toContain('profile3');
    });

    it('generates AUMID identifiers for packaged UWP apps', () => {
      const id = buildAppRecordId(undefined, 'Microsoft.WindowsTerminal_8wekyb3d8bbwe!App');
      expect(id).toBe('aumid:microsoft.windowsterminal_8wekyb3d8bbwe!app');
    });
  });

  describe('Path Normalization', () => {
    it('normalizes slashes, casing, and trailing whitespace', () => {
      const norm1 = normalizeAppPath('C:/Program Files/App/run.exe ');
      const norm2 = normalizeAppPath('C:\\Program Files\\App\\run.exe');
      expect(norm1).toBe(norm2);
    });
  });

  describe('Passive Discovery (recordActiveProcess)', () => {
    it('never registers protected system tools like canonical explorer.exe or taskmgr.exe', () => {
      const resExplorer = recordActiveProcess('C:\\Windows\\explorer.exe', 'Windows Explorer', 100);
      expect(resExplorer).toBeNull();

      const resTaskmgr = recordActiveProcess('C:\\Windows\\System32\\taskmgr.exe', 'Task Manager', 200);
      expect(resTaskmgr).toBeNull();
    });

    it('never registers background host or helper processes', () => {
      const resWebView = recordActiveProcess('C:\\Program Files\\Edge\\msedgewebview2.exe', 'WebView Host', 300);
      expect(resWebView).toBeNull();

      const resRuntimeBroker = recordActiveProcess('C:\\Windows\\System32\\runtimebroker.exe', 'Broker', 400);
      expect(resRuntimeBroker).toBeNull();
    });

    it('passively registers an unknown user application', () => {
      const app = recordActiveProcess('D:\\Tools\\MySpecialTool\\tool.exe', 'Special Tool', 500);
      expect(app).not.toBeNull();
      expect(app?.name).toBe('Special Tool');
      expect(app?.exeName).toBe('tool.exe');
      expect(app?.source).toBe('passive');
      expect(app?.isProtected).toBe(false);
      expect(app?.id.startsWith('passive:')).toBe(true);
    });

    it('updates lastSeenAt when an already registered app is seen again', () => {
      const first = recordActiveProcess('D:\\Tools\\MySpecialTool\\tool.exe', 'Special Tool', 500);
      const firstSeen = first?.lastSeenAt;

      const second = recordActiveProcess('D:\\Tools\\MySpecialTool\\tool.exe', 'Special Tool', 500);
      expect(second?.id).toBe(first?.id);
      expect(second?.lastSeenAt).toBeGreaterThanOrEqual(firstSeen!);
    });
  });

  describe('Définition d\'Identité Stable (STABLE_RESCAN & STABLE_UPDATE)', () => {
    it('garantit STABLE_RESCAN : deux scans successifs du même logiciel produisent le même appId', () => {
      const scan1 = buildAppRecordId('C:\\Program Files\\Spotify\\Spotify.exe');
      const scan2 = buildAppRecordId('C:\\Program Files\\Spotify\\Spotify.exe');
      expect(scan1).toBe(scan2);
      expect(scan1).toBe('win32:c:\\program files\\spotify\\spotify.exe');
    });

    it('garantit STABLE_UPDATE : Discord version N et version N+1 conservent le même appId', () => {
      // Signal 1 : Via parsingPath Squirrel officiel invariant
      const squirrelIdN = buildAppRecordId(
        'C:\\Users\\obedi\\AppData\\Local\\Discord\\app-1.0.9168\\Discord.exe',
        'com.squirrel.Discord.Discord'
      );
      const squirrelIdNext = buildAppRecordId(
        'C:\\Users\\obedi\\AppData\\Local\\Discord\\app-1.0.9219\\Discord.exe',
        'com.squirrel.Discord.Discord'
      );
      expect(squirrelIdN).toBe(squirrelIdNext);
      expect(squirrelIdN).toBe('squirrel:com.squirrel.discord.discord');

      // Signal 2 : Via normalisation du dossier de version transitoire app-X.Y.Z
      const pathIdN = buildAppRecordId('C:\\Users\\obedi\\AppData\\Local\\Discord\\app-1.0.9168\\Discord.exe');
      const pathIdNext = buildAppRecordId('C:\\Users\\obedi\\AppData\\Local\\Discord\\app-1.0.9219\\Discord.exe');
      expect(pathIdN).toBe(pathIdNext);
      expect(pathIdN).toBe('win32:c:\\users\\obedi\\appdata\\local\\discord\\discord.exe');
    });
  });

  describe('ROOT_APPLICATION vs CHILD_OR_HOST_PROCESS', () => {
    it('classifie une application utilisateur comme ROOT_APPLICATION', () => {
      const res = resolveProcessOwnership({ pid: 1000, exeName: 'Discord.exe' });
      expect(res.classification).toBe('ROOT_APPLICATION');
      expect(res.status).toBe('ROOT');
      expect(res.ownerAppId).toBe('Discord.exe');
    });

    it('rattache un helper / renderer à son application racine propriétaire (OWNER_RESOLVED)', () => {
      const activeRoots = new Map<number, string>([[1000, 'Discord.exe']]);
      const res = resolveProcessOwnership(
        { pid: 1005, exeName: 'msedgewebview2.exe', parentPid: 1000 },
        activeRoots
      );
      expect(res.classification).toBe('CHILD_OR_HOST_PROCESS');
      expect(res.status).toBe('OWNER_RESOLVED');
      expect(res.ownerAppId).toBe('Discord.exe');
    });

    it('marque un helper orphelin comme OWNER_UNRESOLVED sans l\'ignorer silencieusement', () => {
      const res = resolveProcessOwnership({ pid: 2000, exeName: 'msedgewebview2.exe' });
      expect(res.classification).toBe('CHILD_OR_HOST_PROCESS');
      expect(res.status).toBe('OWNER_UNRESOLVED');
      expect(res.ownerAppId).toBeUndefined();
    });
  });

  describe('Registry & Icon Path Cleaning (cleanDisplayIconPath & cleanNameKey)', () => {
    it('strips quotes and icon index from DisplayIcon strings', async () => {
      const { cleanDisplayIconPath, cleanNameKey } = await import('./app-inventory');
      expect(cleanDisplayIconPath('"C:\\Games\\Cyberpunk 2077\\bin\\x64\\Cyberpunk2077.exe",0')).toBe(
        'C:\\Games\\Cyberpunk 2077\\bin\\x64\\Cyberpunk2077.exe'
      );
      expect(cleanDisplayIconPath('C:\\Program Files\\Steam\\steam.exe,-101')).toBe(
        'C:\\Program Files\\Steam\\steam.exe'
      );
      expect(cleanDisplayIconPath('  "C:\\App\\icon.ico"  ')).toBe('C:\\App\\icon.ico');
      expect(cleanNameKey('Cyberpunk 2077 - Bonus Content!')).toBe('cyberpunk2077bonuscontent');
    });
  });

  describe('Inventory Deduplication & Reconciliation (reconcileAndDeduplicateInventory)', () => {
    it('deduplicates Steam games and prefers the real Win32 executable while transferring overrides', async () => {
      const { reconcileAndDeduplicateInventory } = await import('./app-inventory');
      const apps = reconcileAndDeduplicateInventory([
        {
          id: 'steam:2807960',
          name: 'BattlefieldT 6',
          exeName: '2807960',
          exePath: 'steam://rungameid/2807960',
          publisher: '',
          category: 'games',
          classificationState: 'RESOLVED',
          classificationSource: 'USER_OVERRIDE',
          classificationReasonCode: 'USER_MANUAL_OVERRIDE',
          classifierVersion: 1,
          source: 'appsFolder',
          isProtected: false,
          targetPath: 'steam://rungameid/2807960',
          steamAppId: '2807960',
          logoPath: 'C:\\Steam\\icon.ico',
        },
        {
          id: 'win32:c:\\program files (x86)\\steam\\steamapps\\common\\battlefield 6\\bf6.exe',
          name: 'BattlefieldT 6',
          exeName: 'bf6.exe',
          exePath: 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Battlefield 6\\bf6.exe',
          publisher: 'Electronic Arts',
          category: 'games',
          classificationState: 'RESOLVED',
          classificationSource: 'BUILTIN_CATALOG',
          classificationReasonCode: 'BUILTIN_EXACT_MATCH',
          classifierVersion: 1,
          source: 'registry',
          isProtected: false,
          targetPath: 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Battlefield 6\\bf6.exe',
          steamAppId: '2807960',
        },
      ]);

      expect(apps).toHaveLength(1);
      expect(apps[0]?.name).toBe('BattlefieldT 6');
      expect(apps[0]?.exeName).toBe('bf6.exe');
      expect(apps[0]?.classificationSource).toBe('USER_OVERRIDE');
      expect(apps[0]?.publisher).toBe('Electronic Arts');
      expect(apps[0]?.logoPath).toBe('C:\\Steam\\icon.ico');
    });

    it('filters out directories and patchers and keeps only main application', async () => {
      const { reconcileAndDeduplicateInventory } = await import('./app-inventory');
      const apps = reconcileAndDeduplicateInventory([
        {
          id: 'app:samples',
          name: 'Samples',
          exeName: 'Samples',
          exePath: 'C:\\Program Files\\Afterburner\\SDK\\Samples',
          publisher: '',
          category: 'utilities',
          classificationState: 'RESOLVED',
          classificationSource: 'BUILTIN_CATALOG',
          classificationReasonCode: 'BUILTIN_EXACT_MATCH',
          classifierVersion: 1,
          source: 'appsFolder',
          isProtected: false,
          targetPath: 'C:\\Program Files\\Afterburner\\SDK\\Samples',
        },
        {
          id: 'app:launcherpatcher',
          name: 'Rockstar Games Launcher',
          exeName: 'LauncherPatcher.exe',
          exePath: 'C:\\Program Files\\Rockstar\\LauncherPatcher.exe',
          publisher: '',
          category: 'games',
          classificationState: 'RESOLVED',
          classificationSource: 'BUILTIN_CATALOG',
          classificationReasonCode: 'BUILTIN_EXACT_MATCH',
          classifierVersion: 1,
          source: 'appsFolder',
          isProtected: false,
          targetPath: 'C:\\Program Files\\Rockstar\\LauncherPatcher.exe',
        },
        {
          id: 'app:launcher',
          name: 'Rockstar Games Launcher',
          exeName: 'Launcher.exe',
          exePath: 'C:\\Program Files\\Rockstar\\Launcher.exe',
          publisher: 'Rockstar Games',
          category: 'games',
          classificationState: 'RESOLVED',
          classificationSource: 'BUILTIN_CATALOG',
          classificationReasonCode: 'BUILTIN_EXACT_MATCH',
          classifierVersion: 1,
          source: 'registry',
          isProtected: false,
          targetPath: 'C:\\Program Files\\Rockstar\\Launcher.exe',
        },
      ]);

      expect(apps.find((a) => a.name === 'Samples')).toBeUndefined();
      const rockstar = apps.filter((a) => a.name === 'Rockstar Games Launcher');
      expect(rockstar).toHaveLength(1);
      expect(rockstar[0]?.exeName).toBe('Launcher.exe');
    });
  });
});

