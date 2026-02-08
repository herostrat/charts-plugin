import fs from 'fs'
import path from 'path'
import https from 'https'
import http from 'http'
import { fileURLToPath } from 'url'
import esbuild from 'esbuild'
import { copyTasks, downloadTasks } from './web-assets.config'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')

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

const runCopyTasks = () => {
  copyTasks.forEach((task) => {
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
  await new Promise<void>((resolve, reject) => {
    const handleResponse = (response: http.IncomingMessage) => {
      if (response.statusCode && response.statusCode >= 400) {
        reject(new Error(`Download failed (${response.statusCode}) ${url}`))
        return
      }
      ensureDir(path.dirname(toPath))
      const file = fs.createWriteStream(toPath)
      response.pipe(file)
      file.on('finish', () => {
        file.close()
        resolve()
      })
    }

    const request = url.startsWith('https://')
      ? https.get(url, handleResponse)
      : http.get(url, handleResponse)
    request.on('error', reject)
  })
}

const runDownloadTasks = async () => {
  for (const task of downloadTasks) {
    const targetPath = path.resolve(repoRoot, task.to)
    await downloadFile(task.url, targetPath)
  }
}

const runBundle = async () => {
  const publicDir = path.resolve(repoRoot, 'public')
  const outDir = path.resolve(repoRoot, 'plugin/public')

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
  runCopyTasks()
  await runDownloadTasks()
  await runBundle()
}

main().catch((err) => {
  console.error('Failed to build web assets:', err)
  process.exit(1)
})
