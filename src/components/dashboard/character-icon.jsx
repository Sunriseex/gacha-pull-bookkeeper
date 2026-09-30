import { useState } from 'react';
import icons from '@/data/character-icons.json';

export function CharacterIcon({ gameId, name }) {
  const src = icons[gameId]?.[name]?.src;
  const [failed, setFailed] = useState(false);
  const initials = name.split(/[\s·:]+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('');
  return <span className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-secondary/60 ring-1 ring-border/60" aria-hidden="true">
    {src && !failed
      ? <img src={`${import.meta.env.BASE_URL}${src}`} alt="" width="48" height="48" loading="lazy" decoding="async" className={`size-full object-contain ${gameId === 'wuthering-waves' ? 'origin-top scale-150' : ''}`} onError={() => setFailed(true)} data-testid="character-icon" />
      : <span className="text-sm font-semibold text-muted-foreground" data-testid="character-icon-fallback">{initials}</span>}
  </span>;
}
