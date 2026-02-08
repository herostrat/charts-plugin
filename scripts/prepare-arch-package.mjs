import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')

const args = process.argv.slice(2)
const archArgIndex = args.indexOf('--arch')
const arch = archArgIndex >= 0 ? args[archArgIndex + 1] : null

if (!arch) {
  console.error('Usage: node scripts/prepare-arch-package.mjs --arch <os-arch>')
  process.exit(1)
}

const [os, cpu] = arch.split('-')
if (!os || !cpu) {
  console.error(`Invalid arch format: ${arch}`)
  process.exit(1)
}

const pluginDir = path.join(repoRoot, `plugin-${arch}`)
if (!fs.existsSync(pluginDir)) {
  console.error(`Missing plugin output: ${pluginDir}`)
  process.exit(1)
}

const pkgJsonPath = path.join(repoRoot, 'package.json')
const basePkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'))

const outDir = path.join(repoRoot, 'dist', `package-${arch}`)
fs.rmSync(outDir, { recursive: true, force: true })
fs.mkdirSync(outDir, { recursive: true })

const copyDir = (fromDir, toDir) => {
  fs.mkdirSync(toDir, { recursive: true })
  fs.readdirSync(fromDir, { withFileTypes: true }).forEach((entry) => {
    const fromPath = path.join(fromDir, entry.name)
    const toPath = path.join(toDir, entry.name)
    if (entry.isDirectory()) {
      copyDir(fromPath, toPath)
      return
    }
    fs.copyFileSync(fromPath, toPath)
  })
}

copyDir(pluginDir, path.join(outDir, 'plugin'))

const minimalPkg = {
  name: `${basePkg.name}-${arch}`,
  version: basePkg.version,
  description: `${basePkg.description} (${arch})`,
  main: basePkg.main,
  type: basePkg.type,
  license: basePkg.license,
  repository: basePkg.repository,
  keywords: basePkg.keywords,
  dependencies: basePkg.dependencies,
  os: [os],
  cpu: [cpu],
  files: ['plugin']
}

fs.writeFileSync(
  path.join(outDir, 'package.json'),
  JSON.stringify(minimalPkg, null, 2)
)

const maybeCopy = (name) => {
  const from = path.join(repoRoot, name)
  const to = path.join(outDir, name)
  if (fs.existsSync(from)) {
    fs.copyFileSync(from, to)
  }
}

maybeCopy('README.md')
maybeCopy('LICENSE')
maybeCopy('THIRD_PARTY_NOTICES.md')

console.log(`Prepared ${minimalPkg.name} at ${outDir}`)
