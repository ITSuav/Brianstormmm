from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageStat

PROJECT_ROOT = Path(__file__).resolve().parents[1]
MIN_LARGE_ASSET_BYTES = 1024
MIN_MANIFEST_BYTES = 128


@dataclass(frozen=True)
class AssetRequirement:
    relative_path: str
    min_bytes: int


REQUIRED_ASSETS = (
    AssetRequirement("public/assets/geospatial/hk-gee-dem-heightmap.png", MIN_LARGE_ASSET_BYTES),
    AssetRequirement("public/assets/geospatial/hk-gee-sentinel2-texture.png", MIN_LARGE_ASSET_BYTES),
    AssetRequirement("public/assets/geospatial/hk-gee-slope.png", MIN_LARGE_ASSET_BYTES),
    AssetRequirement("public/assets/geospatial/hk-gee-risk-surface.png", MIN_LARGE_ASSET_BYTES),
    AssetRequirement("public/assets/geospatial/manifest.json", MIN_MANIFEST_BYTES),
    AssetRequirement("public/assets/routes/science_park_ting_kok_route_result.geojson", MIN_MANIFEST_BYTES),
    AssetRequirement("public/assets/routes/science_park_ting_kok_route_result.json", MIN_MANIFEST_BYTES),
    AssetRequirement("public/assets/drone-twin/hkstp/hk-gee-blender-terrain.png", MIN_LARGE_ASSET_BYTES),
    AssetRequirement("public/assets/drone-twin/hkstp/hk-gee-terrain-model.glb", MIN_LARGE_ASSET_BYTES),
    AssetRequirement("public/assets/drone-twin/hkstp/blender-manifest.json", MIN_MANIFEST_BYTES),
)

PNG_ASSETS = tuple(
    requirement.relative_path
    for requirement in REQUIRED_ASSETS
    if requirement.relative_path.endswith(".png")
)


def is_nonblank_png(relative_path: str) -> bool:
    image = Image.open(PROJECT_ROOT / relative_path).convert("RGBA")
    alpha_extrema = image.getchannel("A").getextrema()
    if alpha_extrema == (0, 0):
        return False
    rgb_stat = ImageStat.Stat(image.convert("RGB"))
    return max(channel_max for _, channel_max in image.convert("RGB").getextrema()) > 0 and sum(rgb_stat.var) > 0


def main() -> None:
    missing: list[str] = []
    too_small: list[str] = []
    blank_pngs: list[str] = []
    for requirement in REQUIRED_ASSETS:
        path = PROJECT_ROOT / requirement.relative_path
        if not path.exists():
            missing.append(requirement.relative_path)
            continue
        if path.stat().st_size < requirement.min_bytes:
            too_small.append(requirement.relative_path)

    if missing or too_small:
        details = []
        if missing:
            details.append(f"missing={missing}")
        if too_small:
            details.append(f"too_small={too_small}")
        raise SystemExit("Asset verification failed: " + "; ".join(details))

    blank_pngs = [relative_path for relative_path in PNG_ASSETS if not is_nonblank_png(relative_path)]
    if blank_pngs:
        raise SystemExit(f"Asset verification failed: blank_pngs={blank_pngs}")

    manifest_path = PROJECT_ROOT / "public/assets/geospatial/manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("status") != "real_gee_products_generated":
        raise SystemExit("GEE manifest does not declare real generated products")
    if manifest.get("routeGeoJson") != "public/assets/routes/science_park_ting_kok_route_result.geojson":
        raise SystemExit("GEE manifest does not declare the Ting Kok route GeoJSON corridor")
    dtm = manifest.get("dtm")
    if not isinstance(dtm, dict) or dtm.get("status") != "official_5m_dtm_connected" or dtm.get("connectedResolutionMeters") != 5:
        raise SystemExit("GEE manifest does not declare the official 5m DTM connection")

    blender_manifest_path = PROJECT_ROOT / "public/assets/drone-twin/hkstp/blender-manifest.json"
    blender_manifest = json.loads(blender_manifest_path.read_text(encoding="utf-8"))
    if blender_manifest.get("status") != "real_blender_render_generated":
        raise SystemExit("Blender manifest does not declare real generated render products")

    print("Asset verification passed")


if __name__ == "__main__":
    main()
