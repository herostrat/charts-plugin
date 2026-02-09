import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'

const resolvePmtilesBin = () => {
  const binName = process.platform === 'win32' ? 'pmtiles.cmd' : 'pmtiles'
  const pluginBin = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    'bin',
    binName
  )
  if (!fs.existsSync(pluginBin)) {
    throw new Error(
      `pmtiles CLI missing at ${pluginBin}. Run build to bundle it.`
    )
  }
  return pluginBin
}

export const runPmtilesConvert = (inputPath: string, outputPath: string) => {
  return new Promise<void>((resolve, reject) => {
    const args = ['convert', inputPath, outputPath]
    const bin = resolvePmtilesBin()
    const proc = spawn(bin, args)
    let stderr = ''
    proc.stderr.on('data', (data) => {
      stderr += data.toString()
    })
    proc.on('error', (err) => {
      reject(err)
    })
    proc.on('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      const hint = stderr.trim()
      reject(
        new Error(
          `pmtiles convert failed (${code ?? 'unknown'}): ${hint || 'unknown error'}`
        )
      )
    })
  })
}
