import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';

const modes = [['latest5', 'Last 5 patches'], ['latest10', 'Last 10 patches'], ['all', 'All patches'], ['custom', 'Custom range']];
export function PatchRangeControls({ patches, selection, onChange }) {
  function changeMode(mode) {
    if (mode === 'custom' && patches.length) {
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
    {selection.mode === 'custom' && patches.length > 0 && [['startId', 'From patch'], ['endId', 'To patch']].map(([key, label]) => <div key={key} className="space-y-2"><Label htmlFor={`range-${key}`}>{label}</Label>
      <Select value={selection[key]} onValueChange={id => changeBoundary(key, id)}>
        <SelectTrigger id={`range-${key}`} className="min-h-11 w-full"><SelectValue /></SelectTrigger>
        <SelectContent>{patches.map(row => <SelectItem key={row.id} value={row.id}>{row.patch}{row.tags?.includes('WIP') && !row.patch.includes('WIP') ? ' (WIP)' : ''}</SelectItem>)}</SelectContent>
      </Select>
    </div>)}
  </div>;
}
