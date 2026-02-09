import express from 'express'
import bodyParser from 'body-parser'
import http from 'http'

export const createTestServer = ({
  configPath = process.cwd(),
  version = '2.0.0',
  ssl = false
} = {}) => {
  const app = express()
  app.use(bodyParser.json())
  const resourceProviders = new Map()
  app.debug = () => undefined
  app.config = {
    configPath,
    version,
    ssl,
    getExternalPort: () => app.get('port')
  }

  app.registerResourceProvider = ({ type, methods }) => {
    if (!type || !methods) return
    resourceProviders.set(type, methods)
  }

  app.statusMessage = () => 'started'
  app.error = () => undefined
  app.setPluginStatus = () => undefined
  app.setPluginError = () => undefined

  app.get('/signalk/v2/api/resources/:type', async (req, res) => {
    const provider = resourceProviders.get(req.params.type)
    if (!provider) {
      res.status(404).send('Not found')
      return
    }
    try {
      const resources = await provider.listResources({})
      if (Array.isArray(resources)) {
        const mapped = resources.reduce((acc, entry) => {
          if (entry?.identifier) {
            acc[entry.identifier] = entry
          }
          return acc
        }, {})
        res.json(mapped)
        return
      }
      res.json(resources)
    } catch (err) {
      res.status(500).send('Error')
    }
  })

  app.get('/signalk/v2/api/resources/:type/:id', async (req, res) => {
    const provider = resourceProviders.get(req.params.type)
    if (!provider) {
      res.status(404).send('Not found')
      return
    }
    try {
      const resource = await provider.getResource(req.params.id)
      res.json(resource)
    } catch (err) {
      res.status(404).send('Not found')
    }
  })

  return new Promise((resolve) => {
    const server = http.createServer(app)
    server.listen(() => {
      const { port } = server.address()
      app.set('port', port)
      resolve({ app, server })
    })
  })
}
