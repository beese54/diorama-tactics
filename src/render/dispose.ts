import * as THREE from 'three';

/**
 * Frees the GPU memory behind every mesh under `root`: geometries, materials and their textures,
 * including any a material swaps between (animation frames), listed in its `userData.textures` (arrays may hold arrays).
 */
export function disposeTree(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      for (const value of [...Object.values(material), ...(material.userData.textures ?? []).flat()]) if (value instanceof THREE.Texture) value.dispose();
      material.dispose();
    }
  });
}
