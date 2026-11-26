import {useEffect,useId,useRef,useState} from 'react';
import {ChevronUp,LocateFixed} from 'lucide-react';
import './map-city-key.css';

type City = {name:string;coordinates:readonly number[];role:string;roleLabel?:string};
const categories = [
 {role:'capital',label:'首都'},
 {role:'seat',label:'行政中心'},
 {role:'city',label:'主要城市'},
];

export default function MapCityKey({cities,onLocate}:{cities:readonly City[];onLocate:(coordinates:[number,number])=>void}){
 const [open,setOpen]=useState(false);
 const root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null);
 const id=useId();
 useEffect(()=>{
  if(!open)return;
  const outside=(event:PointerEvent)=>{
   if(event.target instanceof Node&&!root.current?.contains(event.target))setOpen(false);
  };
  document.addEventListener('pointerdown',outside);
  return()=>document.removeEventListener('pointerdown',outside);
 },[open]);
 if(!cities.length)return null;
 const displayed=categories.flatMap(group=>{
  const places=cities.filter(city=>city.role===group.role);
  if(!places.length)return [];
  const localLabel=places[0].roleLabel;
  const sameTownLabel=group.role==='city' && (localLabel==='主要聚居地'||localLabel==='主要城镇') && places.every(city=>city.roleLabel===localLabel);
  return [{role:group.role,label:sameTownLabel?localLabel:group.label}];
 });
 return <div ref={root} className="map-city-key" onKeyDown={event=>{
  if(open&&event.key==='Escape'){
   event.preventDefault();event.stopPropagation();setOpen(false);trigger.current?.focus();
  }
 }}>
  <button ref={trigger} type="button" className="map-city-key-toggle"
   aria-label="城市图例与定位" aria-controls={id} aria-expanded={open} onClick={()=>setOpen(v=>!v)}>
   {displayed.map(({role,label})=><span key={role}><i aria-hidden="true" data-role={role}/>{label}</span>)}
   <ChevronUp size={12} aria-hidden="true"/>
  </button>
  <div id={id} className="map-city-key-list" hidden={!open}>
   {cities.map(city=><button type="button" key={city.name} onClick={()=>{
    onLocate([city.coordinates[0],city.coordinates[1]]);setOpen(false);trigger.current?.focus({preventScroll:true});
   }}>
    <i data-role={city.role} aria-hidden="true"/>
    <span>{city.name}<small>{city.roleLabel||categories.find(group=>group.role===city.role)?.label}</small></span>
    <LocateFixed size={13} aria-hidden="true"/>
   </button>)}
  </div>
 </div>;
}
