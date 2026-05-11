import type { Drone, DroneRouteCandidate, Metric, MissionEvent } from '../domain/models'

export const drones: readonly Drone[] = [
  {
    id: 'uav-01',
    callsign: 'HKSTP-01',
    status: 'ready',
    batteryPercent: 94,
    payloadKg: 2.4,
    location: { label: 'HKSTP launch deck', latitude: 22.4269, longitude: 114.2122, altitudeMeters: 18 },
  },
  {
    id: 'uav-02',
    callsign: 'RIDGE-02',
    status: 'charging',
    batteryPercent: 68,
    payloadKg: 1.8,
    location: { label: 'Tai Po relay pad', latitude: 22.4501, longitude: 114.1646, altitudeMeters: 42 },
  },
  {
    id: 'uav-03',
    callsign: 'COAST-03',
    status: 'maintenance',
    batteryPercent: 31,
    payloadKg: 0,
    location: { label: 'Hangar bay', latitude: 22.4274, longitude: 114.2106, altitudeMeters: 12 },
  },
] as const

export const routeCandidates: readonly DroneRouteCandidate[] = [
  {
    id: 'route-algorithm-slot-001',
    name: 'HKSTP to eastern mountain delivery slot',
    status: 'algorithm_pending',
    source: 'algorithm_interface',
    distanceKm: 0,
    estimatedMinutes: 0,
    riskScore: 0,
    waypoints: [
      { sequence: 1, action: 'launch', label: 'HKSTP launch deck', latitude: 22.4269, longitude: 114.2122, altitudeMeters: 18 },
      { sequence: 2, action: 'transit', label: 'Algorithm waypoint upload required', latitude: 22.4388, longitude: 114.2401, altitudeMeters: 130 },
      { sequence: 3, action: 'delivery', label: 'Mountain delivery endpoint pending', latitude: 22.3862, longitude: 114.2786, altitudeMeters: 210 },
    ],
  },
] as const

export const metrics: readonly Metric[] = [
  { label: 'Real GEE layers', value: '4', trend: 'DEM, imagery, slope, risk' },
  { label: 'Blender outputs', value: '2', trend: 'render + GLB' },
  { label: 'Algorithm routes', value: 'pending', trend: 'interface only' },
  { label: 'MATSim', value: 'pending', trend: 'team integration' },
] as const

export const missionTimeline: readonly MissionEvent[] = [
  { time: 'T-24h', label: 'GEE terrain and satellite export', status: 'nominal' },
  { time: 'T-12h', label: 'Blender terrain render refresh', status: 'nominal' },
  { time: 'T-04h', label: 'Algorithm route payload upload', status: 'attention' },
  { time: 'T-02h', label: 'MATSim scenario ingest', status: 'attention' },
] as const
