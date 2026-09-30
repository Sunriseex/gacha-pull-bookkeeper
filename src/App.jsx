import { useEffect, useMemo, useRef, useState } from 'react';
import { Github, Eye, EyeOff, Copy, RefreshCw, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Toaster } from '@/components/ui/sonner';
import { DEFAULT_GAME_ID, GAME_CATALOG, getGameById } from './data/patches.js';
import { aggregateTotals, chartSeries } from './domain/calculation.js';
import { cardsConfig } from './ui/render.js';
import { drawPatchChart, resizeChart, stopChartAnimation, highlightChartSource, sourceColor } from './ui/chart.js';
import { isLocalSyncPage } from './ui/sync.js';
import { readPreference, writePreference, readOptions, readPatchRange } from './lib/preferences.js';
import { selectPatchRange } from './domain/patch-range.js';
import { PatchRangeControls } from './components/dashboard/patch-range-controls.jsx';
import { syncGames } from './lib/patchsync.js';

const number = new Intl.NumberFormat('en', { maximumFractionDigits: 1 });
const shortTitles = ['Endfield', 'WuWa', 'ZZZ', 'Genshin', 'Star Rail'];
const sources = [
  'https://docs.google.com/spreadsheets/d/1zGNuQ53R7c190RG40dHxcHv8tJuT3cBaclm8CjI-luY/edit',
  'https://docs.google.com/spreadsheets/d/1msSsnWBcXKniykf4rWQCEdk2IQuB9JHy/edit',
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vTiSx8OSyx-BZktnpT-fh_pQHjjkD8q3sp3Csy2aOI-8CV_QroqxzhhNjiCZNV4IdzhyK3xbipZn9WD/pubhtml',
  'https://docs.google.com/spreadsheets/d/1l9HPu2cAzTckdXtr7u-7D8NSKzZNUqOuvbmxERFZ_6w/edit',
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vRIWjzFwAZZoBvKw2oiNaVpppI9atoV0wxuOjulKRJECrg_BN404d7LoKlHp8RMX8hegDr4b8jlHjYy/pubhtml',
];
function updatedAt(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(date) : 'Unknown';
}

function PatchBreakdown({ series }) {
  const maximum = Math.max(1, ...series.map(item => item.total));
  return <Accordion type="multiple" className="w-full" aria-label="Pull sources by patch">
    {series.map(item => <AccordionItem key={item.label} value={item.label}>
      <AccordionTrigger className="min-h-14 hover:no-underline">
        <span className="min-w-0 flex-1 pr-2">
          <span className="flex justify-between gap-3"><span className="break-words">{item.label}</span><span className="shrink-0 font-mono text-primary">{number.format(item.total)} pulls</span></span>
          <span className="mt-2 flex h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">{item.segments.filter(segment => segment.value > 0).map(segment => <span key={segment.label} style={{ width: `${segment.value / maximum * 100}%`, backgroundColor: sourceColor(segment.label) }} />)}</span>
        </span>
      </AccordionTrigger>
      <AccordionContent><dl className="space-y-3">{item.segments.filter(segment => segment.value > 0).map(segment => <div key={segment.label} className="flex items-start justify-between gap-4"><dt className="flex min-w-0 gap-2"><span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: sourceColor(segment.label) }} /><span className="break-words">{segment.label}</span></dt><dd className="shrink-0 font-mono">{number.format(segment.value)}</dd></div>)}</dl></AccordionContent>
    </AccordionItem>)}
  </Accordion>;
}

function DesktopChart({ series, title }) {
  const canvas = useRef(null);
  useEffect(() => {
    const element = canvas.current;
    element.parentElement.scrollLeft = 0;
    drawPatchChart(element, series);
    const observer = new ResizeObserver(() => resizeChart(element));
    observer.observe(element.parentElement);
    const media = matchMedia('(max-width: 760px)');
    const resize = () => { stopChartAnimation(element); resizeChart(element); };
    media.addEventListener('change', resize);
    return () => { observer.disconnect(); media.removeEventListener('change', resize); stopChartAnimation(element); };
  }, [series]);
  const labels = [...new Set(series.flatMap(item => item.segments.map(segment => segment.label)))];
  return <div className="desktop-chart min-w-0">
    <p id="chart-scroll-hint" className="mb-2 text-xs text-muted-foreground">Scroll horizontally when the selected range is wider than the chart.</p>
    <div className="chart-scroll" role="region" aria-label="Patch chart, horizontally scrollable" aria-describedby="chart-scroll-hint" tabIndex={0}>
      <canvas ref={canvas} width="1200" height="420" role="img" aria-label={`${title}. Numeric values are available in Patch details below.`} />
    </div>
    <ul className="chart-legend my-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground" aria-label="Chart sources">
      {labels.map(label => <li key={label}><button type="button" className="flex min-h-11 items-center gap-2 rounded px-1 text-left hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring" onMouseEnter={() => highlightChartSource(canvas.current, label)} onMouseLeave={() => highlightChartSource(canvas.current, null)} onFocus={() => highlightChartSource(canvas.current, label)} onBlur={() => highlightChartSource(canvas.current, null)}><span className="size-3 shrink-0 rounded-sm" style={{ backgroundColor: sourceColor(label) }} aria-hidden="true" />{label}</button></li>)}
    </ul>
  </div>;
}

function SyncControl({ onRefresh }) {
  const [running, setRunning] = useState(false);
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState('');
  const pending = useRef(null);
  const finish = value => { pending.current?.(value); pending.current = null; setToken(''); setOpen(false); };
  useEffect(() => () => pending.current?.(''), []);
  async function sync() {
    if (running) return;
    setRunning(true);
    try {
      const result = await syncGames(() => new Promise(resolve => { pending.current = resolve; setOpen(true); }));
      if (result) {
        onRefresh();
        if (result.errors.length) toast.error(result.message, { description: result.errors.join(' | '), duration: 8000 });
        else toast.success(result.message);
      }
    } catch (error) { toast.error(error.message || 'Sync failed'); }
    finally { setRunning(false); }
  }
  return <>
    <Button variant="outline" disabled={running} onClick={sync}><RefreshCw className={running ? 'animate-spin' : ''} />{running ? 'Syncing…' : 'Sync Sheets'}</Button>
    <Dialog open={open} onOpenChange={value => { if (!value) finish(''); }}>
      <DialogContent className="max-w-sm"><form onSubmit={event => { event.preventDefault(); finish(token.trim()); }}>
        <DialogHeader><DialogTitle>Patchsync token required</DialogTitle><DialogDescription>Enter the token for your local sync service. It is saved in this browser.</DialogDescription></DialogHeader>
        <div className="my-5 space-y-2"><Label htmlFor="sync-token">Token</Label><Input id="sync-token" type="password" autoComplete="off" spellCheck={false} value={token} onChange={event => setToken(event.target.value)} /></div>
        <DialogFooter><Button type="button" variant="outline" onClick={() => finish('')}>Cancel</Button><Button type="submit" disabled={!token.trim()}>Save and sync</Button></DialogFooter>
      </form></DialogContent>
    </Dialog>
  </>;
}

export default function App() {
  const [gameId, setGameId] = useState(() => getGameById(readPreference('bookkeeper:selectedGameId', DEFAULT_GAME_ID)).id);
  const [optionsByGame, setOptionsByGame] = useState(() => Object.fromEntries(GAME_CATALOG.games.map(game => [game.id, readOptions(game)])));
  const [rangesByGame, setRangesByGame] = useState(() => Object.fromEntries(GAME_CATALOG.games.map(game => [game.id, readPatchRange(game)])));
  const [revision, setRevision] = useState(0);
  const [hidden, setHidden] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const game = getGameById(gameId);
  const options = optionsByGame[game.id];
  const range = useMemo(() => selectPatchRange(game.patches, rangesByGame[game.id]), [game, rangesByGame, revision]);
  const totals = useMemo(() => aggregateTotals(range.rows, options, game), [range, options, game]);
  const series = useMemo(() => chartSeries(range.rows, options, game), [range, options, game]);
  const cards = cardsConfig(totals, game);
  const index = GAME_CATALOG.games.findIndex(item => item.id === game.id);
  useEffect(() => { document.title = `${game.title} Bookkeeper`; }, [game.title]);
  function selectGame(id) {
    setGameId(id); setDetailsOpen(false); writePreference('bookkeeper:selectedGameId', id);
  }
  function updateOption(key, value) {
    const next = { ...options, [key]: value };
    setOptionsByGame(current => ({ ...current, [game.id]: next }));
    writePreference(`bookkeeper:options:${game.id}`, JSON.stringify(next));
  }
  function updateRange(selection) {
    setRangesByGame(current => ({ ...current, [game.id]: selection }));
    writePreference(`bookkeeper:range:${game.id}`, JSON.stringify(selection));
  }
  async function copyUid() {
    try { await navigator.clipboard.writeText(game.ui.ownerUid); toast.success('UID copied'); }
    catch { toast.error('Unable to copy UID', { description: `UID: ${game.ui.ownerUid}` }); }
  }
  return <>
    <div className={`game-background ${hidden ? 'background-visible' : ''}`} style={{ backgroundImage: `url("${game.ui.backgroundImage}")` }} aria-hidden="true" />
    <div className="relative mx-auto max-w-6xl px-4 pb-10 pt-5 sm:px-6 sm:pt-8">
      <div className="mb-4 flex flex-wrap justify-end gap-2">
        {isLocalSyncPage(location) && <SyncControl onRefresh={() => setRevision(value => value + 1)} />}
        <Button variant="outline" onClick={() => setHidden(value => !value)} aria-pressed={hidden}>{hidden ? <Eye /> : <EyeOff />}{hidden ? 'Show UI' : 'Hide UI'}</Button>
      </div>
      {!hidden && <main id="main-content" className="space-y-5">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0"><p className="mb-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Gacha Pull Bookkeeper</p><h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{game.title}</h1><p className="mt-2 text-sm text-muted-foreground">Compare your pull income across patches.</p></div>
          <div className="flex flex-wrap items-center gap-2">
            {game.ui.ownerUid && <Button variant="outline" size="sm" onClick={copyUid}><Copy />UID: {game.ui.ownerUid}</Button>}
            <Button variant="outline" size="icon" asChild><a href="https://github.com/Sunriseex/gacha-pull-bookkeeper" target="_blank" rel="noopener noreferrer" aria-label="Open GitHub repository"><Github /></a></Button>
          </div>
        </header>
        <nav className="game-selector grid grid-cols-2 gap-2 sm:grid-cols-5" aria-label="Game selector">
          {GAME_CATALOG.games.map((item, i) => <Button key={item.id} variant={item.id === game.id ? 'default' : 'outline'} className="h-auto min-h-12 px-3 py-3" aria-label={item.title} aria-pressed={item.id === game.id} onClick={() => selectGame(item.id)}>{shortTitles[i]}</Button>)}
        </nav>
        <Card>
          <CardHeader className="px-4 sm:px-6"><CardTitle>Income settings</CardTitle><CardDescription>Settings are saved separately for each game on this device.</CardDescription></CardHeader>
          <CardContent className="grid gap-4 px-4 sm:grid-cols-2 sm:px-6">
            <div className="space-y-2"><Label htmlFor="battle-pass">{game.ui.battlePass.label}</Label><Select value={String(options.battlePassTier)} onValueChange={value => updateOption('battlePassTier', Number(value))}><SelectTrigger id="battle-pass" className="min-h-11 w-full"><SelectValue /></SelectTrigger><SelectContent>{game.ui.battlePass.tiers.map(tier => <SelectItem key={tier.value} value={String(tier.value)}>{tier.label}</SelectItem>)}</SelectContent></Select></div>
            {[{ key: 'monthlySub', label: game.ui.monthlyPassLabel ?? 'Monthly Pass' }, ...(game.ui.optionalToggles ?? [])].map(flag => <div key={flag.key} className="flex min-h-14 items-center justify-between gap-4 rounded-lg border p-3"><Label htmlFor={`option-${flag.key}`} className="flex-1 cursor-pointer leading-relaxed">{flag.label}</Label><Switch id={`option-${flag.key}`} checked={Boolean(options[flag.key])} onCheckedChange={value => updateOption(flag.key, value)} className="touch-switch" /></div>)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="px-4 sm:px-6"><CardTitle>Period</CardTitle><CardDescription>Chart, source details and all totals use this range.</CardDescription></CardHeader>
          <CardContent className="px-4 sm:px-6"><PatchRangeControls patches={game.patches} selection={range.selection} onChange={updateRange} />
            <p className="mt-4 text-sm text-muted-foreground" data-testid="period-label" role="status">Totals for {range.label} · {range.rows.length} of {game.patches.length} patches</p>
          </CardContent>
        </Card>
        <section className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 sm:grid-cols-3" aria-label="Pull totals">
          {cards.slice(0, 3).map(card => <Card key={card.label} className="gap-2 px-4 py-5"><h2 className="text-sm text-muted-foreground">{card.label}</h2><p className="text-3xl font-semibold tabular-nums text-primary" data-testid="summary-value">{number.format(card.value)}</p></Card>)}
        </section>
        <Card>
          <CardHeader className="px-4 sm:px-6"><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle><h2>{game.ui.chartTitle ?? 'Pulls per version'}</h2></CardTitle><Badge variant="secondary">{range.rows.length} patches</Badge></div><CardDescription>Updated: {updatedAt(game.generatedAt)}. WIP values are estimates and may change.</CardDescription></CardHeader>
          <CardContent className="min-w-0 px-4 sm:px-6">
            {!series.length ? <p className="py-8 text-muted-foreground">No patches available for this game yet.</p> : <>
              <DesktopChart key={game.id} series={series} title={game.ui.chartTitle} />
              <div className="mobile-breakdown"><p className="mb-1 text-sm text-muted-foreground">Tap a patch to see its sources.</p><PatchBreakdown key={game.id} series={series} /></div>
              <div className="desktop-details"><Button variant="outline" aria-expanded={detailsOpen} aria-controls="patch-details" onClick={() => setDetailsOpen(value => !value)}>{detailsOpen ? 'Hide patch details' : 'Show patch details'}</Button>{detailsOpen && <div id="patch-details" className="mt-3"><PatchBreakdown key={game.id} series={series} /></div>}</div>
            </>}
          </CardContent>
        </Card>
        <section aria-label="Resource totals" className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 sm:grid-cols-3">
          {cards.slice(3).map(card => <Card key={card.label} className="relative gap-2 overflow-hidden px-4 py-5">{card.icon && <img src={card.icon} alt="" loading="lazy" className="absolute right-3 top-4 size-10 object-contain opacity-60" />}<h2 className={`text-sm text-muted-foreground ${card.icon ? 'pr-12' : ''}`}>{card.label}</h2><p className="text-2xl font-semibold tabular-nums">{number.format(card.value)}</p>{card.hint && <p className="break-words text-xs text-muted-foreground">{card.hint}</p>}</Card>)}
        </section>
        <footer className="flex flex-wrap justify-between gap-3 border-t pt-4 text-xs text-muted-foreground"><p>Estimated income, not your personal pull history.</p><a className="inline-flex min-h-11 items-center gap-1 underline underline-offset-4" href={sources[index]} target="_blank" rel="noopener noreferrer">Source spreadsheet<ExternalLink className="size-3" /></a></footer>
      </main>}
    </div>
    <Toaster theme="dark" position="bottom-right" richColors />
  </>;
}
