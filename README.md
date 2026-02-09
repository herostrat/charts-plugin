# Signal K server Charts plugin

Signal K Node server plugin to provide chart metadata, imports, proxying, caching, and tile serving for chart data.

This README describes the current behavior and capabilities of the plugin.

Chart metadata is made available to both v1 and v2 Signal K `resources` api paths.

| Server Version | API | Path |
|--- |--- |--- |
| 1.x.x | v1 | `/signalk/v1/api/resources/charts` |
| 2.x.x | v2 | `/signalk/v2/api/resources/charts` |

    
_Note: Version 2 resource paths will only be made available on Signal K server v2.0.0 and later_

## Usage

1. Install `@signalk/signalk-charts` from the Signal K Server Appstore

2. Configure the plugin in the Admin UI _(**Server -> Plugin Config -> Signal K Charts**)_ 

3. Activate the plugin

> [!TIP]
> On Victron Venus devices you may need to install additional system dependencies manually. See
> https://github.com/SignalK/charts-plugin/issues/40#issuecomment-3396744642

Chart metadata will then be available to client apps via the resources api `/resources/charts` for example:
- [Freeboard SK](https://www.npmjs.com/package/@signalk/freeboard-sk)
- [Tuktuk Chart Plotter](https://www.npmjs.com/package/tuktuk-chart-plotter)


## Configuration


### Local chart files

The plugin scans one or more chart paths for local files. By default it scans:

```
/home/<user>/.signalk/charts/database
```

You can either:
1. Put chart files inside the default database folder shown above.
2. Add configuration entries for the folders where your chart files are stored.

<img src="https://user-images.githubusercontent.com/1435910/39382493-57c1e4dc-4a6e-11e8-93e1-cedb4c7662f4.png" alt="Chart paths configuration" width="450"/>

>**Note:** After chart files have been added to folders they will be processed after the plugin has been restarted. _(disable / enable the plugin)_


### Online chart providers

If your chart source is not local to the Signal K Server you can add "Online Chart Providers" and enter the required metadata for the source.

Required fields:
1. A chart name for client applications to display
2. The URL to the chart source (XYZ/TMS template or service endpoint)
3. The tile format (png, jpg, or pbf)
4. Minimum and maximum zoom levels

Optional fields:
- Description
- Map source type (tilelayer, WMS, WMTS, mapstyleJSON, tileJSON)
- Request headers

<img src="https://github.com/user-attachments/assets/77cb3aaf-5471-4e55-b05d-aad70cacab6a" alt="Online chart providers configuration" width="450"/>

For WMS and WMTS sources you can specify the layers you wish to display.
For WMTS, the first entry is treated as the layer name and the second entry
is used as the TileMatrixSet (defaults to GoogleMapsCompatible).

<img src="https://github.com/user-attachments/assets/b9bfba38-8468-4eca-aeb3-96a80fcbc7a6" alt="Online chart provider layers" width="450"/>

A proxy for online charts can be created using the "Proxy through SignalK server" option. If enabled, tiles are fetched from the remote server and cached by the Signal K server (MBTiles cache). Additional HTTP headers can be passed to the remote server by adding colon separated headers, e.g. User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64).

COG sources can be configured as tilelayer providers that point to a remote
GeoTIFF URL and have proxy enabled.

### Configuration overview

Key configuration fields used by current features:
- Chart paths: folders scanned for local charts
- Charts root: root directory for imports and storage layout
- Cache path: defaults to `<chartsRoot>/cache`
- Online chart providers: remote sources and proxy settings

### Supported chart formats and imports

Local files and directories:
- [PMTiles](https://protomaps.com/docs/pmtiles) files
- [MBTiles](https://github.com/mapbox/mbtiles-spec) files
- Directory with cached [TMS](https://wiki.osgeo.org/wiki/Tile_Map_Service_Specification) tiles and `tilemapresource.xml`
- Directory with XYZ tiles and `metadata.json`

Imports and conversions:
- GeoTIFF -> MBTiles -> PMTiles (built-in)
- S-57 -> GeoJSON -> MBTiles -> PMTiles (requires external tools)
- PMTiles subset extraction from remote PMTiles (bbox)

Online sources (proxied and cached when proxy is enabled):
- XYZ/TMS
- WMS (GetMap to XYZ)
- WMTS (GetTile)
- COG (remote GeoTIFF, tiled on demand)

### S-57 conversion requirements

S-57 imports require external tools that are not bundled with the npm plugin:

- `ogr2ogr` (from GDAL/OGR)
- `tippecanoe`

If these tools are missing, S-57 import will be blocked and the UI will show
a clear error. Install them via your system package manager before importing
S-57 charts.

### Caching and hotloading

Online sources and PMTiles hotloading use an MBTiles cache stored under the charts root:

```
<chartsRoot>/cache/mbtiles/<provider-identifier>.mbtiles
```

Hotloading is implemented by seeding tiles into the cache. You can seed:
- A bounding box
- A single tile (with sub-tiles)
- A course corridor using position and heading

### Streaming methods

When online sources are proxied, the server adapts them to XYZ tiles:
- WMS: builds GetMap requests using EPSG:3857 BBOX
- WMTS: builds GetTile requests using TileMatrix/Row/Col
- COG: reads windowed data from a remote GeoTIFF and resamples to 256x256 tiles

### Vector sprites demo

This repo includes placeholder SVG icons under `assets/sprites/icons` and a sprite build script.
To generate the sprite sheets used by the vector Mapbox style:

```bash
npm run build:sprites
```

Generated files:
- `plugin/public/styles/sprites/nautical.png`
- `plugin/public/styles/sprites/nautical@2x.png`
- `plugin/public/styles/sprites/nautical.json`
- `plugin/public/styles/sprites/nautical@2x.json`

The vector style endpoint uses this sprite base URL:

```
/@signalk/charts-plugin/styles/sprites/nautical
```

### Vector data + sprite distribution

For vector charts (PMTiles or MBTiles with `format: "pbf"`), the plugin serves:

- Tile data (XYZ): `/signalk/chart-tiles/${identifier}/{z}/{x}/{y}`
- PMTiles range endpoint: `/signalk/chart-pmtiles/${identifier}.pmtiles`
- Style JSON: `/signalk/chart-style/${identifier}`
- Sprite sheets: `/@signalk/charts-plugin/styles/sprites/nautical` (+ `@2x`)

This means a client like Freeboard can render vector tiles with the bundled
nautical style and the sprite atlas without extra hosting.

Publicly available MBTiles charts can be found from:
- [NOAA Nautical charts](https://distribution.charts.noaa.gov/ncds/index.html)
- [Finnish Transport Agency nautical charts](https://github.com/vokkim/rannikkokartat-mbtiles)
- [Signal K World Coastline Map](https://github.com/netAction/signalk-world-coastline-map), download [MBTiles release](https://github.com/netAction/signalk-world-coastline-map/releases/download/v1.0/signalk-world-coastline-map-database.tgz)


---

### API

Plugin adds support for `/resources/charts` endpoints described in [Signal K specification](http://signalk.org/specification/1.0.0/doc/otherBranches.html#resourcescharts):

#### List available charts

```bash
GET /signalk/v2/api/resources/charts/` 
```

#### Return metadata for selected chart

```bash

GET /signalk/v2/api/resources/charts/${identifier}` 
```

#### Chart Tiles
Chart tiles are retrieved using the URL defined in the chart metadata.

For proxied online sources, the URL is:

```bash
/signalk/chart-tiles/${identifier}/${z}/${x}/${y}
```

For local PMTiles, the range endpoint is:

```bash
/signalk/chart-pmtiles/${identifier}.pmtiles
```

#### Vector chart style (v2 only)

For vector charts, the plugin serves a Mapbox style JSON endpoint.

```bash
GET /signalk/chart-style/${identifier}?theme=day|night
```

Notes:
- `theme` is optional and defaults to `day`.
- Experimental: `theme` is reserved and currently ignored (server always returns day).
- This endpoint is not yet in the Signal K spec; we plan to propose it.

#### Cache and hotload API

```bash
POST /@signalk/charts-plugin/cache/seed/{id}
POST /@signalk/charts-plugin/cache/seed-course/{id}
GET  /@signalk/charts-plugin/cache/jobs
POST /@signalk/charts-plugin/cache/jobs/{id}
POST /@signalk/charts-plugin/cache/snapshot/{id}
```

#### Import capabilities API

```bash
GET /@signalk/charts-plugin/imports/capabilities
```

License
-------
Copyright 2018 Mikko Vesikkala

Third-party notices for bundled fixtures are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
