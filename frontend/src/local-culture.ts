import type {LocalNote,Profile,Source,CulturePhoto,CultureCategory} from './types';
import {supportedText} from './evidence-display.ts';

export const readableNoteSource=(source:Source)=>source.check_status==='accessible'||source.check_status==='indexed_text'&&['indexed_primary_text','indexed_source_text'].includes((source as Source&{verification_method?:string}).verification_method||'');
export const hasReadableNoteSources=(ids:string[],sources:Source[])=>!!ids?.length&&ids.every(id=>sources.some(s=>s.id===id&&readableNoteSource(s)));

function visibleNotes(profile:Profile|null,container:'local_culture'|'religion_life',field:'highlights'|'everyday'){
 const section=profile?.sections.find(s=>s.id===container),data=section?.[container] as {highlights?:LocalNote[];everyday?:LocalNote[]}|undefined;
 const sources=profile?.sources||[];
 const items=(data?.[field]||[]).filter(item=>supportedText(item.label)&&supportedText(item.text)&&supportedText(item.applies_to)&&hasReadableNoteSources(item.source_ids,sources));
 const refs=new Set(items.flatMap(item=>item.source_ids));
 return {items,sources:sources.filter(s=>refs.has(s.id)&&readableNoteSource(s))};
}
export const visibleLocalCulture=(profile:Profile|null)=>visibleNotes(profile,'local_culture','highlights');
export const visibleReligionLife=(profile:Profile|null)=>visibleNotes(profile,'religion_life','everyday');

export const cultureCategories:Record<CultureCategory,string>={food:'吃喝与餐桌',festival:'节日与庆典',clothing:'服饰与穿戴',custom:'家庭与日常',region:'地区与人群',place:'城市与居住',arts:'艺术与娱乐'};
export const cultureIsExpanded=(profile:Profile|null)=>visibleLocalCulture(profile).items.length>0;
export function culturePhotos(item:LocalNote){
 return [...(item.photo?[item.photo]:[]),...(item.photos||[])].filter(validCulturePhoto).filter((photo,i,all)=>all.findIndex(p=>p.src===photo.src)===i);
}
export function cultureGroups(items:LocalNote[]){
 return (Object.keys(cultureCategories) as CultureCategory[]).map(id=>({id,label:cultureCategories[id],items:items.filter(item=>(item.category||'custom')===id)})).filter(group=>group.items.length>0);
}

export function validCulturePhoto(value:unknown):value is CulturePhoto{
 if(!value||typeof value!=='object')return false;
 const p=value as CulturePhoto;
 return ['src','alt','caption','credit','source_url','license','license_url'].every(k=>typeof p[k as keyof CulturePhoto]==='string'&&p[k as keyof CulturePhoto].trim())
  && /^\/media\/culture\/[a-z0-9-]+\.(jpg|jpeg|webp|png)$/.test(p.src)
  && [p.source_url,p.license_url].every(u=>{try{return new URL(u).protocol==='https:'}catch{return false}});
}

export function validateLocalNotes(value:unknown,field:'highlights'|'everyday',knownSources:Set<string>,sectionSources:Set<string>):string[]{
 const label=field==='highlights'?'当地特色':'当地信仰生活',errors:string[]=[];
 if(!value||typeof value!=='object'||!Array.isArray((value as Record<string,unknown>)[field]))return [label+'须为对象列表'];
 const ids=new Set<string>();
 for(const item of (value as Record<string,LocalNote[]>)[field]){
  if(!item||typeof item!=='object'){errors.push(label+'每项须为对象');continue}
  if(['id','label','text','applies_to'].some(key=>typeof item[key as keyof LocalNote]!=='string'||!String(item[key as keyof LocalNote]).trim()))errors.push(label+'须填写标题、内容和适用范围');
  if(ids.has(item.id))errors.push(label+'条目 ID 不可重复');ids.add(item.id);
  if(!Array.isArray(item.source_ids)||!item.source_ids.length||item.source_ids.some(id=>!knownSources.has(id)||!sectionSources.has(id)))errors.push(label+'须引用档案中已登记且纳入章节的来源');
  if(item.year!==undefined&&(!Number.isInteger(item.year)||item.year<1900||item.year>Number(new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'}).slice(0,4))))errors.push(label+'须使用有效调查或观察年份');
  if(item.when!==undefined&&(typeof item.when!=='string'||!item.when.trim()))errors.push(label+'时间须为非空文本');
  if(item.photo!==undefined&&!validCulturePhoto(item.photo))errors.push('图片须使用本地文化图片路径，并填写图注、图片说明、署名和来源及许可链接');
  if(item.photos!==undefined&&(!Array.isArray(item.photos)||item.photos.length>6||item.photos.some(photo=>!validCulturePhoto(photo))))errors.push('补充图片须为最多六张具备完整署名与许可的本地图片');
  if(item.category!==undefined&&!Object.hasOwn(cultureCategories,item.category))errors.push('当地文化分类无效');
 }
 return errors;
}
