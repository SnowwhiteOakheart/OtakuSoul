//! Dieselben Lucide-Symbole wie im React-Frontend, beim Build eingebettet.
//! Herkunft: lucide-react 1.70.0; Lizenz unter assets/icons/LICENSE.

use iced::widget::svg::{self, Svg};

#[derive(Clone, Copy, PartialEq)]
pub enum Icon {
    Home,
    Chat,
    Stage,
    Companion,
    Characters,
    Avatars,
    Lorebooks,
    Hub,
    Integrations,
    Settings,
    Collapse,
    Expand,
    Eye,
    Compact,
    Search,
    Copy,
    Send,
    Down,
    Plus,
    Close,
    Moon,
    Sun,
    Back,
    Help,
    Image,
    Attachment,
    Microphone,
}

pub fn icon(icon: Icon, size: u32) -> Svg<'static> {
    let bytes: &'static [u8] = match icon {
        Icon::Home => include_bytes!("../assets/icons/House.svg"),
        Icon::Chat => include_bytes!("../assets/icons/MessageSquare.svg"),
        Icon::Stage => include_bytes!("../assets/icons/Dice5.svg"),
        Icon::Companion => include_bytes!("../assets/icons/Bot.svg"),
        Icon::Characters => include_bytes!("../assets/icons/Users.svg"),
        Icon::Avatars => include_bytes!("../assets/icons/UserRound.svg"),
        Icon::Lorebooks => include_bytes!("../assets/icons/BookOpen.svg"),
        Icon::Hub => include_bytes!("../assets/icons/Compass.svg"),
        Icon::Integrations => include_bytes!("../assets/icons/Layers.svg"),
        Icon::Settings => include_bytes!("../assets/icons/Settings.svg"),
        Icon::Collapse => include_bytes!("../assets/icons/ChevronsLeft.svg"),
        Icon::Expand => include_bytes!("../assets/icons/ChevronsRight.svg"),
        Icon::Eye => include_bytes!("../assets/icons/Eye.svg"),
        Icon::Compact => include_bytes!("../assets/icons/Rows3.svg"),
        Icon::Search => include_bytes!("../assets/icons/Search.svg"),
        Icon::Copy => include_bytes!("../assets/icons/Copy.svg"),
        Icon::Send => include_bytes!("../assets/icons/Send.svg"),
        Icon::Down => include_bytes!("../assets/icons/ChevronDown.svg"),
        Icon::Plus => include_bytes!("../assets/icons/Plus.svg"),
        Icon::Close => include_bytes!("../assets/icons/X.svg"),
        Icon::Moon => include_bytes!("../assets/icons/Moon.svg"),
        Icon::Sun => include_bytes!("../assets/icons/Sun.svg"),
        Icon::Back => include_bytes!("../assets/icons/ArrowLeft.svg"),
        Icon::Help => include_bytes!("../assets/icons/CircleHelp.svg"),
        Icon::Image => include_bytes!("../assets/icons/Image.svg"),
        Icon::Attachment => include_bytes!("../assets/icons/Paperclip.svg"),
        Icon::Microphone => include_bytes!("../assets/icons/Mic.svg"),
    };
    Svg::new(svg::Handle::from_memory(bytes))
        .width(size)
        .height(size)
}
