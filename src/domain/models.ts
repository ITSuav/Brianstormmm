export type RoutePlanningStatus = 'algorithm_pending' | 'candidate' | 'approved' | 'active'

export type DroneStatus = 'ready' | 'in_flight' | 'charging' | 'maintenance'

export type AssetReadiness = 'available' | 'required' | 'blocked'

export interface GeoPoint {
  readonly label: string
  readonly latitude: number
  readonly longitude: number
  readonly altitudeMeters?: number
}

export interface GeospatialLayer {
  readonly id: string
  readonly name: string
  readonly source: 'GEE' | 'Official HK dataset required'
  readonly dataset: string
  readonly productPath: string
  readonly status: AssetReadiness
  readonly purpose: string
}

export interface DigitalTwinAsset {
  readonly id: string
  readonly name: string
  readonly source: 'Blender render' | 'Blender model' | 'GEE texture' | 'SuperSplat slot'
  readonly productPath: string
  readonly status: AssetReadiness
  readonly notes: string
}

export interface Drone {
  readonly id: string
  readonly callsign: string
  readonly status: DroneStatus
  readonly batteryPercent: number
  readonly payloadKg: number
  readonly location: GeoPoint
}

export interface RouteWaypoint extends GeoPoint {
  readonly sequence: number
  readonly action: 'launch' | 'transit' | 'delivery' | 'return'
}

export interface DroneRouteCandidate {
  readonly id: string
  readonly name: string
  readonly status: RoutePlanningStatus
  readonly source: 'algorithm_interface'
  readonly distanceKm: number
  readonly estimatedMinutes: number
  readonly riskScore: number
  readonly waypoints: readonly RouteWaypoint[]
}

export interface MissionEvent {
  readonly time: string
  readonly label: string
  readonly status: 'nominal' | 'attention' | 'blocked'
}

export interface Metric {
  readonly label: string
  readonly value: string
  readonly trend: string
}
