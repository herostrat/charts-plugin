import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'

type ChartsStorageLayout = {
  root: string
  inputDir: string
  conversionDir: string
  databaseDir: string
}

let activeLayout: ChartsStorageLayout | null = null

const ensureDir = (dirPath: string) => {
  fs.mkdirSync(dirPath, { recursive: true })
}

export const resolveChartsRoot = (
  configBasePath: string,
  chartsRoot?: string
) => {
  if (chartsRoot && chartsRoot.trim().length > 0) {
    return path.resolve(chartsRoot)
  }
  return path.join(configBasePath, '/charts')
}

export const buildChartsStorageLayout = (root: string): ChartsStorageLayout => {
  const normalized = path.resolve(root)
  return {
    root: normalized,
    inputDir: path.join(normalized, 'input'),
    conversionDir: path.join(normalized, 'conversion'),
    databaseDir: path.join(normalized, 'database')
  }
}

export const ensureChartsStorageLayout = (layout: ChartsStorageLayout) => {
  ensureDir(layout.root)
  ensureDir(layout.inputDir)
  ensureDir(layout.conversionDir)
  ensureDir(layout.databaseDir)
}

export const setChartsStorageLayout = (layout: ChartsStorageLayout) => {
  activeLayout = layout
}

export const clearChartsStorageLayout = () => {
  activeLayout = null
}

export const getChartsStorageLayout = () => activeLayout

const ensureParentDir = async (filePath: string) => {
  await fsp.mkdir(path.dirname(filePath), { recursive: true })
}

const copyFileWithFsync = async (src: string, dest: string) => {
  await ensureParentDir(dest)
  await fsp.copyFile(src, dest)
  const handle = await fsp.open(dest, 'r+')
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
}

const copyDirRecursive = async (src: string, dest: string) => {
  await fsp.mkdir(dest, { recursive: true })
  const entries = await fsp.readdir(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      await copyDirRecursive(srcPath, destPath)
    } else if (entry.isFile()) {
      await copyFileWithFsync(srcPath, destPath)
    }
  }
}

export const isSameDevice = async (a: string, b: string) => {
  const statA = await fsp.stat(a)
  const statB = await fsp.stat(b)
  return statA.dev === statB.dev
}

export const safeMove = async (src: string, dest: string) => {
  await ensureParentDir(dest)
  try {
    await fsp.rename(src, dest)
    return
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code !== 'EXDEV') {
      throw err
    }
  }

  const stats = await fsp.lstat(src)
  if (stats.isDirectory()) {
    await copyDirRecursive(src, dest)
    await fsp.rm(src, { recursive: true, force: true })
  } else {
    await copyFileWithFsync(src, dest)
    await fsp.unlink(src)
  }
}

export const buildStagingDir = (parentDir: string, id: string) => {
  return path.join(parentDir, `${id}.staging`)
}

export const commitStagingDir = async (stagingDir: string, finalDir: string) => {
  await safeMove(stagingDir, finalDir)
}
