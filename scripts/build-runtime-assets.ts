import fs from 'fs'
import path from 'path'
import https from 'https'
import http from 'http'
import os from 'os'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import esbuild from 'esbuild'
import {
  createRuntimeAssetContext,
  runtimeCopyTasks,
  runtimeDownloadTasks
} from './runtime-assets.config'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')
const pluginOutDir = process.env.PLUGIN_OUT_DIR || 'plugin'

const ensureDir = (dirPath: string) => {
  fs.mkdirSync(dirPath, { recursive: true })
}

const copyDir = (fromDir: string, toDir: string) => {
  ensureDir(toDir)
  fs.readdirSync(fromDir, { withFileTypes: true }).forEach((entry) => {
    const fromPath = path.join(fromDir, entry.name)
    const toPath = path.join(toDir, entry.name)
    if (entry.isDirectory()) {
      copyDir(fromPath, toPath)
      return
    }
    if (entry.isFile() && entry.name.endsWith('.ts')) {
      return
    }
    fs.copyFileSync(fromPath, toPath)
  })
}

const runCopyTasks = (ctx: ReturnType<typeof createRuntimeAssetContext>) => {
  runtimeCopyTasks(ctx).forEach((task) => {
    const fromPath = path.resolve(repoRoot, task.from)
    const toPath = path.resolve(repoRoot, task.to)
    if (!fs.existsSync(fromPath)) {
      console.warn(`Copy source not found: ${fromPath}`)
      return
    }
    copyDir(fromPath, toPath)
  })
}

const downloadFile = async (url: string, toPath: string) => {
  const tmpPath = `${toPath}.tmp`

  const download = async (nextUrl: string, depth: number): Promise<void> => {
    if (depth > 5) {
      throw new Error(`Too many redirects for ${url}`)
    }
    fs.rmSync(tmpPath, { force: true })

    await new Promise<void>((resolve, reject) => {
      const handleResponse = (response: http.IncomingMessage) => {
        if (
          response.statusCode &&
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          response.headers.location
        ) {
          const redirected = new URL(response.headers.location, nextUrl).toString()
          download(redirected, depth + 1).then(resolve).catch(reject)
          return
        }
        if (response.statusCode && response.statusCode >= 400) {
          reject(new Error(`Download failed (${response.statusCode}) ${nextUrl}`))
          return
        }
        ensureDir(path.dirname(tmpPath))
        const file = fs.createWriteStream(tmpPath)
        response.pipe(file)
        file.on('finish', () => {
          file.close()
          resolve()
        })
      }

      const request = nextUrl.startsWith('https://')
        ? https.get(nextUrl, handleResponse)
        : http.get(nextUrl, handleResponse)
      request.on('error', reject)
    })

    fs.renameSync(tmpPath, toPath)
  }

  await download(url, 0)
}

const extractTarGz = async (
  archivePath: string,
  entryName: string,
  targetPath: string
) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-assets-'))
  try {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn('tar', ['-xzf', archivePath, '-C', tmpDir])
      let stderr = ''
      proc.stderr.on('data', (data) => {
        stderr += data.toString()
      })
      proc.on('error', reject)
      proc.on('close', (code) => {
        if (code === 0) {
          resolve()
          return
        }
        reject(new Error(stderr || `tar exited ${code}`))
      })
    })

    const findEntry = (dir: string): string | null => {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isFile() && entry.name === entryName) {
          return fullPath
        }
        if (entry.isDirectory()) {
          const found = findEntry(fullPath)
          if (found) return found
        }
      }
      return null
    }

    const extractedPath = findEntry(tmpDir)
    if (!extractedPath) {
      throw new Error(`Archive entry not found: ${entryName}`)
    }

    ensureDir(path.dirname(targetPath))
    fs.copyFileSync(extractedPath, targetPath)
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
}

const copyWithCache = (cachePath: string, targetPath: string) => {
  ensureDir(path.dirname(targetPath))
  fs.copyFileSync(cachePath, targetPath)
}

const runDownloadTasks = async (
  ctx: ReturnType<typeof createRuntimeAssetContext>
) => {
  const cacheRoot = path.resolve(repoRoot, '.cache', 'runtime-assets')
  const force = process.env.RUNTIME_ASSETS_FORCE === '1'

  for (const task of runtimeDownloadTasks(ctx)) {
    const targetPath = path.resolve(repoRoot, task.to)
    if (!force && fs.existsSync(targetPath)) {
      continue
    }

    const cacheKey = task.cacheKey || path.basename(new URL(task.url).pathname)
    const cachePath = path.join(cacheRoot, cacheKey)

    const useCache = !force && fs.existsSync(cachePath)
    if (!useCache) {
      await downloadFile(task.url, cachePath)
    }

    try {
      if (task.extract?.type === 'tar.gz') {
        await extractTarGz(cachePath, task.extract.entry, targetPath)
      } else {
        copyWithCache(cachePath, targetPath)
      }
    } catch (err) {
      if (!useCache) {
        throw err
      }
      fs.rmSync(cachePath, { force: true })
      await downloadFile(task.url, cachePath)
      if (task.extract?.type === 'tar.gz') {
        await extractTarGz(cachePath, task.extract.entry, targetPath)
      } else {
        copyWithCache(cachePath, targetPath)
      }
    }

    if (task.executable) {
      try {
        fs.chmodSync(targetPath, 0o755)
      } catch (err) {
        void err
      }
    }
  }
}

const runBundle = async () => {
  const publicDir = path.resolve(repoRoot, 'public')
  const outDir = path.resolve(repoRoot, pluginOutDir, 'public')

  await esbuild.build({
    entryPoints: [path.join(publicDir, 'index.ts')],
    outfile: path.join(outDir, 'index.js'),
    bundle: true,
    minify: true,
    sourcemap: false,
    format: 'esm',
    target: ['es2020'],
    treeShaking: true
  })

  await esbuild.build({
    entryPoints: [path.join(publicDir, 'style.css')],
    outfile: path.join(outDir, 'style.css'),
    bundle: false,
    minify: true
  })
}

const main = async () => {
  const ctx = createRuntimeAssetContext(pluginOutDir)
  runCopyTasks(ctx)
  await runDownloadTasks(ctx)
  await runBundle()
}

main().catch((err) => {
  console.error('Failed to build runtime assets:', err)
  process.exit(1)
})
