import { useCallback, useEffect, useRef } from 'react';
import type React from 'react';
import { emitTo } from '@tauri-apps/api/event';
import {
  availableMonitors,
  currentMonitor,
  getCurrentWindow,
  LogicalSize,
  monitorFromPoint,
  PhysicalPosition,
} from '@tauri-apps/api/window';
import type { PetFigure } from '../../avatar/avatarStage';
import { PET_EDGE_SINK } from '../../../services/avatarViewState';
import {
  clampPetHeight,
  loadPetPlacement,
  PET_RESIZE_EVENT,
  petWindowSize,
  savePetModelHeight,
  savePetPlacement,
  type PetPrefs,
} from '../../../services/desktopPet';
import { bubbleSide, type BubbleSide, type PetBehavior, type PetSeat } from '../petBehavior';
import { planJump, stepBody, throwVelocity, walkArea, type Body, type Platform, type Rect } from '../petPhysics';
import {
  AREA_REFRESH_MS,
  COME_NEAR_PX,
  DRAG_GIVE_UP_MS,
  DRAG_SETTLE_MS,
  JUMP_CHECK_TICKS,
  PHYSICS_TICK_MS,
  PLACEMENT_SAVE_MS,
  SINK_EASE,
  THROW_STILL_MS,
  THROW_WINDOW_MS,
  WHEEL_STEP,
  within,
} from './petConstants';

export interface DragState {
  startedAt: number;
  movedAt: number;
  ending?: boolean;
  /** Recent pointer positions (physical px, backend ms), for the speed of a throw. */
  samples: { t: number; x: number; y: number }[];
}

interface UsePetWindowPhysicsArgs {
  behavior: PetBehavior;
  prefsRef: React.RefObject<PetPrefs>;
  awayRef: React.RefObject<boolean>;
  stageRef: React.RefObject<PetFigure | null>;
  figureRef: React.RefObject<HTMLDivElement | null>;
  seatRef: React.RefObject<PetSeat | null>;
  modelRef: React.RefObject<string>;
}

/**
 * Manages the pet window's desktop position, multi-monitor work areas, falling/walking physics,
 * edge sinking, drag settling/throwing, "Komm her" movement and Ctrl+wheel resizing.
 */
export function usePetWindowPhysics({
  behavior,
  prefsRef,
  awayRef,
  stageRef,
  figureRef,
  seatRef,
  modelRef,
}: UsePetWindowPhysicsArgs) {
  /** How far the window has sunk below where the figure stands (physical px): legs hanging off an edge. */
  const sink = useRef(0);
  /** Where the physics last put the window (physical px). */
  const placed = useRef({ x: Number.NaN, y: Number.NaN });
  /** Desktop physics: the window (physical px), its size, the floor's work area and the scale. */
  const body = useRef<Body | null>(null);
  const windowSize = useRef({ width: 0, height: 0 });
  const area = useRef<Rect | null>(null);
  /** Work areas of all monitors: the figure walks over to one that continues to the side. */
  const monitors = useRef<Rect[]>([]);
  const monitorScale = useRef(1);
  const walkDirection = useRef<-1 | 0 | 1>(0);
  /** Top edges of the other windows to stand on (empty outside Windows). */
  const platforms = useRef<Platform[]>([]);
  const placementSavedAt = useRef(0);
  /** Last global pointer position (physical px), for "Komm her". */
  const lastCursor = useRef<{ x: number; y: number } | null>(null);
  /** Window height (logical px) and the resize running now with the next wish waiting. */
  const heightRef = useRef(loadPetPlacement().height);
  const resizing = useRef<{ busy: boolean; next: number | null }>({ busy: false, next: null });
  /** Where "Komm her" walks to (physical x of the pointer) and which way, null when not called. */
  const comeTarget = useRef<{ x: number; direction: -1 | 1 } | null>(null);
  const drag = useRef<DragState | null>(null);

  /** Reads where the window stands and the work area of the monitor under its feet. */
  const syncWindow = useCallback(async () => {
    const win = getCurrentWindow();
    const [position, size, factor] = await within(Promise.all([win.outerPosition(), win.outerSize(), win.scaleFactor()]));
    const monitor =
      (await within(monitorFromPoint(position.x + size.width / 2, position.y + size.height - 1)).catch(() => null)) ??
      (await within(currentMonitor()).catch(() => null));
    // The window may have sunk below the figure's feet (sitting on an edge).
    body.current = { x: position.x, y: position.y - sink.current, vy: 0, support: null, edge: null };
    placed.current = { x: position.x, y: position.y };
    windowSize.current = { width: size.width, height: size.height };
    monitorScale.current = factor;
    if (monitor) {
      const { position: at, size: extent } = monitor.workArea;
      area.current = { x: at.x, y: at.y, width: extent.width, height: extent.height };
    }
    const all = await within(availableMonitors()).catch(() => null);
    if (all) {
      monitors.current = all.map(({ workArea }) => ({
        x: workArea.position.x,
        y: workArea.position.y,
        width: workArea.size.width,
        height: workArea.size.height,
      }));
    }
  }, []);

  /** The behaviour wants to jump: launch towards the nearest reachable window edge, if there still is one. */
  const startJump = useCallback(
    (now: number) => {
      const current = body.current;
      if (!prefsRef.current.physics || !current || !area.current) return;
      const size = windowSize.current;
      const plan = planJump(
        current,
        size,
        walkArea(monitors.current, current.x + size.width / 2, area.current),
        monitorScale.current,
        platforms.current,
      );
      if (!plan) return;
      body.current = { ...current, vx: plan.vx, vy: plan.vy, support: null, edge: null };
      behavior.jumped(now);
    },
    [behavior, prefsRef],
  );

  /**
   * The drag is over: the physics takes over where the figure was let go. With `fling`, the
   * speed of the last moves goes along (a throw), if the mouse was still moving at release.
   */
  const finishDrag = useCallback(
    (fling: boolean) => {
      const dragging = drag.current;
      if (!dragging || dragging.ending) return;
      dragging.ending = true;
      // The last sample is the release; the last move is where the position last changed.
      const samples = dragging.samples;
      const release = samples[samples.length - 1];
      let moved = samples.length - 1;
      while (moved > 0 && samples[moved]!.x === samples[moved - 1]!.x && samples[moved]!.y === samples[moved - 1]!.y) {
        moved -= 1;
      }
      const lastMove = samples[moved];
      const recent =
        release && lastMove && release.t - lastMove.t <= THROW_STILL_MS
          ? samples.slice(0, moved + 1).filter((s) => lastMove.t - s.t <= THROW_WINDOW_MS)
          : [];
      const speed = fling ? throwVelocity(recent, monitorScale.current) : { vx: 0, vy: 0 };
      void syncWindow()
        .catch(() => {})
        .finally(() => {
          if (body.current) {
            body.current.vx = speed.vx;
            body.current.vy = speed.vy;
          }
          drag.current = null;
          behavior.dragEnd(performance.now());
        });
    },
    [behavior, syncWindow],
  );

  // Desktop physics: falling to the floor above the taskbar, walking, turning at the walls.
  useEffect(() => {
    let last = performance.now();
    let moving = false;
    let jumpCheck = 0;
    const step = window.setInterval(() => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const current = body.current;
      if (
        !prefsRef.current.physics ||
        awayRef.current ||
        drag.current ||
        resizing.current.busy ||
        !current ||
        !area.current ||
        moving
      ) {
        return;
      }
      const result = stepBody(
        current,
        windowSize.current,
        walkArea(monitors.current, current.x + windowSize.current.width / 2, area.current),
        dt,
        walkDirection.current,
        monitorScale.current,
        platforms.current,
        prefsRef.current.rideWindows,
      );
      behavior.setGrounded(result.grounded, now);
      behavior.setOnWindow(result.body.support !== null);
      // About once a second: is a window's edge within jumping reach?
      if (++jumpCheck % JUMP_CHECK_TICKS === 0 && result.grounded) {
        behavior.setCanJump(
          planJump(
            result.body,
            windowSize.current,
            walkArea(monitors.current, result.body.x + windowSize.current.width / 2, area.current),
            monitorScale.current,
            platforms.current,
          ) !== null,
        );
      }
      if (result.wall) behavior.bumped(result.wall, now);
      // Sitting on an edge: the window sinks below it so the hanging legs show (eased like the pose).
      const sinkGoal = seatRef.current === 'edge' ? PET_EDGE_SINK * windowSize.current.height : 0;
      sink.current =
        Math.abs(sinkGoal - sink.current) < 1 ? sinkGoal : sink.current + (sinkGoal - sink.current) * SINK_EASE;
      const [x, y] = [Math.round(result.body.x), Math.round(result.body.y + sink.current)];
      // Arms and hair swing with the window's moves.
      stageRef.current?.addWindowMove(result.body.x - current.x, result.body.y - current.y);
      body.current = result.body;
      // "Komm her": stops below the pointer (or once it has walked past it).
      const target = comeTarget.current;
      if (target !== null) {
        const dx = target.x - (result.body.x + windowSize.current.width / 2);
        if (!behavior.coming) comeTarget.current = null;
        else if (Math.abs(dx) < COME_NEAR_PX * monitorScale.current || Math.sign(dx) !== target.direction) {
          comeTarget.current = null;
          behavior.arrived(now);
        }
      }
      if (x === placed.current.x && y === placed.current.y) return;
      placed.current = { x, y };
      // One move at a time; the next step waits for it.
      moving = true;
      void within(getCurrentWindow().setPosition(new PhysicalPosition(x, y)))
        .catch(() => {})
        .finally(() => {
          moving = false;
        });
    }, PHYSICS_TICK_MS);
    const refresh = window.setInterval(() => {
      if (prefsRef.current.physics && !drag.current) {
        const kept = body.current;
        void syncWindow().then(() => {
          // Keep the falling speed and the window it stands on across the re-read.
          if (kept && body.current) {
            body.current.vy = kept.vy;
            body.current.vx = kept.vx;
            body.current.support = kept.support;
            body.current.edge = kept.edge;
          }
        });
      }
    }, AREA_REFRESH_MS);
    return () => {
      window.clearInterval(step);
      window.clearInterval(refresh);
    };
  }, [awayRef, behavior, prefsRef, seatRef, stageRef, syncWindow]);

  /**
   * "Komm her" (tray menu, double click on the tray icon): with physics the figure walks along
   * its floor below the pointer; without, or when it cannot walk now, it jumps there with its
   * feet at the pointer, inside the monitor's work area.
   */
  const comeHere = useCallback(async () => {
    const cursor = lastCursor.current;
    if (!cursor || awayRef.current || drag.current) return;
    const now = performance.now();
    if (prefsRef.current.physics && body.current) {
      const dx = cursor.x - (body.current.x + windowSize.current.width / 2);
      if (Math.abs(dx) < COME_NEAR_PX * monitorScale.current) {
        behavior.arrived(now);
        return;
      }
      const direction = dx < 0 ? -1 : 1;
      if (behavior.come(now, direction)) {
        comeTarget.current = { x: cursor.x, direction };
        return;
      }
    }
    await syncWindow().catch(() => {});
    const { width, height } = windowSize.current;
    const under =
      monitors.current.find(
        (m) => cursor.x >= m.x && cursor.x < m.x + m.width && cursor.y >= m.y && cursor.y < m.y + m.height,
      ) ?? area.current;
    if (!under || !width) return;
    const x = Math.round(Math.min(Math.max(cursor.x - width / 2, under.x), under.x + under.width - width));
    const y = Math.round(Math.min(Math.max(cursor.y - height, under.y), under.y + under.height - height));
    await within(getCurrentWindow().setPosition(new PhysicalPosition(x, y))).catch(() => {});
    savePetPlacement({ x, y });
    // The physics (if on) goes on from the new place.
    await syncWindow().catch(() => {});
    behavior.arrived(performance.now());
  }, [awayRef, behavior, prefsRef, syncWindow]);

  /**
   * Resizes the pet to `wanted` (logical window height) with its feet where they stood. Runs one
   * resize at a time; wishes meanwhile (wheel notches) collect and the last one wins. The size
   * is remembered for the shown model too.
   */
  const resizeTo = useCallback(
    async (wanted: number) => {
      const queue = resizing.current;
      queue.next = clampPetHeight(wanted);
      if (queue.busy) return;
      queue.busy = true;
      try {
        while (queue.next !== null) {
          const height = queue.next;
          queue.next = null;
          if (height === heightRef.current) continue;
          const win = getCurrentWindow();
          const size = petWindowSize(height);
          const [scale, position, current] = await within(
            Promise.all([win.scaleFactor(), win.outerPosition(), win.innerSize()]),
          );
          const x = Math.round(position.x + (current.width - size.width * scale) / 2);
          const y = Math.round(position.y + current.height - size.height * scale);
          await within(win.setSize(new LogicalSize(size.width, size.height)));
          await within(win.setPosition(new PhysicalPosition(x, y)));
          heightRef.current = height;
          savePetPlacement({ height, x, y });
          if (modelRef.current) savePetModelHeight(modelRef.current, height);
        }
      } catch {
        queue.next = null;
      } finally {
        queue.busy = false;
      }
      // The Desktop-Pet tab's slider follows (also after Ctrl+wheel or a model's own size).
      void emitTo('main', PET_RESIZE_EVENT, heightRef.current).catch(() => {});
      await syncWindow().catch(() => {});
    },
    [modelRef, syncWindow],
  );

  // Ctrl+wheel over the figure: size in small steps (the pointer is over it, so it gets the wheel).
  useEffect(() => {
    const figure = figureRef.current;
    if (!figure) return undefined;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey || !e.deltaY) return;
      e.preventDefault();
      const notches = Math.max(-3, Math.min(3, -e.deltaY / 100)) || -Math.sign(e.deltaY);
      const from = resizing.current.next ?? heightRef.current;
      void resizeTo(from * WHEEL_STEP ** notches);
    };
    figure.addEventListener('wheel', onWheel, { passive: false });
    return () => figure.removeEventListener('wheel', onWheel);
  }, [figureRef, resizeTo]);

  const beginDrag = useCallback((now: number) => {
    drag.current = { startedAt: now, movedAt: now, samples: [] };
  }, []);

  const settleDrag = useCallback(
    (now: number) => {
      const dragging = drag.current;
      if (!dragging) return;
      const stillFor = now - Math.max(dragging.startedAt, dragging.movedAt);
      if (dragging.ending && stillFor > DRAG_GIVE_UP_MS) {
        // Where it stands now is unknown: the physics waits for the next read (AREA_REFRESH_MS).
        body.current = null;
        drag.current = null;
        behavior.dragEnd(now);
      } else if (!dragging.ending && stillFor > DRAG_SETTLE_MS) {
        // Without a button state (outside Windows) the drag ends when the window rests.
        finishDrag(false);
      }
    },
    [behavior, finishDrag],
  );

  const trackWindowMoved = useCallback((now: number, x: number, y: number) => {
    if (drag.current) drag.current.movedAt = now;
    if (drag.current || now - placementSavedAt.current > PLACEMENT_SAVE_MS) {
      placementSavedAt.current = now;
      savePetPlacement({ x, y });
    }
  }, []);

  const recordCursorMove = useCallback(
    (gx: number, gy: number, button: boolean | null | undefined, polledAt: number) => {
      lastCursor.current = { x: gx, y: gy };
      const dragging = drag.current;
      if (dragging && !dragging.ending) {
        const previous = dragging.samples[dragging.samples.length - 1];
        if (previous) stageRef.current?.addWindowMove(gx - previous.x, gy - previous.y);
        dragging.samples.push({ t: polledAt, x: gx, y: gy });
        if (dragging.samples.length > 30) dragging.samples.shift();
        // Released: the drag ends now, and a release in motion throws the figure.
        if (button === false) finishDrag(true);
      }
    },
    [finishDrag, stageRef],
  );

  const setPlatforms = useCallback((next: Platform[]) => {
    platforms.current = next;
  }, []);

  const setWalkDirection = useCallback((dir: -1 | 0 | 1) => {
    walkDirection.current = dir;
  }, []);

  const readBubbleSide = useCallback(async (): Promise<BubbleSide | null> => {
    await (body.current && area.current ? Promise.resolve() : syncWindow()).catch(() => {});
    const current = body.current;
    const monitor = area.current;
    if (!current || !monitor) return null;
    return bubbleSide(current.x + windowSize.current.width / 2, monitor.x, monitor.width);
  }, [syncWindow]);

  const currentHeight = useCallback(() => heightRef.current, []);

  return {
    syncWindow,
    beginDrag,
    settleDrag,
    trackWindowMoved,
    recordCursorMove,
    setPlatforms,
    setWalkDirection,
    readBubbleSide,
    currentHeight,
    startJump,
    comeHere,
    resizeTo,
  };
}
