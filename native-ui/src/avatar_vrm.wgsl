struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) normal: vec3<f32>,
    @location(1) uv: vec2<f32>,
    @location(2) color: vec4<f32>,
    @location(3) @interpolate(flat) cutoff: f32,
}

struct Camera {
    matrix: mat4x4<f32>,
    expressions: vec4<f32>,
}

@group(0) @binding(0) var<uniform> camera: Camera;
@group(1) @binding(0) var albedo: texture_2d<f32>;
@group(1) @binding(1) var albedo_sampler: sampler;

@vertex
fn vs_main(
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
    @location(3) color: vec4<f32>,
    @location(4) cutoff: f32,
    @location(5) blink: vec3<f32>,
    @location(6) mouth: vec3<f32>,
) -> VertexOutput {
    let posed = position + camera.expressions.x * blink + camera.expressions.y * mouth;
    return VertexOutput(camera.matrix * vec4<f32>(posed, 1.0), normal, uv, color, cutoff);
}

@fragment
fn fs_main(vertex: VertexOutput) -> @location(0) vec4<f32> {
    let surface = textureSample(albedo, albedo_sampler, vertex.uv) * vertex.color;
    if surface.a < vertex.cutoff {
        discard;
    }
    let light = 0.78 + 0.22 * abs(dot(vertex.normal, normalize(vec3<f32>(0.3, 0.7, 1.0))));
    return vec4<f32>(surface.rgb * light, select(surface.a, 1.0, vertex.cutoff < 0.0));
}
