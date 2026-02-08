import fs from 'fs/promises'
import path from 'path'

const inputDir = path.resolve('test', 'fixtures', 'charts', 'input')
const uploadsDir = path.join(inputDir, 'uploads')

const isUploadFixture = (name) => /-upload\.(tif|tiff)$/i.test(name)
const isStagingDir = (name) => name.endsWith('.staging')

const main = async () => {
  try {
    const uploadEntries = await fs.readdir(uploadsDir, { withFileTypes: true })
    const uploadDeletes = uploadEntries
      .filter((entry) => entry.isFile() && isUploadFixture(entry.name))
      .map((entry) => fs.unlink(path.join(uploadsDir, entry.name)))

    const inputEntries = await fs.readdir(inputDir, { withFileTypes: true })
    const stagingDeletes = inputEntries
      .filter((entry) => entry.isDirectory() && isStagingDir(entry.name))
      .map((entry) =>
        fs.rm(path.join(inputDir, entry.name), { recursive: true, force: true })
      )

    await Promise.all([...uploadDeletes, ...stagingDeletes])
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err) {
      if (err.code === 'ENOENT') return
    }
    throw err
  }
}

main().catch((err) => {
  console.warn('Cleanup failed:', err)
})
