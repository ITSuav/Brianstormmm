import type { DigitalTwinAsset, GeospatialLayer } from '../domain/models'

export const geospatialLayers: readonly GeospatialLayer[] = [
  {
    id: 'gee-dem',
    name: 'Copernicus DEM heightmap',
    source: 'GEE',
    dataset: 'COPERNICUS/DEM/GLO30',
    productPath: '/assets/geospatial/hk-gee-dem-heightmap.png',
    status: 'available',
    purpose: 'Terrain displacement source for the Blender white model.',
  },
  {
    id: 'gee-sentinel',
    name: 'Sentinel-2 satellite texture',
    source: 'GEE',
    dataset: 'COPERNICUS/S2_SR_HARMONIZED',
    productPath: '/assets/geospatial/hk-gee-sentinel2-texture.png',
    status: 'available',
    purpose: 'Real optical texture draped over the terrain render.',
  },
  {
    id: 'gee-slope',
    name: 'Terrain slope',
    source: 'GEE',
    dataset: 'ee.Terrain.slope(COPERNICUS/DEM/GLO30)',
    productPath: '/assets/geospatial/hk-gee-slope.png',
    status: 'available',
    purpose: 'Mountain flight risk and landing suitability screening.',
  },
  {
    id: 'gee-risk',
    name: 'Composite GEE risk surface',
    source: 'GEE',
    dataset: 'Slope + NDVI + JRC water occurrence',
    productPath: '/assets/geospatial/hk-gee-risk-surface.png',
    status: 'available',
    purpose: 'Operational risk visualization, not final route approval.',
  },
  {
    id: 'hk-building-heights',
    name: 'Building heights',
    source: 'Official HK dataset required',
    dataset: 'Hong Kong building footprints with height or CityGML/3D Tiles',
    productPath: '/data/requirements/missing-official-layers.md',
    status: 'blocked',
    purpose: 'Needed for true city clearance and non-symbolic building extrusion.',
  },
] as const

export const digitalTwinAssets: readonly DigitalTwinAsset[] = [
  {
    id: 'blender-render',
    name: 'HK terrain render',
    source: 'Blender render',
    productPath: '/assets/drone-twin/hkstp/hk-gee-blender-terrain.png',
    status: 'available',
    notes: 'Rendered from GEE heightmap and Sentinel-2 texture with Blender 4.3.',
  },
  {
    id: 'blender-model',
    name: 'Terrain GLB model',
    source: 'Blender model',
    productPath: '/assets/drone-twin/hkstp/hk-gee-terrain-model.glb',
    status: 'available',
    notes: 'Reusable model export for later Three.js/Cesium asset integration.',
  },
  {
    id: 'satellite-texture',
    name: 'Draped satellite texture',
    source: 'GEE texture',
    productPath: '/assets/geospatial/hk-gee-sentinel2-texture.png',
    status: 'available',
    notes: 'GEE product; keep attribution with the public demo.',
  },
  {
    id: 'supersplat-site',
    name: 'Future 3DGS site capture',
    source: 'SuperSplat slot',
    productPath: '/assets/drone-twin/hkstp/splats/',
    status: 'required',
    notes: 'Reserved for real HKSTP or mountain landing-site capture, not mocked.',
  },
] as const

export const viewportAsset = {
  renderPath: '/assets/drone-twin/hkstp/hk-gee-blender-terrain.png',
  heightmapPath: '/assets/geospatial/hk-gee-dem-heightmap.png',
  texturePath: '/assets/geospatial/hk-gee-sentinel2-texture.png',
  modelPath: '/assets/drone-twin/hkstp/hk-gee-terrain-model.glb',
  manifestPath: '/assets/drone-twin/hkstp/blender-manifest.json',
  geeManifestPath: '/assets/geospatial/manifest.json',
} as const
