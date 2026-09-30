import type { UserPersona } from '../../types';

/** Round picture of a user persona; falls back to its initial. */
export const PersonaAvatar = ({ persona, className = 'w-8 h-8 text-xs' }: { persona: UserPersona; className?: string }) =>
  persona.avatar_data_url ? (
    <img src={persona.avatar_data_url} alt="" className={`${className} rounded-full object-cover shrink-0`} />
  ) : (
    <span
      aria-hidden="true"
      className={`${className} rounded-full bg-linear-to-tr from-indigo-600 to-accent-600 flex items-center justify-center text-white font-bold shrink-0`}
    >
      {persona.name.charAt(0).toUpperCase() || '?'}
    </span>
  );
