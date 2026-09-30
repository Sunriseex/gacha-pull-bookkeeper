import { getPatchBanners } from '@/domain/banners';
import { Badge } from '@/components/ui/badge';
import { CharacterIcon } from '@/components/dashboard/character-icon';

export function PatchBanners({ gameId, patchId }) {
  const entry = getPatchBanners(gameId, patchId);
  if (!entry) return <p className="text-sm text-muted-foreground" data-testid="banner-history">Banner history not reviewed for this patch yet.</p>;
  return <div className="space-y-3" data-testid="banner-history">
    {entry.phases.map(phase => <div key={phase.label}>
      <h3 className="mb-2 text-xs font-semibold text-muted-foreground">{phase.label}</h3>
      <ul className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 xl:grid-cols-3">
        {phase.characters.map(character => <li key={character.name} className="flex min-w-0 items-center gap-3 rounded-xl border border-border/40 bg-secondary/30 p-2.5 text-sm">
          <CharacterIcon key={`${gameId}:${character.name}`} gameId={gameId} name={character.name} />
          <div className="min-w-0 space-y-1">
            <span className="block break-words font-medium">{character.name}</span>
            <Badge variant={character.appearance === 'debut' ? 'default' : 'secondary'}>{{ debut: 'Debut', rerun: 'Rerun', ongoing: 'Ongoing' }[character.appearance]}</Badge>
          </div>
        </li>)}
      </ul>
    </div>)}
    {entry.phases.some(phase => phase.characters.some(character => character.appearance === 'ongoing')) && <p className="text-xs text-muted-foreground">Ongoing: the same banner continues from an earlier patch.</p>}
    {!entry.complete && <p className="text-xs text-muted-foreground">Partial history. {entry.note}</p>}
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"><span>Reviewed {entry.reviewedAt}</span>{entry.sources.map((url, index) => <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center underline underline-offset-4">Source {index + 1}<span className="sr-only"> for patch {patchId} banners</span></a>)}</div>
  </div>;
}
