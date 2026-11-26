import type {Map as GLMap} from 'maplibre-gl';
import type {Geometry} from 'geojson';
import cityData from './country-cities.json';

export type CountryCity = {name:string; coordinates:[number,number]; role:'capital'|'seat'|'city'; roleLabel?:string};
// The dataset builder validates every [longitude, latitude] pair; JSON imports widen tuples to number[].
export const countryCities = cityData as unknown as Record<string,CountryCity[]>;
export type ScreenBox = {x:number; y:number; w:number; h:number};
type Site = CountryCity & {iso:string; width:number};
type VisibleSite = {site:Site; x:number; y:number};
type CityNode = {marker:HTMLButtonElement; caption:HTMLSpanElement; leader:HTMLElement};
const roles = {capital:'首都',seat:'行政中心',city:'主要城市'};
const halo = 3;

export function intersects(a:ScreenBox,b:ScreenBox){
 return a.x<b.x+b.w && a.x+a.w>b.x && a.y<b.y+b.h && a.y+a.h>b.y;
}

export function fitsLabel(box:ScreenBox,width:number,height:number,occupied:ScreenBox[]){
 return box.x>=4 && box.y>=4 && box.x+box.w<=width-4 && box.y+box.h<=height-4 && !occupied.some(other=>intersects(box,other));
}

function newCityNode(site:Site,select:(iso:string)=>void){
 const marker=document.createElement('button');
 marker.type='button';
 // Search and the country legend provide the keyboard routes into this same content.
 marker.tabIndex=-1;
 marker.className='atlas-city-marker';
 marker.dataset.country=site.iso;
 marker.dataset.cityRole=site.role;
 marker.dataset.cityName=site.name;
 marker.dataset.placeKind='city';
 marker.dataset.coordinates=site.coordinates.join(',');
 const descriptor=`${site.name} · ${site.roleLabel||roles[site.role]}`;
 marker.setAttribute('aria-label',`${descriptor}，查看所属国家或地区`);
 marker.title=descriptor;
 const leader=document.createElement('i');
 leader.className='atlas-city-leader';
 leader.hidden=true;
 const dot=document.createElement('i');
 dot.className='atlas-city-dot';
 const caption=document.createElement('span');
 caption.className='atlas-city-caption';
 caption.textContent=site.name;
 marker.append(leader,dot,caption);
 let press:{x:number;y:number}|null=null;
 marker.addEventListener('pointerdown',event=>{press=event.isPrimary?{x:event.clientX,y:event.clientY}:null});
 marker.addEventListener('pointercancel',()=>{press=null});
 marker.addEventListener('click',event=>{
  event.stopPropagation();
  const tapped=event.detail===0||!!press&&Math.hypot(event.clientX-press.x,event.clientY-press.y)<5;
  press=null;
  if(tapped)select(site.iso);
 });
 return {marker,caption,leader};
}

// City dots stay on their coordinates. Only the caption chooses a side.
function captionBox(row:VisibleSite,width:number,height:number,occupied:ScreenBox[],selected:boolean){
 const {site,x,y}=row, w=site.width+halo*2,h=19;
 const right=x+5, left=x-5-w, center=x-w/2;
 const placements=[
  [right,y-h/2],[left,y-h/2],[center,y-5-h],[center,y+5],
  [right,y-4-h],[left,y-4-h],[right,y+4],[left,y+4],
 ];
 if(selected){
  for(const gap of [18,36]){
   placements.push([right,y-gap-h],[left,y-gap-h],[right,y+gap],[left,y+gap],[center,y-gap-h],[center,y+gap]);
  }
 }
 for(const [bx,by] of placements){
  const box={x:bx,y:by,w,h};
  if(fitsLabel(box,width,height,occupied))return box;
 }
}

export class CityLabelLayer {
 private root=document.createElement('div');
 private sites:Site[];
 private nodes=new Map<Site,CityNode>();
 private drawn=new Set<Site>();
 constructor(container:HTMLElement,private select:(iso:string)=>void){
  this.root.className='atlas-city-layer';
  container.append(this.root);
  const measure=document.createElement('canvas').getContext('2d');
  this.sites=Object.entries(countryCities).flatMap(([iso,rows])=>rows.map(city=>{
   if(measure)measure.font=`${city.role==='city'?'500 11px':'650 12px'} -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`;
   return {...city,iso,width:Math.ceil(measure?.measureText(city.name).width||city.name.length*12)};
  })).sort((a,b)=>Number(a.role==='city')-Number(b.role==='city'));
 }
 project(map:GLMap,selected:string,visible:Set<string>,width:number,height:number){
  const zoom=map.getZoom(),bounds=map.getBounds(),chosen:VisibleSite[]=[],others:VisibleSite[]=[];
  this.drawn.clear();
  for(const site of this.sites){
   const active=site.iso===selected;
   if(!active&&(!visible.has(site.iso)||zoom<(site.role==='city'?4.65:3.45)))continue;
   if(!bounds.contains(site.coordinates))continue;
   const {x,y}=map.project(site.coordinates);
   if(x<4||y<4||x>width-4||y>height-4)continue;
   (active?chosen:others).push({site,x,y});
  }
  return {chosen,others};
 }
 draw(rows:VisibleSite[],selected:boolean,width:number,height:number,occupied:ScreenBox[]){
  // Reserve the selected country's pin positions before placing its first name.
  if(selected)for(const {x,y} of rows)occupied.push({x:x-3,y:y-3,w:6,h:6});
  for(const row of rows){
   const {site,x,y}=row;
   const pin={x:x-4,y:y-4,w:8,h:8};
   if(!selected&&occupied.some(box=>intersects(box,pin)))continue;
   const box=captionBox(row,width,height,occupied,selected);
   if(!box&&!selected)continue;
   let node=this.nodes.get(site);
   if(!node){node=newCityNode(site,this.select); this.nodes.set(site,node);this.root.append(node.marker)}
   node.marker.style.transform=`translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
   node.marker.classList.toggle('in-selected-country',selected);
   node.caption.hidden=!box;
   node.leader.hidden=true;
   if(box){
    node.caption.style.transform=`translate(${(box.x-x+halo).toFixed(1)}px,${(box.y-y+2).toFixed(1)}px)`;
    if(selected){
     const dx=Math.max(box.x,Math.min(x,box.x+box.w))-x;
     const dy=Math.max(box.y,Math.min(y,box.y+box.h))-y;
     const length=Math.hypot(dx,dy);
     if(length>14){
      node.leader.hidden=false;node.leader.style.width=`${length}px`;
      node.leader.style.transform=`rotate(${Math.atan2(dy,dx)}rad)`;
     }
    }
    occupied.push(box);
   }
   if(!selected)occupied.push(pin);
   this.drawn.add(site);
  }
 }
 finish(){
  for(const [site,{marker}] of this.nodes)if(!this.drawn.has(site)){marker.remove();this.nodes.delete(site)}
 }
 remove(){this.root.remove();this.nodes.clear()}
}

type Extent=[[number,number],[number,number]];

// Use the landmass carrying the country name, keeping unrelated overseas polygons out of the opening view.
export function mainlandBounds(geometry:Geometry|undefined,anchor:[number,number]|undefined):Extent|undefined{
 if(!geometry||!anchor)return;
 const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.type==='MultiPolygon'?geometry.coordinates:[];
 for(const polygon of polygons){
  const ring=polygon[0];
  let west=Infinity,east=-Infinity,south=Infinity,north=-Infinity,inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
   const [x,y]=ring[i],[px,py]=ring[j];
   west=Math.min(west,x);east=Math.max(east,x);south=Math.min(south,y);north=Math.max(north,y);
   if((y>anchor[1])!==(py>anchor[1])&&anchor[0]<(px-x)*(anchor[1]-y)/(py-y)+x)inside=!inside;
  }
  if(inside&&east-west<180)return [[west,south],[east,north]];
 }
}

// Offshore cities across the date line remain marked; the camera opens on the capital's map copy.
export function cityBounds(rows:CountryCity[],countryPoint?:[number,number],preset?:Extent,mainland?:Extent):Extent|undefined{
 if(!rows.length)return preset||mainland;
 const anchor=rows[0].coordinates[0];
 const points=rows.map(row=>row.coordinates);
 if(countryPoint)points.push(countryPoint);
 if(preset)points.push(...preset);
 if(mainland)points.push(...mainland);
 const near=points.filter(point=>Math.abs(point[0]-anchor)<180);
 const xs=near.map(point=>point[0]),ys=near.map(point=>point[1]);
 return [[Math.min(...xs)-.004,Math.min(...ys)-.004],[Math.max(...xs)+.004,Math.max(...ys)+.004]];
}
