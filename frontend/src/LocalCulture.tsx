import {useMemo} from 'react';
import {ArrowRight,ArrowUpRight,ChevronDown,Landmark} from 'lucide-react';
import type {LocalNote,Source} from './types';
import {safeUrl} from './lib';
import {cultureGroups,culturePhotos} from './local-culture';
import type {CountryCulture} from './published-culture';
import './religion.css';
import CulturePhoto from './CulturePhoto';

export function LocalNotes({items,sources}:{items:LocalNote[];sources:Source[]}){
 const sourceMap=useMemo(()=>new Map(sources.map(s=>[s.id,s])),[sources]);
 return <div className="religion-everyday-notes">{items.map(item=>{
   const photos=culturePhotos(item);
   const refs=new Map(item.source_ids.map(id=>sourceMap.get(id)).filter((s):s is Source=>!!s).map(s=>[s.url,s]));
   const scope=[item.when,item.year!=null?`${item.year} 年`:null,item.applies_to].filter(Boolean).join(' · ');
   return <article className="religion-everyday-note" key={item.id} data-culture-id={item.id}>
    <h4>{item.label}</h4>
    {photos.length>0&&<div className="culture-photo-set"><CulturePhoto photo={photos[0]}/>
     {photos.length>1&&<details className="culture-more-photos"><summary>更多图片（{photos.length-1}）<ChevronDown size={13}/></summary>
      <div className="culture-photo-details">{photos.slice(1).map(photo=><CulturePhoto key={photo.src} photo={photo}/>)}</div>
     </details>}</div>}
    <div className="culture-note-copy">{item.text.split(/\n\s*\n/).filter(Boolean).map((paragraph,i)=><p key={i}>{paragraph}</p>)}</div>
    <div className="religion-note-meta">{scope&&<span>{scope}</span>}
     <details className="religion-note-sources"><summary>来源<ChevronDown size={11}/></summary>
      <div>{[...refs.values()].map(source=><div className="culture-source-line" key={source.id}>
       <a href={safeUrl(source.url)} target="_blank" rel="noreferrer">{source.title}<ArrowUpRight size={11}/></a>
       {source.license&&(source.license_url?<a href={safeUrl(source.license_url)} target="_blank" rel="noreferrer">{source.license}</a>:<span>{source.license}</span>)}
      </div>)}
       {photos.map((photo,i)=><span key={photo.src} className="culture-photo-credit">{photos.length>1?`图 ${i+1}`:'图片'}　<a href={safeUrl(photo.source_url)} target="_blank" rel="noreferrer">{photo.credit}</a> · <a href={safeUrl(photo.license_url)} target="_blank" rel="noreferrer">{photo.license}</a></span>)}
      </div>
     </details>
    </div>
   </article>;
 })}</div>;
}

type Props={
 culture:CountryCulture;
 mode:'drawer'|'full'|'compare';
 onExplore:(topic:string,noteId?:string)=>void;
};

export default function LocalCulture({culture,mode,onExplore}:Props){
 const groups=cultureGroups(culture.items);
 if(!groups.length)return null;
 if(mode==='full')return <section className="local-culture religion-basics culture-full" aria-label="当地特色">
   <div className="religion-heading"><Landmark size={17}/><h3>当地特色</h3></div>
   <div className="culture-category-sections">{groups.map(group=><section className="culture-category-section" key={group.id} aria-label={group.label}>
    <h4>{group.label}<span>{group.items.length} 项</span></h4>
    <LocalNotes items={group.items.slice(0,2)} sources={culture.sources}/>
    {group.items.length>2&&<button type="button" className="culture-category-more no-print" onClick={()=>onExplore(group.id)}>查看全部 {group.items.length} 项<ArrowRight size={14}/></button>}
   </section>)}</div>
  </section>;
 const previewOrder=['place','custom','arts'];
 const previewGroups=[...previewOrder.flatMap(id=>groups.filter(g=>g.id===id)),...groups.filter(g=>!previewOrder.includes(g.id))];
 const preview=previewGroups.slice(0,mode==='compare'?1:3).map(group=>group.items.find(item=>culturePhotos(item).length)||group.items[0]);
 return <section className="culture-preview religion-basics" aria-label="人文与生活">
   <div className="religion-heading"><Landmark size={17}/><h3>人文与生活</h3></div>
   <div className="culture-preview-stories">{preview.map(item=>{
    const photo=culturePhotos(item)[0];
    const sentence=item.text.split(/[。！？\n]/)[0];
    return <button type="button" key={item.id} onClick={()=>onExplore(item.category||'custom',item.id)}>
     {photo&&<img src={photo.src} alt={photo.alt} loading="lazy" decoding="async"/>}
     <span><strong>{item.label}</strong><span>{sentence}{sentence===item.text?'':'。'}</span></span><ArrowRight size={15}/>
    </button>;
   })}</div>
   <div className="culture-preview-topics">{groups.map(group=><button type="button" key={group.id} onClick={()=>onExplore(group.id)}>{group.label}</button>)}</div>
   <button type="button" className="culture-open-reader" onClick={()=>onExplore(groups[0].id)}>展开人文与生活<ArrowRight size={15}/></button>
  </section>;
}
