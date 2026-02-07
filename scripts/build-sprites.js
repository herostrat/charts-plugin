const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const repoRoot = path.resolve(__dirname, '..')
const outputDir = path.resolve(repoRoot, 'plugin/public/styles/sprites')
const outputBase = path.join(outputDir, 's52')
const iconDir = path.resolve(repoRoot, 'src/assets/charts/icons')
const spritezero = path.resolve(
  repoRoot,
  'node_modules/@mapbox/spritezero-cli/bin/spritezero'
)

fs.mkdirSync(outputDir, { recursive: true })

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    ...options
  })
  if (result.status !== 0) {
    process.exit(result.status || 1)
  }
}

const hasCommand = (command, args) => {
  const result = spawnSync(command, args, { encoding: 'utf8' })
  return result.status === 0
}

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

if (fs.existsSync(spritezero)) {
  run(process.execPath, [spritezero, '--retina', outputBase, iconDir])
  process.exit(0)
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

const findConvertCommand = () => {
  if (hasCommand('magick', ['-version'])) {
    return { command: 'magick', prefixArgs: [] }
  }
  if (hasCommand('convert', ['-version'])) {
    const output = spawnSync('convert', ['-version'], { encoding: 'utf8' })
    const text = `${output.stdout || ''}${output.stderr || ''}`
    if (text.includes('ImageMagick 7')) {
      console.error(
        'ImageMagick 7 detected but "magick" is not available. Install ImageMagick with the magick CLI to avoid deprecated convert warnings.'
      )
      process.exit(1)
    }
    return { command: 'convert', prefixArgs: [] }
  }
  return null
}

const hasRsvg = hasCommand('rsvg-convert', ['--version'])
const convertTool = findConvertCommand()
const tmpDir = path.join(outputDir, '__tmp')
fs.mkdirSync(tmpDir, { recursive: true })

const renderIcon = (svgPath, size, outPath) => {
  if (hasRsvg) {
    run('rsvg-convert', ['-w', String(size), '-h', String(size), '-o', outPath, svgPath])
    return
  }
  if (!convertTool) {
    console.error('No SVG renderer available (rsvg-convert/magick/convert).')
    process.exit(1)
  }
  if (convertTool.command === 'magick' && convertTool.prefixArgs.length === 0) {
    run(convertTool.command, [
      svgPath,
      '-background',
      'none',
      '-alpha',
      'on',
      '-define',
      'png:color-type=6',
      '-resize',
      `${size}x${size}`,
      outPath
    ])
    return
  }
  run(convertTool.command, [
    ...convertTool.prefixArgs,
    '-background',
    'none',
    '-alpha',
    'on',
    '-define',
    'png:color-type=6',
    '-resize',
    `${size}x${size}`,
    svgPath,
    outPath
  ])
}

const buildSprite = (size, suffix, pixelRatio) => {
  const outputPng = `${outputBase}${suffix}.png`
  const outputJson = `${outputBase}${suffix}.json`

  const rendered = iconSvgs.map((icon) => {
    const target = path.join(tmpDir, `${icon.name}-${size}.png`)
    renderIcon(icon.path, size, target)
    return target
  })

  if (!convertTool) {
    console.error('ImageMagick not found (magick/convert).')
    process.exit(1)
  }
  if (convertTool.command === 'magick' && convertTool.prefixArgs.length === 0) {
    run(convertTool.command, [
      ...rendered,
      '-background',
      'none',
      '-alpha',
      'on',
      '+append',
      outputPng
    ])
  } else {
    run(convertTool.command, [
      ...convertTool.prefixArgs,
      ...rendered,
      '-background',
      'none',
      '-alpha',
      'on',
      '+append',
      outputPng
    ])
  }
  writeSpriteJson(outputJson, iconNames, size, pixelRatio)
}

buildSprite(32, '', 1)
buildSprite(64, '@2x', 2)

fs.rmSync(tmpDir, { recursive: true, force: true })
