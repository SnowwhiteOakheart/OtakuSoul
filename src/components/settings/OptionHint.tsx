/** One sentence under a setting that says what it does; `id` goes into the control's `aria-describedby`. */
export const OptionHint = ({ id, children }: { id: string; children: React.ReactNode }) => (
  <p id={id} className="text-[11px] leading-snug text-slate-400">
    {children}
  </p>
);
