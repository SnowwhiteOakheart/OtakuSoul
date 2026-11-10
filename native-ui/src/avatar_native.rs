//! Lokaler GPU-Renderer für die native Avataransicht.
use iced::widget::image::Handle;
use std::{
    fs::{self, File},
    io::Read,
    path::Path,
    sync::{Arc, Mutex},
};

#[path = "avatar_live2d.rs"]
mod live2d;
#[path = "avatar_vrm.rs"]
mod vrm;

pub const SIZE: u32 = 512;
const EXTENT: wgpu::Extent3d = wgpu::Extent3d {
    width: SIZE,
    height: SIZE,
    depth_or_array_layers: 1,
};
pub type Shared = Arc<Mutex<Avatar>>;

#[derive(Debug, Clone, Copy)]
pub struct Controls {
    pub turn: bool,
    pub animate: bool,
    pub mouth: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    Vrm,
    Live2d,
}

impl Kind {
    pub fn name(self) -> &'static str {
        match self {
            Self::Vrm => "VRM",
            Self::Live2d => "Live2D",
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct Pose {
    pub angle: f32,
    pub zoom: f32,
    pub time: Option<f32>,
    pub mouth: bool,
}

impl Default for Pose {
    fn default() -> Self {
        Self {
            angle: 0.0,
            zoom: 1.0,
            time: None,
            mouth: false,
        }
    }
}

pub struct Avatar {
    device: wgpu::Device,
    queue: wgpu::Queue,
    model: Model,
    target: wgpu::Texture,
    view: wgpu::TextureView,
    readback: wgpu::Buffer,
}

enum Model {
    Vrm(Box<vrm::Vrm>),
    Live2d(Box<live2d::Live2d>),
}

impl Avatar {
    pub fn controls(&self) -> Controls {
        match &self.model {
            Model::Vrm(model) => model.controls(),
            Model::Live2d(model) => model.controls(),
        }
    }

    pub fn load(kind: Kind, path: &Path) -> Result<(Shared, Handle), String> {
        let name = path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase();
        let suffix = match kind {
            Kind::Vrm => ".vrm",
            Kind::Live2d => ".model3.json",
        };
        if !name.ends_with(suffix) {
            return Err(format!(
                "Bitte eine Datei mit der Endung {suffix} auswählen."
            ));
        }
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .map_err(|error| error.to_string())?;
        let mut descriptor = wgpu::InstanceDescriptor::new_without_display_handle();
        if cfg!(target_os = "windows") {
            // Iced may already have created a D3D12 device. Enabling the D3D12
            // debug layer afterwards invalidates that device.
            descriptor.flags.remove(
                wgpu::InstanceFlags::VALIDATION | wgpu::InstanceFlags::GPU_BASED_VALIDATION,
            );
        }
        let instance = wgpu::Instance::new(descriptor);
        let adapter = runtime
            .block_on(instance.request_adapter(&wgpu::RequestAdapterOptions::default()))
            .map_err(|error| format!("Kein Grafikadapter für die native Avataransicht: {error}"))?;
        let (device, queue) = runtime
            .block_on(adapter.request_device(&wgpu::DeviceDescriptor::default()))
            .map_err(|error| format!("Grafikgerät konnte nicht geöffnet werden: {error}"))?;
        let model = match kind {
            Kind::Vrm => Model::Vrm(Box::new(vrm::Vrm::load(&device, &queue, path)?)),
            Kind::Live2d => Model::Live2d(Box::new(live2d::Live2d::load(&device, &queue, path)?)),
        };
        let format = match kind {
            Kind::Vrm => vrm::FORMAT,
            Kind::Live2d => live2d::FORMAT,
        };
        let target = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("OtakuSoul avatar frame"),
            size: EXTENT,
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
            view_formats: &[],
        });
        let view = target.create_view(&Default::default());
        let readback = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("OtakuSoul avatar readback"),
            size: u64::from(SIZE * SIZE * 4),
            usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let mut avatar = Self {
            device,
            queue,
            model,
            target,
            view,
            readback,
        };
        let pixels = avatar.render(Pose::default())?;
        Ok((Arc::new(Mutex::new(avatar)), pixels))
    }

    pub fn render(&mut self, pose: Pose) -> Result<Handle, String> {
        let mut encoder = self.device.create_command_encoder(&Default::default());
        match &mut self.model {
            Model::Vrm(model) => model.render(&self.queue, &mut encoder, &self.view, pose),
            Model::Live2d(model) => model.render(&self.device, &mut encoder, &self.view, pose)?,
        }
        encoder.copy_texture_to_buffer(
            self.target.as_image_copy(),
            wgpu::TexelCopyBufferInfo {
                buffer: &self.readback,
                layout: wgpu::TexelCopyBufferLayout {
                    offset: 0,
                    bytes_per_row: Some(SIZE * 4),
                    rows_per_image: Some(SIZE),
                },
            },
            EXTENT,
        );
        let submission = self.queue.submit([encoder.finish()]);
        let pixels = self.read_pixels(submission);
        self.readback.unmap();
        Ok(Handle::from_rgba(SIZE, SIZE, pixels?))
    }

    fn read_pixels(&self, submission: wgpu::SubmissionIndex) -> Result<Vec<u8>, String> {
        let slice = self.readback.slice(..);
        let (send, receive) = std::sync::mpsc::channel();
        slice.map_async(wgpu::MapMode::Read, move |result| {
            let _ = send.send(result);
        });
        self.device
            .poll(wgpu::PollType::Wait {
                submission_index: Some(submission),
                timeout: Some(std::time::Duration::from_secs(12)),
            })
            .map_err(|error| error.to_string())?;
        receive
            .recv_timeout(std::time::Duration::from_secs(1))
            .map_err(|error| error.to_string())?
            .map_err(|error| error.to_string())?;
        Ok(slice
            .get_mapped_range()
            .map_err(|error| error.to_string())?
            .to_vec())
    }
}

pub fn render_frame(avatar: &Shared, pose: Pose) -> Result<Handle, String> {
    avatar
        .lock()
        .map_err(|_| "Der Avatar-Renderer wurde unterbrochen.")?
        .render(pose)
}

fn read(path: &Path, max_bytes: u64) -> Result<Vec<u8>, String> {
    let metadata = fs::metadata(path).map_err(|_| "Eine Avatar-Datei ist nicht zugänglich.")?;
    if !metadata.is_file() || metadata.len() > max_bytes {
        return Err("Eine Avatar-Datei ist zu groß oder kein regulärer Dateieintrag.".into());
    }
    let mut bytes = Vec::new();
    File::open(path)
        .and_then(|file| file.take(max_bytes + 1).read_to_end(&mut bytes))
        .map_err(|_| "Eine Avatar-Datei konnte nicht gelesen werden.")?;
    if bytes.len() as u64 > max_bytes {
        return Err("Eine Avatar-Datei überschreitet die Vorschaugrenze.".into());
    }
    Ok(bytes)
}

fn color(view: &wgpu::TextureView, clear: wgpu::Color) -> wgpu::RenderPassColorAttachment<'_> {
    wgpu::RenderPassColorAttachment {
        view,
        depth_slice: None,
        resolve_target: None,
        ops: wgpu::Operations {
            load: wgpu::LoadOp::Clear(clear),
            store: wgpu::StoreOp::Store,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore = "benötigt einen WGPU-Grafikadapter"]
    fn renders_bundled_avatars_without_a_window() {
        let assets = Path::new(env!("CARGO_MANIFEST_DIR")).join("../assets");
        for (kind, file) in [
            (Kind::Vrm, "vrm/Seed-san.vrm"),
            (Kind::Vrm, "vrm/Anime Girl.vrm"),
            (Kind::Live2d, "live2d/Hiyori/hiyori_free_t08.model3.json"),
            (Kind::Live2d, "live2d/haru/haru.model3.json"),
        ] {
            let (renderer, first) = Avatar::load(kind, &assets.join(file))
                .unwrap_or_else(|error| panic!("{file}: {error}"));
            let second = render_frame(
                &renderer,
                Pose {
                    angle: 25.0,
                    ..Pose::default()
                },
            )
            .unwrap();
            let rgba = |handle| match handle {
                Handle::Rgba {
                    pixels,
                    width: SIZE,
                    height: SIZE,
                    ..
                } => pixels,
                _ => panic!("Erwartet wurde ein RGBA-Frame mit {SIZE} × {SIZE} Pixeln."),
            };
            let first = rgba(first);
            let visible = first
                .as_chunks::<4>()
                .0
                .iter()
                .filter(|pixel| *pixel != &first[..4])
                .count();
            assert!(visible > 1000, "{file}: nur {visible} sichtbare Pixel");
            let second = rgba(second);
            assert!(
                first.as_ref() != second.as_ref(),
                "{file}: Drehung ändert kein Pixel"
            );
            let controls = renderer.lock().unwrap().controls();
            assert!(
                controls.turn && controls.animate && controls.mouth,
                "{file}: {controls:?}"
            );
            let animated = rgba(
                render_frame(
                    &renderer,
                    Pose {
                        time: Some(2.1),
                        ..Pose::default()
                    },
                )
                .unwrap(),
            );
            assert!(
                first.as_ref() != animated.as_ref(),
                "{file}: Animation ändert kein Pixel"
            );
            let mouth = rgba(
                render_frame(
                    &renderer,
                    Pose {
                        mouth: true,
                        ..Pose::default()
                    },
                )
                .unwrap(),
            );
            assert!(
                first.as_ref() != mouth.as_ref(),
                "{file}: Mundstellung ändert kein Pixel"
            );
            if let Some(directory) = std::env::var_os("OTAKUSOUL_AVATAR_TEST_FRAMES") {
                let path = Path::new(&directory)
                    .join(Path::new(file).file_stem().unwrap())
                    .with_extension("png");
                image::save_buffer(path, &first, SIZE, SIZE, image::ColorType::Rgba8).unwrap();
            }
            eprintln!("{file}: {visible} sichtbare Pixel, Drehung geprüft");
        }
    }
}
