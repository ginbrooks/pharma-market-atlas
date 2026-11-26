import type {FeatureCollection} from 'geojson';
import countryUrl from './map-overview/countries.geojson?url';
import terrainUrl from './map-overview/terrain.webp?url';
import waterUrl from './map-overview/water.json?url';

export type WaterLabel = ['river'|'lake'|'sea'|'ocean'|'port', string, [number,number], number, number, number];
export type OverviewWater = {lakes:FeatureCollection;rivers:FeatureCollection;labels:WaterLabel[]};
export {terrainUrl, waterUrl};

let countries:Promise<FeatureCollection>|undefined;
export function loadOverviewCountries(){
 if(!countries){
  countries=fetch(countryUrl).then(res=>{
   if(!res.ok)throw new Error('国家边界暂时未能加载');
   return res.json() as Promise<FeatureCollection>;
  }).catch(error=>{countries=undefined;throw error});
 }
 return countries;
}

export function preloadOverview(){
 void loadOverviewCountries().catch(()=>{});
 const image=document.createElement('link');
 image.rel='preload';image.as='fetch';image.crossOrigin='anonymous';image.href=terrainUrl;
 document.head.append(image);
}
