use super::{Controls, Pose, SIZE, read};
use bytemuck::{Pod, Zeroable};
use glam::{Mat4, Vec3};
use std::{
    collections::{HashMap, HashSet},
    io::Cursor,
    path::Path,
};
use wgpu::util::DeviceExt;

const DEPTH: wgpu::TextureFormat = wgpu::TextureFormat::Depth24Plus;
pub const FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8UnormSrgb;
const BACKGROUND: wgpu::Color = wgpu::Color {
    r: 0.026,
    g: 0.034,
    b: 0.052,
    a: 1.0,
};
const VERTEX_LIMIT: usize = 2_000_000;
const INDEX_LIMIT: usize = 6_000_000;

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct Vertex {
    position: [f32; 3],
    normal: [f32; 3],
    uv: [f32; 2],
    color: [f32; 4],
    cutoff: f32,
    blink: [f32; 3],
    mouth: [f32; 3],
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct Camera {
    matrix: [f32; 16],
    expressions: [f32; 4],
}

#[derive(Clone, Copy)]
struct Morph {
    target: usize,
    weight: f32,
    expression: usize,
}

struct Mesh {
    vertices: wgpu::Buffer,
    indices: wgpu::Buffer,
    count: u32,
    texture: Option<usize>,
}

pub struct Vrm {
    pipeline: wgpu::RenderPipeline,
    camera: wgpu::Buffer,
    camera_group: wgpu::BindGroup,
    depth: wgpu::TextureView,
    textures: HashMap<Option<usize>, wgpu::BindGroup>,
    meshes: Vec<Mesh>,
    center: Vec3,
    radius: f32,
    front: f32,
    controls: Controls,
}

impl Vrm {
    pub fn controls(&self) -> Controls {
        self.controls
    }

    pub fn load(device: &wgpu::Device, queue: &wgpu::Queue, path: &Path) -> Result<Self, String> {
        let bytes = read(path, 128 * 1024 * 1024)?;
        let file = gltf::Gltf::from_slice(&bytes).map_err(|error| format!("VRM: {error}"))?;
        let extensions = file
            .extensions()
            .ok_or("Der Datei fehlt die VRM-Erweiterung.")?;
        let front = if extensions.contains_key("VRMC_vrm") {
            0.0
        } else if extensions.contains_key("VRM") {
            std::f32::consts::PI
        } else {
            return Err("Der Datei fehlt die VRM-Erweiterung.".into());
        };
        let morphs = expression_morphs(extensions);
        let mut supported = [false; 2];
        let blob = file
            .blob
            .as_deref()
            .ok_or("Das VRM-Modell enthält keine eingebetteten Daten.")?;
        if file.buffers().len() != 1
            || file.buffers().any(|buffer| {
                !matches!(buffer.source(), gltf::buffer::Source::Bin)
                    || buffer.length() > blob.len()
            })
        {
            return Err("VRM benötigt einen eingebetteten Datenpuffer.".into());
        }
        let scene = file
            .default_scene()
            .or_else(|| file.scenes().next())
            .ok_or("Das VRM-Modell enthält keine Szene.")?;
        let pipeline = pipeline(device);
        let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            address_mode_u: wgpu::AddressMode::Repeat,
            address_mode_v: wgpu::AddressMode::Repeat,
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            ..Default::default()
        });
        let texture_layout = pipeline.get_bind_group_layout(1);
        let white = image::RgbaImage::from_pixel(1, 1, image::Rgba([255; 4]));
        let mut textures = HashMap::from([(
            None,
            upload(device, queue, &texture_layout, &sampler, &white),
        )]);
        let mut pixels = 1;
        let mut meshes = Vec::new();
        let mut min = Vec3::splat(f32::INFINITY);
        let mut max = Vec3::splat(f32::NEG_INFINITY);
        let mut vertices_left = VERTEX_LIMIT;
        let mut indices_left = INDEX_LIMIT;
        let mut visited = HashSet::new();
        let mut nodes: Vec<_> = scene.nodes().map(|node| (node, Mat4::IDENTITY)).collect();
        while let Some((node, parent)) = nodes.pop() {
            if !visited.insert(node.index()) {
                return Err("Die VRM-Szene enthält mehrfach referenzierte Knoten.".into());
            }
            let transform = parent * Mat4::from_cols_array_2d(&node.transform().matrix());
            nodes.extend(node.children().map(|child| (child, transform)));
            let Some(mesh) = node.mesh() else { continue };
            let normal_transform = transform.inverse().transpose();
            for primitive in mesh.primitives() {
                if primitive.mode() != gltf::mesh::Mode::Triangles {
                    continue;
                }
                let reader = primitive.reader(|_| Some(blob));
                let positions = reader
                    .read_positions()
                    .ok_or("Ungültige VRM-Vertexdaten.")?;
                let count = positions.len();
                if count == 0 {
                    continue;
                }
                vertices_left = vertices_left
                    .checked_sub(count)
                    .ok_or("Das VRM-Modell hat zu viele Vertices.")?;
                let mut normals = reader.read_normals().into_iter().flatten();
                let material = primitive.material();
                let pbr = material.pbr_metallic_roughness();
                let texture_info = pbr.base_color_texture();
                let mut uvs = reader
                    .read_tex_coords(texture_info.as_ref().map_or(0, |info| info.tex_coord()))
                    .map(|uvs| uvs.into_f32())
                    .into_iter()
                    .flatten();
                let cutoff = match material.alpha_mode() {
                    gltf::material::AlphaMode::Opaque => -1.0,
                    gltf::material::AlphaMode::Mask => material.alpha_cutoff().unwrap_or(0.5),
                    gltf::material::AlphaMode::Blend => 0.02,
                };
                let mut vertices = Vec::with_capacity(count);
                for position in positions {
                    let position = transform.transform_point3(Vec3::from(position));
                    if !position.is_finite() {
                        return Err("Ungültige VRM-Koordinaten.".into());
                    }
                    min = min.min(position);
                    max = max.max(position);
                    let normal = normals.next().map_or(Vec3::Z, |normal| {
                        normal_transform
                            .transform_vector3(Vec3::from(normal))
                            .normalize_or_zero()
                    });
                    vertices.push(Vertex {
                        position: position.to_array(),
                        normal: normal.to_array(),
                        uv: uvs.next().unwrap_or_default(),
                        color: pbr.base_color_factor(),
                        cutoff,
                        blink: [0.0; 3],
                        mouth: [0.0; 3],
                    });
                }
                let bindings = morphs
                    .get(&(false, node.index()))
                    .or_else(|| morphs.get(&(true, mesh.index())));
                if let Some(bindings) = bindings {
                    for (target, (positions, _, _)) in reader.read_morph_targets().enumerate() {
                        for binding in bindings.iter().filter(|binding| binding.target == target) {
                            let Some(positions) = positions.clone() else {
                                continue;
                            };
                            if positions.len() != count {
                                return Err("Ungültiges VRM-Morphziel.".into());
                            }
                            for (vertex, delta) in vertices.iter_mut().zip(positions) {
                                let delta =
                                    transform.transform_vector3(Vec3::from(delta)) * binding.weight;
                                if !delta.is_finite() {
                                    return Err("Ungültiges VRM-Morphziel.".into());
                                }
                                let displacement = if binding.expression == 0 {
                                    &mut vertex.blink
                                } else {
                                    &mut vertex.mouth
                                };
                                *displacement = (Vec3::from(*displacement) + delta).to_array();
                            }
                            supported[binding.expression] = true;
                        }
                    }
                }
                let indices: Box<dyn ExactSizeIterator<Item = u32>> = match reader.read_indices() {
                    Some(indices) => Box::new(indices.into_u32()),
                    None if primitive.indices().is_none() => Box::new(0..count as u32),
                    None => return Err("Ungültige VRM-Indexdaten.".into()),
                };
                indices_left = indices_left
                    .checked_sub(indices.len())
                    .ok_or("Das VRM-Modell hat zu viele Indizes.")?;
                let indices: Vec<_> = indices.collect();
                if indices.len() < 3
                    || !indices.len().is_multiple_of(3)
                    || indices.iter().any(|&i| i as usize >= count)
                {
                    return Err("Ungültige VRM-Indexdaten.".into());
                }
                let texture = if let Some(info) = texture_info {
                    let source = info.texture().source();
                    let key = Some(source.index());
                    if let std::collections::hash_map::Entry::Vacant(entry) = textures.entry(key) {
                        let image = decode_texture(source, blob, &mut pixels)?;
                        entry.insert(upload(device, queue, &texture_layout, &sampler, &image));
                    }
                    key
                } else {
                    None
                };
                meshes.push(Mesh {
                    vertices: device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                        label: Some("VRM vertices"),
                        contents: bytemuck::cast_slice(&vertices),
                        usage: wgpu::BufferUsages::VERTEX,
                    }),
                    indices: device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                        label: Some("VRM indices"),
                        contents: bytemuck::cast_slice(&indices),
                        usage: wgpu::BufferUsages::INDEX,
                    }),
                    count: indices.len() as u32,
                    texture,
                });
            }
        }
        let radius = (max - min).length() * 0.5;
        if meshes.is_empty() || !radius.is_finite() || radius < 0.0001 {
            return Err("Das VRM-Modell enthält keine sichtbare Geometrie.".into());
        }
        let camera = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("VRM camera"),
            size: std::mem::size_of::<Camera>() as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let camera_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("VRM camera"),
            layout: &pipeline.get_bind_group_layout(0),
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: camera.as_entire_binding(),
            }],
        });
        let depth = device
            .create_texture(&wgpu::TextureDescriptor {
                label: Some("VRM depth"),
                size: extent(SIZE, SIZE),
                mip_level_count: 1,
                sample_count: 1,
                dimension: wgpu::TextureDimension::D2,
                format: DEPTH,
                usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
                view_formats: &[],
            })
            .create_view(&Default::default());
        Ok(Self {
            pipeline,
            camera,
            camera_group,
            depth,
            textures,
            meshes,
            center: min + (max - min) * 0.5,
            radius,
            front,
            controls: Controls {
                turn: true,
                animate: supported[0],
                mouth: supported[1],
            },
        })
    }

    pub fn render(
        &self,
        queue: &wgpu::Queue,
        encoder: &mut wgpu::CommandEncoder,
        target: &wgpu::TextureView,
        pose: Pose,
    ) {
        let (sin, cos) = (self.front + pose.angle.to_radians()).sin_cos();
        let eye = self.center + Vec3::new(sin, 0.0, cos) * (self.radius * 3.1 / pose.zoom);
        let view = Mat4::look_at_rh(eye, self.center, Vec3::Y);
        let projection = Mat4::perspective_rh(0.75, 1.0, self.radius * 0.02, self.radius * 20.0);
        let blink = pose.time.map_or(0.0, |time| {
            let phase = time.rem_euclid(3.4);
            (1.0 - (phase - 2.1).abs() / 0.14).max(0.0)
        });
        let camera = Camera {
            matrix: (projection * view).to_cols_array(),
            expressions: [blink, if pose.mouth { 1.0 } else { 0.0 }, 0.0, 0.0],
        };
        queue.write_buffer(&self.camera, 0, bytemuck::bytes_of(&camera));
        let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            color_attachments: &[Some(super::color(target, BACKGROUND))],
            depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                view: &self.depth,
                depth_ops: Some(wgpu::Operations {
                    load: wgpu::LoadOp::Clear(1.0),
                    store: wgpu::StoreOp::Discard,
                }),
                stencil_ops: None,
            }),
            ..Default::default()
        });
        pass.set_pipeline(&self.pipeline);
        pass.set_bind_group(0, &self.camera_group, &[]);
        for mesh in &self.meshes {
            pass.set_bind_group(1, &self.textures[&mesh.texture], &[]);
            pass.set_vertex_buffer(0, mesh.vertices.slice(..));
            pass.set_index_buffer(mesh.indices.slice(..), wgpu::IndexFormat::Uint32);
            pass.draw_indexed(0..mesh.count, 0, 0..1);
        }
    }
}

fn expression_morphs(
    extensions: &serde_json::Map<String, serde_json::Value>,
) -> HashMap<(bool, usize), Vec<Morph>> {
    let mut morphs = HashMap::<_, Vec<Morph>>::new();
    let mut add = |binding: &serde_json::Value, legacy: bool, expression| {
        let Some(owner) = binding[if legacy { "mesh" } else { "node" }].as_u64() else {
            return;
        };
        let Some(target) = binding["index"].as_u64() else {
            return;
        };
        let weight = binding["weight"].as_f64().unwrap_or_default() as f32;
        let weight = if legacy { weight / 100.0 } else { weight }.clamp(0.0, 1.0);
        if weight > 0.0 {
            morphs
                .entry((legacy, owner as usize))
                .or_default()
                .push(Morph {
                    target: target as usize,
                    weight,
                    expression,
                });
        }
    };
    if let Some(vrm) = extensions.get("VRMC_vrm") {
        for (expression, name) in ["blink", "aa"].into_iter().enumerate() {
            if let Some(bindings) =
                vrm["expressions"]["preset"][name]["morphTargetBinds"].as_array()
            {
                for binding in bindings.iter().take(64) {
                    add(binding, false, expression);
                }
            }
        }
    } else if let Some(groups) = extensions
        .get("VRM")
        .and_then(|vrm| vrm["blendShapeMaster"]["blendShapeGroups"].as_array())
    {
        for (expression, name) in ["blink", "a"].into_iter().enumerate() {
            if let Some(bindings) = groups
                .iter()
                .find(|group| group["presetName"].as_str() == Some(name))
                .and_then(|group| group["binds"].as_array())
            {
                for binding in bindings.iter().take(64) {
                    add(binding, true, expression);
                }
            }
        }
    }
    morphs
}

fn decode_texture(
    source: gltf::Image<'_>,
    blob: &[u8],
    pixels: &mut u64,
) -> Result<image::RgbaImage, String> {
    let gltf::image::Source::View { view, mime_type } = source.source() else {
        return Err("VRM-Texturen müssen eingebettet sein.".into());
    };
    let end = view
        .offset()
        .checked_add(view.length())
        .ok_or("Ungültiger VRM-Texturbereich.")?;
    let bytes = blob
        .get(view.offset()..end)
        .ok_or("Ungültiger VRM-Texturbereich.")?;
    let format = match mime_type {
        "image/png" => image::ImageFormat::Png,
        "image/jpeg" => image::ImageFormat::Jpeg,
        _ => return Err("Unbekanntes VRM-Texturformat.".into()),
    };
    let reader = || image::ImageReader::with_format(Cursor::new(bytes), format);
    let (width, height) = reader()
        .into_dimensions()
        .map_err(|error| format!("VRM-Textur: {error}"))?;
    *pixels += u64::from(width) * u64::from(height);
    if width > 4096 || height > 4096 || *pixels > 64 * 1024 * 1024 {
        return Err("Die VRM-Texturen überschreiten die Vorschaugrenze.".into());
    }
    let mut reader = reader();
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(4096);
    limits.max_image_height = Some(4096);
    limits.max_alloc = Some(128 * 1024 * 1024);
    reader.limits(limits);
    reader
        .decode()
        .map(|image| image.into_rgba8())
        .map_err(|error| format!("VRM-Textur: {error}"))
}

fn extent(width: u32, height: u32) -> wgpu::Extent3d {
    wgpu::Extent3d {
        width,
        height,
        depth_or_array_layers: 1,
    }
}

fn upload(
    device: &wgpu::Device,
    queue: &wgpu::Queue,
    layout: &wgpu::BindGroupLayout,
    sampler: &wgpu::Sampler,
    image: &image::RgbaImage,
) -> wgpu::BindGroup {
    let size = extent(image.width(), image.height());
    let texture = device.create_texture(&wgpu::TextureDescriptor {
        label: Some("VRM albedo"),
        size,
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: FORMAT,
        usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
        view_formats: &[],
    });
    queue.write_texture(
        texture.as_image_copy(),
        image.as_raw(),
        wgpu::TexelCopyBufferLayout {
            offset: 0,
            bytes_per_row: Some(image.width() * 4),
            rows_per_image: Some(image.height()),
        },
        size,
    );
    device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("VRM albedo"),
        layout,
        entries: &[
            wgpu::BindGroupEntry {
                binding: 0,
                resource: wgpu::BindingResource::TextureView(
                    &texture.create_view(&Default::default()),
                ),
            },
            wgpu::BindGroupEntry {
                binding: 1,
                resource: wgpu::BindingResource::Sampler(sampler),
            },
        ],
    })
}

fn pipeline(device: &wgpu::Device) -> wgpu::RenderPipeline {
    let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("VRM preview"),
        source: wgpu::ShaderSource::Wgsl(include_str!("avatar_vrm.wgsl").into()),
    });
    device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("VRM preview"),
        layout: None,
        vertex: wgpu::VertexState {
            module: &shader, entry_point: Some("vs_main"), compilation_options: Default::default(),
            buffers: &[Some(wgpu::VertexBufferLayout {
                array_stride: std::mem::size_of::<Vertex>() as u64, step_mode: wgpu::VertexStepMode::Vertex,
                attributes: &wgpu::vertex_attr_array![0 => Float32x3, 1 => Float32x3, 2 => Float32x2, 3 => Float32x4, 4 => Float32, 5 => Float32x3, 6 => Float32x3],
            })],
        },
        primitive: wgpu::PrimitiveState::default(),
        depth_stencil: Some(wgpu::DepthStencilState {
            format: DEPTH, depth_write_enabled: Some(true), depth_compare: Some(wgpu::CompareFunction::LessEqual),
            stencil: Default::default(), bias: Default::default(),
        }),
        multisample: Default::default(),
        fragment: Some(wgpu::FragmentState {
            module: &shader, entry_point: Some("fs_main"), compilation_options: Default::default(),
            targets: &[Some(wgpu::ColorTargetState { format: FORMAT, blend: Some(wgpu::BlendState::ALPHA_BLENDING), write_mask: wgpu::ColorWrites::ALL })],
        }),
        multiview_mask: None,
        cache: None,
    })
}
