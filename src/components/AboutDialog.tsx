import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { BrainCircuit, Dice5, HeartHandshake, ShieldCheck, Sparkles, X } from 'lucide-react';
import logoUrl from '../assets/brand/otakusoul-logo-wide.webp';

interface AboutDialogProps {
  onClose: () => void;
}

const highlights = [
  { icon: BrainCircuit, label: 'Lokale & Cloud-KI' },
  { icon: HeartHandshake, label: 'Kognitives Soul Memory' },
  { icon: Sparkles, label: 'VRM & Live2D Avatare' },
  { icon: Dice5, label: 'Soul Stage Rollenspiel' },
];

export function AboutDialog({ onClose }: AboutDialogProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] grid place-items-center overflow-y-auto bg-slate-950/85 p-5 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="relative max-h-[calc(100vh-2.5rem)] w-full max-w-3xl overflow-y-auto rounded-3xl border border-purple-400/25 bg-slate-950 shadow-2xl shadow-purple-950/60">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 rounded-full border border-white/10 bg-slate-950/70 p-2 text-slate-300 backdrop-blur transition hover:border-purple-400/40 hover:text-white"
          aria-label="Über-Dialog schließen"
        >
          <X className="h-4 w-4" />
        </button>

        <img
          src={logoUrl}
          alt="OtakuSoul – Infinite Worlds"
          className="aspect-video w-full object-cover"
        />

        <div className="relative space-y-5 p-6 sm:p-8">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-purple-400/70 to-transparent" />
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 id="about-title" className="text-2xl font-semibold tracking-wide text-white">
                OtakuSoul
              </h2>
              <span className="rounded-full border border-purple-400/30 bg-purple-500/10 px-2.5 py-1 font-mono text-[11px] text-purple-200">
                v0.1.0
              </span>
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              Eine immersive Desktop-Plattform für persönliche KI-Charaktere, lebendige Avatare,
              langfristige Erinnerungen und gemeinsam erzählte Welten.
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {highlights.map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-2.5 rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2.5 text-xs text-slate-200"
              >
                <Icon className="h-4 w-4 text-purple-300" />
                <span>{label}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-800 pt-5 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
            <span>Entwickelt von SnowwhiteOakheart</span>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              Open Source · GPLv3
            </span>
          </div>
        </div>
      </section>
    </div>,
    document.body
  );
}
