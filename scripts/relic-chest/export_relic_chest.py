"""Build the articulated Recoil Crew relic chest from the CC0 source blend.

Run with Blender, for example:
  blender --background --python scripts/relic-chest/export_relic_chest.py

The source file is opened read-only in memory. Only the derived GLB is written.
"""

from pathlib import Path
import json
import os

import bmesh
import bpy
from mathutils import Matrix, Vector


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "docs/relics/source/ultimate-rpg-items/Chest_Closed.blend"
OUTPUT = ROOT / "public/assets/models/items/relic-chest/relic-chest.glb"
HINGE = Vector((0.0, 0.4090001629865654, 0.4355505736912692))
OPEN_ANGLE_DEGREES = -55.791075
SOURCE_MATERIALS = {
    "DarkMetal": ((0.06305812299251556, 0.05166768655180931, 0.09462308138608932, 1.0), 0.0, 0.5),
    "Metal": ((0.07698974758386612, 0.06832612305879593, 0.11493299156427383, 1.0), 0.0, 0.5),
    "Wood": ((0.20189261436462402, 0.10397916287183762, 0.07928955554962158, 1.0), 0.0, 0.5),
}


def connected_components(mesh: bpy.types.Mesh) -> list[set[int]]:
    neighbors = {vertex.index: set() for vertex in mesh.vertices}
    for edge in mesh.edges:
        a, b = edge.vertices
        neighbors[a].add(b)
        neighbors[b].add(a)

    components: list[set[int]] = []
    unvisited = set(neighbors)
    while unvisited:
        stack = [min(unvisited)]
        component: set[int] = set()
        while stack:
            index = stack.pop()
            if index in component:
                continue
            component.add(index)
            unvisited.discard(index)
            stack.extend(neighbors[index] - component)
        components.append(component)
    return components


def partition_mesh(source: bpy.types.Mesh, name: str, keep: set[int]) -> bpy.types.Object:
    data = source.copy()
    data.name = f"{name}Mesh"
    result = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(result)
    editable = bmesh.new()
    editable.from_mesh(data)
    editable.verts.ensure_lookup_table()
    bmesh.ops.delete(editable, geom=[vertex for vertex in editable.verts if vertex.index not in keep], context="VERTS")
    editable.to_mesh(data)
    editable.free()
    data.update()
    return result


def make_exportable_materials() -> None:
    # The legacy blend contains two Material Output nodes; its diffuse output
    # is active, which makes Blender's glTF exporter omit the authored PBR
    # factors. Rebuild only the derived node graphs from the exact source
    # Principled values so the GLB contains those values explicitly.
    for name, (color, metallic, roughness) in SOURCE_MATERIALS.items():
        material = bpy.data.materials[name]
        material.use_nodes = True
        material.diffuse_color = color
        nodes = material.node_tree.nodes
        nodes.clear()
        output = nodes.new("ShaderNodeOutputMaterial")
        output.name = "Material Output"
        output.is_active_output = True
        shader = nodes.new("ShaderNodeBsdfPrincipled")
        shader.name = "Principled BSDF"
        shader.inputs["Base Color"].default_value = color
        shader.inputs["Metallic"].default_value = metallic
        shader.inputs["Roughness"].default_value = roughness
        shader.inputs["Emission Color"].default_value = (0.0, 0.0, 0.0, 1.0)
        shader.inputs["Emission Strength"].default_value = 0.0
        material.node_tree.links.new(shader.outputs["BSDF"], output.inputs["Surface"])


def export() -> None:
    source_object = bpy.data.objects.get("Chest_Closed") if Path(bpy.data.filepath).resolve() == SOURCE.resolve() else None
    if source_object is None:
        for existing in list(bpy.data.objects):
            bpy.data.objects.remove(existing, do_unlink=True)
        with bpy.data.libraries.load(str(SOURCE), link=False) as (available, requested):
            if "Chest_Closed" not in available.objects:
                raise RuntimeError("Chest_Closed source mesh was not found in the source blend")
            requested.objects = ["Chest_Closed"]
        source_object = requested.objects[0]
        if source_object is not None:
            bpy.context.collection.objects.link(source_object)
    if source_object is None or source_object.type != "MESH":
        raise RuntimeError("Chest_Closed source mesh was not found")

    components = connected_components(source_object.data)
    if len(components) != 37:
        raise RuntimeError(f"Expected 37 disconnected source islands, found {len(components)}")
    lid_indices = set().union(*components[:23])
    base_indices = set().union(*components[23:])
    if lid_indices & base_indices or len(lid_indices | base_indices) != len(source_object.data.vertices):
        raise RuntimeError("Closed-source component partition is invalid")

    base = partition_mesh(source_object.data, "Base", base_indices)
    lid = partition_mesh(source_object.data, "Lid", lid_indices)
    root = bpy.data.objects.new("RelicChest", None)
    bpy.context.collection.objects.link(root)
    root["source_pack"] = "Ultimate RPG Items Pack - Aug 2019"
    root["source_mesh"] = "Chest_Closed"
    root["source_license"] = "CC0 1.0"
    root["source_component_count"] = 37
    root["lid_component_count"] = 23
    root["base_component_count"] = 14

    base.parent = root
    lid.data.transform(Matrix.Translation(-HINGE))
    lid.location = HINGE
    lid.parent = root
    lid["hinge_axis"] = "local +X / rotation opens toward -X"
    lid["open_angle_degrees"] = OPEN_ANGLE_DEGREES
    lid["reference_pose"] = "Chest_Open"

    glow = bpy.data.objects.new("GlowOrigin", None)
    bpy.context.collection.objects.link(glow)
    glow.parent = base
    glow.location = (0.0, 0.015, 0.405)
    glow["purpose"] = "Local origin for relic chest presentation VFX"

    reward = bpy.data.objects.new("RewardAnchor", None)
    bpy.context.collection.objects.link(reward)
    reward.parent = base
    reward.location = (0.0, 0.015, 0.385)
    reward["purpose"] = "Future relic spawn and rise origin"

    bpy.data.objects.remove(source_object, do_unlink=True)
    make_exportable_materials()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    objects = [root, base, lid, glow, reward]
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    override = {
        "scene": bpy.context.scene,
        "view_layer": bpy.context.view_layer,
        "active_object": root,
        "object": root,
        "selected_objects": objects,
        "selected_editable_objects": objects,
    }
    with bpy.context.temp_override(**override):
        bpy.ops.export_scene.gltf(
            filepath=str(OUTPUT),
            export_format="GLB",
            use_selection=True,
            export_yup=True,
            export_apply=False,
            export_animations=False,
            export_cameras=False,
            export_lights=False,
            export_extras=True,
        )

    print(json.dumps({
        "output": str(OUTPUT),
        "bytes": os.path.getsize(OUTPUT),
        "hinge": list(HINGE),
        "open_angle_degrees": OPEN_ANGLE_DEGREES,
        "lid_components": 23,
        "base_components": 14,
    }, indent=2))


if __name__ == "__main__":
    export()
