import * as THREE from 'three';

/** Small marker factories; callers track returned objects for disposal. */
export function sphereMarker(
  x: number,
  y: number,
  z: number,
  radius: number,
  color: number,
  opacity: number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 10, 8),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }),
  );
  mesh.position.set(x, y, z);
  return mesh;
}

export function ringMarker(x: number, y: number, z: number, radius: number, color: number): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.RingGeometry(Math.max(0.2, radius - 0.5), radius + 0.5, 28),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, y, z);
  return mesh;
}

export function wireBoxMarker(x: number, z: number, w: number, d: number, h: number): THREE.LineSegments {
  const lines = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)),
    new THREE.LineBasicMaterial({ color: 0xff5533, transparent: true, opacity: 0.7 }),
  );
  lines.position.set(x, h / 2, z);
  return lines;
}

export function lineBetween(ax: number, ay: number, az: number, bx: number, by: number, bz: number, color: number, opacity = 1): THREE.Line {
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(ax, ay, az), new THREE.Vector3(bx, by, bz)]),
    new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }),
  );
  return line;
}

/** Remove every child and dispose per-marker resources. */
export function clearGroup(group: THREE.Group): void {
  while (group.children.length > 0) {
    const child = group.children.pop()!;
    group.remove(child);
    child.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else if (mat) mat.dispose();
    });
  }
}
