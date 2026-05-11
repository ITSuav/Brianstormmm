import { useEffect, useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

interface DigitalTwinViewportProps {
  readonly heightmapPath: string
  readonly texturePath: string
  readonly fallbackImagePath: string
  readonly alt: string
  readonly resetLabel: string
}

const TERRAIN_WIDTH = 7.2
const TERRAIN_DEPTH = 5.1
const GRID_COLUMNS = 180
const GRID_ROWS = 128
const HEIGHT_SCALE = 1.25
const PAN_LIMIT_X = TERRAIN_WIDTH * 0.32
const PAN_LIMIT_Y = TERRAIN_DEPTH * 0.32
const MIN_TARGET_HEIGHT = 0.18
const MAX_TARGET_HEIGHT = 0.92
const EMPTY_RESET = () => undefined

function clampValue(value: number, minValue: number, maxValue: number): number {
  return Math.min(Math.max(value, minValue), maxValue)
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

function createTerrainGeometry(heightImage: HTMLImageElement): THREE.BufferGeometry {
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
  let minHeight = 255
  let maxHeight = 0

  for (let index = 0; index < heightValues.length; index += 1) {
    const value = imageData[index * 4]
    heightValues[index] = value
    minHeight = Math.min(minHeight, value)
    maxHeight = Math.max(maxHeight, value)
  }

  const heightRange = Math.max(1, maxHeight - minHeight)
  const positions = new Float32Array(GRID_COLUMNS * GRID_ROWS * 3)
  const uvs = new Float32Array(GRID_COLUMNS * GRID_ROWS * 2)
  const indices: number[] = []

  for (let row = 0; row < GRID_ROWS; row += 1) {
    const v = row / (GRID_ROWS - 1)
    for (let column = 0; column < GRID_COLUMNS; column += 1) {
      const u = column / (GRID_COLUMNS - 1)
      const vertexIndex = row * GRID_COLUMNS + column
      const normalizedHeight = (heightValues[vertexIndex] - minHeight) / heightRange
      positions[vertexIndex * 3] = (u - 0.5) * TERRAIN_WIDTH
      positions[vertexIndex * 3 + 1] = (0.5 - v) * TERRAIN_DEPTH
      positions[vertexIndex * 3 + 2] = normalizedHeight * HEIGHT_SCALE
      uvs[vertexIndex * 2] = u
      uvs[vertexIndex * 2 + 1] = 1 - v
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

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
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

export function DigitalTwinViewport({ heightmapPath, texturePath, fallbackImagePath, alt, resetLabel }: DigitalTwinViewportProps) {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const resetViewRef = useRef<() => void>(EMPTY_RESET)
  const [isReady, setIsReady] = useState(false)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) {
      return undefined
    }

    let isDisposed = false
    let satelliteTexture: THREE.Texture | undefined
    setIsReady(false)
    setHasError(false)

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

    Promise.all([loadImage(heightmapPath), loadImage(texturePath)])
      .then(([heightImage, textureImage]) => {
        if (isDisposed) {
          return
        }

        const geometry = createTerrainGeometry(heightImage)
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
        const terrain = new THREE.Mesh(geometry, material)
        terrain.name = 'interactive-hkstp-delivery-terrain'
        terrainGroup.add(terrain)

        const rim = new THREE.EdgesGeometry(new THREE.PlaneGeometry(TERRAIN_WIDTH, TERRAIN_DEPTH))
        const rimMaterial = new THREE.LineBasicMaterial({ color: 0x4285f4, transparent: true, opacity: 0.72 })
        const rimObject = new THREE.LineSegments(rim, rimMaterial)
        rimObject.position.z = 0.04
        terrainGroup.add(rimObject)

        const routeMaterial = new THREE.LineBasicMaterial({ color: 0xfbbc04, transparent: true, opacity: 0.92 })
        const routeGeometry = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(-2.9, -1.7, 0.62),
          new THREE.Vector3(-1.3, -0.45, 0.78),
          new THREE.Vector3(0.7, 0.18, 0.9),
          new THREE.Vector3(2.6, 1.55, 0.82),
        ])
        const routeLine = new THREE.Line(routeGeometry, routeMaterial)
        routeLine.name = 'operator-route-preview'
        terrainGroup.add(routeLine)
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
      controls.dispose()
      renderer.setAnimationLoop(null)
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement)
      }
      disposeObject(scene)
      satelliteTexture?.dispose()
      renderer.dispose()
    }
  }, [alt, heightmapPath, texturePath])

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
    </div>
  )
}
