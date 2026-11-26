import type {FeatureCollection} from 'geojson';
import type {GeoJSONSource, ImageSource, Map as GLMap} from 'maplibre-gl';
import {terrainUrl, waterUrl} from './map-overview';
import type {OverviewWater,WaterLabel} from './map-overview';

const empty:FeatureCollection={type:'FeatureCollection',features:[]};
const earthCorners:[[number,number],[number,number],[number,number],[number,number]]=
 [[-180,85.05112878],[180,85.05112878],[180,-85.05112878],[-180,-85.05112878]];

// Keep layer order fixed while changing the scale of their source data. Optional
// detail downloads never gate the country polygons or their click handlers.
export function addPhysicalBasemap(map:GLMap,thematic:boolean,signal:AbortSignal,onLabels:(labels:WaterLabel[])=>void){
 map.addLayer({id:'land-fill',type:'fill',source:'countries',paint:{'fill-color':'#f8f6f1'}});
 map.addSource('terrain-image',{type:'image',url:terrainUrl,coordinates:earthCorners});
 map.addLayer({id:'relief',type:'raster',source:'terrain-image',paint:{'raster-opacity':thematic?.12:.94,'raster-fade-duration':0}});
 map.addLayer({id:'countries-fill',type:'fill',source:'countries',paint:{'fill-color':['coalesce',['get','color'],'#e2ebdf'],'fill-opacity':thematic?['case',['==',['get','visible'],1],.76,.08]:0}});
 map.addSource('rivers',{type:'geojson',data:empty});
 map.addLayer({id:'rivers-lines',type:'line',source:'rivers',minzoom:1.6,filter:['<=',['get','rank'],3],layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#62c5d8','line-width':['interpolate',['linear'],['zoom'],1.6,.55,4,1.25,6.2,2.1],'line-opacity':.88}});
 map.addLayer({id:'rivers-regional',type:'line',source:'rivers',minzoom:3,filter:['all',['>',['get','rank'],3],['<=',['get','rank'],6]],layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#70cddd','line-width':['interpolate',['linear'],['zoom'],3,.45,4.5,.85,6.2,1.45],'line-opacity':.82}});
 map.addLayer({id:'rivers-local',type:'line',source:'rivers',minzoom:4.7,filter:['>',['get','rank'],6],layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#7bd0df','line-width':['interpolate',['linear'],['zoom'],4.7,.4,6.2,.9],'line-opacity':.72}});
 map.addSource('lakes',{type:'geojson',data:empty});
 map.addLayer({id:'lakes-fill',type:'fill',source:'lakes',paint:{'fill-color':'#6fd3e7'}});
 map.addLayer({id:'lakes-shore',type:'line',source:'lakes',minzoom:3,paint:{'line-color':'#58b7c9','line-width':.45,'line-opacity':.65}});

 const started=new Set<string>();
 function load(name:string,install:(data:FeatureCollection)=>void) {
  if(started.has(name))return;
  started.add(name);
  fetch('/api/basemap/'+name+'.geojson',{signal}).then(async res=>{
   if(!res.ok)throw Error(res.statusText);
   const json=await res.json();
   if(!signal.aborted)install(json);
  }).catch(()=>started.delete(name));
 }
 const detailedWater=new Set<string>();
 fetch(waterUrl,{signal}).then(async res=>{
  if(!res.ok)return;
  const data:OverviewWater=await res.json();
  if(signal.aborted)return;
  for(const id of ['rivers','lakes'] as const){
   if(!detailedWater.has(id))(map.getSource(id) as GeoJSONSource).setData(data[id]);
  }
  onLabels(data.labels);
 }).catch(()=>{});

 return ()=>{
  const zoom=map.getZoom();
  if(zoom<3)return;
  if(!started.has('relief')){
   started.add('relief');
   (map.getSource('terrain-image') as ImageSource).updateImage({url:'/api/basemap/relief.webp'});
  }
  load('land',data=>{
   map.addSource('land',{type:'geojson',data});
   map.addLayer({id:'detailed-land-fill',type:'fill',source:'land',paint:{'fill-color':'#f8f6f1'}},'land-fill');
   map.setLayoutProperty('land-fill','visibility','none');
  });
  for(const id of ['rivers','lakes']){
   load(id,data=>{detailedWater.add(id);(map.getSource(id) as GeoJSONSource).setData(data)});
  }
  load('province-lines',data=>{
   map.addSource('province',{type:'geojson',data});
   map.addLayer({id:'province-lines',type:'line',source:'province',minzoom:3,paint:{'line-color':'#78817f','line-width':.6,'line-dasharray':[2,3],'line-opacity':.65}},'rivers-lines');
  });
  if(zoom>=3.5)load('urban-areas',data=>{
   map.addSource('urban',{type:'geojson',data});
   map.addLayer({id:'urban-fill',type:'fill',source:'urban',minzoom:3.5,paint:{'fill-color':'#eeece4','fill-opacity':.55}},map.getLayer('province-lines')?'province-lines':'rivers-lines');
  });
  if(zoom>=3.8)load('roads',data=>{
   map.addSource('roads',{type:'geojson',data});
   map.addLayer({id:'roads-lines',type:'line',source:'roads',minzoom:3.8,paint:{'line-color':'#ddd1b4','line-width':['interpolate',['linear'],['zoom'],3.8,.4,6,1.1],'line-opacity':.65}},'countries-border');
  });
 };
}
