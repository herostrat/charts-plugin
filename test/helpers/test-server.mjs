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
  app.debug = () => undefined
  app.config = {
    configPath,
    version,
    ssl,
    getExternalPort: () => app.get('port')
  }

  app.statusMessage = () => 'started'
  app.error = () => undefined
  app.setPluginStatus = () => undefined
  app.setPluginError = () => undefined

  return new Promise((resolve) => {
    const server = http.createServer(app)
    server.listen(() => {
      const { port } = server.address()
      app.set('port', port)
      resolve({ app, server })
    })
  })
}
