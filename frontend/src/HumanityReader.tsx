import {useEffect,useMemo,useRef,useState} from 'react';
import type {ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {ArrowLeft,ArrowRight,Search,X} from 'lucide-react';
import type {LocalNote,Profile} from './types';
import {cultureGroups,visibleReligionLife} from './local-culture';
import type {CountryCulture} from './published-culture';
import {visibleReligion} from './religion-display';
import {LocalNotes} from './LocalCulture';
import './humanity.css';
import './HumanityReader.css';

const pageSize=6;
type Props={
 profile:Profile|null; culture:CountryCulture; countryName:string; initialTopic:string;
 initialNote?:string; religion?:ReactNode; onClose:()=>void;
};

export default function HumanityReader({profile,culture,countryName,initialTopic,initialNote,religion,onClose}:Props){
 const groups=useMemo(()=>cultureGroups(culture.items),[culture.items]);
 const topics=[...groups.map(g=>({id:g.id as string,label:g.label,count:g.items.length})),...(religion?[{id:'faith',label:'信仰与日常',count:0}]:[])];
 const [topic,setTopic]=useState(initialTopic),[query,setQuery]=useState('');
 const [page,setPage]=useState(0),[anchor,setAnchor]=useState(initialNote);
 const dialog=useRef<HTMLDialogElement>(null),content=useRef<HTMLElement>(null);
 const opener=useRef<HTMLElement|null>(null);
 const topicNav=useRef<HTMLElement>(null);
 const searchInput=useRef<HTMLInputElement>(null);
 const selected=topics.find(t=>t.id===topic) || topics[0];
 const term=query.trim().toLocaleLowerCase();
 const faithItems=useMemo(()=>visibleReligion(profile)?.everyday||visibleReligionLife(profile).items,[profile]);
 const matching=useMemo<LocalNote[]>(()=>{
  if(!term)return groups.find(g=>g.id===selected?.id)?.items||[];
  return [...culture.items,...faithItems].filter(item=>`${item.label} ${item.text} ${item.applies_to||''}`.toLocaleLowerCase().includes(term));
 },[term,groups,selected?.id,culture.items,faithItems]);
 const refs=useMemo(()=>term?[...culture.sources,...(profile?.sources||[])]:culture.sources,[term,culture.sources,profile]);
 const anchorIndex=anchor?matching.findIndex(row=>row.id===anchor||row.legacy_ids?.includes(anchor)):-1;
 const anchoredId=anchorIndex>=0?matching[anchorIndex].id:undefined;
 const pages=Math.ceil(matching.length/pageSize);
 const currentPage=anchorIndex>=0?Math.floor(anchorIndex/pageSize):Math.min(page,Math.max(0,pages-1));
 const shown=matching.slice(currentPage*pageSize,(currentPage+1)*pageSize);
 const faith=!term&&selected?.id==='faith';
 useEffect(()=>{
  const previous=document.body.style.overflow;
  if(!opener.current&&document.activeElement instanceof HTMLElement)opener.current=document.activeElement;
  document.body.style.overflow='hidden';
  dialog.current?.showModal();
  return()=>{document.body.style.overflow=previous;opener.current?.focus({preventScroll:true})};
 },[]);
 useEffect(()=>{
  const frame=requestAnimationFrame(()=>{
   const note=anchoredId&&Array.from(content.current?.querySelectorAll<HTMLElement>('[data-culture-id]')||[]).find(el=>el.dataset.cultureId===anchoredId);
   if(note)note.scrollIntoView({block:'start'});else content.current?.scrollTo({top:0});
  });
  return()=>cancelAnimationFrame(frame);
 },[anchoredId,anchorIndex,currentPage,term,selected?.id]);
 useEffect(()=>{
  const nav=topicNav.current;
  const active=nav?.querySelector<HTMLButtonElement>('[aria-pressed=true]');
  if(!nav||!active||nav.scrollWidth<=nav.clientWidth)return;
  const bounds=nav.getBoundingClientRect(),button=active.getBoundingClientRect();
  if(button.left<bounds.left||button.right>bounds.right){
   nav.scrollLeft+=button.left-bounds.left-(nav.clientWidth-button.width)/2;
  }
 },[selected?.id,term]);
 function choose(id:string){setTopic(id);setQuery('');setAnchor(undefined);setPage(0)}
 function search(value:string){setQuery(value);setAnchor(undefined);setPage(0)}
 function move(next:number){setAnchor(undefined);setPage(next)}
 return createPortal(
  <dialog className="humanity-dialog atlas-reader" ref={dialog} aria-label={`${countryName} · 人文与生活`}
   onCancel={e=>{e.preventDefault();onClose()}} onClose={onClose}
   onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
   <div className="humanity-reader">
    <header className="humanity-reader-header">
     <div className="reader-identity"><h2>{countryName}</h2><span>人文与生活</span></div>
     <button type="button" className="humanity-close" aria-label="关闭人文与生活" onClick={onClose}><X size={20}/></button>
     <label className="humanity-search">
      <Search size={16} aria-hidden="true"/>
      <input ref={searchInput} value={query} onChange={e=>search(e.target.value)}
       placeholder="搜索本国人文" aria-label="搜索本国文化内容"/>
      {query&&<button type="button" aria-label="清空文化搜索" onClick={()=>{search('');searchInput.current?.focus()}}><X size={14}/></button>}
     </label>
    </header>
    <div className="humanity-reader-body">
     <aside className="humanity-sidebar">
      <nav ref={topicNav} aria-label="人文主题">{topics.map(t=>
       <button type="button" key={t.id} aria-pressed={!term&&selected?.id===t.id} onClick={()=>choose(t.id)}>
        {t.label}{t.count>0&&<small>{t.count}</small>}
       </button>)}</nav>
     </aside>
     <main className="humanity-content" ref={content} tabIndex={0} aria-label={term?'文化搜索结果':selected?.label}>
      <div className="reader-column">
       <div className="humanity-topic-heading">
        <h3>{term?'搜索结果':selected?.label}</h3>
        {!faith&&matching.length>0&&<span aria-live="polite">{pages>1?`${currentPage*pageSize+1}–${currentPage*pageSize+shown.length} / ${matching.length}`:`${matching.length} 项`}</span>}
        {!faith&&pages>1&&<select className="humanity-story-picker" aria-label="按题目跳转" value={anchoredId||''} onChange={e=>setAnchor(e.target.value||undefined)}>
         <option value="">按题目跳转</option>{matching.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}
        </select>}
       </div>
       <div key={`${term?'search':selected?.id}-${currentPage}`} className="reader-stories">
        {faith?religion:shown.length?<LocalNotes items={shown} sources={refs}/>:<p className="humanity-no-results" role="status">没有找到“{query.trim()}”</p>}
       </div>
       {!faith&&pages>1&&<nav className="humanity-pagination" aria-label="人文内容翻页">
        <button type="button" disabled={currentPage===0} onClick={()=>move(currentPage-1)}><ArrowLeft size={15}/>上一页</button>
        <span aria-live="polite">{currentPage+1} / {pages}</span>
        <button type="button" disabled={currentPage>=pages-1} onClick={()=>move(currentPage+1)}>下一页<ArrowRight size={15}/></button>
       </nav>}
      </div>
     </main>
    </div>
   </div>
  </dialog>,document.body);
}
