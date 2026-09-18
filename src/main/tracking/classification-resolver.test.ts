import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  resolveAppClassificationSync,
  resolveAppClassification,
  setUserOverride,
  initUserOverrides,
  clearUserOverrides,
  clearLocalKnowledge,
  canSourceOverwrite,
  askAiForAppCategory,
  type AppIdentityInput,
  type AppOverrideRecord,
} from './classification-resolver'
import * as deepseek from '@main/blocking/deepseek'

vi.mock('@main/blocking/deepseek', () => ({
  askDeepSeekJson: vi.fn(),
}))

describe('classification-resolver', () => {
  beforeEach(() => {
    clearUserOverrides()
    clearLocalKnowledge()
    vi.clearAllMocks()
  })

  describe('Authority hierarchy (canSourceOverwrite & resolveAppClassificationSync)', () => {
    it('ranks sources correctly: USER_OVERRIDE > BUILTIN > LOCAL > METADATA > AI > UNRESOLVED', () => {
      expect(canSourceOverwrite('USER_OVERRIDE', 'BUILTIN_CATALOG')).toBe(false)
      expect(canSourceOverwrite('BUILTIN_CATALOG', 'USER_OVERRIDE')).toBe(true)

      expect(canSourceOverwrite('BUILTIN_CATALOG', 'EXACT_LOCAL_KNOWLEDGE')).toBe(false)
      expect(canSourceOverwrite('EXACT_LOCAL_KNOWLEDGE', 'BUILTIN_CATALOG')).toBe(true)

      expect(canSourceOverwrite('EXACT_LOCAL_KNOWLEDGE', 'DETERMINISTIC_METADATA_RULE')).toBe(false)
      expect(canSourceOverwrite('DETERMINISTIC_METADATA_RULE', 'EXACT_LOCAL_KNOWLEDGE')).toBe(true)

      expect(canSourceOverwrite('DETERMINISTIC_METADATA_RULE', 'AI_RESOLVED')).toBe(false)
      expect(canSourceOverwrite('AI_RESOLVED', 'DETERMINISTIC_METADATA_RULE')).toBe(true)

      expect(canSourceOverwrite('AI_RESOLVED', 'UNRESOLVED')).toBe(false)
      expect(canSourceOverwrite('UNRESOLVED', 'AI_RESOLVED')).toBe(true)
    })


  })

  describe('PWA Isolation (Anime-Sama & chrome_proxy.exe)', () => {
    it('Anime-Sama PWA is never classified as Google Chrome or utilities', () => {
      const animeSamaPwa: AppIdentityInput = {
        id: 'pwa:chrome._crx_kmpbgkdpgngfldkjdfghjklmnbvcxz',
        name: 'Anime-Sama',
        exeName: 'chrome_proxy.exe',
        targetPath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome_proxy.exe',
        parsingPath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome_proxy.exe --app-id=kmpbgkdpgngfldkjdfghjklmnbvcxz',
      }

      const res = resolveAppClassificationSync(animeSamaPwa)
      // Ne doit JAMAIS être classé en 'utilities' ou comme Chrome
      expect(res.category).not.toBe('utilities')
      // Sans AI_RESOLVED ou règle spécifique, reste UNRESOLVED proprement
      expect(res.classificationState).toBe('UNRESOLVED')
      expect(res.category).toBeNull()
      expect(res.appIdInterne).toBe('pwa:chrome._crx_kmpbgkdpgngfldkjdfghjklmnbvcxz')
    })

  })

  describe('Ubisoft Connect consolidation', () => {
    it('recognizes both ubisoftconnect.exe and upc.exe as games', () => {
      const ubi1 = resolveAppClassificationSync({
        name: 'Ubisoft Connect',
        exeName: 'ubisoftconnect.exe',
      })
      expect(ubi1.category).toBe('games')
      expect(ubi1.classificationState).toBe('RESOLVED')

      const ubi2 = resolveAppClassificationSync({
        name: 'Ubisoft Connect',
        exeName: 'upc.exe',
      })
      expect(ubi2.category).toBe('games')
      expect(ubi2.classificationState).toBe('RESOLVED')
    })
  })

  describe('Deterministic metadata rules (Steam & UWP)', () => {
    it('detects Steam games via targetPath steam://rungameid/', () => {
      const steamGame: AppIdentityInput = {
        name: 'Custom Unlisted Game',
        exeName: 'custom_game.exe',
        targetPath: 'steam://rungameid/999999',
      }

      const res = resolveAppClassificationSync(steamGame)
      expect(res.category).toBe('games')
      expect(res.classificationSource).toBe('DETERMINISTIC_METADATA_RULE')
      expect(res.classificationReasonCode).toBe('METADATA_STEAM_PROTOCOL')
    })

    it('detects UWP Windows Terminal as productivity', () => {
      const terminal: AppIdentityInput = {
        name: 'Custom Dev Terminal',
        exeName: 'custom_terminal.exe',
        parsingPath: 'Microsoft.WindowsTerminal_8wekyb3d8bbwe!App',
      }

      const res = resolveAppClassificationSync(terminal)
      expect(res.category).toBe('productivity')
      expect(res.classificationSource).toBe('DETERMINISTIC_METADATA_RULE')
    })
  })

  describe('Avoid substring collisions (Blender & AMD Software)', () => {
    it('Blender with blender-launcher.exe is creativity, NOT games', () => {
      const blender = resolveAppClassificationSync({
        name: 'Blender',
        exeName: 'blender-launcher.exe',
        targetPath: 'C:\\Program Files\\Blender Foundation\\Blender 4.2\\blender-launcher.exe',
      })
      expect(blender.category).toBe('creativity')
      expect(blender.category).not.toBe('games')
    })

    it('AMD Software is NOT classified as creativity due to "edit" in Edition', () => {
      const amd = resolveAppClassificationSync({
        name: 'AMD Software: Adrenalin Edition',
        exeName: 'radeonsoftware.exe',
      })
      // Ne doit JAMAIS être 'creativity'
      expect(amd.category).not.toBe('creativity')
    })
  })

  describe('UNRESOLVED vs OTHER distinction', () => {
    it('returns category: null and UNRESOLVED for totally unknown apps without AI', () => {
      const unknownApp: AppIdentityInput = {
        name: 'XyzFubarApplicationUnique123',
        exeName: 'xyzfubar123.exe',
      }

      const res = resolveAppClassificationSync(unknownApp)
      expect(res.category).toBeNull()
      expect(res.classificationState).toBe('UNRESOLVED')
      expect(res.classificationSource).toBe('UNRESOLVED')
    })

    it('does not assign "others" unless explicitly classified as such', async () => {
      const appInput: AppIdentityInput = {
        name: 'RandomMiscTool',
        exeName: 'misctool.exe',
      }

      const syncRes = resolveAppClassificationSync(appInput)
      expect(syncRes.category).not.toBe('others')
      expect(syncRes.category).toBeNull()

      // Maintenant, supposons qu'un override utilisateur désigne 'others'
      await setUserOverride('misctool.exe', 'others')
      const overriddenRes = resolveAppClassificationSync(appInput)
      expect(overriddenRes.category).toBe('others')
      expect(overriddenRes.classificationState).toBe('RESOLVED')
      expect(overriddenRes.classificationSource).toBe('USER_OVERRIDE')
    })
  })

  describe('DeepSeek AI classification & strict enum validation', () => {
    it('accepts valid canonical category from AI', async () => {
      vi.mocked(deepseek.askDeepSeekJson).mockResolvedValueOnce({
        category: 'entertainment',
      })

      const cat = await askAiForAppCategory({
        name: 'Crunchyroll',
        exeName: 'crunchyroll.exe',
      })

      expect(cat).toBe('entertainment')
    })

    it('strictly rejects non-canonical categories from AI', async () => {
      vi.mocked(deepseek.askDeepSeekJson).mockResolvedValueOnce({
        category: 'anime_streaming', // Non valide dans APP_CATEGORIES
      })

      const cat = await askAiForAppCategory({
        name: 'Crunchyroll',
        exeName: 'crunchyroll.exe',
      })

      expect(cat).toBeNull()
    })

    it('handles AI network errors, invalid JSON or timeout gracefully by returning null', async () => {
      vi.mocked(deepseek.askDeepSeekJson).mockRejectedValueOnce(new Error('Timeout'))

      const cat = await askAiForAppCategory({
        name: 'TestApp',
        exeName: 'testapp.exe',
      })

      expect(cat).toBeNull()
    })

    it('resolveAppClassification invokes AI only when requiredNow === true', async () => {
      vi.mocked(deepseek.askDeepSeekJson).mockResolvedValueOnce({
        category: 'entertainment',
      })

      const appInput: AppIdentityInput = {
        name: 'UnknownMediaViewer',
        exeName: 'unknownmedia.exe',
      }

      // requiredNow = false -> Pas d'appel IA, reste UNRESOLVED
      const syncResult = await resolveAppClassification(appInput, { requiredNow: false })
      expect(syncResult.classificationState).toBe('UNRESOLVED')
      expect(syncResult.category).toBeNull()
      expect(deepseek.askDeepSeekJson).not.toHaveBeenCalled()

      // requiredNow = true -> Appel IA déclenché
      const aiResult = await resolveAppClassification(appInput, { requiredNow: true })
      expect(aiResult.classificationState).toBe('RESOLVED')
      expect(aiResult.category).toBe('entertainment')
      expect(aiResult.classificationSource).toBe('AI_RESOLVED')
      expect(deepseek.askDeepSeekJson).toHaveBeenCalledTimes(1)
    })
  })

  describe('User override persistence & initialization', () => {
    it('persists overrides and restores them via initUserOverrides', async () => {
      let savedData: Record<string, AppOverrideRecord> = {}
      const onPersist = vi.fn().mockImplementation(async (data: Record<string, AppOverrideRecord>) => {
        savedData = { ...data }
      })

      initUserOverrides({}, onPersist)

      await setUserOverride('myapp.exe', 'creativity')
      expect(onPersist).toHaveBeenCalledTimes(1)
      expect(savedData['myapp.exe']?.category).toBe('creativity')

      // Simule un redémarrage avec les données persistées
      clearUserOverrides()
      initUserOverrides(savedData)

      const appInput: AppIdentityInput = {
        name: 'My App',
        exeName: 'myapp.exe',
      }
      const res = resolveAppClassificationSync(appInput)
      expect(res.category).toBe('creativity')
      expect(res.classificationSource).toBe('USER_OVERRIDE')
    })
  })
})
