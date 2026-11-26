import {lazy,Suspense,useEffect,useRef,useState} from 'react';
import {ArrowUpRight,ChevronDown,Users} from 'lucide-react';
import type {Profile,ReligionGroup} from './types';
import {safeUrl} from './lib';
import {religionShareText,visibleReligion} from './religion-display';
import LocalCulture,{LocalNotes as EverydayNotes} from './LocalCulture';
import {visibleReligionLife} from './local-culture';
import {useCountryCulture} from './useCountryCulture';
import type {CountryCultureView} from './useCountryCulture';
import './religion.css';
import './humanity.css';
const HumanityReader=lazy(()=>import('./HumanityReader')); 

function ReligionShares({groups}:{groups:ReligionGroup[]}){
 return <div className="religion-shares">{groups.map(group=><div className={`religion-share religion-${group.id}`} key={group.id}>
  <div><span>{group.label}</span><strong>{religionShareText(group)}</strong></div>
  {group.share!==null&&<div className="religion-share-track" aria-hidden="true"><span style={{width:`${group.share}%`}}/></div>}
 </div>)}</div>;
}

function ReligionContent({profile,mode='drawer',onExplore}:{profile:Profile|null;mode?:'drawer'|'full'|'compare';onExplore?:()=>void}){
 const view=visibleReligion(profile),fallback=visibleReligionLife(profile),root=useRef<HTMLElement>(null);
 useEffect(()=>{
  let opened:HTMLDetailsElement[]=[];
  const prepare=()=>{opened=Array.from(root.current?.querySelectorAll<HTMLDetailsElement>('details:not([open])')||[]);opened.forEach(item=>{item.open=true})};
  const restore=()=>{opened.forEach(item=>{item.open=false});opened=[]};
  window.addEventListener('beforeprint',prepare);window.addEventListener('afterprint',restore);
  return()=>{window.removeEventListener('beforeprint',prepare);window.removeEventListener('afterprint',restore)};
 },[]);
 if(!view)return fallback.items.length?<section ref={root} className={`religion-basics religion-${mode}`} aria-label="宗教与习俗">
  <div className="religion-heading"><Users size={17}/><h3>信仰在日常生活里</h3></div>
  {onExplore?<button type="button" className="culture-open-reader" onClick={onExplore}>信仰与日常生活<ArrowUpRight size={15}/></button>:<>
   <EverydayNotes items={mode==='full'?fallback.items:fallback.items.slice(0,3)} sources={fallback.sources}/>
   {mode!=='full'&&fallback.items.length>3&&<details className="religion-everyday-more"><summary>更多日常细节<ChevronDown size={13}/></summary><EverydayNotes items={fallback.items.slice(3)} sources={fallback.sources}/></details>}
  </>}
 </section>:null;
 const {data,groups,traditions,definitions,everyday,sources}=view;
 const known=groups.filter(group=>group.share!==null&&group.share>0);
 const primary=(known.length?known:groups).slice(0,3),remaining=groups.filter(group=>!primary.includes(group));
 return <section ref={root} className={`religion-basics religion-${mode}`} aria-label="宗教与习俗">
  <div className="religion-heading">{mode!=='full'&&<><Users size={17}/><h3>宗教与习俗</h3></>}<span>{data.year} 年 · 人口占比</span></div>
  <div className="religion-layout">
   <div className="religion-composition"><ReligionShares groups={primary}/>
    {remaining.length>0&&<details className="religion-more"><summary>全部构成<ChevronDown size={13}/></summary><ReligionShares groups={remaining}/></details>}
   </div>
   {!onExplore&&(everyday.length>0||traditions.length>0)&&<div className="religion-life">
    {everyday.length>0&&<div className="religion-everyday"><h4 className="religion-everyday-heading">信仰在日常生活里</h4>
     <EverydayNotes items={mode==='full'?everyday:everyday.slice(0,3)} sources={sources}/>
     {mode!=='full'&&everyday.length>3&&<details className="religion-everyday-more"><summary>更多日常细节<ChevronDown size={13}/></summary><EverydayNotes items={everyday.slice(3)} sources={sources}/></details>}
    </div>}
    {traditions.length>0&&<details className="religion-quick-reference"><summary>常见习俗<ChevronDown size={14}/></summary>
     <div className="religion-traditions">{traditions.map(tradition=><details key={tradition.id} className="religion-tradition">
      <summary><span>{tradition.label}</span><ChevronDown size={14}/></summary>
      <div>{tradition.practices.map(practice=><div className="religion-practice" key={practice.id}><p><strong>{practice.label}</strong>{practice.text}</p><small>{practice.applies_to}</small></div>)}</div>
     </details>)}</div>
    </details>}
   </div>}
  </div>
  {onExplore&&<button type="button" className="culture-open-reader" onClick={onExplore}>信仰与日常生活<ArrowUpRight size={15}/></button>}
  <details className="religion-evidence"><summary>统计口径与来源<ChevronDown size={13}/></summary>
   <p>{data.geographic_scope} · {data.denominator} · {data.year} 年</p><p>{data.methodology}</p>
   {definitions.map(tradition=><div className="religion-definition" key={tradition.id}>{tradition.introduction&&<p><strong>{tradition.label}</strong>：{tradition.introduction}</p>}</div>)}
   <div className="religion-sources">{sources.map(source=><a key={source.id} href={safeUrl(source.url)} target="_blank" rel="noreferrer"><span>{source.title}</span><ArrowUpRight size={12}/></a>)}</div>
  </details>
 </section>;
}

type Props={profile:Profile|null;mode?:'drawer'|'full'|'compare';countryName?:string;iso3?:string};

export default function ReligionBasics(props:Props){
 const culture=useCountryCulture(props.profile,props.iso3||props.profile?.iso3);
 return <CountryHumanity {...props} culture={culture}/>;
}

export function CountryHumanity({profile,mode='drawer',countryName,iso3=profile?.iso3,culture}:Props&{culture:CountryCultureView}){
 const [reading,setReading]=useState<{iso3?:string;topic:string;noteId?:string}|null>(null);
 const religion=visibleReligion(profile)||visibleReligionLife(profile).items.length>0;
 const explore=(topic:string,noteId?:string)=>setReading({iso3,topic,noteId});
 return <><ReligionContent profile={profile} mode={mode} onExplore={culture.items.length>0&&mode==='drawer'?()=>explore('faith'):undefined}/>
  <LocalCulture culture={culture} mode={mode} onExplore={explore}/>
  {culture.failed&&<p className="culture-load-error">更多人文资料暂未载入。<button type="button" onClick={culture.retry}>重试</button></p>}
  {reading&&reading.iso3===iso3&&<Suspense fallback={<span role="status">正在打开人文内容…</span>}>
   <HumanityReader profile={profile} culture={culture} countryName={countryName||iso3||''} initialTopic={reading.topic} initialNote={reading.noteId}
    religion={religion?<ReligionContent profile={profile} mode="full"/>:undefined} onClose={()=>setReading(null)}/>
  </Suspense>}
 </>;
}
