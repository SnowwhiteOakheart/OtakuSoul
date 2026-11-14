//! The desktop pet's weather (umbrella in the rain, snow): only when the user switched it on and
//! typed a place. That place goes to Open-Meteo (no key, no account); nothing else does, and
//! nothing is stored besides the place's coordinates for this run.

use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use std::time::Duration;

/// What the sky does, coarse enough for the pet's props.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Sky {
    Clear,
    Cloudy,
    Fog,
    Rain,
    Snow,
    Storm,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PetWeather {
    pub sky: Sky,
    /// °C.
    pub temperature: f64,
    /// The place as the weather service named it.
    pub place: String,
}

/// WMO weather code → sky (see Open-Meteo's documentation).
pub fn sky_of(code: u32) -> Sky {
    match code {
        0..=2 => Sky::Clear,
        3 => Sky::Cloudy,
        45 | 48 => Sky::Fog,
        51..=67 | 80..=82 => Sky::Rain,
        71..=77 | 85 | 86 => Sky::Snow,
        95..=99 => Sky::Storm,
        _ => Sky::Cloudy,
    }
}

#[derive(Deserialize)]
struct Geo {
    results: Option<Vec<GeoPlace>>,
}

#[derive(Deserialize, Clone)]
struct GeoPlace {
    name: String,
    latitude: f64,
    longitude: f64,
}

#[derive(Deserialize)]
struct Forecast {
    current: Current,
}

#[derive(Deserialize)]
struct Current {
    temperature_2m: f64,
    weather_code: u32,
}

/// The last place looked up (typed text → coordinates), so only the weather is asked for again.
static PLACE: Mutex<Option<(String, GeoPlace)>> = Mutex::new(None);

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| crate::err!("backend.common.httpClient", error = e))
}

async fn place(client: &reqwest::Client, city: &str) -> Result<GeoPlace, String> {
    if let Ok(cached) = PLACE.lock()
        && let Some((name, place)) = cached.as_ref()
        && name == city
    {
        return Ok(place.clone());
    }
    let url = reqwest::Url::parse_with_params(
        "https://geocoding-api.open-meteo.com/v1/search",
        &[("name", city), ("count", "1"), ("format", "json")],
    )
    .map_err(|e| e.to_string())?;
    let geo: Geo = client
        .get(url)
        .send()
        .await
        .and_then(reqwest::Response::error_for_status)
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    let found = geo
        .results
        .and_then(|mut places| (!places.is_empty()).then(|| places.swap_remove(0)))
        .ok_or_else(|| format!("place not found: {city}"))?;
    if let Ok(mut cached) = PLACE.lock() {
        *cached = Some((city.to_owned(), found.clone()));
    }
    Ok(found)
}

/// The weather at `city` right now.
pub async fn weather(city: &str) -> Result<PetWeather, String> {
    let city = city.trim();
    if city.is_empty() || city.chars().count() > 80 {
        return Err("no place".into());
    }
    let client = client()?;
    let at = place(&client, city).await?;
    let url = reqwest::Url::parse_with_params(
        "https://api.open-meteo.com/v1/forecast",
        &[
            ("latitude", format!("{:.3}", at.latitude)),
            ("longitude", format!("{:.3}", at.longitude)),
            ("current", "temperature_2m,weather_code".to_owned()),
        ],
    )
    .map_err(|e| e.to_string())?;
    let forecast: Forecast = client
        .get(url)
        .send()
        .await
        .and_then(reqwest::Response::error_for_status)
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    Ok(PetWeather {
        sky: sky_of(forecast.current.weather_code),
        temperature: forecast.current.temperature_2m,
        place: at.name,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn weather_codes_map_to_props() {
        assert_eq!(sky_of(0), Sky::Clear);
        assert_eq!(sky_of(3), Sky::Cloudy);
        assert_eq!(sky_of(61), Sky::Rain);
        assert_eq!(sky_of(81), Sky::Rain);
        assert_eq!(sky_of(73), Sky::Snow);
        assert_eq!(sky_of(95), Sky::Storm);
        assert_eq!(sky_of(45), Sky::Fog);
    }
}
