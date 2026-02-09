import {
  generateCuratedSources,
  writeCuratedSources
} from '../src/imports/curated-sources'

const main = async () => {
  const catalog = await generateCuratedSources()
  await writeCuratedSources(catalog)
  process.stdout.write(
    'Curated sources written to dev-data/curated-sources.json\n'
  )
}

main().catch((err) => {
  console.error('Failed to generate curated sources:', err)
  process.exit(1)
})
