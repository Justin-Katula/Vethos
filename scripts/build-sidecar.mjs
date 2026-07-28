// Compile le sidecar natif vethos-probe.
//
// Localise Visual Studio via vswhere.exe, dont le chemin est garanti fixe par
// l'installeur, puis appelle cl.exe dans un environnement vcvars64.
//
//   node scripts/build-sidecar.mjs          compile le sidecar
//   node scripts/build-sidecar.mjs --test   compile et execute le test du codec
import { execFileSync, execSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const NATIVE = join(ROOT, 'native', 'vethos-probe')
const OUT_DIR = join(ROOT, 'resources', 'sidecar')
const OBJ_DIR = join(NATIVE, 'obj')

const WITH_TEST = process.argv.includes('--test')

function findVcVars() {
  const programFilesX86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)'
  const vswhere = join(programFilesX86, 'Microsoft Visual Studio', 'Installer', 'vswhere.exe')
  if (!existsSync(vswhere)) {
    throw new Error(
      `vswhere introuvable a ${vswhere}.\n` +
        'Installe la charge de travail "Developpement Desktop en C++" de Visual Studio.',
    )
  }
  const installPath = execFileSync(
    vswhere,
    [
      '-latest',
      '-products',
      '*',
      '-requires',
      'Microsoft.VisualStudio.Component.VC.Tools.x86.x64',
      '-property',
      'installationPath',
    ],
    { encoding: 'utf8' },
  ).trim()
  if (!installPath) {
    throw new Error('Aucune installation Visual Studio avec les outils C++ x64.')
  }
  const vcvars = join(installPath, 'VC', 'Auxiliary', 'Build', 'vcvars64.bat')
  if (!existsSync(vcvars)) throw new Error(`vcvars64.bat introuvable a ${vcvars}.`)
  return vcvars
}

// /MT lie le CRT statiquement : le binaire ne depend d'aucun redistribuable.
const COMMON_FLAGS = '/nologo /std:c++20 /EHsc /W4 /O2 /MT /DUNICODE /D_UNICODE'
const LIBS = 'user32.lib ole32.lib oleaut32.lib dwmapi.lib shell32.lib advapi32.lib'

function run(vcvars, commands) {
  const batPath = join(NATIVE, '.build.bat')
  const script = ['@echo off', `call "${vcvars}" >nul 2>&1`, `cd /d "${NATIVE}"`, ...commands].join(
    '\r\n',
  )
  writeFileSync(batPath, `${script}\r\n`, 'utf8')
  try {
    execSync(`"${batPath}"`, { stdio: 'inherit', windowsHide: true })
  } finally {
    rmSync(batPath, { force: true })
  }
}

function main() {
  if (process.platform !== 'win32') {
    throw new Error('Le sidecar est specifique a Windows.')
  }
  const vcvars = findVcVars()
  mkdirSync(OUT_DIR, { recursive: true })
  mkdirSync(OBJ_DIR, { recursive: true })

  const commands = []
  if (WITH_TEST) {
    commands.push(
      `cl ${COMMON_FLAGS} /Fo"obj\\\\" test\\test_json.cpp src\\json.cpp ` +
        `/Fe"obj\\test_json.exe" || exit /b 1`,
      'obj\\test_json.exe || exit /b 1',
    )
  }
  commands.push(
    `cl ${COMMON_FLAGS} /Fo"obj\\\\" src\\json.cpp src\\win_windows.cpp src\\undo_log.cpp ` +
      `src\\main.cpp /Fe"${join(OUT_DIR, 'vethos-probe.exe')}" /link ${LIBS} || exit /b 1`,
  )
  run(vcvars, commands)
  console.log(`sidecar compile -> ${join(OUT_DIR, 'vethos-probe.exe')}`)
}

main()
