use crate::avatar_native::{Avatar, Controls, Kind, Pose, Shared, render_frame};
use crate::ui_text::text as label;
use iced::widget::{button, column, container, image, row, scrollable, text};
use iced::{ContentFit, Element, Fill, Subscription, Task};
use std::{
    fmt,
    path::PathBuf,
    time::{Duration, Instant},
};

#[derive(Default)]
pub struct State {
    model: Option<Loaded>,
    pose: Pose,
    busy: bool,
    loading: bool,
    playing_since: Option<Instant>,
    error: Option<String>,
}

#[derive(Clone)]
pub struct Loaded {
    kind: Kind,
    path: PathBuf,
    renderer: Shared,
    frame: image::Handle,
    controls: Controls,
}

impl Loaded {
    fn open(kind: Kind, path: PathBuf) -> Result<Self, String> {
        let (renderer, frame) = Avatar::load(kind, &path)?;
        let controls = renderer
            .lock()
            .map_err(|error| error.to_string())?
            .controls();
        Ok(Self {
            kind,
            path,
            renderer,
            frame,
            controls,
        })
    }
}

impl fmt::Debug for Loaded {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("Loaded")
            .field("kind", &self.kind)
            .field("path", &self.path)
            .finish_non_exhaustive()
    }
}

#[derive(Debug, Clone)]
pub enum Action {
    Pick(Kind),
    Loaded(Result<Option<Loaded>, String>),
    Render(Pose),
    Rendered(Pose, Result<image::Handle, String>),
    TogglePlayback,
    Tick(Instant),
    Close,
}

impl State {
    pub fn subscription(&self) -> Subscription<Action> {
        if self.playing_since.is_some() {
            iced::time::every(Duration::from_millis(42)).map(Action::Tick)
        } else {
            Subscription::none()
        }
    }

    pub fn stop_playback(&mut self) {
        self.playing_since = None;
    }

    pub fn update(&mut self, action: Action) -> Task<Action> {
        match action {
            Action::Pick(kind) if !self.busy => {
                self.busy = true;
                self.loading = true;
                self.stop_playback();
                self.error = None;
                return Task::perform(
                    async move {
                        let dialog = rfd::AsyncFileDialog::new();
                        let dialog = match kind {
                            Kind::Vrm => dialog.add_filter("VRM", &["vrm"]),
                            Kind::Live2d => dialog.add_filter("Live2D (*.model3.json)", &["json"]),
                        };
                        let Some(file) = dialog.pick_file().await else {
                            return Ok(None);
                        };
                        let path = file.path().to_owned();
                        crate::background(move || Loaded::open(kind, path).map(Some)).await
                    },
                    Action::Loaded,
                );
            }
            Action::Loaded(result) => {
                self.busy = false;
                self.loading = false;
                match result {
                    Ok(Some(model)) => {
                        self.model = Some(model);
                        self.pose = Pose::default();
                    }
                    Ok(None) => {}
                    Err(error) => self.error = Some(error),
                }
            }
            Action::Render(pose) => return self.render(pose),
            Action::TogglePlayback => {
                if self.playing_since.is_some() {
                    self.stop_playback();
                } else if !self.busy
                    && self
                        .model
                        .as_ref()
                        .is_some_and(|model| model.controls.animate)
                {
                    self.playing_since = Some(Instant::now());
                }
            }
            Action::Tick(now) => {
                if let Some(started) = self.playing_since {
                    return self.render(Pose {
                        time: Some(now.saturating_duration_since(started).as_secs_f32()),
                        ..self.pose
                    });
                }
            }
            Action::Rendered(pose, result) => {
                self.busy = false;
                match result {
                    Ok(frame) => {
                        if let Some(model) = &mut self.model {
                            self.pose = Pose { time: None, ..pose };
                            model.frame = frame;
                        }
                    }
                    Err(error) => {
                        self.stop_playback();
                        self.error = Some(error);
                    }
                }
            }
            Action::Close if !self.busy => *self = Self::default(),
            _ => {}
        }
        Task::none()
    }

    fn render(&mut self, pose: Pose) -> Task<Action> {
        let Some(model) = self.model.as_ref().filter(|_| !self.busy) else {
            return Task::none();
        };
        self.busy = true;
        self.error = None;
        let renderer = model.renderer.clone();
        Task::perform(
            crate::background(move || render_frame(&renderer, pose)),
            move |result| Action::Rendered(pose, result),
        )
    }

    pub fn view(&self) -> Element<'_, Action> {
        let playing = self.playing_since.is_some();
        let enabled = !self.busy && !playing;
        let mut body = column![
            text(label("avatars.title")).size(28),
            text(label("avatars.native.intro")).size(15),
            row![
                button(label("avatars.native.openVrm"))
                    .on_press_maybe(enabled.then_some(Action::Pick(Kind::Vrm))),
                button(label("avatars.native.openLive2d"))
                    .on_press_maybe(enabled.then_some(Action::Pick(Kind::Live2d))),
            ]
            .spacing(8)
            .wrap(),
        ]
        .spacing(12)
        .width(Fill);
        if self.loading {
            body = body.push(text(label("avatars.native.loading")));
        }
        if let Some(error) = &self.error {
            body = body.push(text(error).size(14));
        }
        if let Some(model) = &self.model {
            let name = model.path.file_name().unwrap_or_default().to_string_lossy();
            let angle = |delta: f32| match model.kind {
                Kind::Vrm => (self.pose.angle + delta).rem_euclid(360.0),
                Kind::Live2d => (self.pose.angle + delta).clamp(-30.0, 30.0),
            };
            let rotate = |delta| {
                Action::Render(Pose {
                    angle: angle(delta),
                    ..self.pose
                })
            };
            let zoom = |factor: f32| {
                Action::Render(Pose {
                    zoom: (self.pose.zoom * factor).clamp(0.55, 2.5),
                    ..self.pose
                })
            };
            let (left, right, step) = match model.kind {
                Kind::Vrm => ("avatars.native.turnLeft", "avatars.native.turnRight", 20.0),
                Kind::Live2d => ("avatars.native.headLeft", "avatars.native.headRight", 15.0),
            };
            let mut controls = row![
                button(label("avatars.native.zoomIn"))
                    .on_press_maybe((enabled && self.pose.zoom < 2.5).then_some(zoom(1.25_f32))),
                button(label("avatars.native.zoomOut"))
                    .on_press_maybe((enabled && self.pose.zoom > 0.55).then_some(zoom(0.8_f32))),
                button(label("avatars.native.reset"))
                    .on_press_maybe(enabled.then_some(Action::Render(Pose::default()))),
            ]
            .spacing(8);
            if model.controls.turn {
                controls = controls
                    .push(button(label(left)).on_press_maybe(
                        (enabled && angle(-step) != self.pose.angle).then_some(rotate(-step)),
                    ))
                    .push(button(label(right)).on_press_maybe(
                        (enabled && angle(step) != self.pose.angle).then_some(rotate(step)),
                    ));
            }
            if model.controls.mouth {
                let key = if self.pose.mouth {
                    "avatars.native.mouthClose"
                } else {
                    "avatars.native.mouthOpen"
                };
                controls = controls.push(button(label(key)).on_press_maybe(enabled.then_some(
                    Action::Render(Pose {
                        mouth: !self.pose.mouth,
                        ..self.pose
                    }),
                )));
            }
            if model.controls.animate {
                let key = if playing {
                    "avatars.native.stop"
                } else {
                    "avatars.native.play"
                };
                controls =
                    controls
                        .push(button(label(key)).on_press_maybe(
                            (playing || enabled).then_some(Action::TogglePlayback),
                        ));
            }
            controls = controls.push(
                button(label("avatars.native.close"))
                    .on_press_maybe(enabled.then_some(Action::Close)),
            );
            body = body
                .push(text(format!("{} · {name}", model.kind.name())))
                .push(controls.wrap())
                .push(
                    container(
                        image(model.frame.clone())
                            .width(Fill)
                            .height(512)
                            .content_fit(ContentFit::Contain),
                    )
                    .width(Fill)
                    .style(container::rounded_box),
                );
        } else if !self.busy {
            body = body.push(text(label("avatars.native.empty")));
        }
        scrollable(body.padding(24)).width(Fill).height(Fill).into()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use iced::advanced::{
        layout::{Layout, Limits},
        mouse, renderer,
        renderer::Headless,
        widget::Tree,
    };
    use iced::{Color, Rectangle, Size};

    #[test]
    #[ignore = "benötigt einen WGPU-Grafikadapter"]
    fn displays_loaded_avatars_with_iced_wgpu() {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let mut renderer = runtime
            .block_on(iced::Renderer::new(
                crate::ui_font(),
                16.into(),
                Some("wgpu"),
            ))
            .expect("Iced-WGPU-Renderer");
        let mut app = crate::App {
            page: crate::Page::Avatars,
            ..Default::default()
        };
        let mut tree = Tree::new(app.view());
        let bounds = Size::new(1440.0, 900.0);
        let mut snapshot = |app: &crate::App| {
            let mut view = app.view();
            tree.diff(&view);
            renderer::Renderer::reset(&mut renderer, Rectangle::with_size(bounds));
            let node =
                view.as_widget_mut()
                    .layout(&mut tree, &renderer, &Limits::new(Size::ZERO, bounds));
            view.as_widget().draw(
                &tree,
                &mut renderer,
                &app.theme(),
                &renderer::Style::default(),
                Layout::new(&node),
                mouse::Cursor::Unavailable,
                &Rectangle::with_size(bounds),
            );
            renderer.screenshot(Size::new(1440, 900), 1.0, Color::BLACK)
        };
        let mut previous = snapshot(&app);
        let assets = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../assets");
        for (kind, file) in [
            (Kind::Vrm, "vrm/Seed-san.vrm"),
            (Kind::Live2d, "live2d/Hiyori/hiyori_free_t08.model3.json"),
        ] {
            let result = runtime.block_on(crate::background({
                let path = assets.join(file);
                move || Loaded::open(kind, path).map(Some)
            }));
            assert!(result.is_ok(), "{file}: {result:?}");
            let _ = app.update(crate::Message::Avatar(Action::Loaded(result)));
            let frame = snapshot(&app);
            assert!(frame != previous, "{file}: Iced-Vorschau ist unverändert");
            previous = frame;
        }
    }
}
