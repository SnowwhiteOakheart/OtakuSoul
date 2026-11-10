use super::{Controls, Pose, color, read};
use mocari::{
    assets::{RuntimeModel, load_model_runtime},
    core::Matrix44,
    json::Motion3,
    motion::MotionPlayer,
    render::wgpu::{
        WgpuClippingPlan, WgpuLive2dRenderer, WgpuMaskRenderTarget, WgpuMeshBuffers, WgpuTexture,
    },
};
use std::path::{Component, Path};

// Mocari samples Cubism's encoded color channels from Rgba8Unorm textures.
pub const FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8Unorm;
const BACKGROUND: wgpu::Color = wgpu::Color {
    r: 45.0 / 255.0,
    g: 52.0 / 255.0,
    b: 64.0 / 255.0,
    a: 1.0,
};

pub struct Live2d {
    model: RuntimeModel,
    renderer: WgpuLive2dRenderer,
    textures: Vec<WgpuTexture>,
    mask: WgpuMaskRenderTarget,
    center: [f32; 2],
    size: f32,
    idle: Option<MotionPlayer>,
    angle_parameter: Option<usize>,
    mouth_parameter: Option<usize>,
}

impl Live2d {
    pub fn controls(&self) -> Controls {
        Controls {
            turn: self.angle_parameter.is_some(),
            animate: self.idle.is_some(),
            mouth: self.mouth_parameter.is_some(),
        }
    }

    pub fn load(device: &wgpu::Device, queue: &wgpu::Queue, path: &Path) -> Result<Self, String> {
        let path = path
            .canonicalize()
            .map_err(|_| "Live2D-Datei nicht zugänglich.")?;
        let root = path.parent().ok_or("Live2D-Modellordner fehlt.")?;
        let json: serde_json::Value = serde_json::from_slice(&read(&path, 1024 * 1024)?)
            .map_err(|_| "Ungültige .model3.json-Datei.")?;
        let files = &json["FileReferences"];
        let moc = files["Moc"]
            .as_str()
            .ok_or("Der Live2D-Datei fehlt die Moc3-Referenz.")?;
        check_asset(root, moc, 64 * 1024 * 1024)?;
        for key in ["Physics", "Pose"] {
            if let Some(name) = files[key].as_str() {
                check_asset(root, name, 1024 * 1024)?;
            }
        }
        let textures = files["Textures"]
            .as_array()
            .filter(|textures| !textures.is_empty() && textures.len() <= 32)
            .ok_or("Die Live2D-Texturliste fehlt oder ist zu groß.")?;
        let mut pixels = 0u64;
        for texture in textures {
            let path = check_asset(
                root,
                texture.as_str().ok_or("Ungültiger Texturpfad.")?,
                32 * 1024 * 1024,
            )?;
            let (width, height) = image::ImageReader::open(path)
                .map_err(|_| "Live2D-Textur nicht lesbar.")?
                .with_guessed_format()
                .map_err(|_| "Live2D-Textur nicht lesbar.")?
                .into_dimensions()
                .map_err(|_| "Live2D-Textur nicht lesbar.")?;
            pixels += u64::from(width) * u64::from(height);
            if width > 4096 || height > 4096 || pixels > 32 * 1024 * 1024 {
                return Err("Die Live2D-Texturen überschreiten die Vorschaugrenze.".into());
            }
        }
        let model = load_model_runtime(&path).map_err(|error| error.to_string())?;
        let parameter = |names: [&str; 2]| {
            names
                .into_iter()
                .find_map(|name| model.runtime().parameter_index(name))
        };
        let angle_parameter = parameter(["ParamAngleX", "PARAM_ANGLE_X"]);
        let mouth_parameter = parameter(["ParamMouthOpenY", "PARAM_MOUTH_OPEN_Y"]);
        let renderer = WgpuLive2dRenderer::new(device, FORMAT);
        let textures = model
            .textures()
            .iter()
            .map(|texture| {
                renderer
                    .create_rgba8_texture(
                        device,
                        queue,
                        texture.width(),
                        texture.height(),
                        texture.rgba(),
                    )
                    .map_err(|error| error.to_string())
            })
            .collect::<Result<_, _>>()?;
        let mask = renderer
            .create_mask_render_target(device, 512)
            .map_err(|error| error.to_string())?;
        let mut min = [f32::INFINITY; 2];
        let mut max = [f32::NEG_INFINITY; 2];
        for position in model
            .runtime()
            .meshes()
            .iter()
            .flat_map(|mesh| mesh.vertices().iter().map(|vertex| vertex.position()))
        {
            for axis in 0..2 {
                min[axis] = min[axis].min(position[axis]);
                max[axis] = max[axis].max(position[axis]);
            }
        }
        let size = (max[0] - min[0]).max(max[1] - min[1]);
        if !size.is_finite() || size <= 0.0 {
            return Err("Das Live2D-Modell hat keine sichtbare Geometrie.".into());
        }
        let center = [(min[0] + max[0]) * 0.5, (min[1] + max[1]) * 0.5];
        let idle = files["Motions"]["Idle"][0]["File"]
            .as_str()
            .and_then(|name| {
                let path = check_asset(root, name, 2 * 1024 * 1024).ok()?;
                let source = String::from_utf8(read(&path, 2 * 1024 * 1024).ok()?).ok()?;
                let motion = Motion3::from_json_str(&source).ok()?;
                (motion.meta().duration() > 0.0).then(|| MotionPlayer::with_looping(motion, true))
            });
        Ok(Self {
            model,
            renderer,
            textures,
            mask,
            center,
            size,
            idle,
            angle_parameter,
            mouth_parameter,
        })
    }

    pub fn render(
        &mut self,
        device: &wgpu::Device,
        encoder: &mut wgpu::CommandEncoder,
        target: &wgpu::TextureView,
        pose: Pose,
    ) -> Result<(), String> {
        let runtime = self.model.runtime_mut();
        runtime.reset_parameters();
        runtime.reset_part_opacities();
        if let (Some(player), Some(time)) = (&mut self.idle, pose.time) {
            player.restart();
            player.tick(time);
            player.apply(runtime);
        } else if let Some(index) = self.angle_parameter {
            runtime.set_parameter_by_index(index, pose.angle.clamp(-30.0, 30.0));
        }
        if pose.mouth
            && let Some(index) = self.mouth_parameter
        {
            runtime.set_parameter_normalized_by_index(index, 1.0);
        }
        runtime
            .update_meshes()
            .ok_or("Live2D-Geometrie konnte nicht aktualisiert werden.")?;
        let mesh = WgpuMeshBuffers::from_drawables(device, runtime.meshes())
            .ok_or("Live2D-Geometrie konnte nicht vorbereitet werden.")?;
        let mut plan = WgpuClippingPlan::from_mesh_buffers(&mesh);
        plan.prepare_single_texture_masks(&mesh)
            .map_err(|error| error.to_string())?;
        let clipping = self
            .renderer
            .create_clipping_resources(device, &plan)
            .map_err(|error| error.to_string())?;
        let scale = 1.8 * pose.zoom / self.size;
        let mut matrix = Matrix44::identity();
        matrix.scale(scale, scale);
        matrix.translate(-self.center[0] * scale, -self.center[1] * scale);
        let transform = self.renderer.create_transform(device, &matrix);
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                color_attachments: &[Some(color(self.mask.view(), wgpu::Color::TRANSPARENT))],
                ..Default::default()
            });
            self.renderer
                .draw_masks_with_textures(&mut pass, &mesh, &clipping, &self.textures)
                .map_err(|error| error.to_string())?;
        }
        let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            color_attachments: &[Some(color(target, BACKGROUND))],
            ..Default::default()
        });
        self.renderer
            .draw_with_textures_clipping_and_transform(
                &mut pass,
                &mesh,
                &self.textures,
                &clipping,
                &self.mask,
                &transform,
            )
            .map(|_| ())
            .map_err(|error| error.to_string())
    }
}

fn check_asset(root: &Path, name: &str, limit: u64) -> Result<std::path::PathBuf, String> {
    let relative = Path::new(name);
    if relative.as_os_str().is_empty()
        || name.contains(':')
        || relative
            .components()
            .any(|component| !matches!(component, Component::Normal(_) | Component::CurDir))
    {
        return Err("Live2D-Dateien müssen im ausgewählten Modellordner liegen.".into());
    }
    let path = root
        .join(relative)
        .canonicalize()
        .map_err(|_| "Eine referenzierte Live2D-Datei fehlt.")?;
    if !path.starts_with(root) {
        return Err("Eine Live2D-Referenz zeigt außerhalb des Modellordners.".into());
    }
    let metadata = path.metadata().map_err(|_| "Live2D-Datei nicht lesbar.")?;
    if !metadata.is_file() || metadata.len() > limit {
        return Err("Eine Live2D-Datei überschreitet die Vorschaugrenze.".into());
    }
    Ok(path)
}
