import { useEffect, useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

interface DigitalTwinViewportProps {
  readonly heightmapPath: string
  readonly texturePath: string
  readonly fallbackImagePath: string
  readonly routeGeoJsonPath: string
  readonly manifestPath: string
  readonly alt: string
  readonly resetLabel: string
}

interface Bounds {
  readonly west: number
  readonly south: number
  readonly east: number
  readonly north: number
}

interface RouteNode {
  readonly id: string
  readonly name: string
  readonly kind: string
  readonly source: string
  readonly order: number
  readonly longitude: number
  readonly latitude: number
}

interface RouteGeometry {
  readonly line: readonly GeoCoordinate[]
  readonly nodes: readonly RouteNode[]
}

interface TerrainGeometryResult {
  readonly geometry: THREE.BufferGeometry
  readonly heightAt: (longitude: number, latitude: number, bounds: Bounds) => number
}

interface RouteFeatureCollection {
  readonly features?: readonly RouteFeature[]
}

interface RouteFeature {
  readonly geometry?: {
    readonly type?: string
    readonly coordinates?: unknown
  }
  readonly properties?: Readonly<Record<string, unknown>>
}

interface GeeManifest {
  readonly bounds?: readonly unknown[]
}

type GeoCoordinate = readonly [number, number]

const TERRAIN_WIDTH = 7.2
const TERRAIN_DEPTH = 5.1
const GRID_COLUMNS = 260
const GRID_ROWS = 184
const HEIGHT_SCALE = 1.05
const TERRAIN_BASE_Z = -0.18
const PAN_LIMIT_X = TERRAIN_WIDTH * 0.32
const PAN_LIMIT_Y = TERRAIN_DEPTH * 0.32
const MIN_TARGET_HEIGHT = 0.18
const MAX_TARGET_HEIGHT = 0.74
const EMPTY_RESET = () => undefined

function clampValue(value: number, minValue: number, maxValue: number): number {
  return Math.min(Math.max(value, minValue), maxValue)
}

function readString(record: Readonly<Record<string, unknown>> | undefined, key: string, fallback: string): string {
  const value = record?.[key]
  return typeof value === 'string' && value.length > 0 ? value : fallback
}

function readNumber(record: Readonly<Record<string, unknown>> | undefined, key: string, fallback: number): number {
  const value = record?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function parsePointCoordinate(value: unknown): GeoCoordinate | undefined {
  if (!Array.isArray(value) || value.length < 2) {
    return undefined
  }

  const [longitude, latitude] = value
  if (typeof longitude !== 'number' || typeof latitude !== 'number') {
    return undefined
  }
  return [longitude, latitude]
}

function parseLineCoordinates(value: unknown): readonly GeoCoordinate[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap((coordinate) => {
    const point = parsePointCoordinate(coordinate)
    return point ? [point] : []
  })
}

async function loadJson<T>(src: string): Promise<T> {
  const response = await fetch(src)
  if (!response.ok) {
    throw new Error(`Unable to load JSON asset: ${src}`)
  }
  return response.json() as Promise<T>
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Unable to load terrain image: ${src}`))
    image.src = src
  })
}

function createTerrainGeometry(heightImage: HTMLImageElement): TerrainGeometryResult {
  const canvas = document.createElement('canvas')
  canvas.width = GRID_COLUMNS
  canvas.height = GRID_ROWS
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    throw new Error('Unable to create terrain sampling context')
  }

  context.drawImage(heightImage, 0, 0, GRID_COLUMNS, GRID_ROWS)
  const imageData = context.getImageData(0, 0, GRID_COLUMNS, GRID_ROWS).data
  const heightValues = new Float32Array(GRID_COLUMNS * GRID_ROWS)

  for (let index = 0; index < heightValues.length; index += 1) {
    const value = imageData[index * 4] / 255
    heightValues[index] = value
  }

  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []

  const addVertex = (xPosition: number, yPosition: number, zPosition: number, textureU: number, textureV: number): number => {
    positions.push(xPosition, yPosition, zPosition)
    uvs.push(textureU, textureV)
    return positions.length / 3 - 1
  }

  const topIndex = (row: number, column: number): number => row * GRID_COLUMNS + column

  for (let row = 0; row < GRID_ROWS; row += 1) {
    const textureV = row / (GRID_ROWS - 1)
    for (let column = 0; column < GRID_COLUMNS; column += 1) {
      const textureU = column / (GRID_COLUMNS - 1)
      const vertexIndex = row * GRID_COLUMNS + column
      addVertex(
        (textureU - 0.5) * TERRAIN_WIDTH,
        (0.5 - textureV) * TERRAIN_DEPTH,
        heightValues[vertexIndex] * HEIGHT_SCALE,
        textureU,
        1 - textureV,
      )
    }
  }

  for (let row = 0; row < GRID_ROWS - 1; row += 1) {
    for (let column = 0; column < GRID_COLUMNS - 1; column += 1) {
      const topLeft = row * GRID_COLUMNS + column
      const topRight = topLeft + 1
      const bottomLeft = topLeft + GRID_COLUMNS
      const bottomRight = bottomLeft + 1
      indices.push(topLeft, bottomLeft, topRight, topRight, bottomLeft, bottomRight)
    }
  }

  const bottomIndexByTopIndex = new Map<number, number>()
  const bottomIndexForTopIndex = (vertexIndex: number): number => {
    const existingIndex = bottomIndexByTopIndex.get(vertexIndex)
    if (existingIndex !== undefined) {
      return existingIndex
    }

    const positionOffset = vertexIndex * 3
    const uvOffset = vertexIndex * 2
    const bottomIndex = addVertex(positions[positionOffset], positions[positionOffset + 1], TERRAIN_BASE_Z, uvs[uvOffset], uvs[uvOffset + 1])
    bottomIndexByTopIndex.set(vertexIndex, bottomIndex)
    return bottomIndex
  }

  const addSideWall = (boundaryTopIndices: readonly number[]) => {
    for (let index = 0; index < boundaryTopIndices.length - 1; index += 1) {
      const firstTop = boundaryTopIndices[index]
      const secondTop = boundaryTopIndices[index + 1]
      const firstBottom = bottomIndexForTopIndex(firstTop)
      const secondBottom = bottomIndexForTopIndex(secondTop)
      indices.push(firstTop, firstBottom, secondTop, secondTop, firstBottom, secondBottom)
    }
  }

  addSideWall(Array.from({ length: GRID_COLUMNS }, (_, column) => topIndex(0, column)))
  addSideWall(Array.from({ length: GRID_ROWS }, (_, row) => topIndex(row, GRID_COLUMNS - 1)))
  addSideWall(Array.from({ length: GRID_COLUMNS }, (_, column) => topIndex(GRID_ROWS - 1, GRID_COLUMNS - 1 - column)))
  addSideWall(Array.from({ length: GRID_ROWS }, (_, row) => topIndex(GRID_ROWS - 1 - row, 0)))

  const bottomNorthWest = addVertex(-TERRAIN_WIDTH / 2, TERRAIN_DEPTH / 2, TERRAIN_BASE_Z, 0, 1)
  const bottomNorthEast = addVertex(TERRAIN_WIDTH / 2, TERRAIN_DEPTH / 2, TERRAIN_BASE_Z, 1, 1)
  const bottomSouthEast = addVertex(TERRAIN_WIDTH / 2, -TERRAIN_DEPTH / 2, TERRAIN_BASE_Z, 1, 0)
  const bottomSouthWest = addVertex(-TERRAIN_WIDTH / 2, -TERRAIN_DEPTH / 2, TERRAIN_BASE_Z, 0, 0)
  indices.push(bottomNorthWest, bottomSouthEast, bottomNorthEast, bottomNorthWest, bottomSouthWest, bottomSouthEast)

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()

  const heightAt = (longitude: number, latitude: number, bounds: Bounds): number => {
    const longitudeRatio = clampValue((longitude - bounds.west) / Math.max(bounds.east - bounds.west, Number.EPSILON), 0, 1)
    const latitudeRatio = clampValue((latitude - bounds.south) / Math.max(bounds.north - bounds.south, Number.EPSILON), 0, 1)
    const column = Math.round(longitudeRatio * (GRID_COLUMNS - 1))
    const row = Math.round((1 - latitudeRatio) * (GRID_ROWS - 1))
    const value = heightValues[row * GRID_COLUMNS + column]
    return value * HEIGHT_SCALE
  }

  return { geometry, heightAt }
}

function parseRouteGeometry(collection: RouteFeatureCollection): RouteGeometry {
  const features = collection.features ?? []
  const line = features.flatMap((feature) => (feature.geometry?.type === 'LineString' ? parseLineCoordinates(feature.geometry.coordinates) : []))
  const nodes = features.flatMap((feature) => {
    if (feature.geometry?.type !== 'Point') {
      return []
    }

    const coordinate = parsePointCoordinate(feature.geometry.coordinates)
    if (!coordinate) {
      return []
    }

    const properties = feature.properties
    const order = readNumber(properties, 'order', 0)
    return [
      {
        id: readString(properties, 'node_id', `route-node-${order}`),
        name: readString(properties, 'name', `Route node ${order}`),
        kind: readString(properties, 'kind', 'waypoint'),
        source: readString(properties, 'source', 'unknown'),
        order,
        longitude: coordinate[0],
        latitude: coordinate[1],
      },
    ]
  })

  return { line, nodes }
}

function boundsFromManifest(manifest: GeeManifest, route: RouteGeometry): Bounds {
  const manifestBounds = manifest.bounds
  if (
    Array.isArray(manifestBounds)
    && manifestBounds.length >= 4
    && manifestBounds.every((value) => typeof value === 'number' && Number.isFinite(value))
  ) {
    return { west: manifestBounds[0] as number, south: manifestBounds[1] as number, east: manifestBounds[2] as number, north: manifestBounds[3] as number }
  }

  const coordinates = [...route.line, ...route.nodes.map((node) => [node.longitude, node.latitude] as const)]
  const longitudes = coordinates.map((coordinate) => coordinate[0])
  const latitudes = coordinates.map((coordinate) => coordinate[1])
  const west = Math.min(...longitudes)
  const east = Math.max(...longitudes)
  const south = Math.min(...latitudes)
  const north = Math.max(...latitudes)
  const padding = 0.006
  return { west: west - padding, south: south - padding, east: east + padding, north: north + padding }
}

function coordinateToTerrain(longitude: number, latitude: number, bounds: Bounds, heightAt: TerrainGeometryResult['heightAt'], altitudeOffset = 0.1): THREE.Vector3 {
  const longitudeRatio = clampValue((longitude - bounds.west) / Math.max(bounds.east - bounds.west, Number.EPSILON), 0, 1)
  const latitudeRatio = clampValue((latitude - bounds.south) / Math.max(bounds.north - bounds.south, Number.EPSILON), 0, 1)
  return new THREE.Vector3(
    (longitudeRatio - 0.5) * TERRAIN_WIDTH,
    (latitudeRatio - 0.5) * TERRAIN_DEPTH,
    heightAt(longitude, latitude, bounds) + altitudeOffset,
  )
}

function routeNodeColor(kind: string): number {
  if (kind === 'depot') {
    return 0x4285f4
  }
  if (kind === 'charger') {
    return 0x34a853
  }
  if (kind === 'destination') {
    return 0xea4335
  }
  return 0xfbbc04
}

function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.LineSegments)) {
      return
    }

    child.geometry.dispose()
    const material = child.material
    if (Array.isArray(material)) {
      material.forEach((item) => item.dispose())
      return
    }
    material.dispose()
  })
}

export function DigitalTwinViewport({ heightmapPath, texturePath, fallbackImagePath, routeGeoJsonPath, manifestPath, alt, resetLabel }: DigitalTwinViewportProps) {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const resetViewRef = useRef<() => void>(EMPTY_RESET)
  const [isReady, setIsReady] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [selectedRouteNode, setSelectedRouteNode] = useState<RouteNode | undefined>()

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) {
      return undefined
    }

    let isDisposed = false
    let satelliteTexture: THREE.Texture | undefined
    const clickableMarkers: THREE.Object3D[] = []
    const routeHotspots: Array<{ readonly object: THREE.Object3D; readonly routeNode: RouteNode }> = []
    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const projectedPosition = new THREE.Vector3()
    setIsReady(false)
    setHasError(false)
    setSelectedRouteNode(undefined)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 80)
    camera.up.set(0, 0, 1)
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' })
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.setClearColor(0x000000, 0)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.domElement.className = 'digital-twin-canvas'
    renderer.domElement.setAttribute('aria-label', alt)
    mount.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.1
    controls.enablePan = true
    controls.screenSpacePanning = false
    controls.minDistance = 2.45
    controls.maxDistance = 8.8
    controls.minPolarAngle = Math.PI * 0.2
    controls.maxPolarAngle = Math.PI * 0.47
    controls.rotateSpeed = 0.78
    controls.zoomSpeed = 0.86
    controls.panSpeed = 0.48

    const cameraOffset = new THREE.Vector3()
    const clampedTarget = new THREE.Vector3()

    const clampControls = () => {
      cameraOffset.copy(camera.position).sub(controls.target)
      clampedTarget.set(
        clampValue(controls.target.x, -PAN_LIMIT_X, PAN_LIMIT_X),
        clampValue(controls.target.y, -PAN_LIMIT_Y, PAN_LIMIT_Y),
        clampValue(controls.target.z, MIN_TARGET_HEIGHT, MAX_TARGET_HEIGHT),
      )

      if (clampedTarget.equals(controls.target)) {
        return
      }

      controls.target.copy(clampedTarget)
      camera.position.copy(clampedTarget).add(cameraOffset)
    }

    const ambientLight = new THREE.HemisphereLight(0xffffff, 0x1a2430, 1.85)
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.4)
    keyLight.position.set(3.8, -4.6, 5.2)
    const fillLight = new THREE.DirectionalLight(0x91b7ff, 0.95)
    fillLight.position.set(-4.2, 3.4, 2.2)
    scene.add(ambientLight, keyLight, fillLight)

    const applyDefaultView = () => {
      camera.position.set(4.9, -5.5, 4.25)
      camera.near = 0.01
      camera.far = 80
      camera.updateProjectionMatrix()
      controls.target.set(0, 0, 0.46)
      clampControls()
      controls.update()
    }

    const resize = () => {
      const width = Math.max(1, mount.clientWidth)
      const height = Math.max(1, mount.clientHeight)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height, false)
    }

    resize()
    applyDefaultView()
    resetViewRef.current = applyDefaultView
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(mount)

    const handleRouteClick = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest('.viewport-reset-button, .route-node-panel')) {
        return
      }

      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)

      const hit = raycaster.intersectObjects(clickableMarkers, false).find((item) => item.object.userData.routeNode)
      const routeNode = hit?.object.userData.routeNode as RouteNode | undefined
      if (routeNode) {
        setSelectedRouteNode(routeNode)
        return
      }

      scene.updateMatrixWorld(true)
      let nearestRouteNode: RouteNode | undefined
      let nearestDistance = Number.POSITIVE_INFINITY
      for (const hotspot of routeHotspots) {
        projectedPosition.setFromMatrixPosition(hotspot.object.matrixWorld).project(camera)
        if (!Number.isFinite(projectedPosition.x) || !Number.isFinite(projectedPosition.y)) {
          continue
        }
        const screenX = (projectedPosition.x * 0.5 + 0.5) * rect.width
        const screenY = (-projectedPosition.y * 0.5 + 0.5) * rect.height
        const distance = Math.hypot(event.clientX - rect.left - screenX, event.clientY - rect.top - screenY)
        if (distance < nearestDistance) {
          nearestDistance = distance
          nearestRouteNode = hotspot.routeNode
        }
      }

      if (nearestRouteNode && nearestDistance < 140) {
        setSelectedRouteNode(nearestRouteNode)
      }
    }

    mount.addEventListener('pointerup', handleRouteClick)

    Promise.all([loadImage(heightmapPath), loadImage(texturePath), loadJson<RouteFeatureCollection>(routeGeoJsonPath), loadJson<GeeManifest>(manifestPath)])
      .then(([heightImage, textureImage, routeCollection, manifest]) => {
        if (isDisposed) {
          return
        }

        const terrainGeometry = createTerrainGeometry(heightImage)
        const route = parseRouteGeometry(routeCollection)
        const bounds = boundsFromManifest(manifest, route)
        satelliteTexture = new THREE.Texture(textureImage)
        satelliteTexture.colorSpace = THREE.SRGBColorSpace
        satelliteTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
        satelliteTexture.needsUpdate = true

        const material = new THREE.MeshBasicMaterial({
          map: satelliteTexture,
          side: THREE.DoubleSide,
        })
        const terrainGroup = new THREE.Group()
        terrainGroup.rotation.z = -0.08
        terrainGroup.name = 'hkstp-local-scene-terrain-group'
        const terrain = new THREE.Mesh(terrainGeometry.geometry, material)
        terrain.name = 'interactive-hkstp-delivery-terrain'
        terrainGroup.add(terrain)

        const rim = new THREE.EdgesGeometry(new THREE.PlaneGeometry(TERRAIN_WIDTH, TERRAIN_DEPTH))
        const rimMaterial = new THREE.LineBasicMaterial({ color: 0x4285f4, transparent: true, opacity: 0.72 })
        const rimObject = new THREE.LineSegments(rim, rimMaterial)
        rimObject.position.z = 0.04
        terrainGroup.add(rimObject)

        const routeMaterial = new THREE.LineBasicMaterial({ color: 0xfbbc04, transparent: true, opacity: 0.92 })
        const routePoints = route.line.map(([longitude, latitude]) => coordinateToTerrain(longitude, latitude, bounds, terrainGeometry.heightAt, 0.16))
        const routeGeometry = new THREE.BufferGeometry().setFromPoints(routePoints)
        const routeLine = new THREE.Line(routeGeometry, routeMaterial)
        routeLine.name = 'geojson-route-preview'
        terrainGroup.add(routeLine)

        route.nodes.forEach((node) => {
          const markerGroup = new THREE.Group()
          markerGroup.name = `route-node-${node.id}`
          markerGroup.position.copy(coordinateToTerrain(node.longitude, node.latitude, bounds, terrainGeometry.heightAt, 0.22))

          const color = routeNodeColor(node.kind)
          const markerMaterial = new THREE.MeshBasicMaterial({ color })
          const baseMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28 })
          const hitMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
          const marker = new THREE.Mesh(new THREE.SphereGeometry(0.085, 18, 12), markerMaterial)
          marker.position.z = 0.08
          marker.userData.routeNode = node
          const hitTarget = new THREE.Mesh(new THREE.SphereGeometry(0.26, 18, 12), hitMaterial)
          hitTarget.position.z = 0.08
          hitTarget.userData.routeNode = node
          const base = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.012, 32), baseMaterial)
          base.userData.routeNode = node
          const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.18, 10), markerMaterial)
          stem.position.z = -0.005
          stem.userData.routeNode = node
          markerGroup.add(base, stem, marker, hitTarget)
          terrainGroup.add(markerGroup)
          clickableMarkers.push(hitTarget, marker, base, stem)
          routeHotspots.push({ object: markerGroup, routeNode: node })
        })

        scene.add(terrainGroup)
        setIsReady(true)
      })
      .catch(() => {
        if (!isDisposed) {
          setHasError(true)
        }
      })

    renderer.setAnimationLoop(() => {
      clampControls()
      controls.update()
      renderer.render(scene, camera)
    })

    return () => {
      isDisposed = true
      resetViewRef.current = EMPTY_RESET
      resizeObserver.disconnect()
      mount.removeEventListener('pointerup', handleRouteClick)
      controls.dispose()
      renderer.setAnimationLoop(null)
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement)
      }
      disposeObject(scene)
      satelliteTexture?.dispose()
      renderer.dispose()
    }
  }, [alt, heightmapPath, manifestPath, routeGeoJsonPath, texturePath])

  return (
    <div
      className={`digital-twin-viewer ${isReady ? 'ready' : ''} ${hasError ? 'fallback' : ''}`}
      ref={mountRef}
      role="img"
      aria-label={alt}
    >
      <img className="digital-twin-fallback" src={fallbackImagePath} alt="" aria-hidden="true" />
      <button className="viewport-reset-button" type="button" aria-label={resetLabel} title={resetLabel} onClick={() => resetViewRef.current()}>
        <RotateCcw size={18} />
      </button>
      {selectedRouteNode ? (
        <article className="route-node-panel" aria-live="polite">
          <div>
            <span>{selectedRouteNode.kind}</span>
            <strong>{selectedRouteNode.name}</strong>
          </div>
          <dl>
            <div>
              <dt>Node</dt>
              <dd>{selectedRouteNode.id}</dd>
            </div>
            <div>
              <dt>Order</dt>
              <dd>{selectedRouteNode.order + 1}</dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>{selectedRouteNode.source}</dd>
            </div>
            <div>
              <dt>Lon / Lat</dt>
              <dd>{selectedRouteNode.longitude.toFixed(4)} / {selectedRouteNode.latitude.toFixed(4)}</dd>
            </div>
          </dl>
          <button type="button" onClick={() => setSelectedRouteNode(undefined)}>Close</button>
        </article>
      ) : null}
    </div>
  )
}
