/*
 * WebGL2 renderer for Inochi2D puppets. Port of Inox2D's OpenGL renderer and the Inochi2D shaders
 * (BSD-2-Clause, © Speykious, Luna Nielsen and the Inochi2D Project, see LICENSE-inox2d.txt):
 * premultiplied alpha, stencil masks, composites through an offscreen buffer, the seven blend modes.
 * Only the albedo pass is drawn (no emission/bump lighting, which Inox2D leaves out too).
 */
import { decodePng, decodeTga, type InpFile, type RawImage } from './inp';
import { multiply, identity, type Mat4 } from './math';
import type { BlendMode, Drawable, Mask, Puppet, PuppetNode } from './puppet';

const PART_VERT = `#version 300 es
uniform mat4 mvp;
layout(location = 0) in vec2 verts;
layout(location = 1) in vec2 uvs;
layout(location = 2) in vec2 deform;
out vec2 texUVs;
void main() {
  gl_Position = mvp * vec4(verts + deform, 0.0, 1.0);
  texUVs = uvs;
}`;

// WebGL has no transparent texture border (Inochi2D uses CLAMP_TO_BORDER): UVs outside 0…1 must
// stay empty instead of repeating the edge pixels.
const SAMPLE = `
vec4 sampleAlbedo(sampler2D tex, vec2 uv) {
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return vec4(0.0);
  return texture(tex, uv);
}`;

const PART_FRAG = `#version 300 es
precision highp float;
in vec2 texUVs;
out vec4 outColor;
uniform sampler2D albedo;
uniform float opacity;
uniform vec3 multColor;
uniform vec3 screenColor;
${SAMPLE}
void main() {
  vec4 texColor = sampleAlbedo(albedo, texUVs);
  vec3 screenOut = vec3(1.0) - ((vec3(1.0) - texColor.rgb) * (vec3(1.0) - (screenColor * texColor.a)));
  outColor = vec4(screenOut, texColor.a) * vec4(multColor, 1.0) * opacity;
}`;

const MASK_FRAG = `#version 300 es
precision highp float;
in vec2 texUVs;
out vec4 outColor;
uniform sampler2D albedo;
uniform float threshold;
${SAMPLE}
void main() {
  if (sampleAlbedo(albedo, texUVs).a <= threshold) discard;
  outColor = vec4(1.0);
}`;

/** `Mask` nodes: the whole mesh counts, there is no texture. */
const PLAIN_MASK_FRAG = `#version 300 es
precision highp float;
out vec4 outColor;
void main() {
  outColor = vec4(1.0);
}`;

const COMPOSITE_VERT = `#version 300 es
layout(location = 0) in vec2 verts;
layout(location = 1) in vec2 uvs;
out vec2 texUVs;
void main() {
  gl_Position = vec4(verts, 0.0, 1.0);
  texUVs = uvs;
}`;

const COMPOSITE_FRAG = PART_FRAG;

interface Program {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
}

function compile(gl: WebGL2RenderingContext, vert: string, frag: string, names: string[]): Program {
  const shader = (type: number, source: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) {
      throw new Error(`Inochi2D shader: ${gl.getShaderInfoLog(s) ?? 'compile error'}`);
    }
    return s;
  };
  const program = gl.createProgram()!;
  const vs = shader(gl.VERTEX_SHADER, vert);
  const fs = shader(gl.FRAGMENT_SHADER, frag);
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) {
    throw new Error(`Inochi2D shader: ${gl.getProgramInfoLog(program) ?? 'link error'}`);
  }
  const uniforms: Program['uniforms'] = {};
  for (const name of names) uniforms[name] = gl.getUniformLocation(program, name);
  return { program, uniforms };
}

/** A decoded texture, ready for upload. */
type TextureSource = RawImage | ImageBitmap;

/** Decodes one texture on this thread (fallback, and PNG variants only the browser reads). */
async function decodeHere(tex: InpFile['textures'][number]): Promise<TextureSource | null> {
  if (tex.encoding === 'tga') return decodeTga(tex.data);
  if (tex.encoding !== 'png') return null;
  // Own decoder keeps the stored (premultiplied) bytes in every engine; the browser decoder only
  // for PNG variants it does not cover (interlaced).
  return decodePng(tex.data).catch(() =>
    createImageBitmap(new Blob([tex.data as BlobPart], { type: 'image/png' }), {
      premultiplyAlpha: 'none',
      colorSpaceConversion: 'none',
    }),
  );
}

/** A worker for the textures, or null where there is none (tests, a refused worker). */
function startWorker(): Worker | null {
  try {
    return typeof Worker === 'undefined' ? null : new Worker(new URL('./textureWorker.ts', import.meta.url), { type: 'module' });
  } catch {
    return null;
  }
}

/**
 * Decodes the puppet's textures (TGA and PNG in a worker, so the interface stays responsive).
 * The pixels are kept as stored: Inochi2D textures already carry premultiplied alpha. BC7 (a GPU
 * format WebGL cannot take without an extension) and unreadable textures stay empty (null).
 */
export async function decodeTextures(file: InpFile, signal?: AbortSignal): Promise<(TextureSource | null)[]> {
  const worker = startWorker();
  const pending = new Map<number, (result: { image?: RawImage; error?: string }) => void>();
  let broken = !worker;
  if (worker) {
    worker.onmessage = (e: MessageEvent<{ id: number; image?: RawImage; error?: string }>) => {
      pending.get(e.data.id)?.(e.data);
      pending.delete(e.data.id);
    };
    worker.onerror = () => {
      // The worker could not run (e.g. blocked): everything left is decoded here.
      broken = true;
      for (const resolve of pending.values()) resolve({ error: 'worker' });
      pending.clear();
    };
  }
  const inWorker = (id: number, tex: InpFile['textures'][number]) =>
    new Promise<{ image?: RawImage; error?: string }>((resolve) => {
      pending.set(id, resolve);
      // A copy: the texture is a view into the whole file, which must stay usable here.
      const data = tex.data.slice();
      worker!.postMessage({ id, encoding: tex.encoding, data }, [data.buffer]);
    });
  try {
    const jobs = file.textures.map(async (tex, id): Promise<TextureSource | null> => {
      try {
        if (tex.encoding === 'bc7') return null;
        if (!broken) {
          const result = await inWorker(id, tex);
          if (result.image) return result.image;
        }
        if (signal?.aborted) return null;
        return await decodeHere(tex);
      } catch (e) {
        console.warn('Inochi2D: Textur nicht lesbar:', e);
        return null;
      }
    });
    const abort = new Promise<never>((_, reject) =>
      signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true }),
    );
    return await Promise.race([Promise.all(jobs), abort]);
  } finally {
    worker?.terminate();
  }
}

interface PartRange {
  vertOffset: number;
  indexOffset: number;
  indexCount: number;
}

export class PuppetRenderer {
  private readonly gl: WebGL2RenderingContext;
  private readonly puppet: Puppet;
  private readonly partProgram: Program;
  private readonly maskProgram: Program;
  private readonly plainMaskProgram: Program;
  private readonly compositeProgram: Program;
  private readonly vao: WebGLVertexArrayObject;
  private readonly quadVao: WebGLVertexArrayObject;
  private readonly buffers: WebGLBuffer[] = [];
  private readonly deformBuffer: WebGLBuffer;
  private readonly deformData: Float32Array;
  private readonly ranges = new Map<PuppetNode, PartRange>();
  private readonly textures: (WebGLTexture | null)[];
  private framebuffer: WebGLFramebuffer | null = null;
  private fbTexture: WebGLTexture | null = null;
  private fbStencil: WebGLRenderbuffer | null = null;
  private fbSize = [0, 0];
  private viewProj: Mat4 = identity();
  private blend: BlendMode | null = null;
  private readonly mvp = identity();

  constructor(gl: WebGL2RenderingContext, puppet: Puppet, textures: (TextureSource | null)[]) {
    this.gl = gl;
    this.puppet = puppet;
    this.partProgram = compile(gl, PART_VERT, PART_FRAG, ['mvp', 'albedo', 'opacity', 'multColor', 'screenColor']);
    this.maskProgram = compile(gl, PART_VERT, MASK_FRAG, ['mvp', 'albedo', 'threshold']);
    this.plainMaskProgram = compile(gl, PART_VERT, PLAIN_MASK_FRAG, ['mvp']);
    this.compositeProgram = compile(gl, COMPOSITE_VERT, COMPOSITE_FRAG, ['albedo', 'opacity', 'multColor', 'screenColor']);

    // One buffer for all parts: positions and UVs stay, offsets change every frame.
    const parts = puppet.nodes.filter((n) => n.part);
    let vertCount = 0;
    let indexCount = 0;
    for (const node of parts) {
      this.ranges.set(node, { vertOffset: vertCount, indexOffset: indexCount, indexCount: node.part!.indices.length });
      vertCount += node.part!.verts.length / 2;
      indexCount += node.part!.indices.length;
    }
    const verts = new Float32Array(vertCount * 2);
    const uvs = new Float32Array(vertCount * 2);
    const indices = new Uint32Array(indexCount);
    for (const node of parts) {
      const part = node.part!;
      const range = this.ranges.get(node)!;
      verts.set(part.verts, range.vertOffset * 2);
      uvs.set(part.uvs.subarray(0, part.verts.length), range.vertOffset * 2);
      for (let i = 0; i < part.indices.length; i += 1) indices[range.indexOffset + i] = part.indices[i]! + range.vertOffset;
    }
    this.deformData = new Float32Array(vertCount * 2);

    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    const attrib = (location: number, data: Float32Array, usage: number) => {
      const buffer = gl.createBuffer()!;
      this.buffers.push(buffer);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, data, usage);
      gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(location);
      return buffer;
    };
    attrib(0, verts, gl.STATIC_DRAW);
    attrib(1, uvs, gl.STATIC_DRAW);
    this.deformBuffer = attrib(2, this.deformData, gl.DYNAMIC_DRAW);
    const indexBuffer = gl.createBuffer()!;
    this.buffers.push(indexBuffer);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);

    // Full-screen quad for composites.
    this.quadVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.quadVao);
    attrib(0, new Float32Array([-1, -1, -1, 1, 1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    attrib(1, new Float32Array([0, 0, 0, 1, 1, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.bindVertexArray(null);

    // Inochi Creator stores textures with premultiplied alpha already: upload them as they are.
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    this.textures = textures.map((source) => {
      if (!source) return null;
      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      if ('pixels' in source) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, source.width, source.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, source.pixels);
      } else {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
        source.close();
      }
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return tex;
    });
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.BROWSER_DEFAULT_WEBGL);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  /** Offscreen buffer for composites, as large as the canvas. */
  private ensureFramebuffer(width: number, height: number) {
    const gl = this.gl;
    if (this.framebuffer && this.fbSize[0] === width && this.fbSize[1] === height) return;
    this.fbTexture ??= gl.createTexture();
    this.fbStencil ??= gl.createRenderbuffer();
    this.framebuffer ??= gl.createFramebuffer();
    gl.bindTexture(gl.TEXTURE_2D, this.fbTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.fbStencil);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH24_STENCIL8, width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.fbTexture, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, this.fbStencil);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    this.fbSize = [width, height];
  }

  /**
   * Draws the puppet (after `puppet.update`) into the canvas. `viewProj` maps puppet space to clip
   * space; `width`/`height` are the drawing buffer's size.
   */
  render(viewProj: Mat4, width: number, height: number) {
    const gl = this.gl;
    if (gl.isContextLost()) return;
    this.viewProj = viewProj;
    this.blend = null;
    this.ensureFramebuffer(width, height);

    for (const [node, range] of this.ranges) this.deformData.set(node.part!.deform, range.vertOffset * 2);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.deformBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.deformData);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.STENCIL_TEST);
    gl.enable(gl.BLEND);
    gl.colorMask(true, true, true, true);
    gl.clearColor(0, 0, 0, 0);
    gl.clearStencil(0);
    gl.stencilMask(0xff);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);

    for (const node of this.puppet.drawList) {
      if (!node.visible) continue;
      if (node.composite) this.drawComposite(node);
      else this.drawMasked(node, () => this.drawPart(node));
    }
    gl.bindVertexArray(null);
    gl.disable(gl.STENCIL_TEST);
  }

  private setBlend(mode: BlendMode) {
    if (this.blend === mode) return;
    this.blend = mode;
    const gl = this.gl;
    gl.blendEquation(mode === 'SliceFromLower' ? gl.FUNC_SUBTRACT : gl.FUNC_ADD);
    switch (mode) {
      case 'Multiply': gl.blendFunc(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA); break;
      case 'ColorDodge': gl.blendFunc(gl.DST_COLOR, gl.ONE); break;
      case 'LinearDodge': gl.blendFunc(gl.ONE, gl.ONE); break;
      case 'Screen': gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR); break;
      case 'ClipToLower': gl.blendFunc(gl.DST_ALPHA, gl.ONE_MINUS_SRC_ALPHA); break;
      case 'SliceFromLower': gl.blendFunc(gl.ONE_MINUS_DST_ALPHA, gl.ONE_MINUS_SRC_ALPHA); break;
      default: gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    }
  }

  /** Runs `draw` limited by the drawable's masks (stencil), like Inox2D's `draw_drawable`. */
  private drawMasked(node: PuppetNode, draw: () => void) {
    const drawable = (node.part ?? node.composite) as Drawable;
    const masks = drawable.masks.filter((m) => this.puppet.node(m.source));
    if (masks.length === 0) {
      draw();
      return;
    }
    const gl = this.gl;
    gl.enable(gl.STENCIL_TEST);
    gl.clearStencil(masks.some((m) => m.mode === 'mask') ? 0 : 1);
    gl.stencilMask(0xff);
    gl.clear(gl.STENCIL_BUFFER_BIT);
    gl.colorMask(false, false, false, false);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
    for (const mask of masks) this.drawMaskSource(mask, drawable.maskThreshold);
    gl.stencilFunc(gl.EQUAL, 1, 0xff);
    gl.stencilMask(0x00);
    gl.colorMask(true, true, true, true);
    draw();
    gl.stencilMask(0xff);
    gl.stencilFunc(gl.ALWAYS, 1, 0xff);
    gl.disable(gl.STENCIL_TEST);
  }

  private drawMaskSource(mask: Mask, threshold: number) {
    const gl = this.gl;
    const source = this.puppet.node(mask.source)!;
    gl.stencilFunc(gl.ALWAYS, mask.mode === 'mask' ? 1 : 0, 0xff);
    if (source.maskOnly) {
      gl.useProgram(this.plainMaskProgram.program);
      this.drawMesh(source, this.plainMaskProgram);
      return;
    }
    const parts = source.part ? [source] : (source.composite?.parts ?? []);
    gl.useProgram(this.maskProgram.program);
    gl.uniform1f(this.maskProgram.uniforms.threshold!, Math.min(Math.max(threshold, 0), 1));
    gl.uniform1i(this.maskProgram.uniforms.albedo!, 0);
    for (const node of parts) this.drawMesh(node, this.maskProgram);
  }

  /** Binds the part's texture and matrix and draws its triangles. */
  private drawMesh(node: PuppetNode, program: Program): boolean {
    const gl = this.gl;
    const range = this.ranges.get(node);
    const texture = this.textures[node.part!.textures[0]] ?? null;
    if (!range || (!texture && !node.maskOnly) || range.indexCount === 0) return false;
    multiply(this.mvp, this.viewProj, node.abs);
    gl.uniformMatrix4fv(program.uniforms.mvp!, false, this.mvp);
    if (texture) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
    }
    gl.bindVertexArray(this.vao);
    gl.drawElements(gl.TRIANGLES, range.indexCount, gl.UNSIGNED_INT, range.indexOffset * 4);
    return true;
  }

  private drawPart(node: PuppetNode) {
    const part = node.part!;
    const opacity = part.opacity * node.opacityFactor;
    if (opacity <= 0) return;
    const gl = this.gl;
    const p = this.partProgram;
    this.setBlend(part.blend);
    gl.useProgram(p.program);
    gl.uniform1i(p.uniforms.albedo!, 0);
    gl.uniform1f(p.uniforms.opacity!, opacity);
    gl.uniform3fv(p.uniforms.multColor!, part.tint);
    gl.uniform3fv(p.uniforms.screenColor!, part.screenTint);
    this.drawMesh(node, p);
  }

  /** Draws the composite's parts into the offscreen buffer, then that onto the canvas. */
  private drawComposite(node: PuppetNode) {
    const composite = node.composite!;
    const parts = composite.parts.filter((n) => n.visible);
    if (parts.length === 0) return;
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    for (const part of parts) this.drawMasked(part, () => this.drawPart(part));
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    const opacity = Math.min(Math.max(composite.opacity * node.opacityFactor, 0), 1);
    if (opacity <= 0) return;
    const clamp = (c: [number, number, number]) => c.map((v) => Math.min(Math.max(v, 0), 1));
    this.drawMasked(node, () => {
      const p = this.compositeProgram;
      this.setBlend(composite.blend);
      gl.useProgram(p.program);
      gl.uniform1i(p.uniforms.albedo!, 0);
      gl.uniform1f(p.uniforms.opacity!, opacity);
      gl.uniform3fv(p.uniforms.multColor!, clamp(composite.tint));
      gl.uniform3fv(p.uniforms.screenColor!, clamp(composite.screenTint));
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.fbTexture);
      gl.bindVertexArray(this.quadVao);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    });
  }

  /** Frees everything on the GPU (the canvas itself stays). */
  dispose() {
    const gl = this.gl;
    if (gl.isContextLost()) return;
    for (const tex of this.textures) if (tex) gl.deleteTexture(tex);
    for (const buffer of this.buffers) gl.deleteBuffer(buffer);
    gl.deleteVertexArray(this.vao);
    gl.deleteVertexArray(this.quadVao);
    gl.deleteProgram(this.partProgram.program);
    gl.deleteProgram(this.maskProgram.program);
    gl.deleteProgram(this.plainMaskProgram.program);
    gl.deleteProgram(this.compositeProgram.program);
    if (this.framebuffer) gl.deleteFramebuffer(this.framebuffer);
    if (this.fbTexture) gl.deleteTexture(this.fbTexture);
    if (this.fbStencil) gl.deleteRenderbuffer(this.fbStencil);
  }
}
