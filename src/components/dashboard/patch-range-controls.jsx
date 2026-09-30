import { Label } from '@/components/ui/label';
import { useState } from 'react';
import { ChevronLeft, ChevronRight, Grid2X2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';

const modes = [['single', 'One patch'], ['latest5', 'Last 5 patches'], ['latest10', 'Last 10 patches'], ['all', 'All patches'], ['custom', 'Custom range']];
export function PatchRangeControls({ patches, selection, onChange }) {
  const [gridOpen, setGridOpen] = useState(false);
  const selectedIndex = patches.findIndex(row => row.id === selection.patchId);
  const groups = new Map();
  for (const row of patches) {
    const major = row.patch.split('.')[0];
    if (!groups.has(major)) groups.set(major, []);
    groups.get(major).push(row);
  }
  function changeMode(mode) {
    if (mode === 'single' && patches.length) {
      onChange({ mode, patchId: patches.at(-1).id });
    } else if (mode === 'custom' && patches.length) {
      onChange({ mode, startId: patches[Math.max(0, patches.length - 10)].id, endId: patches.at(-1).id });
    } else onChange({ mode });
  }
  function changeBoundary(key, id) {
    const next = { ...selection, [key]: id };
    const start = patches.findIndex(row => row.id === next.startId);
    const end = patches.findIndex(row => row.id === next.endId);
    // Moving one end past the other selects that single patch, rather than an empty range.
    if (start > end) next[key === 'startId' ? 'endId' : 'startId'] = id;
    onChange(next);
  }
  return <div className={`grid gap-3 ${selection.mode === 'custom' ? 'sm:grid-cols-3' : ''}`}>
    <div className="space-y-2"><Label htmlFor="patch-range">Patch range</Label>
      <Select value={selection.mode} onValueChange={changeMode} disabled={!patches.length}>
        <SelectTrigger id="patch-range" className="min-h-11 w-full"><SelectValue /></SelectTrigger>
        <SelectContent>{modes.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
      </Select>
    </div>
    {selection.mode === 'single' && patches.length > 0 && <div className="space-y-2"><Label>Selected patch</Label><div className="flex items-center gap-2">
      <Button variant="outline" size="icon" className="size-11 shrink-0" aria-label="Previous patch" disabled={selectedIndex <= 0} onClick={() => onChange({ mode: 'single', patchId: patches[selectedIndex - 1].id })}><ChevronLeft /></Button>
      <Button variant="outline" className="min-h-11 min-w-0 flex-1" aria-label="Choose patch" onClick={() => setGridOpen(true)}><Grid2X2 />{patches[selectedIndex]?.patch}</Button>
      <Button variant="outline" size="icon" className="size-11 shrink-0" aria-label="Next patch" disabled={selectedIndex >= patches.length - 1} onClick={() => onChange({ mode: 'single', patchId: patches[selectedIndex + 1].id })}><ChevronRight /></Button>
    </div><Dialog open={gridOpen} onOpenChange={setGridOpen}><DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>Choose a patch</DialogTitle><DialogDescription>Select one version to see its income and character banners.</DialogDescription></DialogHeader><div className="space-y-5">{[...groups].reverse().map(([major, rows]) => <section key={major} aria-label={`Version ${major}.x`}><h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Version {major}.x</h3><div className="grid grid-cols-4 gap-2 sm:grid-cols-7">{rows.map(row => <Button key={row.id} variant={row.id === selection.patchId ? 'default' : 'outline'} aria-label={`Select patch ${row.patch}`} aria-pressed={row.id === selection.patchId} className="min-h-14 min-w-0 flex-col gap-0.5 px-1 tabular-nums" onClick={() => { onChange({ mode: 'single', patchId: row.id }); setGridOpen(false); }}>{row.patch}{row.tags?.includes('WIP') && <span className="text-[10px]">WIP</span>}</Button>)}</div></section>)}</div></DialogContent></Dialog></div>}
    {selection.mode === 'custom' && patches.length > 0 && [['startId', 'From patch'], ['endId', 'To patch']].map(([key, label]) => <div key={key} className="space-y-2"><Label htmlFor={`range-${key}`}>{label}</Label>
      <Select value={selection[key]} onValueChange={id => changeBoundary(key, id)}>
        <SelectTrigger id={`range-${key}`} className="min-h-11 w-full"><SelectValue /></SelectTrigger>
        <SelectContent>{patches.map(row => <SelectItem key={row.id} value={row.id}>{row.patch}{row.tags?.includes('WIP') && !row.patch.includes('WIP') ? ' (WIP)' : ''}</SelectItem>)}</SelectContent>
      </Select>
    </div>)}
  </div>;
}
