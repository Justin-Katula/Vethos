/**
 * Génère toutes les variantes du logo Vethos à partir du PNG source.
 *
 * - Rend le fond blanc transparent (chroma-key, tolérance configurable).
 * - Génère un PNG RGBA pour l'usage dans l'app (renderer).
 * - Génère un .ico multi-résolution (16→256) pour Windows (taskbar, .exe).
 * - Génère un PNG 256x256 pour l'installer NSIS.
 *
 * 100 % Node pur (pas de sharp / imagemagick / dépendance externe) :
 * décodage PNG manuel, downscale nearest-neighbor, encodage PNG via zlib,
 * conteneur ICO avec frames PNG embarquées (supporté depuis Vista).
 *
 * Usage : node scripts/build-logo.mjs [seuil-blanc 0-255]
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const ROOT = path.resolve(path.dirname(__filename), '..')
const SRC = path.join(ROOT, 'Logo', 'new-logo.png')
const OUT_DIR = path.join(ROOT, 'build')
const RENDERER_OUT = path.join(ROOT, 'src', 'renderer', 'src', 'assets')
const WHITE_THRESHOLD = Number(process.argv[2] ?? 235) // au-dessus = considéré blanc

// ---------------------------------------------------------------------------
// Décodeur PNG minimal (truecolor RGB=2, RGBA=6, grayscale=0, grayscale+alpha=4)
// Gère uniquement le filtre de base (Sub/Up/Average/Paeth) pour ne pas exploser.
// ---------------------------------------------------------------------------

function decodePng(buf) {
  if (buf[0] !== 0x89 || buf[1] !== 0x50) throw new Error('Pas un PNG')
  const width = buf.readUInt32BE(16)
  const height = buf.readUInt32BE(20)
  const bitDepth = buf[24]
  const colorType = buf[25]
  if (bitDepth !== 8) throw new Error(`Bit depth ${bitDepth} non supporté (8 uniquement)`)

  // Concaténer tous les chunks IDAT
  let off = 8
  let idat = []
  while (off < buf.length) {
    const len = buf.readUInt32BE(off)
    const type = buf.toString('ascii', off + 4, off + 8)
    if (type === 'IDAT') idat.push(buf.slice(off + 8, off + 8 + len))
    if (type === 'IEND') break
    off += 12 + len
  }
  const raw = zlib.inflateSync(Buffer.concat(idat))

  const channels = colorType === 2 ? 3 : colorType === 6 ? 4 : colorType === 4 ? 2 : colorType === 0 ? 1 : null
  if (!channels) throw new Error(`Color type ${colorType} non supporté`)
  const bpp = channels // bytes par pixel (8-bit)
  const stride = width * bpp
  const out = Buffer.alloc(height * stride)

  const paeth = (a, b, c) => {
    const p = a + b - c
    const pa = Math.abs(p - a)
    const pb = Math.abs(p - b)
    const pc = Math.abs(p - c)
    if (pa <= pb && pa <= pc) return a
    if (pb <= pc) return b
    return c
  }

  let pos = 0
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++]
    const rowStart = y * stride
    for (let x = 0; x < stride; x++) {
      const cur = raw[pos++]
      const left = x >= bpp ? out[rowStart + x - bpp] : 0
      const up = y > 0 ? out[(y - 1) * stride + x] : 0
      const upLeft = x >= bpp && y > 0 ? out[(y - 1) * stride + x - bpp] : 0
      let recon
      switch (filter) {
        case 0: recon = cur; break
        case 1: recon = (cur + left) & 0xff; break
        case 2: recon = (cur + up) & 0xff; break
        case 3: recon = (cur + ((left + up) >> 1)) & 0xff; break
        case 4: recon = (cur + paeth(left, up, upLeft)) & 0xff; break
        default: throw new Error(`Filtre PNG ${filter} inconnu`)
      }
      out[rowStart + x] = recon
    }
  }
  return { width, height, channels, data: out }
}

// ---------------------------------------------------------------------------
// Encodeur PNG (RGBA, non compressé via zlib deflate). Format minimal valide.
// ---------------------------------------------------------------------------

function encodePngRgba(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const crcTable = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crcTable.push(c)
  }
  const crc32 = (buf) => {
    let c = 0xffffffff
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length, 0)
    const typeBuf = Buffer.from(type, 'ascii')
    const crcBuf = Buffer.alloc(4)
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
    return Buffer.concat([len, typeBuf, data, crcBuf])
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  ihdr[10] = 0 // compression
  ihdr[11] = 0 // filter
  ihdr[12] = 0 // interlace

  // Ajouter 1 byte filtre (0 = none) au début de chaque ligne
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride)
  }
  const idat = zlib.deflateSync(raw, { level: 9 })

  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}

// ---------------------------------------------------------------------------
// Traitement : chroma-key du blanc → RGBA transparent
// ---------------------------------------------------------------------------

function toRgbaWithWhiteKey(decoded, threshold) {
  const { width, height, channels, data } = decoded
  const rgba = Buffer.alloc(width * height * 4)
  for (let i = 0, j = 0; i < data.length; i += channels, j += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const a = channels === 4 ? data[i + 3] : 255
    // Chroma-key : si les 3 canaux sont au-dessus du seuil → transparent.
    // On lisse en gardant un peu d'alpha sur les pixels proches du blanc
    // pour éviter un crénelage brutal.
    const min = Math.min(r, g, b)
    const max = Math.max(r, g, b)
    if (min >= threshold) {
      rgba[j] = r
      rgba[j + 1] = g
      rgba[j + 2] = b
      rgba[j + 3] = 0
    } else if (max >= threshold - 30 && min >= threshold - 50) {
      // Bord flou : demi-transparence pour l'anti-aliasing.
      const t = Math.max(0, Math.min(1, (threshold - min) / 50))
      rgba[j] = r
      rgba[j + 1] = g
      rgba[j + 2] = b
      rgba[j + 3] = Math.round(255 * t)
    } else {
      rgba[j] = r
      rgba[j + 1] = g
      rgba[j + 2] = b
      rgba[j + 3] = a
    }
  }
  return { width, height, rgba }
}

// ---------------------------------------------------------------------------
// Downscale nearest-neighbor (RGBA → RGBA)
// ---------------------------------------------------------------------------

function resizeNearest(src, srcW, srcH, dstW, dstH) {
  const dst = Buffer.alloc(dstW * dstH * 4)
  for (let y = 0; y < dstH; y++) {
    const sy = Math.min(srcH - 1, Math.floor((y * srcH) / dstH))
    for (let x = 0; x < dstW; x++) {
      const sx = Math.min(srcW - 1, Math.floor((x * srcW) / dstW))
      const si = (sy * srcW + sx) * 4
      const di = (y * dstW + x) * 4
      dst[di] = src[si]
      dst[di + 1] = src[si + 1]
      dst[di + 2] = src[si + 2]
      dst[di + 3] = src[si + 3]
    }
  }
  return dst
}

// Downscale avec averaging pour de meilleurs résultats sur petits formats
function resizeBox(src, srcW, srcH, dstW, dstH) {
  const dst = Buffer.alloc(dstW * dstH * 4)
  for (let y = 0; y < dstH; y++) {
    const y0 = Math.floor((y * srcH) / dstH)
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * srcH) / dstH))
    for (let x = 0; x < dstW; x++) {
      const x0 = Math.floor((x * srcW) / dstW)
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * srcW) / dstW))
      let r = 0, g = 0, b = 0, a = 0, count = 0
      for (let sy = y0; sy < y1 && sy < srcH; sy++) {
        for (let sx = x0; sx < x1 && sx < srcW; sx++) {
          const si = (sy * srcW + sx) * 4
          const pa = src[si + 3]
          // Pondérer par l'alpha pour ne pas diluer avec les pixels transparents
          r += src[si] * pa
          g += src[si + 1] * pa
          b += src[si + 2] * pa
          a += pa
          count++
        }
      }
      const di = (y * dstW + x) * 4
      if (a === 0) {
        dst[di] = 0; dst[di + 1] = 0; dst[di + 2] = 0; dst[di + 3] = 0
      } else {
        dst[di] = Math.round(r / a)
        dst[di + 1] = Math.round(g / a)
        dst[di + 2] = Math.round(b / a)
        dst[di + 3] = Math.round(a / count)
      }
    }
  }
  return dst
}

// ---------------------------------------------------------------------------
// Conteneur ICO (frames PNG embarquées, format supporté depuis Vista)
// ---------------------------------------------------------------------------

function buildIco(pngFrames) {
  // pngFrames : [{ width, png }]  (PNG déjà encodé)
  const count = pngFrames.length
  const headerSize = 6 + count * 16
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type = ICO
  header.writeUInt16LE(count, 4)

  const dir = Buffer.alloc(count * 16)
  let offset = headerSize
  for (let i = 0; i < count; i++) {
    const f = pngFrames[i]
    dir.writeUInt8(f.width >= 256 ? 0 : f.width, i * 16)
    dir.writeUInt8(f.width >= 256 ? 0 : f.width, i * 16 + 1) // height (carré)
    dir.writeUInt8(0, i * 16 + 2) // palette
    dir.writeUInt8(0, i * 16 + 3) // reserved
    dir.writeUInt16LE(1, i * 16 + 4) // color planes
    dir.writeUInt16LE(32, i * 16 + 6) // bits par pixel
    dir.writeUInt32LE(f.png.length, i * 16 + 8) // size
    dir.writeUInt32LE(offset, i * 16 + 12) // offset
    offset += f.png.length
  }
  return Buffer.concat([header, dir, ...pngFrames.map((f) => f.png)])
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log('Logo source :', SRC)
const srcBuf = fs.readFileSync(SRC)
const decoded = decodePng(srcBuf)
console.log(`Source : ${decoded.width}x${decoded.height}, ${decoded.channels} canaux`)

const keyed = toRgbaWithWhiteKey(decoded, WHITE_THRESHOLD)
console.log(`Chroma-key appliqué (seuil blanc = ${WHITE_THRESHOLD})`)

// S'assurer que les dossiers de sortie existent
fs.mkdirSync(OUT_DIR, { recursive: true })
fs.mkdirSync(RENDERER_OUT, { recursive: true })

// 1. PNG RGBA pour l'app renderer (256x256, taille raisonnable)
{
  const appSize = 256
  const resized = resizeBox(keyed.rgba, keyed.width, keyed.height, appSize, appSize)
  const png = encodePngRgba(appSize, appSize, resized)
  const outPath = path.join(RENDERER_OUT, 'vethos-logo.png')
  fs.writeFileSync(outPath, png)
  console.log(`✓ Logo app (RGBA ${appSize}x${appSize}) : ${outPath} (${png.length} octets)`)
}

// 2. PNG haute-résolution NSIS (256x256)
{
  const nsisSize = 256
  const resized = resizeBox(keyed.rgba, keyed.width, keyed.height, nsisSize, nsisSize)
  const png = encodePngRgba(nsisSize, nsisSize, resized)
  const outPath = path.join(OUT_DIR, 'installer-icon.png')
  fs.writeFileSync(outPath, png)
  console.log(`✓ Icône NSIS (${nsisSize}x${nsisSize}) : ${outPath}`)
}

// 3. ICO multi-résolution pour Windows
{
  const sizes = [256, 128, 64, 48, 32, 16]
  const frames = sizes.map((size) => {
    const resized = resizeBox(keyed.rgba, keyed.width, keyed.height, size, size)
    return { width: size, png: encodePngRgba(size, size, resized) }
  })
  const ico = buildIco(frames)
  const outPath = path.join(OUT_DIR, 'icon.ico')
  fs.writeFileSync(outPath, ico)
  console.log(`✓ ICO Windows (${sizes.join('/')}px) : ${outPath} (${ico.length} octets)`)
}

console.log('\nTerminé.')
