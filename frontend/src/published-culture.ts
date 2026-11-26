import type {LocalNote,Profile,Source} from './types';
import {safeUrl} from './lib.ts';
import {cultureCategories,culturePhotos,visibleLocalCulture} from './local-culture.ts';

export type PublishedCulture = {
  iso3: string;
  highlights: (LocalNote & {baseline_text?: string;legacy_texts?: Record<string,string>})[];
  sources: Source[];
};

export type CountryCulture = {items: LocalNote[]; sources: Source[]};

const words = (s: string) => s.trim().normalize('NFKC').replace(/\s+/gu,' ');
const titleKey = (note: LocalNote) => (note.category || 'custom') + '\0' + words(note.label).toLowerCase().replace(/[\s\p{P}]/gu,'');

function combineNote(existing: LocalNote, incoming: PublishedCulture['highlights'][number]){
  // A later edit in the live profile takes precedence over its imported research snapshot.
  const baseline = incoming.legacy_texts?.[existing.id] || (incoming.id===existing.id?incoming.baseline_text:undefined);
  const revised = baseline && words(existing.text) === words(baseline);
  const main = revised ? incoming : existing;
  const photos = culturePhotos({...main,photo:undefined,photos:[...culturePhotos(main),...culturePhotos(revised?existing:incoming)]});
  return {...main,id:existing.id,legacy_ids:incoming.legacy_ids,category:main.category || incoming.category,
    source_ids:[...new Set([...existing.source_ids,...incoming.source_ids])],
    photo:photos[0],photos:photos.slice(1)};
}

export function mergeCountryCulture(profile: Profile | null, published?: PublishedCulture): CountryCulture {
  const legacy = visibleLocalCulture(profile);
  if(!published || (profile && profile.iso3!==published.iso3))return legacy;
  const sources = new Map([...published.sources,...legacy.sources].filter(source=>source?.id&&source.title?.trim()&&safeUrl(source.url)!=='#').map(source=>[source.id,source]));
  const liveCulture = profile?.sections.some(section=>section.id==='local_culture'&&Array.isArray(section.local_culture?.highlights));
  const byId = new Map(legacy.items.map(note=>[note.id,note]));
  const byTitle = new Map(legacy.items.map(note=>[titleKey(note),note]));
  const items:LocalNote[] = [];
  const seen = new Set<string>(), titles = new Set<string>();
  function add(note: LocalNote){
    const key = titleKey(note);
    if(!seen.has(note.id) && !titles.has(key)){
      items.push(note);
      seen.add(note.id);
      titles.add(key);
    }
  }
  const foldedIds = new Set<string>();
  for(const row of published.highlights){
    if(!row?.label?.trim() || !row.text?.trim() || !Object.hasOwn(cultureCategories,row.category||'')
      || !Array.isArray(row.source_ids) || !row.source_ids.length || !row.source_ids.every(id=>sources.has(id)))continue;
    const existing = byId.get(row.id) || row.legacy_ids?.map(id=>byId.get(id)).find(Boolean) || byTitle.get(titleKey(row));
    // Published legacy records follow the currently visible profile, including editor removals.
    if(liveCulture && !row.id.startsWith('hum-') && !existing)continue;
    add(existing ? combineNote(existing,row) : row);
    for(const id of row.legacy_ids||[]){
      const alias=byId.get(id), original=row.legacy_texts?.[id];
      if(!alias || !original || words(alias.text)===words(original))foldedIds.add(id);
    }
  }
  for(const row of legacy.items)if(!foldedIds.has(row.id))add(row);
  return {items,sources:[...sources.values()]};
}
