/**
 * Live 2D portrait mesh & pendulum deformation:
 * turns a static PNG/WebP portrait into a responsive breathing, gaze-tracking,
 * window-inertia swaying, and mouth-articulating figure via a fine UV triangle grid.
 */

export interface PortraitPendulumState {
  swayX: number;
  swayY: number;
  velX: number;
  velY: number;
}

export interface PortraitDeformParams {
  breathPhase: number;
  gazeX: number;
  gazeY: number;
  mouthOpen: number;
  swayX: number;
  swayY: number;
  sitting?: boolean;
}

export function createPortraitPendulum(): PortraitPendulumState {
  return { swayX: 0, swayY: 0, velX: 0, velY: 0 };
}

const PENDULUM_STIFFNESS = 36;
const PENDULUM_DAMPING = 6.2;
const MAX_SWAY = 0.075;

/**
 * Advances the spring-damper pendulum state with physical window movement `(moveDx, moveDy)`
 * expressed in portrait heights (`addWindowMove` normalized units).
 */
export function stepPortraitPendulum(
  state: PortraitPendulumState,
  moveDx: number,
  moveDy: number,
  dtRaw: number,
): void {
  const dt = Math.min(0.05, Math.max(0, dtRaw));
  if (dt <= 0) return;

  // Inertia pushes hair & clothing opposite to sudden window motion.
  state.velX -= Math.max(-0.5, Math.min(0.5, moveDx)) * 18;
  state.velY -= Math.max(-0.5, Math.min(0.5, moveDy)) * 12;

  const accX = -PENDULUM_STIFFNESS * state.swayX - PENDULUM_DAMPING * state.velX;
  const accY = -PENDULUM_STIFFNESS * state.swayY - PENDULUM_DAMPING * state.velY;

  state.velX += accX * dt;
  state.velY += accY * dt;
  state.swayX = Math.max(-MAX_SWAY, Math.min(MAX_SWAY, state.swayX + state.velX * dt));
  state.swayY = Math.max(-MAX_SWAY, Math.min(MAX_SWAY, state.swayY + state.velY * dt));
}

function gaussian2(u: number, v: number, cu: number, cv: number, su: number, sv: number): number {
  const du = (u - cu) / su;
  const dv = (v - cv) / sv;
  return Math.exp(-(du * du + dv * dv));
}

/**
 * Computes deformed normalized UV coordinates `{ x, y }` in `[0, 1]` for grid point `(u, v)`.
 * Borders stay pinned so circular/clipped portrait bounds never tear or expose empty seams.
 */
export function deformPortraitPoint(
  u: number,
  v: number,
  params: PortraitDeformParams,
): { x: number; y: number } {
  // Smooth border fade keeps outer edge locked.
  const borderFade = Math.sin(Math.PI * Math.max(0, Math.min(1, u))) * Math.sin(Math.PI * Math.max(0, Math.min(1, v)));
  if (borderFade <= 1e-4) return { x: u, y: v };

  const breath = Math.sin(params.breathPhase);
  const chestMask = gaussian2(u, v, 0.5, 0.72, 0.28, 0.2);
  const headMask = gaussian2(u, v, 0.5, 0.34, 0.24, 0.2);
  const hairOuterMask =
    (Math.min(1, Math.abs(u - 0.5) * 1.9 + 0.15) * (0.25 + 0.75 * v)) * borderFade;
  const jawMask = gaussian2(u, v, 0.5, 0.45, 0.085, 0.055);
  const lowerBodyMask = Math.max(0, (v - 0.55) / 0.45) * borderFade;

  let dx = 0;
  let dy = 0;

  // Breathing: gentle chest lift and ribcage expansion.
  dx += (u - 0.5) * breath * chestMask * 0.032 * borderFade;
  dy -= breath * chestMask * 0.014 * borderFade;

  // Subtle gaze parallax in upper torso / head region.
  const gazeX = Math.max(-1, Math.min(1, params.gazeX));
  const gazeY = Math.max(-1, Math.min(1, params.gazeY));
  dx += gazeX * headMask * 0.022 * borderFade;
  dy -= gazeY * headMask * 0.016 * borderFade;

  // Hair / clothing spring pendulum sway from window dragging, walking and jumping.
  dx += params.swayX * hairOuterMask * 0.9;
  dy += params.swayY * hairOuterMask * 0.55;

  // Mouth/jaw deformation when speaking without external sprite mouth overlays.
  const mouth = Math.max(0, Math.min(1, params.mouthOpen));
  if (mouth > 0.005) {
    dy += jawMask * mouth * 0.024 * borderFade;
    dx += (u - 0.5) * jawMask * mouth * 0.01 * borderFade;
  }

  // Calm sitting posture lowers center of gravity slightly.
  if (params.sitting) {
    dy += lowerBodyMask * 0.012;
  }

  return {
    x: Math.max(0, Math.min(1, u + dx)),
    y: Math.max(0, Math.min(1, v + dy)),
  };
}

function drawTexturedTriangle(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  sx0: number,
  sy0: number,
  sx1: number,
  sy1: number,
  sx2: number,
  sy2: number,
  dx0: number,
  dy0: number,
  dx1: number,
  dy1: number,
  dx2: number,
  dy2: number,
): void {
  const denom = (sx1 - sx0) * (sy2 - sy0) - (sx2 - sx0) * (sy1 - sy0);
  if (Math.abs(denom) < 1e-6) return;

  // Expand clip vertices slightly from centroid to suppress subpixel canvas seams.
  const cx = (dx0 + dx1 + dx2) / 3;
  const cy = (dy0 + dy1 + dy2) / 3;
  const expand = (px: number, py: number) => {
    const vx = px - cx;
    const vy = py - cy;
    const len = Math.hypot(vx, vy) || 1;
    return [px + (vx / len) * 0.4, py + (vy / len) * 0.4] as const;
  };
  const [ex0, ey0] = expand(dx0, dy0);
  const [ex1, ey1] = expand(dx1, dy1);
  const [ex2, ey2] = expand(dx2, dy2);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(ex0, ey0);
  ctx.lineTo(ex1, ey1);
  ctx.lineTo(ex2, ey2);
  ctx.closePath();
  ctx.clip();

  const a = ((dx1 - dx0) * (sy2 - sy0) - (dx2 - dx0) * (sy1 - sy0)) / denom;
  const b = ((dy1 - dy0) * (sy2 - sy0) - (dy2 - dy0) * (sy1 - sy0)) / denom;
  const c = ((sx1 - sx0) * (dx2 - dx0) - (sx2 - sx0) * (dx1 - dx0)) / denom;
  const d = ((sx1 - sx0) * (dy2 - dy0) - (sx2 - sx0) * (dy1 - dy0)) / denom;
  const e = dx0 - a * sx0 - c * sy0;
  const f = dy0 - b * sx0 - d * sy0;

  ctx.transform(a, b, c, d, e, f);
  ctx.drawImage(image, 0, 0);
  ctx.restore();
}

/**
 * Draws `image` across a triangulated `(cols × rows)` deformed mesh into `ctx`.
 */
export function drawDeformedPortrait(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  srcWidth: number,
  srcHeight: number,
  dstWidth: number,
  dstHeight: number,
  cols: number,
  rows: number,
  params: PortraitDeformParams,
): void {
  if (srcWidth <= 0 || srcHeight <= 0 || dstWidth <= 0 || dstHeight <= 0) return;

  // Match CSS `object-cover`: crop source symmetrically to destination aspect ratio.
  const srcAspect = srcWidth / srcHeight;
  const dstAspect = dstWidth / dstHeight;
  let cropX = 0;
  let cropY = 0;
  let cropW = srcWidth;
  let cropH = srcHeight;
  if (srcAspect > dstAspect) {
    cropW = srcHeight * dstAspect;
    cropX = (srcWidth - cropW) / 2;
  } else if (srcAspect < dstAspect) {
    cropH = srcWidth / dstAspect;
    cropY = (srcHeight - cropH) / 2;
  }

  const gridU = cols + 1;
  const gridV = rows + 1;
  const sx = new Float32Array(gridU * gridV);
  const sy = new Float32Array(gridU * gridV);
  const dx = new Float32Array(gridU * gridV);
  const dy = new Float32Array(gridU * gridV);

  for (let iy = 0; iy < gridV; iy += 1) {
    const v = iy / rows;
    for (let ix = 0; ix < gridU; ix += 1) {
      const u = ix / cols;
      const idx = iy * gridU + ix;
      sx[idx] = cropX + u * cropW;
      sy[idx] = cropY + v * cropH;
      const deformed = deformPortraitPoint(u, v, params);
      dx[idx] = deformed.x * dstWidth;
      dy[idx] = deformed.y * dstHeight;
    }
  }

  ctx.clearRect(0, 0, dstWidth, dstHeight);
  for (let iy = 0; iy < rows; iy += 1) {
    for (let ix = 0; ix < cols; ix += 1) {
      const tl = iy * gridU + ix;
      const tr = tl + 1;
      const bl = tl + gridU;
      const br = bl + 1;
      drawTexturedTriangle(
        ctx,
        image,
        sx[tl]!,
        sy[tl]!,
        sx[tr]!,
        sy[tr]!,
        sx[bl]!,
        sy[bl]!,
        dx[tl]!,
        dy[tl]!,
        dx[tr]!,
        dy[tr]!,
        dx[bl]!,
        dy[bl]!,
      );
      drawTexturedTriangle(
        ctx,
        image,
        sx[tr]!,
        sy[tr]!,
        sx[br]!,
        sy[br]!,
        sx[bl]!,
        sy[bl]!,
        dx[tr]!,
        dy[tr]!,
        dx[br]!,
        dy[br]!,
        dx[bl]!,
        dy[bl]!,
      );
    }
  }
}
