from __future__ import annotations

import json
import logging
import math
import os
import urllib.request
import zipfile
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import ee
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter
import rasterio
from rasterio.enums import Resampling
from rasterio.warp import transform_bounds
from rasterio.windows import from_bounds

LOGGER = logging.getLogger(__name__)
PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = PROJECT_ROOT / "public" / "assets" / "geospatial"
ROUTE_GEOJSON_PATH = PROJECT_ROOT / "public" / "assets" / "routes" / "science_park_ting_kok_route_result.geojson"
OFFICIAL_DTM_URL = "https://static.csdi.gov.hk/csdi-webpage/download/43f9ca1bf5695d98885c767185b0afe1/geotiff"
OFFICIAL_DTM_CACHE_DIR = PROJECT_ROOT / "data" / "cache" / "landsd-dtm-5m"
OFFICIAL_DTM_ARCHIVE_PATH = OFFICIAL_DTM_CACHE_DIR / "landsd-dtm-5m-geotiff.zip"
S2_START = "2024-01-01"
S2_END = "2026-05-11"
DIMENSIONS = 2400
SCENE_ASPECT_RATIO = 7.2 / 5.1
OUTPUT_SIZE = (DIMENSIONS, round(DIMENSIONS / SCENE_ASPECT_RATIO))
METERS_PER_DEGREE_LATITUDE = 110_540
MIN_ROUTE_PADDING_METERS = 650
MIN_SCENE_WIDTH_METERS = 12_000
ROUTE_PADDING_RATIO = 0.18
DTM_MIN_ELEVATION_METERS = -5
DTM_MAX_ELEVATION_METERS = 950
TEXTURE_CONTRAST_FACTOR = 1.08
TEXTURE_SHARPNESS_FACTOR = 1.12
TEXTURE_UNSHARP_RADIUS = 1.35
TEXTURE_UNSHARP_PERCENT = 135
TEXTURE_UNSHARP_THRESHOLD = 3


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


PRODUCTS = (
    GeeProduct(
        "Route corridor DTM heightmap",
        "hk-gee-dem-heightmap.png",
        "LandsD Digital Terrain Model (5m Grid); COPERNICUS/DEM/GLO30 fallback",
        "Grayscale elevation source used as Blender terrain displacement.",
    ),
    GeeProduct(
        "Sentinel-2 satellite texture",
        "hk-gee-sentinel2-texture.png",
        "COPERNICUS/S2_SR_HARMONIZED",
        "Cloud-filtered median true-color texture for terrain draping.",
    ),
    GeeProduct(
        "Terrain slope",
        "hk-gee-slope.png",
        "Slope derived from LandsD 5m DTM; ee.Terrain.slope(COPERNICUS/DEM/GLO30) fallback",
        "Slope layer for mountain risk and landing suitability screening.",
    ),
    GeeProduct(
        "Composite risk surface",
        "hk-gee-risk-surface.png",
        "LandsD 5m DTM slope screening; GEE composite fallback",
        "Screening-level operational risk surface; not an algorithm-approved route.",
    ),
)

TEXTURE_PRODUCT_INDEX = 1


def parse_coordinate(value: object) -> tuple[float, float] | None:
    if not isinstance(value, list) or len(value) < 2:
        return None

    longitude, latitude = value[:2]
    if not isinstance(longitude, int | float) or not isinstance(latitude, int | float):
        return None
    return float(longitude), float(latitude)


def iter_geojson_coordinates(geometry: dict[str, object]) -> list[tuple[float, float]]:
    geometry_type = geometry.get("type")
    coordinates = geometry.get("coordinates")
    if geometry_type == "Point":
        coordinate = parse_coordinate(coordinates)
        return [coordinate] if coordinate else []
    if geometry_type == "LineString" and isinstance(coordinates, list):
        return [coordinate for item in coordinates if (coordinate := parse_coordinate(item))]
    return []


def route_coordinates(route_geojson_path: Path) -> list[tuple[float, float]]:
    payload = json.loads(route_geojson_path.read_text(encoding="utf-8-sig"))
    features = payload.get("features")
    if not isinstance(features, list):
        raise ValueError(f"Route GeoJSON has no features: {route_geojson_path}")

    coordinates: list[tuple[float, float]] = []
    for feature in features:
        if not isinstance(feature, dict):
            continue
        geometry = feature.get("geometry")
        if isinstance(geometry, dict):
            coordinates.extend(iter_geojson_coordinates(geometry))

    if not coordinates:
        raise ValueError(f"Route GeoJSON has no Point or LineString coordinates: {route_geojson_path}")
    return coordinates


def route_scene_bounds(route_geojson_path: Path) -> tuple[float, float, float, float]:
    coordinates = route_coordinates(route_geojson_path)
    longitudes = [longitude for longitude, _ in coordinates]
    latitudes = [latitude for _, latitude in coordinates]
    west, east = min(longitudes), max(longitudes)
    south, north = min(latitudes), max(latitudes)
    center_longitude = (west + east) / 2
    center_latitude = (south + north) / 2
    meters_per_degree_longitude = 111_320 * math.cos(math.radians(center_latitude))

    raw_width_meters = max((east - west) * meters_per_degree_longitude, 1)
    raw_height_meters = max((north - south) * METERS_PER_DEGREE_LATITUDE, 1)
    padding_meters = max(MIN_ROUTE_PADDING_METERS, max(raw_width_meters, raw_height_meters) * ROUTE_PADDING_RATIO)
    padded_width_meters = raw_width_meters + padding_meters * 2
    padded_height_meters = raw_height_meters + padding_meters * 2

    target_width_meters = max(padded_width_meters, padded_height_meters * SCENE_ASPECT_RATIO)
    target_height_meters = max(padded_height_meters, target_width_meters / SCENE_ASPECT_RATIO)
    target_width_meters = max(target_width_meters, MIN_SCENE_WIDTH_METERS)
    target_height_meters = max(target_height_meters, target_width_meters / SCENE_ASPECT_RATIO)
    half_width_degrees = target_width_meters / meters_per_degree_longitude / 2
    half_height_degrees = target_height_meters / METERS_PER_DEGREE_LATITUDE / 2
    return (
        center_longitude - half_width_degrees,
        center_latitude - half_height_degrees,
        center_longitude + half_width_degrees,
        center_latitude + half_height_degrees,
    )


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
        "dimensions": f"{OUTPUT_SIZE[0]}x{OUTPUT_SIZE[1]}",
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


def download_official_dtm_archive() -> Path:
    OFFICIAL_DTM_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    if OFFICIAL_DTM_ARCHIVE_PATH.exists() and OFFICIAL_DTM_ARCHIVE_PATH.stat().st_size > 1_000_000:
        return OFFICIAL_DTM_ARCHIVE_PATH

    LOGGER.info("Downloading official LandsD 5m DTM archive: %s", OFFICIAL_DTM_URL)
    with urllib.request.urlopen(OFFICIAL_DTM_URL, timeout=240) as response:
        OFFICIAL_DTM_ARCHIVE_PATH.write_bytes(response.read())
    return OFFICIAL_DTM_ARCHIVE_PATH


def official_dtm_geotiff_path() -> Path:
    archive_path = download_official_dtm_archive()
    with zipfile.ZipFile(archive_path) as archive:
        archive.extractall(OFFICIAL_DTM_CACHE_DIR)

    geotiffs = sorted([
        path
        for suffix in ("*.tif", "*.tiff", "*.TIF", "*.TIFF")
        for path in OFFICIAL_DTM_CACHE_DIR.rglob(suffix)
    ])
    if not geotiffs:
        raise FileNotFoundError(f"Official DTM archive contains no GeoTIFF: {archive_path}")
    return geotiffs[0]


def normalized_uint8(values: np.ndarray, min_value: float, max_value: float) -> np.ndarray:
    scaled = (values - min_value) / max(max_value - min_value, 1e-6)
    return np.clip(scaled * 255, 0, 255).astype(np.uint8)


def enhance_satellite_texture(image: Image.Image) -> Image.Image:
    rgb_image = image.convert("RGB")
    sharpened = rgb_image.filter(ImageFilter.UnsharpMask(
        radius=TEXTURE_UNSHARP_RADIUS,
        percent=TEXTURE_UNSHARP_PERCENT,
        threshold=TEXTURE_UNSHARP_THRESHOLD,
    ))
    contrasted = ImageEnhance.Contrast(sharpened).enhance(TEXTURE_CONTRAST_FACTOR)
    return ImageEnhance.Sharpness(contrasted).enhance(TEXTURE_SHARPNESS_FACTOR).convert("RGBA")


def colorize(values: np.ndarray, min_value: float, max_value: float, palette: tuple[tuple[int, int, int], ...]) -> Image.Image:
    normalized = np.clip((values - min_value) / max(max_value - min_value, 1e-6), 0, 1)
    stops = np.linspace(0, 1, len(palette))
    red = np.interp(normalized, stops, [color[0] for color in palette])
    green = np.interp(normalized, stops, [color[1] for color in palette])
    blue = np.interp(normalized, stops, [color[2] for color in palette])
    rgb = np.dstack([red, green, blue]).astype(np.uint8)
    return Image.fromarray(rgb, mode="RGB").convert("RGBA")


def write_official_dtm_products(bounds: tuple[float, float, float, float]) -> dict[str, object]:
    geotiff_path = official_dtm_geotiff_path()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with rasterio.open(geotiff_path) as dataset:
        projected_bounds = transform_bounds("EPSG:4326", dataset.crs, *bounds, densify_pts=21)
        window = from_bounds(*projected_bounds, transform=dataset.transform)
        elevation = dataset.read(
            1,
            window=window,
            out_shape=(OUTPUT_SIZE[1], OUTPUT_SIZE[0]),
            masked=True,
            resampling=Resampling.bilinear,
        ).astype("float32")
        if np.ma.is_masked(elevation):
            fill_value = float(np.ma.median(elevation))
            elevation = elevation.filled(fill_value)
        elevation = np.asarray(elevation, dtype=np.float32)
        elevation = np.nan_to_num(elevation, nan=float(np.nanmedian(elevation)))
        elevation = np.clip(elevation, DTM_MIN_ELEVATION_METERS, DTM_MAX_ELEVATION_METERS)

        heightmap = Image.fromarray(normalized_uint8(elevation, DTM_MIN_ELEVATION_METERS, DTM_MAX_ELEVATION_METERS), mode="L").convert("RGBA")
        heightmap.save(OUTPUT_DIR / PRODUCTS[0].filename)

        left, bottom, right, top = projected_bounds
        pixel_width = abs(right - left) / OUTPUT_SIZE[0]
        pixel_height = abs(top - bottom) / OUTPUT_SIZE[1]
        gradient_y, gradient_x = np.gradient(elevation, pixel_height, pixel_width)
        slope_degrees = np.degrees(np.arctan(np.hypot(gradient_x, gradient_y)))
        colorize(slope_degrees, 0, 45, ((28, 124, 84), (242, 209, 107), (217, 95, 67), (127, 29, 29))).save(OUTPUT_DIR / PRODUCTS[2].filename)

        slope_risk = np.clip((slope_degrees - 8) / 27, 0, 1)
        colorize(slope_risk, 0, 1, ((18, 60, 105), (47, 158, 68), (242, 201, 76), (239, 140, 69), (212, 72, 72))).save(OUTPUT_DIR / PRODUCTS[3].filename)

    LOGGER.info("Generated official 5m DTM products from %s", geotiff_path)
    return {
        "source": str(geotiff_path.relative_to(PROJECT_ROOT)).replace("\\", "/"),
        "downloadUrl": OFFICIAL_DTM_URL,
        "crs": "EPSG:5738",
        "resolutionMeters": 5,
        "elevationEncoding": {"minMeters": DTM_MIN_ELEVATION_METERS, "maxMeters": DTM_MAX_ELEVATION_METERS},
    }
    projection = ee.Image(collection.first()).projection()
    return (
        collection
        .mosaic()
        .setDefaultProjection(projection)
        .clip(region)
    )


def crop_box(source_bounds: tuple[float, float, float, float], target_bounds: tuple[float, float, float, float], width: int, height: int) -> tuple[int, int, int, int]:
    source_west, source_south, source_east, source_north = source_bounds
    target_west, target_south, target_east, target_north = target_bounds
    left = round((target_west - source_west) / (source_east - source_west) * width)
    right = round((target_east - source_west) / (source_east - source_west) * width)
    top = round((source_north - target_north) / (source_north - source_south) * height)
    bottom = round((source_north - target_south) / (source_north - source_south) * height)
    return (
        int(max(0, min(width - 1, left))),
        int(max(0, min(height - 1, top))),
        int(max(1, min(width, right))),
        int(max(1, min(height, bottom))),
    )


def crop_existing_gee_assets(bounds: tuple[float, float, float, float], product_indices: tuple[int, ...] = tuple(range(len(PRODUCTS)))) -> tuple[float, float, float, float] | None:
    manifest_path = OUTPUT_DIR / "manifest.json"
    if not manifest_path.exists():
        return None

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    source_bounds_value = manifest.get("bounds")
    if not isinstance(source_bounds_value, list) or len(source_bounds_value) < 4:
        return None
    source_bounds = tuple(float(value) for value in source_bounds_value[:4])

    for index in product_indices:
        product = PRODUCTS[index]
        path = OUTPUT_DIR / product.filename
        if not path.exists():
            return None

    current_bounds = tuple(round(value, 9) for value in source_bounds)
    requested_bounds = tuple(round(value, 9) for value in bounds)
    if current_bounds == requested_bounds:
        return source_bounds

    for index in product_indices:
        product = PRODUCTS[index]
        path = OUTPUT_DIR / product.filename
        image = Image.open(path).convert("RGBA")
        box = crop_box(source_bounds, bounds, image.width, image.height)
        resampling = Image.Resampling.LANCZOS if index == TEXTURE_PRODUCT_INDEX else Image.Resampling.BICUBIC
        cropped = image.crop(box).resize(OUTPUT_SIZE, resampling)
        if index == TEXTURE_PRODUCT_INDEX:
            cropped = enhance_satellite_texture(cropped)
        cropped.save(path)
        LOGGER.info("Cropped %s to route corridor", path)
    return source_bounds


def write_manifest(bounds: tuple[float, float, float, float], processing_mode: str, source_bounds: tuple[float, float, float, float] | None = None, official_dtm: dict[str, object] | None = None) -> None:
    has_official_dtm = official_dtm is not None
    manifest = {
        "generatedAt": datetime.now(UTC).isoformat(),
        "bounds": bounds,
        "sourceBounds": source_bounds,
        "routeGeoJson": str(ROUTE_GEOJSON_PATH.relative_to(PROJECT_ROOT)).replace("\\", "/"),
        "region": "HKSTP to Ting Kok route corridor",
        "processingMode": processing_mode,
        "dateRange": {"sentinel2Start": S2_START, "sentinel2End": S2_END},
        "status": "real_gee_products_generated",
        "dtm": {
            "requestedResolutionMeters": 5,
            "connectedResolutionMeters": 5 if has_official_dtm else 30,
            "connectedSource": "LandsD Digital Terrain Model (5m Grid) via CSDI Portal" if has_official_dtm else "COPERNICUS/DEM/GLO30 via Google Earth Engine",
            "status": "official_5m_dtm_connected" if has_official_dtm else "official_5m_dtm_source_not_connected_in_this_workspace",
            "officialDtm": official_dtm,
        },
        "products": [product.__dict__ for product in PRODUCTS],
        "attribution": [
            *(["Lands Department Digital Terrain Model (5m Grid) via CSDI Portal"] if has_official_dtm else ["Copernicus DEM GLO-30 via Google Earth Engine", "JRC Global Surface Water via Google Earth Engine"]),
            "Copernicus Sentinel-2 Surface Reflectance via Google Earth Engine",
        ],
        "limitations": [
            "The current terrain heightmap uses the official LandsD 5 m DTM when processingMode starts with official_5m_dtm." if has_official_dtm else "The current connected DEM is Copernicus DEM GLO-30; it is a 30 m global DEM and not a LiDAR-grade Hong Kong 5 m DTM.",
            "The DTM depicts vegetation height where land area is covered by vegetation, following the CSDI dataset limitation." if has_official_dtm else "If a licensed or official 5 m Hong Kong DTM is supplied, replace the DEM source before engineering review.",
            "Sentinel-2 is suitable for regional visual context but not close-range inspection.",
            "The risk surface is a frontend screening layer, not a validated route planner.",
        ],
    }
    (OUTPUT_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    LOGGER.info("Wrote %s", OUTPUT_DIR / "manifest.json")


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    load_local_env()
    bounds = route_scene_bounds(ROUTE_GEOJSON_PATH)
    try:
        official_dtm = write_official_dtm_products(bounds)
        source_bounds = crop_existing_gee_assets(bounds, (TEXTURE_PRODUCT_INDEX,))
        write_manifest(bounds, "official_5m_dtm_with_route_corridor_texture", source_bounds, official_dtm)
        return
    except Exception as error:
        LOGGER.warning("Official 5m DTM processing failed; falling back to Earth Engine/local GEE products: %s", error)

    try:
        initialize_earth_engine()
        region = ee.Geometry.Rectangle(bounds)

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
            (PRODUCTS[0], dem.unmask(0).visualize(min=0, max=900, palette=["000000", "ffffff"])),
            (PRODUCTS[1], sentinel.unmask(0).visualize(bands=["B4", "B3", "B2"], min=250, max=3200, gamma=1.18)),
            (PRODUCTS[2], slope.unmask(0).visualize(min=0, max=45, palette=["1c7c54", "f2d16b", "d95f43", "7f1d1d"])),
            (PRODUCTS[3], risk.visualize(min=0, max=1, palette=["123c69", "2f9e44", "f2c94c", "ef8c45", "d44848"])),
        )

        for product, image in visual_products:
            download_png(image, product.filename, region)
        write_manifest(bounds, "google_earth_engine_route_corridor_export")
        return
    except Exception as error:
        LOGGER.warning("Earth Engine export failed; attempting local crop fallback from existing GEE assets: %s", error)

    source_bounds = crop_existing_gee_assets(bounds)
    if source_bounds is None:
        raise SystemExit("Earth Engine export failed and no existing GEE products are available for route-corridor cropping")
    write_manifest(bounds, "local_route_corridor_crop_from_existing_gee_products", source_bounds)


if __name__ == "__main__":
    main()
