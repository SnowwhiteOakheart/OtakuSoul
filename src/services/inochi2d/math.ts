/* 4×4 matrices (column major, like WebGL) for the Inochi2D runtime. */

export type Mat4 = Float32Array;

export const identity = (): Mat4 => {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
};

/** out = a · b (out may be a or b). */
export function multiply(out: Mat4, a: Mat4, b: Mat4): Mat4 {
  const r = new Float32Array(16);
  for (let c = 0; c < 4; c += 1) {
    for (let row = 0; row < 4; row += 1) {
      r[c * 4 + row] =
        a[row]! * b[c * 4]! + a[4 + row]! * b[c * 4 + 1]! + a[8 + row]! * b[c * 4 + 2]! + a[12 + row]! * b[c * 4 + 3]!;
    }
  }
  out.set(r);
  return out;
}

/**
 * Translation · rotation (Euler XYZ, as glam's `Quat::from_euler(EulerRot::XYZ, …)`) · scale,
 * the matrix of an Inochi2D node transform.
 */
export function fromTransform(
  out: Mat4,
  tx: number, ty: number, tz: number,
  rx: number, ry: number, rz: number,
  sx: number, sy: number,
): Mat4 {
  const [cx, sxr] = [Math.cos(rx), Math.sin(rx)];
  const [cy, syr] = [Math.cos(ry), Math.sin(ry)];
  const [cz, szr] = [Math.cos(rz), Math.sin(rz)];
  // R = Rx · Ry · Rz
  const r00 = cy * cz;
  const r01 = -cy * szr;
  const r02 = syr;
  const r10 = sxr * syr * cz + cx * szr;
  const r11 = -sxr * syr * szr + cx * cz;
  const r12 = -sxr * cy;
  const r20 = -cx * syr * cz + sxr * szr;
  const r21 = cx * syr * szr + sxr * cz;
  const r22 = cx * cy;
  out[0] = r00 * sx; out[1] = r10 * sx; out[2] = r20 * sx; out[3] = 0;
  out[4] = r01 * sy; out[5] = r11 * sy; out[6] = r21 * sy; out[7] = 0;
  out[8] = r02; out[9] = r12; out[10] = r22; out[11] = 0;
  out[12] = tx; out[13] = ty; out[14] = tz; out[15] = 1;
  return out;
}

/** Inverse of a general 4×4 matrix (identity when it cannot be inverted). */
export function invert(out: Mat4, m: Mat4): Mat4 {
  const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m as unknown as number[];
  const b00 = a00! * a11! - a01! * a10!;
  const b01 = a00! * a12! - a02! * a10!;
  const b02 = a00! * a13! - a03! * a10!;
  const b03 = a01! * a12! - a02! * a11!;
  const b04 = a01! * a13! - a03! * a11!;
  const b05 = a02! * a13! - a03! * a12!;
  const b06 = a20! * a31! - a21! * a30!;
  const b07 = a20! * a32! - a22! * a30!;
  const b08 = a20! * a33! - a23! * a30!;
  const b09 = a21! * a32! - a22! * a31!;
  const b10 = a21! * a33! - a23! * a31!;
  const b11 = a22! * a33! - a23! * a32!;
  const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det || !Number.isFinite(det)) {
    out.set(identity());
    return out;
  }
  const d = 1 / det;
  const r = [
    (a11! * b11 - a12! * b10 + a13! * b09) * d,
    (a02! * b10 - a01! * b11 - a03! * b09) * d,
    (a31! * b05 - a32! * b04 + a33! * b03) * d,
    (a22! * b04 - a21! * b05 - a23! * b03) * d,
    (a12! * b08 - a10! * b11 - a13! * b07) * d,
    (a00! * b11 - a02! * b08 + a03! * b07) * d,
    (a32! * b02 - a30! * b05 - a33! * b01) * d,
    (a20! * b05 - a22! * b02 + a23! * b01) * d,
    (a10! * b10 - a11! * b08 + a13! * b06) * d,
    (a01! * b08 - a00! * b10 - a03! * b06) * d,
    (a30! * b04 - a31! * b02 + a33! * b00) * d,
    (a21! * b02 - a20! * b04 - a23! * b00) * d,
    (a11! * b07 - a10! * b09 - a12! * b06) * d,
    (a00! * b09 - a01! * b07 + a02! * b06) * d,
    (a31! * b01 - a30! * b03 - a32! * b00) * d,
    (a20! * b03 - a21! * b01 + a22! * b00) * d,
  ];
  out.set(r);
  return out;
}

/** The point (x, y, 0, 1) through `m`, only x and y. */
export const transformPoint = (m: Mat4, x: number, y: number): [number, number] => [
  m[0]! * x + m[4]! * y + m[12]!,
  m[1]! * x + m[5]! * y + m[13]!,
];

/** Orthographic projection: x 0…width left to right, y 0…height top to bottom. */
export function ortho(width: number, height: number): Mat4 {
  const m = identity();
  m[0] = 2 / width;
  m[5] = -2 / height;
  // Node transforms carry a z offset; drawing order comes from zsort, so depth is flattened
  // (otherwise parts beyond ±1 would be clipped away).
  m[10] = 0;
  m[12] = -1;
  m[13] = 1;
  return m;
}
