import type React from 'react';
import type { PetHands } from '../../avatar/handTimeline';
import type { PetWeather } from '../../../services/desktopPet';
import { BUILD_MS, type PetBuild, type PetFx } from '../petBehavior';

/**
 * Things around the figure, drawn by the pet window for every model format: effects (hearts,
 * stars, sparkles, confetti, a thought), what the hands hold (a letter, a book), a night cap, an
 * umbrella or a scarf with the weather, and a sandcastle beside it. Inside the figure's box, so
 * hops and the sitting drop move them along; positions are shares of the window's height.
 *
 * Every animation runs once (see `App.css`, `.pet-fx-*`): no endless repainting.
 */
interface PetPropsProps {
  /** Top of the head and its lower end, and where the feet stand (shares of the window height). */
  headTop: number;
  headEnd: number;
  feetLine: number;
  /** Window height (logical px): sizes follow the figure. */
  height: number;
  fx: PetFx | null;
  hands: PetHands | null;
  build: PetBuild | null;
  /** Night cap (props on, at night, upright). */
  nightCap: boolean;
  /** Weather props (umbrella, scarf); null without weather. */
  sky: PetWeather['sky'] | null;
  /** What it thinks of when hungry (its favourite food, if known). */
  foodGlyph: string;
}

const pct = (share: number) => `${share * 100}%`;

/** A spot at `x` (window heights from the middle) and `y` (share from the top). */
const at = (x: number, y: number, height: number): React.CSSProperties => ({
  left: `calc(50% + ${Math.round(x * height)}px)`,
  top: pct(y),
});

function Effect({ fx, headTop, height, foodGlyph }: { fx: PetFx; headTop: number; height: number; foodGlyph: string }) {
  const size = Math.max(14, Math.round(height * 0.05));
  const above = headTop - 0.04;
  switch (fx.kind) {
    case 'hearts':
      return (
        <>
          {[-0.05, 0.03, 0.08, -0.02].map((x, i) => (
            <span
              key={`${fx.id}-${i}`}
              className="pet-fx pet-fx-rise"
              style={{ ...at(x, above + 0.02, height), fontSize: size * (i % 2 ? 0.8 : 1), animationDelay: `${i * 0.25}s`, ['--pet-fx-dx' as string]: `${x * 60}px` }}
            >
              {i % 2 ? '💗' : '💕'}
            </span>
          ))}
        </>
      );
    case 'dizzy':
      return (
        <>
          {['💫', '⭐', '💫'].map((glyph, i) => (
            <span
              key={`${fx.id}-${i}`}
              className="pet-fx pet-fx-orbit"
              style={{
                ...at(0, above + 0.03, height),
                fontSize: size * 0.8,
                animationDelay: `${-i * 0.33}s`,
                ['--pet-fx-r' as string]: `${Math.round(height * 0.06)}px`,
              }}
            >
              {glyph}
            </span>
          ))}
        </>
      );
    case 'sparkle':
      return (
        <>
          {[
            [-0.12, 0.45],
            [0.11, 0.35],
            [0.02, 0.2],
          ].map(([x, y], i) => (
            <span
              key={`${fx.id}-${i}`}
              className="pet-fx pet-fx-pop"
              style={{ ...at(x!, y!, height), fontSize: size, animationDelay: `${i * 0.12}s` }}
            >
              ✨
            </span>
          ))}
        </>
      );
    case 'confetti':
      return (
        <>
          <span className="pet-fx pet-fx-pop" style={{ ...at(0.1, above, height), fontSize: size * 1.2 }}>
            🎉
          </span>
          {Array.from({ length: 10 }, (_, i) => (
            <span
              key={`${fx.id}-${i}`}
              className="pet-fx pet-fx-fall"
              style={{
                ...at(((i % 5) - 2) * 0.05, above - 0.02, height),
                width: 5,
                height: 8,
                borderRadius: 2,
                background: ['#f472b6', '#facc15', '#38bdf8', '#4ade80', '#c084fc'][i % 5],
                animationDelay: `${(i % 4) * 0.12}s`,
                ['--pet-fx-dx' as string]: `${((i * 37) % 60) - 30}px`,
                ['--pet-fx-spin' as string]: `${i % 2 ? 260 : -200}deg`,
              }}
            />
          ))}
        </>
      );
    case 'thinkFood':
    case 'thinkPlay':
      return (
        <span
          key={fx.id}
          className="pet-fx pet-fx-think flex items-center gap-0.5 rounded-full bg-white/90 px-1.5 py-1 shadow"
          style={{ ...at(0.12, above - 0.02, height), fontSize: size * 0.85 }}
        >
          <span aria-hidden>💭</span>
          <span aria-hidden>{fx.kind === 'thinkFood' ? foodGlyph : '🎈'}</span>
        </span>
      );
    default:
      return null;
  }
}

/** A night cap drawn over the head top (an SVG: there is no such emoji). */
function NightCap({ headTop, height }: { headTop: number; height: number }) {
  const width = Math.round(height * 0.17);
  return (
    <svg
      className="pet-fx"
      style={{ ...at(0.015, headTop + 0.005, height), width, height: width, transform: 'translate(-50%, -62%) rotate(14deg)' }}
      viewBox="0 0 40 40"
      aria-hidden
    >
      <path d="M4 30 Q12 6 30 4 Q26 16 34 26 Z" fill="#6366f1" />
      <path d="M2 30 Q20 24 36 28 L36 33 Q20 29 2 35 Z" fill="#e0e7ff" />
      <circle cx="31" cy="5" r="4" fill="#fde68a" />
    </svg>
  );
}

export function PetProps({ headTop, headEnd, feetLine, height, fx, hands, build, nightCap, sky, foodGlyph }: PetPropsProps) {
  const size = Math.max(16, Math.round(height * 0.06));
  const chest = headEnd + 0.13;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0" data-pet-props>
      {nightCap && <NightCap headTop={headTop} height={height} />}
      {(sky === 'rain' || sky === 'storm') && (
        <span className="pet-fx pet-prop-in" style={{ ...at(-0.04, headTop - 0.08, height), fontSize: size * 1.8 }}>
          ☂️
        </span>
      )}
      {sky === 'snow' && (
        <span className="pet-fx pet-prop-in" style={{ ...at(0, headEnd + 0.025, height), fontSize: size * 0.9 }}>
          🧣
        </span>
      )}
      {hands?.kind === 'carry' && (
        <span className="pet-fx pet-prop-in" style={{ ...at(-0.07, chest, height), fontSize: size }}>
          ✉️
        </span>
      )}
      {hands?.kind === 'read' && (
        <span className="pet-fx pet-prop-in" style={{ ...at(0, chest + 0.02, height), fontSize: size * 1.1 }}>
          📖
        </span>
      )}
      {build && (
        <span
          key={build.id}
          className="pet-fx pet-build"
          style={{ ...at(build.side * 0.2, feetLine, height), fontSize: size * 1.3, ['--pet-build-ms' as string]: `${BUILD_MS}ms` }}
        >
          🏰
        </span>
      )}
      {fx && <Effect key={fx.id} fx={fx} headTop={headTop} height={height} foodGlyph={foodGlyph} />}
    </div>
  );
}
