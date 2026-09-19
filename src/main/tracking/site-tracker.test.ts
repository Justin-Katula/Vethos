import { describe, expect, it } from 'vitest'
import { canonicalUrlForDomain, extractDomainFromTitle, isTrackableBrowserWindow } from './site-tracker'

describe('site tracker browser window detection', () => {
  it('recognizes Comet as a browser process', () => {
    expect(
      isTrackableBrowserWindow({
        processName: 'comet.exe',
        title: 'instagram.com - Comet',
      }),
    ).toBe(true)
  })

  it('keeps unknown browser-like windows when the title contains a domain', () => {
    expect(
      isTrackableBrowserWindow({
        processName: 'new-browser.exe',
        title: 'instagram.com',
      }),
    ).toBe(true)
  })

  it('does not treat Vethos/Electron windows as browser windows', () => {
    expect(
      isTrackableBrowserWindow({
        processName: 'electron.exe',
        title: 'instagram.com',
      }),
    ).toBe(false)
  })

  it('extracts domains from plain browser tab titles', () => {
    expect(extractDomainFromTitle('instagram.com')).toBe('instagram.com')
  })
})

describe('adresse interrogée pour connaître le titre d’une page', () => {
  // L'ancienne version renvoyait l'URL BRUTE trouvée dans le titre de la fenêtre.
  // Ce titre vient d'une page web, donc de n'importe qui : une page intitulée
  // « http://192.168.1.1/reboot » faisait émettre cette requête depuis le poste de
  // l'utilisateur, vers un service que l'attaquant ne peut pas joindre lui-même.
  const internes = [
    'localhost',
    '127.0.0.1',
    '0.0.0.0',
    '::1',
    '10.0.0.5',
    '192.168.1.1',
    '169.254.169.254',
    '172.16.0.1',
    '172.31.255.254',
  ]
  for (const hote of internes) {
    it(`refuse ${hote}`, () => {
      expect(canonicalUrlForDomain(hote)).toBeNull()
    })
  }

  it('refuse tout ce qui n’est pas un domaine nu', () => {
    // Port, chemin, identifiants, seconde adresse : autant de façons de sortir
    // de l'hôte que l'on croit interroger.
    expect(canonicalUrlForDomain('exemple.com:8080')).toBeNull()
    expect(canonicalUrlForDomain('exemple.com/admin')).toBeNull()
    expect(canonicalUrlForDomain('user:mdp@exemple.com')).toBeNull()
    expect(canonicalUrlForDomain('exemple.com@127.0.0.1')).toBeNull()
    expect(canonicalUrlForDomain('exemple.com#@127.0.0.1')).toBeNull()
    expect(canonicalUrlForDomain('')).toBeNull()
  })

  it('accepte un vrai domaine, et le force en https', () => {
    expect(canonicalUrlForDomain('youtube.com')).toBe('https://youtube.com/')
    expect(canonicalUrlForDomain('M.YouTube.COM')).toBe('https://m.youtube.com/')
  })
})
