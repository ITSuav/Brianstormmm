# Integration Contracts

## Algorithm Route Gateway

The frontend accepts route outputs as JSON records matching `DroneRouteCandidate` in `src/domain/models.ts`.

Required fields:

- `id`
- `name`
- `status`
- `source`
- `distanceKm`
- `estimatedMinutes`
- `riskScore`
- `waypoints`

Allowed statuses:

- `algorithm_pending`: no route result has been validated yet.
- `candidate`: algorithm proposed a route, not operator-approved.
- `approved`: operator or backend approved the route.
- `active`: route is being flown or replayed.

## MATSim Gateway

MATSim is not implemented in the frontend. The UI reserves the interface for later scenario and run summaries.

Expected future payload groups:

- scenario metadata
- demand or delivery-task set
- network/corridor reference
- simulation run status
- route assignment summary
- KPI comparison against baseline dispatch

## Geospatial Assets

Frontend asset registry is in `src/data/assetRegistry.ts`. Real generated outputs live under `public/assets`.

The registry may mark assets as:

- `available`: generated or supplied real asset exists.
- `required`: real asset is planned but not yet supplied.
- `blocked`: cannot truthfully render without missing official/local data.

## 3D Assets

Blender render and GLB are generated from real GEE products. SuperSplat is reserved for later real 3D Gaussian Splat captures and must not be filled with synthetic scenes.
