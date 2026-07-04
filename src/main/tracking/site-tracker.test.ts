import { describe, expect, it } from 'vitest'
import { extractDomainFromTitle, isTrackableBrowserWindow } from './site-tracker'

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
