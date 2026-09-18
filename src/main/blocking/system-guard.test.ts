import { describe, it, expect } from 'vitest';
import {
  isProtectedExe,
  isProtectedApp,
  isHostOrSubprocess,
  sanitizeCandidateApps,
  sanitizeBlockingTargets,
} from './system-guard';

describe('SystemGuard Protection Rules', () => {
  describe('Canonical path validation for explorer.exe', () => {
    it('protects explorer.exe when path is canonical C:\\Windows\\explorer.exe', () => {
      expect(isProtectedExe('explorer.exe', 'C:\\Windows\\explorer.exe')).toBe(true);
      expect(isProtectedExe('explorer.exe', 'c:\\windows\\explorer.exe')).toBe(true);
    });

    it('protects explorer.exe when no path is provided (default safe assumption)', () => {
      expect(isProtectedExe('explorer.exe')).toBe(true);
    });

    it('DOES NOT protect rogue explorer.exe placed in Downloads or Temp', () => {
      expect(isProtectedExe('explorer.exe', 'C:\\Users\\obedi\\Downloads\\explorer.exe')).toBe(false);
      expect(isProtectedExe('explorer.exe', 'C:\\Temp\\explorer.exe')).toBe(false);
      expect(isProtectedExe('explorer.exe', 'D:\\Games\\explorer.exe')).toBe(false);
    });
  });

  describe('Administrative utilities and terminals', () => {
    it('protects PowerShell and cmd.exe', () => {
      expect(isProtectedExe('powershell.exe')).toBe(true);
      expect(isProtectedExe('powershell.exe', 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')).toBe(true);
      expect(isProtectedExe('pwsh.exe')).toBe(true);
      expect(isProtectedExe('cmd.exe')).toBe(true);
      expect(isProtectedExe('cmd.exe', 'C:\\Windows\\System32\\cmd.exe')).toBe(true);
    });

    it('does not protect cmd.exe if placed in Downloads', () => {
      expect(isProtectedExe('cmd.exe', 'C:\\Users\\User\\Downloads\\cmd.exe')).toBe(false);
    });

    it('protects Windows Terminal, Task Manager, Settings, and Vethos', () => {
      expect(isProtectedExe('windowsterminal.exe')).toBe(true);
      expect(isProtectedExe('wt.exe')).toBe(true);
      expect(isProtectedExe('taskmgr.exe')).toBe(true);
      expect(isProtectedExe('systemsettings.exe')).toBe(true);
      expect(isProtectedExe('sechealthui.exe')).toBe(true);
      expect(isProtectedExe('vethos.exe')).toBe(true);
    });

    it('does not protect regular applications', () => {
      expect(isProtectedExe('discord.exe')).toBe(false);
      expect(isProtectedExe('steam.exe')).toBe(false);
      expect(isProtectedExe('chrome.exe')).toBe(false);
      expect(isProtectedExe('spotify.exe')).toBe(false);
      expect(isProtectedExe('code.exe')).toBe(false);
    });
  });

  describe('Protected AUMIDs & App display names', () => {
    it('protects Windows Settings and Windows Security by AUMID', () => {
      expect(
        isProtectedApp({
          name: 'Settings',
          aumid: 'windows.immersivecontrolpanel_cw5n1h2txyewy!microsoft.windows.immersivecontrolpanel',
        })
      ).toBe(true);

      expect(
        isProtectedApp({
          name: 'Windows Security',
          aumid: 'Microsoft.SecHealthUI_8wekyb3d8bbwe!SecHealthUI',
        })
      ).toBe(true);
    });

    it('protects Task Manager and Windows Terminal by localized display name', () => {
      expect(isProtectedApp({ name: 'Gestionnaire des tâches' })).toBe(true);
      expect(isProtectedApp({ name: 'Task Manager' })).toBe(true);
      expect(isProtectedApp({ name: 'Windows Terminal' })).toBe(true);
      expect(isProtectedApp({ name: 'Invite de commandes' })).toBe(true);
    });
  });

  describe('Host and background subprocesses', () => {
    it('identifies helper and background subprocesses', () => {
      expect(isHostOrSubprocess('msedgewebview2.exe')).toBe(true);
      expect(isHostOrSubprocess('backgroundTaskHost.exe')).toBe(true);
      expect(isHostOrSubprocess('runtimebroker.exe')).toBe(true);
      expect(isHostOrSubprocess('conhost.exe')).toBe(true);
      expect(isHostOrSubprocess('crashpad_handler.exe')).toBe(true);
    });

    it('does not flag normal user apps as host/subprocess', () => {
      expect(isHostOrSubprocess('slack.exe')).toBe(false);
      expect(isHostOrSubprocess('notion.exe')).toBe(false);
    });
  });

  describe('Candidate sanitization (pre-DeepSeek)', () => {
    it('strips protected apps and helper subprocesses before submitting to AI', () => {
      const candidates = [
        { id: '1', name: 'Discord', exeName: 'discord.exe' },
        { id: '2', name: 'Explorer', exeName: 'explorer.exe', targetPath: 'C:\\Windows\\explorer.exe' },
        { id: '3', name: 'PowerShell', exeName: 'powershell.exe' },
        { id: '4', name: 'WebView2 Helper', exeName: 'msedgewebview2.exe' },
        { id: '5', name: 'Steam', exeName: 'steam.exe' },
      ];

      const sanitized = sanitizeCandidateApps(candidates);
      expect(sanitized.map((c) => c.name)).toEqual(['Discord', 'Steam']);
    });
  });

  describe('Target sanitization (post-DeepSeek)', () => {
    it('rejects protected targets returned by AI and allows valid targets', () => {
      const inventory = [
        { id: 'app-discord', name: 'Discord', exeName: 'discord.exe' },
        { id: 'app-steam', name: 'Steam', exeName: 'steam.exe' },
        { id: 'app-taskmgr', name: 'Task Manager', exeName: 'taskmgr.exe' },
        { id: 'app-terminal', name: 'Windows Terminal', exeName: 'windowsterminal.exe' },
      ];

      const aiReturnedTargets = [
        'app-discord',
        'app-taskmgr',
        'explorer.exe',
        'pwsh.exe',
        'app-steam',
      ];

      const { allowedTargets, rejectedTargets } = sanitizeBlockingTargets(aiReturnedTargets, inventory);

      expect(allowedTargets).toEqual(['app-discord', 'app-steam']);
      expect(rejectedTargets).toContain('app-taskmgr');
      expect(rejectedTargets).toContain('explorer.exe');
      expect(rejectedTargets).toContain('pwsh.exe');
    });
  });
});
