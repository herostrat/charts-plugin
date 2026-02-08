export type CopyTask = {
  from: string
  to: string
}

export type DownloadTask = {
  url: string
  to: string
}

export const copyTasks: CopyTask[] = [
  {
    from: 'public',
    to: 'plugin/public'
  }
]

export const downloadTasks: DownloadTask[] = [
  {
    url: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    to: 'plugin/public/assets/leaflet/leaflet.css'
  },
  {
    url: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    to: 'plugin/public/assets/leaflet/leaflet.js'
  },
  {
    url: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    to: 'plugin/public/assets/leaflet/images/marker-icon.png'
  },
  {
    url: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    to: 'plugin/public/assets/leaflet/images/marker-icon-2x.png'
  },
  {
    url: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    to: 'plugin/public/assets/leaflet/images/marker-shadow.png'
  },
  {
    url: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson',
    to: 'plugin/public/assets/world/ne_110m_admin_0_countries.geojson'
  }
]
