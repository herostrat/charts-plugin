import { strict as assert } from 'assert'
import {
  lonLatToTileXY,
  tileToBBox,
  getSubTiles
} from '../../src/tiles/tile-utils.ts'

describe('tile-utils', () => {
  describe('lonLatToTileXY', () => {
    it('should convert lon/lat to tile XY at zoom 0', () => {
      assert.deepEqual(lonLatToTileXY(0, 0, 0), [0, 0])
      assert.deepEqual(lonLatToTileXY(-180, 85.0511, 0), [0, 0])
      assert.deepEqual(lonLatToTileXY(180, -85.0511, 0), [0, 0])
    })
    it('should convert lon/lat to tile XY at zoom 1', () => {
      assert.deepEqual(lonLatToTileXY(0, 0, 1), [1, 1])
      assert.deepEqual(lonLatToTileXY(-180, 85.0511, 1), [0, 0])
      assert.deepEqual(lonLatToTileXY(180, -85.0511, 1), [1, 1])
    })
  })

  describe('tileToBBox', () => {
    it('should return correct bbox for tile 0,0,0', () => {
      const bbox = tileToBBox(0, 0, 0)
      assert(Array.isArray(bbox) && bbox.length === 4)
      assert(bbox[0] <= bbox[2])
      assert(bbox[1] <= bbox[3])
    })
    it('should return correct bbox for tile 1,1,1', () => {
      const bbox = tileToBBox(1, 1, 1)
      assert(Array.isArray(bbox) && bbox.length === 4)
    })
  })

  describe('getSubTiles', () => {
    it('should return all subtiles up to maxZoom', () => {
      const tile = { x: 0, y: 0, z: 0 }
      const subtiles = getSubTiles(tile, 2)
      // 1 (z=0) + 4 (z=1) + 16 (z=2) = 21
      assert.equal(subtiles.length, 21)
      assert(subtiles.some((t) => t.x === 0 && t.y === 0 && t.z === 0))
      assert(subtiles.some((t) => t.z === 2 && t.x === 3 && t.y === 3))
    })
  })
})
