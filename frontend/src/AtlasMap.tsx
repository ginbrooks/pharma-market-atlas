import {useEffect,useRef,useState} from 'react';
import * as gl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type {Map as GLMap,GeoJSONSource} from 'maplibre-gl';
import type {FeatureCollection} from 'geojson';
import {Maximize,AlertCircle} from 'lucide-react';
import type {Country} from './types';
import {api,colorFor,compact,focusCountries,valueOf} from './lib';
import 'maplibre-gl/dist/maplibre-gl.css';
import './cartography.css';
import MapCityKey from './MapCityKey';
import {CityLabelLayer,cityBounds,countryCities,fitsLabel,mainlandBounds} from './city-label-layout';
import type {ScreenBox} from './city-label-layout';
import {loadOverviewCountries} from './map-overview';
import type {WaterLabel} from './map-overview';
import {addPhysicalBasemap} from './physical-basemap';
gl.setWorkerUrl(workerUrl);
gl.prewarm();
type Props={countries:Country[];visible:Set<string>;metric:string;year:string;breaks:number[];selected:string;thematic?:boolean;homeRequest:number;onSelect:(iso:string)=>void};
type GeoLabelKind='river'|'lake'|'sea'|'ocean'|'port';
type Label={iso:string;name:string;element:HTMLElement;point:[number,number];rank:number;minimum:number;geographic:boolean;port:boolean;maximum:number;pointMarker?:gl.Marker;offsetY:number};
type MapWithUpdate=GLMap&{refreshData?:()=>void};
function countryPadding(width:number,height:number){
 return width<=600
  ?{left:34,right:52,top:Math.min(134,height*.19),bottom:Math.min(height*.59,610)+78}
  :{left:width>1050?490:width>800?452:416,right:70,top:108,bottom:84};
}
function showWorld(map:GLMap|null){
 map?.flyTo({center:[25,22],zoom:1.1,padding:{left:0,right:0,top:0,bottom:0},duration:650});
}
const home={center:[92,27] as [number,number],zoom:2.15};
const tropics:FeatureCollection={type:'FeatureCollection',features:[23.436,-23.436].map(latitude=>({type:'Feature',properties:{},geometry:{type:'LineString',coordinates:Array.from({length:13},(_,i)=>[-180+i*30,latitude])}}))};
const bounds:Record<string,[[number,number],[number,number]]>={PHL:[[116,4],[127,21]],UZB:[[55.5,37],[74,46]],LAO:[[100,13.7],[108,23]],KHM:[[102.1,10.3],[107.7,14.9]],LKA:[[79.3,5.7],[82,10.2]]};


export default function AtlasMap(props:Props){
 const ref=useRef<HTMLDivElement>(null),mapRef=useRef<MapWithUpdate|null>(null),latest=useRef(props),geo=useRef<FeatureCollection|null>(null),labels=useRef<Label[]>([]);
 latest.current=props;const [error,setError]=useState(''),[ready,setReady]=useState(false);
 useEffect(()=>{
  let alive=true,map:MapWithUpdate,popup:gl.Popup|undefined,frame=0;
  let cityLayer:CityLabelLayer;
  const downloads=new AbortController();
  let loadPhysicalDetails:(()=>void)|undefined;
  let fullWorldRequested=false;
  const layoutLabels=()=>{
   if(!map||!cityLayer)return;
   const p=latest.current,zoom=map.getZoom(),size=map.getContainer().getBoundingClientRect();
   const {width,height}=size;
   const occupied:ScreenBox[]=[];
   const workspace=ref.current?.closest('.map-workspace');
   const controls=workspace?.querySelectorAll<HTMLElement>('.map-info-panel,.maps-search-area,.maps-base-toggle,.maps-year-control,.maps-metric-control,.maps-navigation,.maps-floating-legend,.map-reset,.maplibregl-ctrl-group,.maplibregl-ctrl-attrib,.maplibregl-ctrl-scale,.map-city-key');
   for(const el of controls||[]){
    const r=el.getBoundingClientRect();
    if(r.width&&r.height)occupied.push({x:r.left-size.left-2,y:r.top-size.top-2,w:r.width+4,h:r.height+4});
   }
   const sites=cityLayer.project(map,p.selected,p.visible,width,height);
   const place=(label:Label)=>{
    const selected=!!p.selected&&label.iso===p.selected;
    const minimum=label.geographic?label.minimum:focusCountries.includes(label.iso)?1.7:label.rank<=2?0:label.rank<=3?1.7:label.rank<=5?2.5:3.5;
    const inRange=(selected||label.geographic||p.visible.has(label.iso))&&(selected||zoom>=minimum)&&(selected||zoom<=label.maximum)&&(label.geographic||zoom<=5.4||selected);
    let show=false;
    if(inRange){
     const point=map.project(label.point);
     const w=Math.max(24,label.name.length*(label.geographic?11:13)+(label.port?28:selected?27:12)),h=label.geographic?21:27;
     const offsets=selected?[0,-24,24,-44,44]:label.port?[0,24,-24]:[0];
     for(const dy of offsets){
      const box={x:point.x-w/2,y:point.y-h/2+dy,w,h};
      if(!fitsLabel(box,width,height,occupied))continue;
      if(!label.pointMarker){
       label.pointMarker=new gl.Marker({element:label.element,anchor:'center',offset:[0,dy]}).setLngLat(label.point).addTo(map);
       label.offsetY=dy;
      }else if(label.offsetY!==dy){label.pointMarker.setOffset([0,dy]);label.offsetY=dy}
      occupied.push(box);show=true;break;
     }
    }
    if(!show&&label.pointMarker){label.pointMarker.remove();label.pointMarker=undefined;}
    const display=show?'':'none';
    if(label.element.style.display!==display)label.element.style.display=display;
    label.element.classList.toggle('is-selected',selected);
   };
   cityLayer.draw(sites.chosen,true,width,height,occupied);
   const all=labels.current;
   const selectedCountry=all.find(label=>label.iso===p.selected&&!label.geographic);
   if(selectedCountry){
    if(sites.chosen.some(row=>row.site.name===selectedCountry.name))selectedCountry.element.style.display='none';
    else place(selectedCountry);
   }
   for(const label of all)if(label!==selectedCountry&&(!label.geographic||label.port))place(label);
   cityLayer.draw(sites.others,false,width,height,occupied);
   for(const label of all)if(label.geographic&&!label.port)place(label);
   cityLayer.finish();
  };
  const scheduleLabels=()=>{
   if(frame)return;
   frame=requestAnimationFrame(()=>{frame=0;layoutLabels()});
  };
  const styledCountries=(world:FeatureCollection):FeatureCollection=>{
   const p=latest.current,index=new Map(p.countries.map(c=>[c.iso3,c]));
   return {...world,features:world.features.map(f=>{
    const iso=f.properties?.iso3,c=index.get(iso);
    return {...f,properties:{...f.properties,color:c?colorFor(valueOf(c,p.metric,p.year),p.breaks):'#dfe4e7',visible:c&&p.visible.has(iso)?1:0,selected:iso===p.selected?1:0}};
   })};
  };
  const update=()=>{
   if(!map?.getSource('countries')||!geo.current)return;const p=latest.current;
   (map.getSource('countries') as GeoJSONSource).setData(styledCountries(geo.current));
   map.setPaintProperty('countries-fill','fill-opacity',p.thematic?['case',['==',['get','visible'],1],.76,.08]:0);
   map.setPaintProperty('relief','raster-opacity',p.thematic?.12:.94);
   scheduleLabels();
  };
  const addLabels=(water?:WaterLabel[])=>{
   const make=(iso:string,name:string,point:[number,number],rank:number,minimum:number,kind?:GeoLabelKind,maximum=10)=>{
    const geographic=!!kind,port=kind==='port',country=!geographic;
    const el=document.createElement(country?'button':'span');if(country)(el as HTMLButtonElement).type='button';
    el.className=`atlas-place-label ${kind?`${kind}-name`:'country-name'} ${focusCountries.includes(iso)&&country?'research-country':''}`;el.dataset.placeKind=kind||'country';
    if(port){const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');icon.innerHTML='<circle cx="12" cy="5" r="2.5"/><path d="M12 8v12M5 12H2v3c0 4 5 6 10 6s10-2 10-6v-3h-3M8 10h8"/>';el.append(icon)}
    el.append(document.createTextNode(name));
    if(country){el.setAttribute('aria-label',`查看${name}档案`);el.addEventListener('click',()=>latest.current.onSelect(iso))}
    labels.current.push({iso,name,element:el,point,rank,minimum,geographic,port,maximum,offsetY:0});
   };
   if(water){
    for(const [kind,name,point,rank,minimum,maximum] of water)make('',name,point,rank,minimum,kind,maximum);
   }else{
    const names=new Map(latest.current.countries.map(c=>[c.iso3,c.name]));
    const positions=new Map((geo.current?.features||[]).map(f=>[f.properties?.iso3,f.properties]));
    for(const [iso,p] of positions){
     const name=names.get(iso);
     if(name&&p&&typeof p.label_x==='number'&&typeof p.label_y==='number')make(iso,name,[p.label_x,p.label_y],p.label_rank||5,0);
    }
   }
   labels.current.sort((a,b)=>Number(a.geographic)-Number(b.geographic)||a.rank-b.rank);
   layoutLabels();
  };
  try{
   map=new gl.Map({container:ref.current!,style:{version:8,sources:{},layers:[{id:'ocean',type:'background',paint:{'background-color':'#6fd3e7'}}]},...home,minZoom:.65,maxZoom:10,attributionControl:false,renderWorldCopies:false,dragRotate:false,pitchWithRotate:false,fadeDuration:150});
   cityLayer=new CityLabelLayer(map.getCanvasContainer(),iso=>{
    if(latest.current.selected!==iso){popup?.remove();latest.current.onSelect(iso)}
   });
   mapRef.current=map;map.refreshData=update;map.addControl(new gl.NavigationControl({showCompass:false}),'bottom-right');map.addControl(new gl.ScaleControl({maxWidth:78,unit:'metric'}),'bottom-left');map.addControl(new gl.AttributionControl({compact:true,customAttribution:'Natural Earth · <a href="https://www.geonames.org/" target="_blank" rel="noreferrer">GeoNames</a>'}),'bottom-left');
   map.on('move',scheduleLabels);map.on('resize',scheduleLabels);
   map.on('load',async()=>{try{
    const world=await loadOverviewCountries().catch(()=>api<FeatureCollection>('/api/geojson',{signal:downloads.signal}));
    if(!alive)return;
    geo.current=world;
    map.addSource('countries',{type:'geojson',data:styledCountries(world)});
    loadPhysicalDetails=addPhysicalBasemap(map,!!latest.current.thematic,downloads.signal,water=>addLabels(water));
    map.addLayer({id:'countries-border',type:'line',source:'countries',paint:{'line-color':'#3f494d','line-width':['interpolate',['linear'],['zoom'],1,.45,5,.9],'line-opacity':.7}});
    map.addLayer({id:'filtered-fill',type:'fill',source:'countries',filter:['==',['get','visible'],0],paint:{'fill-color':'#f9fbfa','fill-opacity':.6}});
    map.addSource('tropics',{type:'geojson',data:tropics});
    map.addLayer({id:'tropics-lines',type:'line',source:'tropics',paint:{'line-color':'#637e83','line-width':['interpolate',['linear'],['zoom'],1,.75,5,.95],'line-opacity':.36,'line-dasharray':[5,7]}});
    map.addLayer({id:'selected-fill',type:'fill',source:'countries',filter:['==',['get','selected'],1],paint:{'fill-color':'#205746','fill-opacity':.045}});
    map.addLayer({id:'selected-line',type:'line',source:'countries',filter:['==',['get','selected'],1],paint:{'line-color':'#205746','line-width':1.8}});
    map.addLayer({id:'hover-line',type:'line',source:'countries',filter:['==',['get','iso3'],''],paint:{'line-color':'#427361','line-width':1.5}});
    const refreshDetail=()=>{
     loadPhysicalDetails?.();
     if(map.getZoom()<3||fullWorldRequested)return;
     fullWorldRequested=true;
     api<FeatureCollection>('/api/geojson',{signal:downloads.signal}).then(detailed=>{
      if(alive){geo.current=detailed;update()}
     }).catch(()=>{fullWorldRequested=false});
    };
    map.on('zoomend',refreshDetail);
    refreshDetail();
    const firstPaint=()=>{
     if(!map.isSourceLoaded('countries'))return;
     // The polygons already participate in hit testing in the frame that dismisses the loader.
     map.off('render',firstPaint);
     addLabels();
     setReady(true);
    };
    map.on('render',firstPaint);

   }catch(e){if(alive)setError(e instanceof Error?e.message:'地图数据加载失败')}});
   map.on('mousemove','countries-fill',e=>{
    const f=e.features?.[0];if(!f)return;const p=latest.current,iso=f.properties.iso3,c=p.countries.find(x=>x.iso3===iso);
    if(!c||!p.visible.has(iso)){popup?.remove();map.getCanvas().style.cursor='';map.setFilter('hover-line',['==',['get','iso3'],'']);return}
    map.getCanvas().style.cursor='pointer';map.setFilter('hover-line',['==',['get','iso3'],iso]);const el=document.createElement('div'),strong=document.createElement('strong'),small=document.createElement('span');strong.textContent=c.name;
    el.append(strong);if(p.thematic){small.textContent=`${compact(valueOf(c,p.metric,p.year),p.metric)} · ${p.year}`;el.append(small)}if(!popup)popup=new gl.Popup({closeButton:false,closeOnClick:false,offset:14,className:'map-tooltip'});popup.setLngLat(e.lngLat).setDOMContent(el).addTo(map);
   });
   map.on('mouseleave','countries-fill',()=>{popup?.remove();map.getCanvas().style.cursor='';map.setFilter('hover-line',['==',['get','iso3'],''])});
   map.on('click','countries-fill',e=>{const iso=e.features?.[0]?.properties.iso3;if(iso&&latest.current.visible.has(iso)){popup?.remove();latest.current.onSelect(iso)}});
   map.on('error',e=>{if(alive&&/WebGL|Worker failed|worker script/.test(String(e.error)))setError('浏览器未能初始化地图，请从搜索结果继续查询。')});
  }catch{setError('地图暂不可用。搜索、档案和对比仍可正常使用。')}
  const resizeObserver=new ResizeObserver(()=>mapRef.current?.resize());if(ref.current)resizeObserver.observe(ref.current);
  return()=>{alive=false;downloads.abort();cancelAnimationFrame(frame);resizeObserver.disconnect();popup?.remove();cityLayer?.remove();map?.remove();mapRef.current=null;labels.current=[]};
 },[]);
 useEffect(()=>{mapRef.current?.refreshData?.()},[props.countries,props.visible,props.metric,props.year,props.breaks,props.selected,props.thematic]);
 useEffect(()=>{
  const map=mapRef.current;if(!ready||!map)return;if(!props.selected){map.setPadding({left:0,right:0,top:0,bottom:0});return}
  const c=props.countries.find(c=>c.iso3===props.selected);if(!c)return;
  const feature=geo.current?.features.find(f=>f.properties?.iso3===c.iso3),p=feature?.properties;
  const countryPoint:[number,number]|undefined=p?.label_x!=null?[p.label_x,p.label_y]:undefined;
  const mainland=mainlandBounds(feature?.geometry,countryPoint);
  const focus=()=>{
   const box=ref.current?.getBoundingClientRect(),width=box?.width||1440;
   const height=box?.height||800;
   const padding=countryPadding(width,height);
   const extent=cityBounds(countryCities[c.iso3]||[],countryPoint,bounds[c.iso3],width>=950?mainland:undefined);
   if(extent&&width>padding.left+padding.right&&height>padding.top+padding.bottom){
    map.fitBounds(extent,{padding,maxZoom:8.6,duration:700});return;
   }
   if(p?.label_x!=null)map.flyTo({center:[p.label_x,p.label_y],zoom:(p.label_rank||5)<=2?2.5:3.8,padding,duration:700});
   else if(c.longitude!=null&&c.latitude!=null)map.flyTo({center:[Number(c.longitude),Number(c.latitude)],zoom:4,padding,duration:700});
  };
  focus();map.on('resize',focus);return()=>{map.off('resize',focus)};
 },[props.selected,ready]);
 useEffect(()=>{if(ready&&props.homeRequest>0)showWorld(mapRef.current)},[props.homeRequest,ready]);
 const locateCity=(coordinates:[number,number])=>{
  const map=mapRef.current;
  if(!map)return;
  const {width,height}=map.getContainer().getBoundingClientRect();
  const pad=countryPadding(width,height);
  map.easeTo({center:coordinates,zoom:Math.max(map.getZoom(),7.8),padding:{left:0,right:0,top:0,bottom:0},offset:[(pad.left-pad.right)/2,(pad.top-pad.bottom)/2],duration:350});
 };
 return <div className={`map-surface${props.thematic?' is-thematic':''}`}><div ref={ref} className="map-canvas" aria-label="可拖动缩放的全球地理地图"/>{ready&&<MapCityKey key={props.selected} cities={countryCities[props.selected]??[]} onLocate={locateCity}/>}{!ready&&!error&&<div className="map-loading"><span className="spinner"/>正在加载地理底图…</div>}{error&&<div className="map-failure"><AlertCircle size={28}/><h3>地图暂时不可用</h3><p>{error}</p><p>使用搜索结果，可继续查看全部国家。</p></div>}<button className="map-reset icon-button" title="回到全球视图" aria-label="回到全球视图" onClick={()=>showWorld(mapRef.current)}><Maximize size={19}/></button></div>;
}
