import React, { useEffect, useLayoutEffect, useRef } from 'react';
import type { PetFigure } from './avatarStage';
import { TalkingOverlay, useTalkingSet } from './TalkingPortrait';
import type { LoopRole } from '../../utils/avatarGestures';
import { DEFAULT_PET_FRAMING, PET_FEET_SHARE, type PetFraming } from '../../services/avatarViewState';

/** Share of the pet window's height the portrait fills (the top fifth stays free for speech bubbles). */
const HEIGHT_SHARE = 0.78;
/** Share of the window's width at most. */
const WIDTH_SHARE = 0.92;
/** Where the face ends in the round portrait (share of its height from the top): above it counts as head. */
const HEAD_SHARE = 0.62;
/** How far the walk tilts the round portrait (radians per radian of turn). */
const TILT = 0.12;

interface PortraitPetProps {
  /** The character's portrait picture (data URL). */
  src: string;
  /** The figure, for its speaking portrait (mouth shapes and blinking, if set up). */
  characterId?: string;
  isSpeaking?: boolean;
  /** Desktop pet link: receives the figure's controls once it is shown. */
  pet: { onStage: (figure: PetFigure | null) => void };
  loop?: LoopRole | null;
}

/**
 * The desktop pet for figures without a 3D, Live2D or Inochi2D model: the portrait picture in a
 * round frame at the window's bottom. It breathes, bobs while it speaks and tilts when it walks;
 * clicks count only on the circle.
 */
export const PortraitPet: React.FC<PortraitPetProps> = ({ src, characterId, isSpeaking = false, pet, loop = null }) => {
  const talking = useTalkingSet(characterId, src);
  const containerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const petRef = useRef(pet);
  useLayoutEffect(() => {
    petRef.current = pet;
  }, [pet]);

  useEffect(() => {
    const container = containerRef.current;
    const frame = frameRef.current;
    if (!container || !frame) return undefined;
    let framing: PetFraming = DEFAULT_PET_FRAMING;
    let paused = false;

    /** Diameter, centre and top of the circle for the current window size and framing. */
    const geometry = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      const size = Math.min(height * HEIGHT_SHARE, width * WIDTH_SHARE) * framing.zoom;
      const bottom = height * (1 - PET_FEET_SHARE - framing.lift);
      return { size, centreX: width / 2, top: bottom - size, height };
    };
    const place = () => {
      const { size, top } = geometry();
      frame.style.width = `${size}px`;
      frame.style.height = `${size}px`;
      frame.style.left = `calc(50% - ${size / 2}px)`;
      frame.style.top = `${top}px`;
    };
    place();
    const resize = new ResizeObserver(place);
    resize.observe(container);

    const figure: PetFigure = {
      // Nothing to look with; the pet window still writes to it.
      mouse: { x: 0, y: 0 },
      probe: (x, y, onResult) => {
        const { size, centreX, top } = geometry();
        const radius = size / 2;
        onResult(!paused && (x - centreX) ** 2 + (y - (top + radius)) ** 2 <= radius ** 2);
      },
      setPaused: (next) => {
        paused = next;
        frame.style.visibility = next ? 'hidden' : 'visible';
      },
      // Breathing is a CSS animation of the compositor; there is no frame rate to lower.
      setSaver: (saver) => {
        frame.style.animationPlayState = saver ? 'paused' : 'running';
      },
      // Only CSS animations: nothing drawn per frame, nothing to swing.
      setFrameRate: () => {},
      addWindowMove: () => {},
      setTurn: (yaw) => {
        frame.style.rotate = `${yaw * TILT}rad`;
      },
      setFraming: (next) => {
        framing = next;
        place();
      },
      headLine: () => {
        const { size, top, height } = geometry();
        return height > 0 ? (top + size * HEAD_SHARE) / height : null;
      },
      // A picture has no hands.
      handAt: () => false,
    };
    petRef.current.onStage(figure);
    return () => {
      resize.disconnect();
      petRef.current.onStage(null);
    };
  }, []);

  return (
    <div ref={containerRef} className="absolute inset-0">
      <div
        ref={frameRef}
        className={`absolute overflow-hidden rounded-full border-2 border-white/70 shadow-xl ${
          isSpeaking ? 'pet-portrait-talk' : loop === 'sit' ? '' : 'pet-portrait-breath'
        }`}
      >
        <img src={src} alt="" draggable={false} className="h-full w-full object-cover" />
        {talking && <TalkingOverlay set={talking} isSpeaking={isSpeaking} />}
      </div>
    </div>
  );
};

export default PortraitPet;
