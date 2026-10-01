// CPU replica of the GLSL value noise / terrain in shaders/topo.ts, with float32 rounding, so that
// scene code can ask "what height is the planet here?" and get the GPU's answer (to the last few ulps).
const f = Math.fround;
const fract = (x: number) => f(x - Math.floor(x));

function hash13(x: number, y: number, z: number) {
  let px = fract(f(x * f(0.1031))), py = fract(f(y * f(0.1031))), pz = fract(f(z * f(0.1031)));
  const d = f(f(px * f(pz + f(31.32))) + f(f(py * f(py + f(31.32))) + f(pz * f(px + f(31.32)))));
  px = f(px + d); py = f(py + d); pz = f(pz + d);
  return fract(f(f(px + py) * pz));
}

export function vnoise3(x: number, y: number, z: number) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = f(x - ix), fy = f(y - iy), fz = f(z - iz);
  const ux = f(fx * fx * (3 - 2 * fx)), uy = f(fy * fy * (3 - 2 * fy)), uz = f(fz * fz * (3 - 2 * fz));
  const a = hash13(ix, iy, iz), b = hash13(ix + 1, iy, iz), c = hash13(ix, iy + 1, iz), d = hash13(ix + 1, iy + 1, iz);
  const e = hash13(ix, iy, iz + 1), g = hash13(ix + 1, iy, iz + 1), h = hash13(ix, iy + 1, iz + 1), k = hash13(ix + 1, iy + 1, iz + 1);
  const m = (p: number, q: number, t: number) => f(p + f((q - p) * t));
  return m(m(m(a, b, ux), m(c, d, ux), uy), m(m(e, g, ux), m(h, k, ux), uy), uz);
}

/** Must match `terrain()` in shaders/topo.ts exactly. */
export function terrain(x: number, y: number, z: number, oct: number) {
  let s = 0, a = 0.5, fr = 1.7;
  for (let i = 0; i < 13; i++) {
    const w = Math.min(1, Math.max(0, oct - i));
    if (w <= 0) break;
    s += a * w * (vnoise3(f(x * fr + i * 7.31), f(y * fr + i * 3.17), f(z * fr + i * 5.13)) - 0.5);
    fr = f(fr * 2.03);
    a *= 0.5;
  }
  return 0.5 + s;
}
