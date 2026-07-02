import { describe, it } from 'vitest'
import { discoverInstalledApps } from './app-discovery'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const runLiveScan = process.env.VETHOS_RUN_LIVE_SCAN === '1'
const describeLiveScan = runLiveScan ? describe : describe.skip

describeLiveScan('live-scan', () => {
  it('runs live scan and writes results to a file', async () => {
    console.log('Starting live app discovery...')
    const apps = await discoverInstalledApps()
    console.log(`Discovered ${apps.length} apps.`)
    const outputPath =
      process.env.VETHOS_LIVE_SCAN_OUTPUT ??
      path.join(os.tmpdir(), 'vethos-live-scan-results.json')
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    fs.writeFileSync(outputPath, JSON.stringify(apps, null, 2), 'utf-8')
    console.log(`Saved results to: ${outputPath}`)
  }, 60000)
})
