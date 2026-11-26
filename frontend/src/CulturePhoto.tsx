import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Expand,X} from 'lucide-react';
import type {CulturePhoto as Photo} from './types';
import {validCulturePhoto} from './local-culture';
import './humanity.css';
import './HumanityReader.css';

export default function CulturePhoto({photo}:{photo:Photo}){
 const [open,setOpen]=useState(false),[failed,setFailed]=useState(false),dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{setFailed(false);setOpen(false)},[photo.src]);
 const trigger=useRef<HTMLButtonElement>(null);
 useEffect(()=>{
  if(!open)return;
  const button=trigger.current;
  dialog.current?.showModal();
  return()=>button?.focus({preventScroll:true});
 },[open]);
 if(failed||!validCulturePhoto(photo))return null;
 return <>
  <figure className="culture-photo">
   <button type="button" ref={trigger} className="culture-photo-trigger" onClick={()=>setOpen(true)} aria-label={`放大图片：${photo.caption}`}>
    <img src={photo.src} alt={photo.alt} loading="lazy" decoding="async" width="960" height="640" onLoad={e=>{const img=e.currentTarget;img.classList.toggle('is-portrait',img.naturalHeight>img.naturalWidth*1.1)}} onError={()=>setFailed(true)}/>
    <span className="culture-photo-expand"><Expand size={14}/></span>
   </button>
   <figcaption>{photo.caption}</figcaption>
  </figure>
  {open&&createPortal(<dialog className="culture-photo-dialog atlas-photo-dialog" ref={dialog} aria-label={photo.caption} onCancel={e=>{e.preventDefault();e.stopPropagation();setOpen(false)}} onClose={e=>{e.stopPropagation();setOpen(false)}} onClick={e=>{e.stopPropagation();if(e.target===e.currentTarget)setOpen(false)}}>
   <div className="culture-photo-viewer">
    <button type="button" autoFocus className="culture-photo-close" aria-label="关闭图片" onClick={()=>setOpen(false)}><X size={22}/></button>
    <img src={photo.src} alt={photo.alt}/>
    <div className="culture-photo-caption"><p>{photo.caption}</p><span><a href={photo.source_url} target="_blank" rel="noreferrer">{photo.credit}</a> · <a href={photo.license_url} target="_blank" rel="noreferrer">{photo.license}</a></span></div>
   </div>
  </dialog>,document.body)}
 </>;
}
