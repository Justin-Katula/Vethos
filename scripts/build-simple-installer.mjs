import { existsSync, readdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const version = pkg.version ?? '0.0.0'
const version4 = version.split('.').concat(['0', '0', '0']).slice(0, 4).join('.')

const sourceDir = join(root, 'release', 'win-unpacked')
const outFile = join(root, 'release', `Vethos-Setup-${version}.exe`)
const script = join(root, 'scripts', 'vethos-simple-installer.nsi')

if (!existsSync(sourceDir)) {
  throw new Error(`Missing ${sourceDir}. Run electron-builder --win --dir first.`)
}

const makensis = findMakensis()
const result = spawnSync(
  makensis,
  [`/DSOURCE_DIR=${sourceDir}`, `/DOUT_FILE=${outFile}`, `/DAPP_VERSION=${version}`, `/DAPP_VERSION4=${version4}`, script],
  { stdio: 'inherit' },
)

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}

function findMakensis() {
  const localAppData = process.env.LOCALAPPDATA
  if (!localAppData) throw new Error('LOCALAPPDATA is not set; cannot find NSIS cache.')

  const cacheRoot = join(localAppData, 'electron-builder', 'Cache', 'nsis')
  const direct = join(cacheRoot, 'nsis-3.0.4.1', 'Bin', 'makensis.exe')
  if (existsSync(direct)) return direct

  for (const entry of readdirSync(cacheRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const candidate = join(cacheRoot, entry.name, 'Bin', 'makensis.exe')
    if (existsSync(candidate)) return candidate
  }

  throw new Error(`makensis.exe not found under ${cacheRoot}`)
}
