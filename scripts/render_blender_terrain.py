from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

import bpy
from mathutils import Vector

PROJECT_ROOT = Path(__file__).resolve().parents[1]
HEIGHTMAP_PATH = PROJECT_ROOT / "public" / "assets" / "geospatial" / "hk-gee-dem-heightmap.png"
TEXTURE_PATH = PROJECT_ROOT / "public" / "assets" / "geospatial" / "hk-gee-sentinel2-texture.png"
GEE_MANIFEST_PATH = PROJECT_ROOT / "public" / "assets" / "geospatial" / "manifest.json"
OUTPUT_DIR = PROJECT_ROOT / "public" / "assets" / "drone-twin" / "hkstp"
RENDER_PATH = OUTPUT_DIR / "hk-gee-blender-terrain.png"
MODEL_PATH = OUTPUT_DIR / "hk-gee-terrain-model.glb"
BLENDER_MANIFEST_PATH = OUTPUT_DIR / "blender-manifest.json"
GRID_SIZE = 384
TERRAIN_WIDTH = 7.2
TERRAIN_DEPTH = 5.1
VERTICAL_SCALE = 1.16
TERRAIN_BASE_Z = -0.18
RENDER_RESOLUTION = (3840, 2400)
RENDER_SAMPLES = 192


def require_inputs() -> None:
    missing = [path for path in (HEIGHTMAP_PATH, TEXTURE_PATH, GEE_MANIFEST_PATH) if not path.exists()]
    if missing:
        formatted = ", ".join(str(path) for path in missing)
        raise FileNotFoundError(f"Run npm run assets:gee first. Missing: {formatted}")


def reset_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def sample_height(pixels, width: int, height: int, u: float, v: float) -> float:
    x = min(width - 1, max(0.0, u * (width - 1)))
    y = min(height - 1, max(0.0, v * (height - 1)))
    x0 = int(x)
    y0 = int(y)
    x1 = min(width - 1, x0 + 1)
    y1 = min(height - 1, y0 + 1)
    tx = x - x0
    ty = y - y0

    def red_at(column: int, row: int) -> float:
        return float(pixels[(row * width + column) * 4])

    top = red_at(x0, y0) * (1 - tx) + red_at(x1, y0) * tx
    bottom = red_at(x0, y1) * (1 - tx) + red_at(x1, y1) * tx
    return top * (1 - ty) + bottom * ty


def build_terrain_mesh(name: str, pixels, image_width: int, image_height: int):
    vertices = []
    faces = []
    for row in range(GRID_SIZE):
        v = row / (GRID_SIZE - 1)
        for column in range(GRID_SIZE):
            u = column / (GRID_SIZE - 1)
            height_value = sample_height(pixels, image_width, image_height, u, v)
            x = (u - 0.5) * TERRAIN_WIDTH
            y = (v - 0.5) * TERRAIN_DEPTH
            z = height_value * VERTICAL_SCALE
            vertices.append((x, y, z))

    for row in range(GRID_SIZE - 1):
        for column in range(GRID_SIZE - 1):
            a = row * GRID_SIZE + column
            faces.append((a, a + 1, a + GRID_SIZE + 1, a + GRID_SIZE))

    bottom_index_by_top_index = {}

    def bottom_index_for_top_index(top_index: int) -> int:
        existing_index = bottom_index_by_top_index.get(top_index)
        if existing_index is not None:
            return existing_index
        x, y, _ = vertices[top_index]
        bottom_index = len(vertices)
        vertices.append((x, y, TERRAIN_BASE_Z))
        bottom_index_by_top_index[top_index] = bottom_index
        return bottom_index

    def add_side_wall(boundary_top_indices) -> None:
        for index in range(len(boundary_top_indices) - 1):
            first_top = boundary_top_indices[index]
            second_top = boundary_top_indices[index + 1]
            first_bottom = bottom_index_for_top_index(first_top)
            second_bottom = bottom_index_for_top_index(second_top)
            faces.append((first_top, second_top, second_bottom, first_bottom))

    add_side_wall([column for column in range(GRID_SIZE)])
    add_side_wall([row * GRID_SIZE + GRID_SIZE - 1 for row in range(GRID_SIZE)])
    add_side_wall([(GRID_SIZE - 1) * GRID_SIZE + column for column in range(GRID_SIZE - 1, -1, -1)])
    add_side_wall([row * GRID_SIZE for row in range(GRID_SIZE - 1, -1, -1)])

    bottom_north_west = len(vertices)
    vertices.extend([
        (-TERRAIN_WIDTH / 2, TERRAIN_DEPTH / 2, TERRAIN_BASE_Z),
        (TERRAIN_WIDTH / 2, TERRAIN_DEPTH / 2, TERRAIN_BASE_Z),
        (TERRAIN_WIDTH / 2, -TERRAIN_DEPTH / 2, TERRAIN_BASE_Z),
        (-TERRAIN_WIDTH / 2, -TERRAIN_DEPTH / 2, TERRAIN_BASE_Z),
    ])
    faces.append((bottom_north_west, bottom_north_west + 1, bottom_north_west + 2, bottom_north_west + 3))

    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    uv_layer = mesh.uv_layers.new(name="GEE_UV")
    for polygon in mesh.polygons:
        for loop_index in polygon.loop_indices:
            vertex_index = mesh.loops[loop_index].vertex_index
            column = vertex_index % GRID_SIZE
            row = vertex_index // GRID_SIZE
            uv_layer.data[loop_index].uv = (column / (GRID_SIZE - 1), row / (GRID_SIZE - 1))
    return mesh


def create_satellite_material(texture_image):
    material = bpy.data.materials.new("gee-sentinel-draped-terrain-material")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    nodes.clear()
    output = nodes.new(type="ShaderNodeOutputMaterial")
    bsdf = nodes.get("Principled BSDF")
    if bsdf is None:
        bsdf = nodes.new(type="ShaderNodeBsdfPrincipled")
    image_node = nodes.new(type="ShaderNodeTexImage")
    image_node.image = texture_image
    material.node_tree.links.new(image_node.outputs["Color"], bsdf.inputs["Base Color"])
    if "Emission Color" in bsdf.inputs:
        material.node_tree.links.new(image_node.outputs["Color"], bsdf.inputs["Emission Color"])
    if "Emission Strength" in bsdf.inputs:
        bsdf.inputs["Emission Strength"].default_value = 0.28
    bsdf.inputs["Roughness"].default_value = 0.7
    material.node_tree.links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    return material


def add_frame() -> None:
    material = bpy.data.materials.new("terrain-frame-google-blue")
    material.diffuse_color = (0.258, 0.522, 0.957, 1)
    curve = bpy.data.curves.new("terrain-extent-frame", type="CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 1
    coordinates = [
        (-TERRAIN_WIDTH / 2, -TERRAIN_DEPTH / 2, 0.06),
        (TERRAIN_WIDTH / 2, -TERRAIN_DEPTH / 2, 0.06),
        (TERRAIN_WIDTH / 2, TERRAIN_DEPTH / 2, 0.06),
        (-TERRAIN_WIDTH / 2, TERRAIN_DEPTH / 2, 0.06),
        (-TERRAIN_WIDTH / 2, -TERRAIN_DEPTH / 2, 0.06),
    ]
    polyline = curve.splines.new("POLY")
    polyline.points.add(len(coordinates) - 1)
    for point, coordinate in zip(polyline.points, coordinates, strict=True):
        point.co = (*coordinate, 1)
    curve.bevel_depth = 0.012
    obj = bpy.data.objects.new("study-area-frame", curve)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)


def add_camera_and_lights() -> None:
    camera = bpy.data.cameras.new("command-center-camera")
    camera_object = bpy.data.objects.new("command-center-camera", camera)
    bpy.context.collection.objects.link(camera_object)
    camera_object.location = (4.45, -5.15, 4.35)
    target = Vector((0, 0, 0.66))
    direction = target - camera_object.location
    camera_object.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    camera.type = "ORTHO"
    camera.ortho_scale = 5.85
    bpy.context.scene.camera = camera_object

    sun = bpy.data.lights.new("low-sun", "SUN")
    sun.energy = 2.8
    sun_object = bpy.data.objects.new("low-sun", sun)
    sun_object.rotation_euler = (0.82, 0.18, -0.68)
    bpy.context.collection.objects.link(sun_object)

    area = bpy.data.lights.new("softbox", "AREA")
    area.energy = 260
    area.size = 5
    area_object = bpy.data.objects.new("softbox", area)
    area_object.location = (0, -2.6, 4.5)
    bpy.context.collection.objects.link(area_object)


def render_scene() -> None:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.eevee.taa_render_samples = RENDER_SAMPLES
    scene.render.resolution_x = RENDER_RESOLUTION[0]
    scene.render.resolution_y = RENDER_RESOLUTION[1]
    scene.world = bpy.data.worlds.new("black-world")
    scene.world.color = (0.005, 0.005, 0.006)
    scene.render.filepath = str(RENDER_PATH)
    bpy.ops.render.render(write_still=True)


def main() -> None:
    require_inputs()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    reset_scene()

    height_image = bpy.data.images.load(str(HEIGHTMAP_PATH))
    texture_image = bpy.data.images.load(str(TEXTURE_PATH))
    height_image.colorspace_settings.name = "Non-Color"
    texture_image.colorspace_settings.name = "sRGB"
    pixels = list(height_image.pixels)
    terrain_mesh = build_terrain_mesh("gee-heightmap-terrain", pixels, height_image.size[0], height_image.size[1])

    terrain_object = bpy.data.objects.new("sentinel2-draped-terrain", terrain_mesh)
    bpy.context.collection.objects.link(terrain_object)
    terrain_object.data.materials.append(create_satellite_material(texture_image))

    add_frame()
    add_camera_and_lights()
    render_scene()
    bpy.ops.export_scene.gltf(filepath=str(MODEL_PATH), export_format="GLB")

    gee_manifest = json.loads(GEE_MANIFEST_PATH.read_text(encoding="utf-8"))
    blender_manifest = {
        "generatedAt": datetime.now(UTC).isoformat(),
        "status": "real_blender_render_generated",
        "blenderVersion": bpy.app.version_string,
        "inputs": {
            "heightmap": str(HEIGHTMAP_PATH.relative_to(PROJECT_ROOT)).replace("\\", "/"),
            "texture": str(TEXTURE_PATH.relative_to(PROJECT_ROOT)).replace("\\", "/"),
            "geeManifest": str(GEE_MANIFEST_PATH.relative_to(PROJECT_ROOT)).replace("\\", "/"),
        },
        "outputs": {
            "render": str(RENDER_PATH.relative_to(PROJECT_ROOT)).replace("\\", "/"),
            "model": str(MODEL_PATH.relative_to(PROJECT_ROOT)).replace("\\", "/"),
        },
        "terrain": {
            "meshGridSize": GRID_SIZE,
            "verticalScale": VERTICAL_SCALE,
            "baseZ": TERRAIN_BASE_Z,
            "renderResolution": RENDER_RESOLUTION,
            "renderSamples": RENDER_SAMPLES,
            "sourceBounds": gee_manifest.get("bounds"),
            "mode": "solid terrain mesh with real Sentinel-2 satellite texture draped over DEM terrain",
        },
        "limitations": [
            "No building-height extrusion is generated until official Hong Kong building height data is supplied.",
            "The GLB is a visual asset for the frontend, not an engineering collision mesh.",
        ],
    }
    BLENDER_MANIFEST_PATH.write_text(json.dumps(blender_manifest, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
