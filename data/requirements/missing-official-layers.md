# Missing Official Or Local Layers

These layers are required before the city model, route clearance, or final operational demo can be presented as real.

## Required

- Hong Kong building footprints with height attributes, CityGML, 3D Tiles, or equivalent official 3D city data.
- Civil Aviation Department restricted airspace, no-fly areas, and temporary restrictions.
- Powerlines, towers, cables, masts, cranes, and other low-altitude obstacles.
- Approved drone launch pads, charging pads, delivery/drop locations, and operator-defined hubs.
- Weather and wind feeds suitable for drone operation.
- Real route outputs from the algorithm group.
- MATSim scenario and simulation outputs from the algorithm group.

## Optional But Valuable

- High-resolution Hong Kong orthophotos for close zoom.
- LiDAR-grade DTM/DSM for mountain and dense urban areas.
- Real 3DGS captures for HKSTP, relay pads, or mountain landing sites.
- Service-area and elderly-care destination data with privacy-safe identifiers.

## Current Frontend Behavior

The app marks these layers as `required` or `blocked`; it does not fabricate city height extrusion or route validation.
