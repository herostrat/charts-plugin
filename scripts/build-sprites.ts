import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { Resvg } from '@resvg/resvg-js'
import { PNG } from 'pngjs'
import crypto from 'crypto'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const repoRoot = path.resolve(__dirname, '..')
const pluginOutDir = process.env.PLUGIN_OUT_DIR || 'plugin'
const outputDir = path.resolve(repoRoot, pluginOutDir, 'public/styles/sprites')
const outputBase = path.join(outputDir, 'nautical')
const iconDir = path.resolve(repoRoot, 'assets/sprites/icons')
const cacheDir = path.resolve(repoRoot, '.cache', 'runtime-assets', 'sprites')

fs.mkdirSync(outputDir, { recursive: true })
fs.mkdirSync(cacheDir, { recursive: true })

type SpriteEntry = {
  x: number
  y: number
  width: number
  height: number
  pixelRatio: number
}

type PngInstance = InstanceType<typeof PNG>

type PngBitblt = (
  src: PngInstance,
  dest: PngInstance,
  sx: number,
  sy: number,
  w: number,
  h: number,
  dx: number,
  dy: number
) => void

type ResvgFitTo = { mode: 'width' | 'height' | 'zoom'; value: number }

const writeSpriteJson = (
  filePath: string,
  entries: string[],
  size: number,
  pixelRatio: number
) => {
  const data: Record<string, SpriteEntry> = {}
  entries.forEach((entry, index) => {
    data[entry] = {
      x: index * size,
      y: 0,
      width: size,
      height: size,
      pixelRatio
    }
  })
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2))
}

const iconNames = fs
  .readdirSync(iconDir)
  .filter((file) => file.toLowerCase().endsWith('.svg'))
  .map((file) => path.basename(file, '.svg'))
  .sort()

if (iconNames.length === 0) {
  console.error('No SVG icons found in', iconDir)
  process.exit(1)
}

const iconSvgs = iconNames.map((name) => ({
  name,
  path: path.join(iconDir, `${name}.svg`)
}))

const hashFile = (filePath: string) => {
  const content = fs.readFileSync(filePath)
  return crypto.createHash('sha256').update(content).digest('hex')
}

const computeSpriteHash = () => {
  const hash = crypto.createHash('sha256')
  hash.update(`sprite-size:32,64;ratio:1,2;count:${iconSvgs.length}`)
  iconSvgs.forEach((icon) => {
    hash.update(icon.name)
    hash.update(hashFile(icon.path))
  })
  return hash.digest('hex')
}

const cachePathsFor = (suffix: string) => {
  return {
    png: path.join(cacheDir, `nautical${suffix}.png`),
    json: path.join(cacheDir, `nautical${suffix}.json`)
  }
}

const outputPathsFor = (suffix: string) => {
  return {
    png: `${outputBase}${suffix}.png`,
    json: `${outputBase}${suffix}.json`
  }
}

const copyCachedSprites = (suffix: string) => {
  const cached = cachePathsFor(suffix)
  const output = outputPathsFor(suffix)
  if (fs.existsSync(cached.png) && fs.existsSync(cached.json)) {
    fs.copyFileSync(cached.png, output.png)
    fs.copyFileSync(cached.json, output.json)
    return true
  }
  return false
}

const bitblt = (PNG as unknown as { bitblt: PngBitblt }).bitblt

const renderIcon = (svgPath: string, size: number) => {
  const svg = fs.readFileSync(svgPath, 'utf8')

  const renderWithFit = (fitTo: ResvgFitTo) => {
    const resvg = new Resvg(svg, { fitTo })
    const rendered = resvg.render()
    return PNG.sync.read(rendered.asPng())
  }

  let decoded = renderWithFit({ mode: 'width', value: size })
  if (decoded.width > size || decoded.height > size) {
    decoded = renderWithFit({ mode: 'height', value: size })
  }
  if (decoded.width > size || decoded.height > size) {
    const scale = size / Math.max(decoded.width, decoded.height)
    decoded = renderWithFit({ mode: 'zoom', value: scale })
  }

  if (decoded.width === size && decoded.height === size) {
    return decoded
  }

  const padded = new PNG({ width: size, height: size })
  const offsetX = Math.max(0, Math.floor((size - decoded.width) / 2))
  const offsetY = Math.max(0, Math.floor((size - decoded.height) / 2))
  bitblt(decoded, padded, 0, 0, decoded.width, decoded.height, offsetX, offsetY)
  return padded
}

const buildSprite = (size: number, suffix: string, pixelRatio: number) => {
  const output = outputPathsFor(suffix)

  const spriteWidth = size * iconSvgs.length
  const sprite = new PNG({ width: spriteWidth, height: size })

  iconSvgs.forEach((icon, index) => {
    const rendered = renderIcon(icon.path, size)
    bitblt(
      rendered,
      sprite,
      0,
      0,
      rendered.width,
      rendered.height,
      index * size,
      0
    )
  })

  fs.writeFileSync(output.png, PNG.sync.write(sprite))
  writeSpriteJson(output.json, iconNames, size, pixelRatio)
}

const persistCache = (suffix: string) => {
  const cached = cachePathsFor(suffix)
  const output = outputPathsFor(suffix)
  fs.copyFileSync(output.png, cached.png)
  fs.copyFileSync(output.json, cached.json)
}

const hash = computeSpriteHash()
const hashFilePath = path.join(cacheDir, 'nautical.hash')
const prevHash = fs.existsSync(hashFilePath)
  ? fs.readFileSync(hashFilePath, 'utf8').trim()
  : ''

if (hash === prevHash) {
  const copied = copyCachedSprites('') && copyCachedSprites('@2x')
  if (copied) {
    process.stdout.write('Sprites unchanged; used cached outputs.\n')
    process.exit(0)
  }
}

buildSprite(32, '', 1)
buildSprite(64, '@2x', 2)
persistCache('')
persistCache('@2x')
fs.writeFileSync(hashFilePath, hash)
