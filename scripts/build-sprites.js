const fs = require('fs')
const path = require('path')
const { Resvg } = require('@resvg/resvg-js')
const { PNG } = require('pngjs')

const repoRoot = path.resolve(__dirname, '..')
const outputDir = path.resolve(repoRoot, 'plugin/public/styles/sprites')
const outputBase = path.join(outputDir, 's52')
const iconDir = path.resolve(repoRoot, 'src/assets/charts/icons')

fs.mkdirSync(outputDir, { recursive: true })

const writeSpriteJson = (filePath, entries, size, pixelRatio) => {
  const data = {}
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

const renderIcon = (svgPath, size) => {
  const svg = fs.readFileSync(svgPath, 'utf8')
  const resvg = new Resvg(svg, {
    fitTo: {
      mode: 'width',
      value: size
    }
  })
  const rendered = resvg.render()
  const pngData = rendered.asPng()
  const decoded = PNG.sync.read(pngData)
  if (decoded.width === size && decoded.height === size) {
    return decoded
  }
  const padded = new PNG({ width: size, height: size })
  const offsetX = Math.max(0, Math.floor((size - decoded.width) / 2))
  const offsetY = Math.max(0, Math.floor((size - decoded.height) / 2))
  PNG.bitblt(
    decoded,
    padded,
    0,
    0,
    decoded.width,
    decoded.height,
    offsetX,
    offsetY
  )
  return padded
}

const buildSprite = (size, suffix, pixelRatio) => {
  const outputPng = `${outputBase}${suffix}.png`
  const outputJson = `${outputBase}${suffix}.json`

  const spriteWidth = size * iconSvgs.length
  const sprite = new PNG({ width: spriteWidth, height: size })

  iconSvgs.forEach((icon, index) => {
    const rendered = renderIcon(icon.path, size)
    PNG.bitblt(
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

  fs.writeFileSync(outputPng, PNG.sync.write(sprite))
  writeSpriteJson(outputJson, iconNames, size, pixelRatio)
}

buildSprite(32, '', 1)
buildSprite(64, '@2x', 2)
