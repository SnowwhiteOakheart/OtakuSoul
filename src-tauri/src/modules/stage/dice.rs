//! Dice formula parser and roller (`2d6+3`, advantage, DC checks).

use super::*;

pub fn roll_dice(
    formula_raw: &str,
    target_dc: Option<i32>,
    combatant: Option<&Combatant>,
) -> Result<DiceRollResult, String> {
    let clean = formula_raw.trim().replace(' ', "");
    if clean.is_empty() {
        return Err(crate::err!("backend.stage.diceEmpty"));
    }

    let parse_modifier = |m: &str| -> Result<i32, String> {
        if let Ok(val) = m.parse::<i32>() {
            Ok(val)
        } else {
            // Skill lookup (case-insensitive)
            if let Some(c) = combatant {
                let m_lower = m.to_lowercase();
                for (k, v) in &c.skills {
                    if k.to_lowercase() == m_lower {
                        return Ok(*v);
                    }
                }
            }
            // Just return 0 if it's a named skill we couldn't find, so you can still roll without error
            // Or return an error if it's strictly required
            // For now, if we cannot parse it, treat it as 0 to be safe and avoid panics, but maybe it's better to tell the user:
            Err("Ungültiger Modifikator oder unbekannte Fertigkeit".to_string())
        }
    };

    let (base_part, modifier) = if let Some(pos) = clean.find('+') {
        let (b, m) = clean.split_at(pos);
        let mod_val = parse_modifier(&m[1..])?;
        (b, mod_val)
    } else if let Some(pos) = clean.rfind('-') {
        let (b, m) = clean.split_at(pos);
        let mod_val = parse_modifier(&m[1..])?;
        (b, -mod_val)
    } else {
        (clean.as_str(), 0)
    };

    let parts: Vec<&str> = base_part.split(['d', 'D']).collect();
    if parts.len() != 2 {
        return Err(crate::err!("backend.stage.diceFormat", formula = clean));
    }

    let dice_count: u32 = if parts[0].is_empty() {
        1
    } else {
        parts[0]
            .parse()
            .map_err(|_| "Ungültige Anzahl der Würfel")?
    };

    let die_faces: u32 = parts[1]
        .parse()
        .map_err(|_| "Ungültige Seitenzahl des Würfels")?;

    if dice_count == 0 || dice_count > 100 {
        return Err(crate::err!("backend.stage.diceCount"));
    }
    if !(2..=1000).contains(&die_faces) {
        return Err(crate::err!("backend.stage.diceSides"));
    }

    let mut rng = rand::rng();
    let mut individual_rolls = Vec::with_capacity(dice_count as usize);
    let mut rolls_sum: i32 = 0;

    for _ in 0..dice_count {
        let roll: u32 = rng.random_range(1..=die_faces);
        rolls_sum += roll as i32;
        individual_rolls.push(roll);
    }

    let total_sum = rolls_sum + modifier;

    let is_critical_success = if dice_count == 1 && die_faces == 20 {
        individual_rolls[0] == 20
    } else if dice_count == 1 && die_faces == 100 {
        individual_rolls[0] <= 5
    } else if dice_count == 2 && die_faces == 6 {
        rolls_sum == 12
    } else {
        false
    };

    let is_critical_failure = if dice_count == 1 && die_faces == 20 {
        individual_rolls[0] == 1
    } else if dice_count == 1 && die_faces == 100 {
        individual_rolls[0] >= 96
    } else if dice_count == 2 && die_faces == 6 {
        rolls_sum == 2
    } else {
        false
    };

    let dc_check = target_dc.map(|dc| DcCheckResult {
        target_dc: dc,
        passed: if is_critical_success {
            true
        } else if is_critical_failure {
            false
        } else {
            total_sum >= dc
        },
        margin: total_sum - dc,
    });

    Ok(DiceRollResult {
        formula: clean,
        dice_count,
        die_faces,
        modifier,
        individual_rolls,
        sum: total_sum,
        is_critical_success,
        is_critical_failure,
        dc_check,
    })
}
