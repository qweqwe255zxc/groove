import * as THREE from "three";

// THREE.PointsMaterial with no `map` draws every point as a hard-edged
// square — at typical point sizes that reads as a grainy stipple rather
// than a smooth cloud. A radial-falloff sprite gives each point a soft
// round edge instead, so overlapping neighbors blend into a continuous
// surface. Shared by OrbScene and TerrainScene (both render as point
// clouds), built once and reused for the life of the module since it never
// depends on props/theme — just a fixed gradient.
let dotTexture: THREE.Texture | null = null;
export function getDotTexture(): THREE.Texture {
  if (dotTexture) return dotTexture;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2
  );
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.5, "rgba(255,255,255,0.7)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  dotTexture = new THREE.CanvasTexture(canvas);
  return dotTexture;
}
