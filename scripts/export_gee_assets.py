from __future__ import annotations

import json
import logging
import os
import urllib.request
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import ee

LOGGER = logging.getLogger(__name__)
PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = PROJECT_ROOT / "public" / "assets" / "geospatial"
BOUNDS = (113.82, 22.13, 114.46, 22.58)
S2_START = "2024-01-01"
S2_END = "2026-05-11"
DIMENSIONS = 1600


def load_local_env() -> None:
    env_path = PROJECT_ROOT / ".env"
    if not env_path.exists():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


@dataclass(frozen=True)
class GeeProduct:
    name: str
    filename: str
    dataset: str
    description: str


def initialize_earth_engine() -> None:
    project = os.environ.get("EE_PROJECT") or os.environ.get("GOOGLE_CLOUD_PROJECT")
    if project:
        ee.Initialize(project=project)
        return
    ee.Initialize()


def download_png(image: ee.Image, filename: str, region: ee.Geometry) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    url = image.getThumbURL({
        "region": region,
        "dimensions": DIMENSIONS,
        "format": "png",
    })
    destination = OUTPUT_DIR / filename
    LOGGER.info("Downloading %s", destination)
    with urllib.request.urlopen(url, timeout=180) as response:
        destination.write_bytes(response.read())


def sentinel2_composite(region: ee.Geometry) -> ee.Image:
    collection = (
        ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
        .filterBounds(region)
        .filterDate(S2_START, S2_END)
        .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 20))
    )
    return collection.median().clip(region)


def copernicus_dem(region: ee.Geometry) -> ee.Image:
    collection = (
        ee.ImageCollection("COPERNICUS/DEM/GLO30")
        .filterBounds(region)
        .select("DEM")
    )
    projection = ee.Image(collection.first()).projection()
    return (
        collection
        .mosaic()
        .setDefaultProjection(projection)
        .clip(region)
    )


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    load_local_env()
    initialize_earth_engine()
    region = ee.Geometry.Rectangle(BOUNDS)

    dem = copernicus_dem(region)
    slope = ee.Terrain.slope(dem).clip(region)
    sentinel = sentinel2_composite(region)
    ndvi = sentinel.normalizedDifference(["B8", "B4"]).rename("NDVI").clip(region)
    water = ee.Image("JRC/GSW1_4/GlobalSurfaceWater").select("occurrence").clip(region)

    slope_risk = slope.unitScale(8, 35).clamp(0, 1).unmask(0)
    vegetation_risk = ndvi.unitScale(0.45, 0.85).clamp(0, 1).unmask(0)
    water_risk = water.unitScale(10, 60).clamp(0, 1).unmask(0)
    risk = slope_risk.max(vegetation_risk).max(water_risk).rename("risk")

    visual_products: tuple[tuple[GeeProduct, ee.Image], ...] = (
        (
            GeeProduct(
                "Copernicus DEM heightmap",
                "hk-gee-dem-heightmap.png",
                "COPERNICUS/DEM/GLO30",
                "Grayscale elevation source used as Blender terrain displacement.",
            ),
            dem.unmask(0).visualize(min=0, max=900, palette=["000000", "ffffff"]),
        ),
        (
            GeeProduct(
                "Sentinel-2 satellite texture",
                "hk-gee-sentinel2-texture.png",
                "COPERNICUS/S2_SR_HARMONIZED",
                "Cloud-filtered median true-color texture for terrain draping.",
            ),
            sentinel.unmask(0).visualize(bands=["B4", "B3", "B2"], min=250, max=3200, gamma=1.18),
        ),
        (
            GeeProduct(
                "Terrain slope",
                "hk-gee-slope.png",
                "ee.Terrain.slope(COPERNICUS/DEM/GLO30)",
                "Slope layer for mountain risk and landing suitability screening.",
            ),
            slope.unmask(0).visualize(min=0, max=45, palette=["1c7c54", "f2d16b", "d95f43", "7f1d1d"]),
        ),
        (
            GeeProduct(
                "Composite risk surface",
                "hk-gee-risk-surface.png",
                "Slope + Sentinel-2 NDVI + JRC water occurrence",
                "Screening-level operational risk surface; not an algorithm-approved route.",
            ),
            risk.visualize(min=0, max=1, palette=["123c69", "2f9e44", "f2c94c", "ef8c45", "d44848"]),
        ),
    )

    for product, image in visual_products:
        download_png(image, product.filename, region)

    manifest = {
        "generatedAt": datetime.now(UTC).isoformat(),
        "bounds": BOUNDS,
        "region": "Hong Kong regional drone delivery study area",
        "dateRange": {"sentinel2Start": S2_START, "sentinel2End": S2_END},
        "status": "real_gee_products_generated",
        "products": [product.__dict__ for product, _ in visual_products],
        "attribution": [
            "Copernicus DEM GLO-30 via Google Earth Engine",
            "Copernicus Sentinel-2 Surface Reflectance via Google Earth Engine",
            "JRC Global Surface Water via Google Earth Engine",
        ],
        "limitations": [
            "Copernicus DEM is a 30 m global DEM and is not a LiDAR-grade Hong Kong engineering DTM.",
            "Sentinel-2 is suitable for regional visual context but not close-range inspection.",
            "The risk surface is a frontend screening layer, not a validated route planner.",
        ],
    }
    (OUTPUT_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    LOGGER.info("Wrote %s", OUTPUT_DIR / "manifest.json")


if __name__ == "__main__":
    main()
