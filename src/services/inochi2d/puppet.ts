/*
 * Inochi2D puppet: node tree, parameters with their bindings, mesh deformation, mesh groups and
 * the simple pendulum physics. Port of Inox2D's `puppet`, `params`, `physics` and `render`
 * modules (BSD-2-Clause, © Speykious and the Inochi2D Project, see LICENSE-inox2d.txt), plus mesh
 * groups as the reference implementation does them (Inox2D does not have those yet).
 */
import { cleanText, type InpFile } from './inp';
import { fromTransform, identity, invert, multiply, transformPoint, type Mat4 } from './math';

type Json = Record<string, unknown>;
export type Vec2 = [number, number];

export type BlendMode =
  | 'Normal' | 'Multiply' | 'ColorDodge' | 'LinearDodge' | 'Screen' | 'ClipToLower' | 'SliceFromLower';
const BLEND_MODES: readonly BlendMode[] = ['Normal', 'Multiply', 'ColorDodge', 'LinearDodge', 'Screen', 'ClipToLower', 'SliceFromLower'];

export interface Mask {
  source: number;
  /** `mask`: draw only where the source is; `dodge`: only where it is not. */
  mode: 'mask' | 'dodge';
}

export interface Drawable {
  blend: BlendMode;
  tint: [number, number, number];
  screenTint: [number, number, number];
  opacity: number;
  masks: Mask[];
  maskThreshold: number;
}

export interface Part extends Drawable {
  /** Vertex positions in the node's space (x, y pairs). */
  verts: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  /** Texture indices: albedo, emissive, bump map. */
  textures: [number, number, number];
  /** Offsets of every vertex for this frame (from parameters and mesh groups). */
  deform: Float32Array;
}

export interface Composite extends Drawable {
  /** Parts drawn into the composite, back to front for this frame. */
  parts: PuppetNode[];
}

interface MeshGroup {
  verts: Float32Array;
  indices: Uint32Array;
  deform: Float32Array;
  /** Children follow the deformed mesh with their own deformation included. */
  dynamic: boolean;
  /** Parts below that follow the mesh. */
  targets: PuppetNode[];
  /** Per triangle (`TRI` floats): first corner, both edges, 1/determinant, bounding box. */
  triangles: Float32Array;
}

type MapMode = 'AngleLength' | 'LengthAngle' | 'XY' | 'YX';

interface Physics {
  param: number;
  spring: boolean;
  mapMode: MapMode;
  gravity: number;
  length: number;
  frequency: number;
  angleDamping: number;
  lengthDamping: number;
  outputScale: Vec2;
  localOnly: boolean;
  /** Simulation state: bob position and velocity (spring), angle and angular speed (rigid). */
  bob: Vec2 | null;
  velocity: Vec2;
  angle: number;
  omega: number;
}

export interface TransformOffset {
  t: [number, number, number];
  r: [number, number, number];
  s: [number, number];
}

export interface PuppetNode {
  uuid: number;
  name: string;
  type: string;
  enabled: boolean;
  zsort: number;
  lockToRoot: boolean;
  base: TransformOffset;
  parent: PuppetNode | null;
  children: PuppetNode[];
  /** This frame: transform after parameters, its matrix in puppet space and the total zsort. */
  rel: TransformOffset;
  abs: Mat4;
  /** Own zsort after parameters, and the total with all above it (higher is further back). */
  z: number;
  zAbs: number;
  /** Product of opacity bindings this frame. */
  opacityFactor: number;
  /** Whether the node and all above it are enabled. */
  visible: boolean;
  /** A `Mask` node: a mesh without texture that only cuts out other parts, never drawn itself. */
  maskOnly?: boolean;
  part?: Part;
  composite?: Composite;
  meshGroup?: MeshGroup;
  physics?: Physics;
}

type BindingTarget = 'tx' | 'ty' | 'tz' | 'sx' | 'sy' | 'rx' | 'ry' | 'rz' | 'zsort' | 'opacity' | 'deform';
const TARGETS: Record<string, BindingTarget> = {
  'transform.t.x': 'tx', 'transform.t.y': 'ty', 'transform.t.z': 'tz',
  'transform.s.x': 'sx', 'transform.s.y': 'sy',
  'transform.r.x': 'rx', 'transform.r.y': 'ry', 'transform.r.z': 'rz',
  zSort: 'zsort', opacity: 'opacity', deform: 'deform',
};

interface Binding {
  node: PuppetNode;
  target: BindingTarget;
  nearest: boolean;
  /** Smooth curve through the neighbouring keys (Catmull-Rom) instead of straight lines. */
  cubic: boolean;
  /** values[x][y]: a number, or the vertex offsets (deform). */
  values: (number | Float32Array)[][];
}

export interface Param {
  uuid: number;
  name: string;
  isVec2: boolean;
  min: Vec2;
  max: Vec2;
  defaults: Vec2;
  axisX: number[];
  axisY: number[];
  bindings: Binding[];
  /** Set by a physics node: its value comes from the simulation. */
  driven: boolean;
}

export interface PuppetMeta {
  name: string | null;
  artist: string | null;
  rigger: string | null;
  copyright: string | null;
  licenseUrl: string | null;
  contact: string | null;
  thumbnailId: number | null;
}

const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const vec2 = (v: unknown, fallback: Vec2 = [0, 0]): Vec2 =>
  Array.isArray(v) ? [num(v[0], fallback[0]), num(v[1], fallback[1])] : [...fallback];
const vec3 = (v: unknown, fallback: [number, number, number]): [number, number, number] =>
  Array.isArray(v) ? [num(v[0], fallback[0]), num(v[1], fallback[1]), num(v[2], fallback[2])] : [...fallback];
const text = (v: unknown) => (typeof v === 'string' && cleanText(v) ? cleanText(v) : null);
const floats = (v: unknown) => Float32Array.from(Array.isArray(v) ? v.map((x) => num(x)) : []);

const copyTransform = (t: TransformOffset): TransformOffset => ({ t: [...t.t], r: [...t.r], s: [...t.s] });

function parseTransform(v: unknown): TransformOffset {
  const o = (v ?? {}) as Json;
  return { t: vec3(o.trans, [0, 0, 0]), r: vec3(o.rot, [0, 0, 0]), s: vec2(o.scale, [1, 1]) };
}

function parseDrawable(o: Json): Drawable {
  const blend = BLEND_MODES.includes(o.blend_mode as BlendMode) ? (o.blend_mode as BlendMode) : 'Normal';
  const masks = Array.isArray(o.masks)
    ? (o.masks as Json[]).map((m) => ({ source: num(m.source), mode: m.mode === 'DodgeMask' ? 'dodge' : 'mask' }) as Mask)
    : [];
  return {
    blend,
    tint: vec3(o.tint, [1, 1, 1]),
    screenTint: vec3(o.screenTint, [0, 0, 0]),
    opacity: num(o.opacity, 1),
    masks,
    maskThreshold: num(o.mask_threshold, 0.5),
  };
}

const NO_TEXTURE = 0xffffffff;

function parseMesh(o: Json) {
  const mesh = (o.mesh ?? {}) as Json;
  const verts = floats(mesh.verts);
  const uvs = floats(mesh.uvs);
  const indices = Uint32Array.from(Array.isArray(mesh.indices) ? (mesh.indices as unknown[]).map((x) => num(x)) : []);
  return { verts, uvs, indices };
}

/** Interpolates along one axis: `t` inside [a, b] maps to [va, vb]. */
const lerp = (t: number, a: number, b: number, va: number, vb: number, nearest: boolean) => {
  if (b === a) return va;
  if (nearest) return b - t < t - a ? vb : va;
  return va + ((t - a) * (vb - va)) / (b - a);
};

/** Catmull-Rom between p1 and p2 at t (0…1). */
const catmull = (p0: number, p1: number, p2: number, p3: number, t: number) => {
  const t2 = t * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t2 * t);
};

/** The two neighbouring axis points around `v` (indices into `axis`, sorted ascending). */
export function axisRange(axis: number[], v: number): [number, number] {
  const last = axis.length - 1;
  if (last <= 0) return [0, 0];
  let i = 0;
  while (i <= last && axis[i]! <= v) i += 1;
  const lo = Math.min(Math.max(i - 1, 0), last - 1);
  return [lo, lo + 1];
}

export class Puppet {
  readonly meta: PuppetMeta;
  readonly root: PuppetNode;
  /** All nodes, parents before children. */
  readonly nodes: PuppetNode[] = [];
  readonly params = new Map<string, Param>();
  private readonly byUuid = new Map<number, PuppetNode>();
  private readonly paramByUuid = new Map<number, Param>();
  private readonly values = new Map<Param, Vec2>();
  private readonly pixelsPerMeter: number;
  private readonly worldGravity: number;
  /** Parts and composites outside composites, back to front for this frame. */
  drawList: PuppetNode[] = [];

  constructor(file: InpFile) {
    const json = file.puppet as Json;
    const meta = (json.meta ?? {}) as Json;
    const thumb = num(meta.thumbnailId, NO_TEXTURE);
    this.meta = {
      name: text(meta.name),
      artist: text(meta.artist),
      rigger: text(meta.rigger),
      copyright: text(meta.copyright),
      licenseUrl: text(meta.licenseURL),
      contact: text(meta.contact),
      thumbnailId: thumb === NO_TEXTURE ? null : thumb,
    };
    const physics = (json.physics ?? {}) as Json;
    this.pixelsPerMeter = num(physics.pixelsPerMeter, 1000);
    this.worldGravity = num(physics.gravity, 9.8);

    this.root = this.loadNode(json.nodes as Json, null);
    for (const p of Array.isArray(json.param) ? (json.param as Json[]) : []) {
      const param = this.loadParam(p);
      if (param) {
        this.params.set(param.name, param);
        this.paramByUuid.set(param.uuid, param);
        this.values.set(param, [...param.defaults]);
      }
    }
    for (const node of this.nodes) {
      if (node.physics) {
        const param = this.paramByUuid.get(node.physics.param);
        if (param) param.driven = true;
      }
      if (node.composite) node.composite.parts = this.compositeParts(node);
      if (node.meshGroup) node.meshGroup.targets = this.meshGroupTargets(node);
    }
    this.update(0);
  }

  private loadNode(o: Json, parent: PuppetNode | null): PuppetNode {
    const base = parseTransform(o.transform);
    const node: PuppetNode = {
      uuid: num(o.uuid),
      name: text(o.name) ?? '',
      type: typeof o.type === 'string' ? o.type : 'Node',
      enabled: o.enabled !== false,
      zsort: num(o.zsort),
      lockToRoot: o.lockToRoot === true,
      base,
      parent,
      children: [],
      rel: copyTransform(base),
      abs: identity(),
      z: 0,
      zAbs: 0,
      opacityFactor: 1,
      visible: true,
    };
    if (node.type === 'Part' || node.type === 'Mask') {
      const { verts, uvs, indices } = parseMesh(o);
      const tex = Array.isArray(o.textures) ? (o.textures as unknown[]).map((x) => num(x, NO_TEXTURE)) : [];
      const pick = (i: number) => {
        const v = tex[i] ?? NO_TEXTURE;
        return v === NO_TEXTURE ? -1 : v;
      };
      node.part = {
        ...parseDrawable(o),
        verts,
        uvs,
        indices,
        textures: [pick(0), pick(1), pick(2)],
        deform: new Float32Array(verts.length),
      };
      if (node.type === 'Mask') {
        node.maskOnly = true;
        node.part.textures = [-1, -1, -1];
      }
    } else if (node.type === 'Composite') {
      node.composite = { ...parseDrawable(o), parts: [] };
    } else if (node.type === 'MeshGroup') {
      const { verts, indices } = parseMesh(o);
      node.meshGroup = {
        verts,
        indices,
        deform: new Float32Array(verts.length),
        dynamic: o.dynamic_deformation === true,
        targets: [],
        triangles: prepareTriangles(verts, indices),
      };
    } else if (node.type === 'SimplePhysics') {
      node.physics = {
        param: num(o.param),
        spring: o.model_type === 'SpringPendulum',
        mapMode: (['AngleLength', 'LengthAngle', 'XY', 'YX'] as MapMode[]).includes(o.map_mode as MapMode) ? (o.map_mode as MapMode) : 'AngleLength',
        gravity: num(o.gravity, 1),
        length: Math.max(num(o.length, 1), 1e-3),
        frequency: num(o.frequency, 1),
        angleDamping: num(o.angle_damping, 0.5),
        lengthDamping: num(o.length_damping, 0.5),
        outputScale: vec2(o.output_scale, [1, 1]),
        localOnly: o.local_only === true,
        bob: null,
        velocity: [0, 0],
        angle: 0,
        omega: 0,
      };
    }
    this.nodes.push(node);
    this.byUuid.set(node.uuid, node);
    for (const child of Array.isArray(o.children) ? (o.children as Json[]) : []) {
      if (child && typeof child === 'object') node.children.push(this.loadNode(child, node));
    }
    return node;
  }

  private loadParam(o: Json): Param | null {
    if (typeof o.name !== 'string') return null;
    const axes = Array.isArray(o.axis_points) ? (o.axis_points as unknown[][]) : [[0], [0]];
    const param: Param = {
      uuid: num(o.uuid),
      name: cleanText(o.name),
      isVec2: o.is_vec2 === true,
      min: vec2(o.min, [0, 0]),
      max: vec2(o.max, [1, 1]),
      defaults: vec2(o.defaults, [0, 0]),
      axisX: (axes[0] ?? [0]).map((x) => num(x)),
      axisY: (axes[1] ?? [0]).map((x) => num(x)),
      bindings: [],
      driven: false,
    };
    for (const b of Array.isArray(o.bindings) ? (o.bindings as Json[]) : []) {
      const target = TARGETS[String(b.param_name)];
      const node = this.byUuid.get(num(b.node));
      if (!target || !node || !Array.isArray(b.values)) continue;
      if (target === 'deform' && !node.part && !node.meshGroup) continue;
      const values = (b.values as unknown[][]).map((column) =>
        (Array.isArray(column) ? column : []).map((v) => {
          if (target !== 'deform') return num(v);
          // A list of [x, y] offsets, one per vertex.
          const pairs = Array.isArray(v) ? (v as unknown[]) : [];
          const out = new Float32Array(pairs.length * 2);
          pairs.forEach((pair, i) => {
            const [x, y] = vec2(pair);
            out[i * 2] = x;
            out[i * 2 + 1] = y;
          });
          return out;
        }),
      );
      if (values.length !== param.axisX.length || values.some((column) => column.length !== param.axisY.length)) continue;
      param.bindings.push({ node, target, nearest: b.interpolate_mode === 'Nearest', cubic: b.interpolate_mode === 'Cubic', values });
    }
    return param;
  }

  /** Parts drawn by a composite: all below it, without going into another composite. */
  private compositeParts(node: PuppetNode): PuppetNode[] {
    const out: PuppetNode[] = [];
    const walk = (n: PuppetNode) => {
      for (const child of n.children) {
        if (child.part && !child.maskOnly) out.push(child);
        if (!child.composite) walk(child);
      }
    };
    walk(node);
    return out;
  }

  /** Parts that follow a mesh group: all below it, up to the next mesh group. */
  private meshGroupTargets(node: PuppetNode): PuppetNode[] {
    const out: PuppetNode[] = [];
    const walk = (n: PuppetNode) => {
      for (const child of n.children) {
        if (child.meshGroup) continue;
        if (child.part) out.push(child);
        walk(child);
      }
    };
    walk(node);
    return out;
  }

  node(uuid: number): PuppetNode | undefined {
    return this.byUuid.get(uuid);
  }

  /** Sets a parameter by name (clamped to its range); false if the puppet has none of that name. */
  setParam(name: string, x: number, y = 0): boolean {
    const param = this.params.get(name);
    if (!param) return false;
    this.values.set(param, [x, y]);
    return true;
  }

  getParam(name: string): Vec2 | undefined {
    const param = this.params.get(name);
    return param && this.values.get(param);
  }

  /** Area the visible parts cover this frame, in puppet space: [minX, minY, maxX, maxY]. */
  bounds(): [number, number, number, number] | null {
    let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const node of this.nodes) {
      const part = node.part;
      if (!part || node.maskOnly || !node.visible || part.opacity * node.opacityFactor <= 0) continue;
      const m = node.abs;
      for (let i = 0; i < part.verts.length; i += 2) {
        const x = part.verts[i]! + part.deform[i]!;
        const y = part.verts[i + 1]! + part.deform[i + 1]!;
        const wx = m[0]! * x + m[4]! * y + m[12]!;
        const wy = m[1]! * x + m[5]! * y + m[13]!;
        if (wx < minX) minX = wx;
        if (wx > maxX) maxX = wx;
        if (wy < minY) minY = wy;
        if (wy > maxY) maxY = wy;
      }
    }
    return Number.isFinite(minX) ? [minX, minY, maxX, maxY] : null;
  }

  /** All parameters back to their default values. */
  resetParams() {
    for (const param of this.params.values()) {
      if (!param.driven) this.values.set(param, [...param.defaults]);
    }
  }

  /** Computes the puppet for a frame; `dt` (seconds) drives the physics. */
  update(dt: number) {
    for (const node of this.nodes) {
      const rel = node.rel;
      rel.t[0] = node.base.t[0]; rel.t[1] = node.base.t[1]; rel.t[2] = node.base.t[2];
      rel.r[0] = node.base.r[0]; rel.r[1] = node.base.r[1]; rel.r[2] = node.base.r[2];
      rel.s[0] = node.base.s[0]; rel.s[1] = node.base.s[1];
      node.z = node.zsort;
      node.opacityFactor = 1;
      node.part?.deform.fill(0);
      node.meshGroup?.deform.fill(0);
    }
    for (const param of this.params.values()) {
      if (!param.driven) this.applyParam(param);
    }
    this.updateTransforms();

    let anyPhysics = false;
    const step = Math.min(Math.max(dt, 0), 0.1);
    for (const node of this.nodes) {
      const physics = node.physics;
      if (!physics) continue;
      const param = this.paramByUuid.get(physics.param);
      if (!param) continue;
      anyPhysics = true;
      if (step > 0) this.values.set(param, this.stepPhysics(node, physics, step));
      this.applyParam(param);
    }
    if (anyPhysics) this.updateTransforms();

    for (const node of this.nodes) {
      if (node.meshGroup && node.visible) this.applyMeshGroup(node, node.meshGroup);
    }
    this.sortDrawables();
  }

  private applyParam(param: Param) {
    const value = this.values.get(param) ?? param.defaults;
    const span = (i: 0 | 1) => param.max[i] - param.min[i];
    const norm = (i: 0 | 1) => {
      const v = Math.min(Math.max(value[i], param.min[i]), param.max[i]);
      return span(i) === 0 ? 0 : (v - param.min[i]) / span(i);
    };
    const nx = norm(0);
    const ny = norm(1);
    const [x0, x1] = axisRange(param.axisX, nx);
    const [y0, y1] = axisRange(param.axisY, ny);
    const ax0 = param.axisX[x0]!;
    const ax1 = param.axisX[x1]!;
    const ay0 = param.axisY[y0]!;
    const ay1 = param.axisY[y1]!;
    const tx = Math.min(Math.max(nx, ax0), ax1);
    const ty = Math.min(Math.max(ny, ay0), ay1);

    // Cubic bindings: Catmull-Rom over the axis keys, neighbours clamped at the ends.
    const lastX = param.axisX.length - 1;
    const lastY = param.axisY.length - 1;
    const ux = ax1 === ax0 ? 0 : (tx - ax0) / (ax1 - ax0);
    const uy = ay1 === ay0 ? 0 : (ty - ay0) / (ay1 - ay0);
    const cubic2 = (get: (ix: number, iy: number) => number) => {
      const row = (iy: number) =>
        catmull(get(Math.max(x0 - 1, 0), iy), get(x0, iy), get(x1, iy), get(Math.min(x1 + 1, lastX), iy), ux);
      return catmull(row(Math.max(y0 - 1, 0)), row(y0), row(y1), row(Math.min(y1 + 1, lastY)), uy);
    };

    for (const b of param.bindings) {
      const v = b.values;
      if (b.cubic) {
        if (b.target === 'deform') {
          const target = b.node.part?.deform ?? b.node.meshGroup?.deform;
          if (!target) continue;
          for (let i = 0; i < target.length; i += 1) {
            target[i]! += cubic2((ix, iy) => (v[ix]![iy] as Float32Array)[i] ?? 0);
          }
        } else {
          this.applyValue(b, cubic2((ix, iy) => v[ix]![iy] as number));
        }
        continue;
      }
      if (b.target === 'deform') {
        const target = b.node.part?.deform ?? b.node.meshGroup?.deform;
        if (!target) continue;
        const a = v[x0]![y0] as Float32Array;
        const c = v[x1]![y0] as Float32Array;
        const d = v[x0]![y1] as Float32Array;
        const e = v[x1]![y1] as Float32Array;
        const n = Math.min(target.length, a.length, c.length, d.length, e.length);
        for (let i = 0; i < n; i += 1) {
          const top = lerp(tx, ax0, ax1, a[i]!, c[i]!, b.nearest);
          const bottom = lerp(tx, ax0, ax1, d[i]!, e[i]!, b.nearest);
          target[i]! += lerp(ty, ay0, ay1, top, bottom, b.nearest);
        }
        continue;
      }
      const top = lerp(tx, ax0, ax1, v[x0]![y0] as number, v[x1]![y0] as number, b.nearest);
      const bottom = lerp(tx, ax0, ax1, v[x0]![y1] as number, v[x1]![y1] as number, b.nearest);
      this.applyValue(b, lerp(ty, ay0, ay1, top, bottom, b.nearest));
    }
  }

  /** Adds (translation, rotation, zsort) or multiplies (scale, opacity) a binding's value. */
  private applyValue(b: Binding, out: number) {
    const rel = b.node.rel;
    switch (b.target) {
      case 'tx': rel.t[0] += out; break;
      case 'ty': rel.t[1] += out; break;
      case 'tz': rel.t[2] += out; break;
      case 'rx': rel.r[0] += out; break;
      case 'ry': rel.r[1] += out; break;
      case 'rz': rel.r[2] += out; break;
      case 'sx': rel.s[0] *= out; break;
      case 'sy': rel.s[1] *= out; break;
      case 'zsort': b.node.z += out; break;
      case 'opacity': b.node.opacityFactor *= out; break;
    }
  }

  /** Absolute matrices and zsort, parents first. `z` holds the node's own value until here. */
  private updateTransforms() {
    const local = identity();
    for (const node of this.nodes) {
      const { t, r, s } = node.rel;
      fromTransform(local, t[0], t[1], t[2], r[0], r[1], r[2], s[0], s[1]);
      const base = node.parent ? (node.lockToRoot ? this.root : node.parent) : null;
      if (base) {
        multiply(node.abs, base.abs, local);
      } else {
        node.abs.set(local);
      }
      node.visible = node.enabled && (node.parent?.visible ?? true);
      node.zAbs = node.z + (base ? base.zAbs : 0);
    }
  }

  private sortDrawables() {
    const byZ = (a: PuppetNode, b: PuppetNode) => b.zAbs - a.zAbs;
    const list: PuppetNode[] = [];
    const walk = (n: PuppetNode) => {
      for (const child of n.children) {
        if ((child.part && !child.maskOnly) || child.composite) list.push(child);
        // Parts inside a composite are drawn by it.
        if (!child.composite) walk(child);
      }
    };
    walk(this.root);
    list.sort(byZ);
    this.drawList = list;
    for (const node of this.nodes) node.composite?.parts.sort(byZ);
  }

  /** Moves the parts below a mesh group with its deformed triangles. */
  private applyMeshGroup(node: PuppetNode, group: MeshGroup) {
    const { verts, deform, triangles, dynamic } = group;
    const triCount = triangles.length / TRI;
    if (triCount === 0) return;
    const toGroup = identity();
    const back = identity();
    const groupInv = invert(identity(), node.abs);
    for (const target of group.targets) {
      const part = target.part!;
      multiply(toGroup, groupInv, target.abs);
      invert(back, toGroup);
      const [b0, b1, b4, b5] = [back[0]!, back[1]!, back[4]!, back[5]!];
      const pv = part.verts;
      const pd = part.deform;
      for (let i = 0; i < pv.length; i += 2) {
        const px = pv[i]! + (dynamic ? pd[i]! : 0);
        const py = pv[i + 1]! + (dynamic ? pd[i + 1]! : 0);
        const [cx, cy] = transformPoint(toGroup, px, py);
        for (let k = 0; k < triCount; k += 1) {
          const o = k * TRI;
          if (cx < triangles[o + 7]! || cx > triangles[o + 9]! || cy < triangles[o + 8]! || cy > triangles[o + 10]!) continue;
          const rx = cx - triangles[o]!;
          const ry = cy - triangles[o + 1]!;
          const e1x = triangles[o + 2]!;
          const e1y = triangles[o + 3]!;
          const e2x = triangles[o + 4]!;
          const e2y = triangles[o + 5]!;
          const inv = triangles[o + 6]!;
          const u = (rx * e2y - ry * e2x) * inv;
          const v = (e1x * ry - e1y * rx) * inv;
          if (u < -1e-4 || v < -1e-4 || u + v > 1 + 1e-4) continue;
          // Same triangle with this frame's deformation.
          const [i0, i1, i2] = triangleCorners(group.indices, k);
          const p0x = verts[i0 * 2]! + deform[i0 * 2]!;
          const p0y = verts[i0 * 2 + 1]! + deform[i0 * 2 + 1]!;
          const nx = p0x + u * (verts[i1 * 2]! + deform[i1 * 2]! - p0x) + v * (verts[i2 * 2]! + deform[i2 * 2]! - p0x);
          const ny = p0y + u * (verts[i1 * 2 + 1]! + deform[i1 * 2 + 1]! - p0y) + v * (verts[i2 * 2 + 1]! + deform[i2 * 2 + 1]! - p0y);
          const dx = nx - cx;
          const dy = ny - cy;
          pd[i]! += b0 * dx + b4 * dy;
          pd[i + 1]! += b1 * dx + b5 * dy;
          break;
        }
      }
    }
  }

  private stepPhysics(node: PuppetNode, p: Physics, dt: number): Vec2 {
    const anchor: Vec2 = p.localOnly ? [node.rel.t[0], node.rel.t[1]] : transformPoint(node.abs, 0, 0);
    const g = p.gravity * this.pixelsPerMeter * this.worldGravity;
    if (!p.bob) p.bob = [anchor[0], anchor[1] + p.length];
    // Small fixed steps keep the simulation stable at low frame rates.
    for (let left = dt; left > 1e-6; left -= 0.01) {
      const h = Math.min(left, 0.01);
      if (p.spring) stepSpring(p, anchor, g, h);
      else stepRigid(p, anchor, g, h);
    }
    return physicsOutput(p, node, anchor);
  }
}

function triangleCorners(indices: Uint32Array, k: number): [number, number, number] {
  return [indices[k * 3]!, indices[k * 3 + 1]!, indices[k * 3 + 2]!];
}

/** Floats per mesh-group triangle: p0 x/y, edge 1 x/y, edge 2 x/y, 1/det, min x/y, max x/y. */
const TRI = 11;

function prepareTriangles(verts: Float32Array, indices: Uint32Array): Float32Array {
  const count = Math.floor(indices.length / 3);
  const out = new Float32Array(count * TRI);
  for (let k = 0; k < count; k += 1) {
    const [i0, i1, i2] = triangleCorners(indices, k);
    const p0x = verts[i0 * 2] ?? 0;
    const p0y = verts[i0 * 2 + 1] ?? 0;
    const p1x = verts[i1 * 2] ?? 0;
    const p1y = verts[i1 * 2 + 1] ?? 0;
    const p2x = verts[i2 * 2] ?? 0;
    const p2y = verts[i2 * 2 + 1] ?? 0;
    const e1x = p1x - p0x;
    const e1y = p1y - p0y;
    const e2x = p2x - p0x;
    const e2y = p2y - p0y;
    const det = e1x * e2y - e1y * e2x;
    out.set(
      [p0x, p0y, e1x, e1y, e2x, e2y, det === 0 ? 0 : 1 / det,
        Math.min(p0x, p1x, p2x), Math.min(p0y, p1y, p2y), Math.max(p0x, p1x, p2x), Math.max(p0y, p1y, p2y)],
      k * TRI,
    );
  }
  return out;
}

/** Rigid pendulum (angle and angular speed), Runge-Kutta 4 like Inox2D. */
function stepRigid(p: Physics, anchor: Vec2, g: number, h: number) {
  const bob = p.bob!;
  p.angle = Math.atan2(-(bob[0] - anchor[0]), bob[1] - anchor[1]);
  const r = p.length;
  const crit = 2 * Math.sqrt(g / r);
  const deriv = (theta: number, omega: number): Vec2 => [omega, -(g / r) * Math.sin(theta) - omega * p.angleDamping * crit];
  const [t0, w0] = [p.angle, p.omega];
  const k1 = deriv(t0, w0);
  const k2 = deriv(t0 + (h * k1[0]) / 2, w0 + (h * k1[1]) / 2);
  const k3 = deriv(t0 + (h * k2[0]) / 2, w0 + (h * k2[1]) / 2);
  const k4 = deriv(t0 + h * k3[0], w0 + h * k3[1]);
  const theta = t0 + (h * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0])) / 6;
  const omega = w0 + (h * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1])) / 6;
  if (Number.isFinite(theta) && Number.isFinite(omega)) {
    p.angle = theta;
    p.omega = omega;
  }
  p.bob = [anchor[0] - Math.sin(p.angle) * r, anchor[1] + Math.cos(p.angle) * r];
}

/** Spring pendulum (bob position and velocity), Runge-Kutta 4 like Inox2D. */
function stepSpring(p: Physics, anchor: Vec2, g: number, h: number) {
  const springK = (p.frequency * 2 * Math.PI) ** 2;
  const kSqrt = p.frequency * 2 * Math.PI;
  const restLength = p.length - g / springK;
  const critAngle = 2 * Math.sqrt(g / p.length);
  const critLength = 2 * kSqrt;
  const deriv = (s: number[]): number[] => {
    const [x, y, vx, vy] = s as [number, number, number, number];
    const ox = x - anchor[0];
    const oy = y - anchor[1];
    const dist = Math.hypot(ox, oy);
    const nx = dist > 0 ? ox / dist : 0;
    const ny = dist > 0 ? oy / dist : 1;
    const fx = -nx * (dist - restLength) * springK;
    const fy = g - ny * (dist - restLength) * springK;
    const rotX = vx * ny + vy * nx;
    const rotY = vy * ny - vx * nx;
    const ddx = -rotX * p.angleDamping * critAngle;
    const ddy = -rotY * p.lengthDamping * critLength;
    const dampX = ddx * ny - rotY * nx;
    const dampY = ddy * ny + rotX * nx;
    return [vx, vy, fx + dampX, fy + dampY];
  };
  const s0 = [p.bob![0], p.bob![1], p.velocity[0], p.velocity[1]];
  const add = (s: number[], k: number[], f: number) => s.map((v, i) => v + k[i]! * f);
  const k1 = deriv(s0);
  const k2 = deriv(add(s0, k1, h / 2));
  const k3 = deriv(add(s0, k2, h / 2));
  const k4 = deriv(add(s0, k3, h));
  const next = s0.map((v, i) => v + (h * (k1[i]! + 2 * k2[i]! + 2 * k3[i]! + k4[i]!)) / 6);
  if (next.every(Number.isFinite)) {
    p.bob = [next[0]!, next[1]!];
    p.velocity = [next[2]!, next[3]!];
  }
}

/** The parameter value of a pendulum: the bob's direction in the node's space and its length. */
function physicsOutput(p: Physics, node: PuppetNode, anchor: Vec2): Vec2 {
  const bob = p.bob!;
  let lx: number;
  let ly: number;
  if (p.localOnly) {
    [lx, ly] = bob;
  } else {
    [lx, ly] = transformPoint(invert(identity(), node.abs), bob[0], bob[1]);
  }
  const len = Math.hypot(lx, ly) || 1;
  const ax = lx / len;
  const ay = ly / len;
  const relLength = Math.hypot(bob[0] - anchor[0], bob[1] - anchor[1]) / p.length;
  let out: Vec2;
  switch (p.mapMode) {
    case 'XY':
      out = [ax * relLength, -(ay * relLength - 1)];
      break;
    case 'YX':
      out = [-(ay * relLength - 1), ax * relLength];
      break;
    case 'LengthAngle':
      out = [relLength, Math.atan2(-ax, ay) / Math.PI];
      break;
    default:
      out = [Math.atan2(-ax, ay) / Math.PI, relLength];
  }
  return [out[0] * p.outputScale[0], out[1] * p.outputScale[1]];
}
