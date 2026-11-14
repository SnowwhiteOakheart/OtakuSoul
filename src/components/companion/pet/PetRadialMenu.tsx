import { useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import type { PetMenuItem } from './petMenuModel';
import { mainSlices, polar, slicePath, subSlices, type OpenArc, type RadialRings, type Slice } from './radialLayout';

interface PetRadialMenuProps {
  items: PetMenuItem[];
  rings: RadialRings;
  arc: OpenArc;
  /** Shown in the middle while nothing is pointed at. */
  title: string;
  ariaLabel: string;
  /** Runs an entry (the caller closes the ring first). */
  onRun: (item: PetMenuItem) => void;
  onClose: () => void;
}

type Focus = { level: 'main'; index: number } | { level: 'sub'; index: number };

const enabled = (item: PetMenuItem) => item.enabled !== false;

/** Icon (or glyph) of an entry at the middle of its slice. */
function SliceMark({ item, x, y, size }: { item: PetMenuItem; x: number; y: number; size: number }) {
  if (item.icon) {
    const Icon = item.icon;
    return <Icon x={x - size / 2} y={y - size / 2} width={size} height={size} strokeWidth={2} aria-hidden />;
  }
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={item.glyph && item.glyph.length > 2 ? size * 0.62 : size * 0.85}
      fontWeight={600}
      className="fill-current"
      aria-hidden
    >
      {item.glyph}
    </text>
  );
}

/**
 * The pet's ring menu: the main entries around the figure, the chosen entry's choices on an
 * arc outside it. Pointer and keyboard (arrows, Enter, Escape) both work; the name of what is
 * pointed at shows in the middle.
 */
export const PetRadialMenu: React.FC<PetRadialMenuProps> = ({ items, rings, arc, title, ariaLabel, onRun, onClose }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  /** Main entry whose choices are open on the outer arc. */
  const [open, setOpen] = useState<number | null>(null);
  const [focus, setFocus] = useState<Focus | null>(null);
  const { cx, cy, r0, r1, r2, r3 } = rings;

  const slices = useMemo(() => mainSlices(items.length, arc), [items.length, arc]);
  const children = open !== null ? (items[open]?.children ?? []) : [];
  const subs = useMemo(
    () => (open !== null && slices[open] ? subSlices(children.length, slices[open].mid, rings, arc) : []),
    [open, slices, children.length, rings, arc],
  );

  // Keys reach the ring at once (the caller focuses the window).
  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
  }, []);

  const activate = (item: PetMenuItem, index: number) => {
    if (!enabled(item)) return;
    if (item.children) {
      setOpen((was) => (was === index ? null : index));
      setFocus({ level: 'sub', index: 0 });
      return;
    }
    onRun(item);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const level = focus?.level ?? 'main';
    const count = level === 'sub' ? children.length : items.length;
    const step = (by: number) => {
      const from = focus?.index ?? (by > 0 ? -1 : 0);
      setFocus({ level, index: (from + by + count) % count });
    };
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        step(1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        step(-1);
        break;
      case 'Enter':
      case ' ': {
        if (!focus) break;
        if (focus.level === 'sub') {
          const child = children[focus.index];
          if (child && enabled(child)) onRun(child);
        } else {
          const item = items[focus.index];
          if (item) activate(item, focus.index);
        }
        break;
      }
      case 'Escape':
        if (level === 'sub' && open !== null) {
          setFocus({ level: 'main', index: open });
          setOpen(null);
        } else {
          onClose();
        }
        break;
      default:
        return;
    }
    e.preventDefault();
    e.stopPropagation();
  };

  const pointed =
    focus?.level === 'sub' ? children[focus.index] : focus?.level === 'main' ? items[focus.index] : undefined;
  const mainSize = Math.min(22, (r1 - r0) * 0.5);
  const subSize = Math.min(20, (r3 - r2) * 0.5);

  const sector = (item: PetMenuItem, slice: Slice, index: number, level: Focus['level']) => {
    const inner = level === 'main' ? r0 : r2;
    const outer = level === 'main' ? r1 : r3;
    const mark = polar(cx, cy, (inner + outer) / 2, slice.mid);
    const isFocused = focus?.level === level && focus.index === index;
    const isOpen = level === 'main' && open === index;
    const on = enabled(item);
    const tone = !on
      ? 'fill-slate-900/70 text-slate-500'
      : isFocused || isOpen
        ? 'fill-accent-600/95 text-white'
        : item.checked
          ? 'fill-accent-900/90 text-accent-200'
          : 'fill-slate-900/85 text-slate-100';
    const badge = item.badge ? polar(cx, cy, outer - 7, slice.a1 - 9 / outer) : null;
    return (
      <g
        key={item.id}
        id={`pet-radial-${level}-${item.id}`}
        data-pet-solid
        role={item.checked !== undefined ? 'menuitemcheckbox' : 'menuitem'}
        aria-label={item.label}
        aria-disabled={!on || undefined}
        aria-checked={item.checked}
        aria-haspopup={item.children ? 'menu' : undefined}
        aria-expanded={item.children ? isOpen : undefined}
        className={`pointer-events-auto ${on ? 'cursor-pointer' : 'cursor-not-allowed'} ${tone}`}
        onPointerEnter={() => {
          setFocus({ level, index });
          // Pointing at an entry with choices shows them; another plain entry keeps the open arc.
          if (level === 'main' && item.children && on) setOpen(index);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          if (level === 'main') activate(item, index);
          else if (on) onRun(item);
        }}
      >
        <path
          d={slicePath(cx, cy, inner, outer, slice.a0, slice.a1)}
          className={`stroke-accent-400/40 transition-colors duration-100`}
          strokeWidth={1}
        />
        <SliceMark item={item} x={mark.x} y={mark.y} size={level === 'main' ? mainSize : subSize} />
        {badge && (
          <text
            x={badge.x}
            y={badge.y}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={10}
            fontWeight={700}
            className="fill-amber-300"
            aria-hidden
          >
            {item.badge}
          </text>
        )}
      </g>
    );
  };

  const label = pointed?.label ?? title;
  return (
    <div
      ref={rootRef}
      role="menu"
      aria-label={ariaLabel}
      aria-activedescendant={pointed ? `pet-radial-${focus!.level}-${pointed.id}` : undefined}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      className="pet-radial-in absolute inset-0 z-30 outline-hidden pointer-events-none"
      style={{ transformOrigin: `${cx}px ${cy}px` }}
      data-pet-radial
    >
      <svg width="100%" height="100%" className="absolute inset-0 overflow-visible pointer-events-none">
        <g role="group">{items.map((item, i) => (slices[i] ? sector(item, slices[i], i, 'main') : null))}</g>
        {open !== null && (
          <g role="menu" aria-label={items[open]?.label} key={`sub-${open}`} className="pet-radial-sub-in">
            {children.map((child, i) => (subs[i] ? sector(child, subs[i], i, 'sub') : null))}
          </g>
        )}
      </svg>
      <div
        aria-live="polite"
        className="absolute rounded-full bg-app/90 border border-accent-500/40 px-2.5 py-1 text-[11px] font-medium text-slate-100 text-center leading-tight shadow-lg"
        style={{ left: cx, top: cy, transform: 'translate(-50%, -50%)', maxWidth: Math.max(96, r0 * 2 - 8) }}
      >
        {label}
      </div>
    </div>
  );
};
