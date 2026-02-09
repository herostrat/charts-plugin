import fs from 'fs'
import os from 'os'
import path from 'path'

const ensureDir = (dirPath) => {
  fs.mkdirSync(dirPath, { recursive: true })
}

const linkOrCopy = (src, dest) => {
  if (fs.existsSync(dest)) return
  const stats = fs.lstatSync(src)
  if (stats.isDirectory()) {
    fs.cpSync(src, dest, { recursive: true })
    return
  }
  try {
    fs.symlinkSync(src, dest, 'file')
  } catch (err) {
    try {
      fs.cpSync(src, dest, { recursive: true })
    } catch {
      throw err
    }
  }
}

const addFixtureContents = (src, destRoot) => {
  const stats = fs.lstatSync(src)
  if (stats.isDirectory()) {
    const entries = fs.readdirSync(src)
    for (const entry of entries) {
      linkOrCopy(path.join(src, entry), path.join(destRoot, entry))
    }
    return
  }
  linkOrCopy(src, path.join(destRoot, path.basename(src)))
}

export const createChartsRoot = ({ fixturesRoot, fixtures = [] } = {}) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'charts-root-'))
  ensureDir(root)
  const databaseDir = path.join(root, 'database')
  ensureDir(databaseDir)
  ensureDir(path.join(root, 'cache'))

  for (const fixture of fixtures) {
    const src = path.resolve(fixturesRoot, fixture)
    if (!fs.existsSync(src)) {
      continue
    }
    addFixtureContents(src, databaseDir)
  }

  return root
}

export const removeChartsRoot = (root) => {
  if (!root) return
  fs.rmSync(root, { recursive: true, force: true })
}
