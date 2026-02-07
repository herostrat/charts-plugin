const fs = require('fs')
const path = require('path')

const mappingSource = path.resolve(
	__dirname,
	'../src/style/mapping/object-catalog.json'
)
const mappingTargetDir = path.resolve(__dirname, '../plugin/style/mapping')
const mappingTarget = path.join(mappingTargetDir, 'object-catalog.json')

const stylesSourceDir = path.resolve(__dirname, '../src/styles')
const stylesTargetDir = path.resolve(__dirname, '../plugin/public/styles')

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

fs.mkdirSync(mappingTargetDir, { recursive: true })
fs.copyFileSync(mappingSource, mappingTarget)

if (fs.existsSync(stylesSourceDir)) {
	copyDir(stylesSourceDir, stylesTargetDir)
}
