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
    id: 'route-hkstp-ting-kok-001',
    name: 'HKSTP to Ting Kok Village lunch route',
    status: 'candidate',
    source: 'algorithm_interface',
    distanceKm: 5.87,
    estimatedMinutes: 10,
    riskScore: 0.034,
    waypoints: [
      { sequence: 1, action: 'launch', label: 'Hong Kong Science Park', latitude: 22.4257, longitude: 114.2119, altitudeMeters: 18 },
      { sequence: 2, action: 'transit', label: 'Pak Shek Kok waterfront waypoint', latitude: 22.433, longitude: 114.215, altitudeMeters: 45 },
      { sequence: 3, action: 'transit', label: 'Demo relay or charging pad near Tolo Harbour', latitude: 22.449, longitude: 114.2215, altitudeMeters: 60 },
      { sequence: 4, action: 'transit', label: 'Tolo Harbour mid-route waypoint', latitude: 22.456, longitude: 114.224, altitudeMeters: 60 },
      { sequence: 5, action: 'delivery', label: 'Ting Kok Village, Tai Po', latitude: 22.4765, longitude: 114.2245, altitudeMeters: 35 },
    ],
  },
] as const

export const metrics: readonly Metric[] = [
  { label: 'Real GEE layers', value: '4', trend: 'DEM, imagery, slope, risk' },
  { label: 'Blender outputs', value: '2', trend: 'render + GLB' },
  { label: 'Algorithm routes', value: '1', trend: 'HKSTP to Ting Kok candidate' },
  { label: 'MATSim', value: 'pending', trend: 'team integration' },
] as const

export const missionTimeline: readonly MissionEvent[] = [
  { time: 'T-24h', label: 'Algorithm GeoJSON route connected', status: 'nominal' },
  { time: 'T-12h', label: 'Route corridor terrain refresh', status: 'nominal' },
  { time: 'T-04h', label: 'Backend API joint test', status: 'attention' },
  { time: 'T-02h', label: 'MATSim scenario ingest pending', status: 'attention' },
] as const
