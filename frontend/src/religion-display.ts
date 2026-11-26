import type {Profile,ReligionData,ReligionGroup} from './types';
import {hasReliableSources,supportedText} from './evidence-display.ts';
import {hasReadableNoteSources,readableNoteSource} from './local-culture.ts';

const validShare=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=100;
const validBound=(group:ReligionGroup)=>group.share===null&&group.share_operator==='<'&&validShare(group.upper_bound)&&group.upper_bound>0&&/^<\s*\d+(?:\.\d+)?\s*%$/.test(group.display_share||'')&&Number(group.display_share!.replace(/[<%\s]/g,''))===group.upper_bound;
export const religionShareText=(group:ReligionGroup)=>group.share!=null?`${group.share.toLocaleString('zh-CN',{maximumFractionDigits:2})}%`:(group.display_share||'');

export function visibleReligion(profile:Profile|null){
 const section=profile?.sections.find(s=>s.id==='religion'),data=section?.religion,sources=profile?.sources||[];
 if(!data||!Number.isInteger(data.year)||data.year<1900||data.year>Number(new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'}).slice(0,4))||!supportedText(data.denominator))return null;
 const groups=(data.groups||[]).filter(g=>supportedText(g.label)&&(validShare(g.share)||validBound(g))&&hasReliableSources(g.source_ids,sources)).sort((a,b)=>(b.share??0)-(a.share??0));
 if(!groups.length)return null;
 const candidates=groups.filter(g=>!['other','unaffiliated','not_stated'].includes(g.id)&&(g.share??0)>0).map(g=>({group:g,tradition:data.traditions?.find(t=>t.id===g.id)})).filter(({tradition})=>!!tradition).map(({group,tradition})=>({...tradition!,share:group.share!,practices:tradition!.practices.filter(p=>supportedText(p.text)&&hasReliableSources(p.source_ids,sources))})).filter(t=>t.practices.length>0);
 const major=candidates.filter(t=>t.share>=10);
 const traditions=(major.length?major:candidates).slice(0,major.length?3:1);
 const definitions=(data.traditions||[]).filter(t=>groups.some(g=>g.id===t.id)&&supportedText(t.introduction)&&hasReliableSources(t.source_ids,sources));
 const everyday=(data.everyday||[]).filter(item=>supportedText(item.label)&&supportedText(item.text)&&supportedText(item.applies_to)&&hasReadableNoteSources(item.source_ids,sources));
 const evidenceIds=new Set([...(data.source_ids||[]),...groups.flatMap(g=>g.source_ids),...traditions.flatMap(t=>t.practices.flatMap(p=>p.source_ids)),...definitions.flatMap(t=>t.source_ids||[]),...everyday.flatMap(item=>item.source_ids)]);
 return {data,groups,traditions,definitions,everyday,sources:sources.filter(s=>evidenceIds.has(s.id)&&readableNoteSource(s))};
}

export function validateReligionData(value:unknown,knownSources:Set<string>,sectionSources:Set<string>):string[]{
 const errors:string[]=[];
 if(!value||typeof value!=='object'||Array.isArray(value))return ['宗教资料须为对象'];
 const data=value as ReligionData;
 if(!Number.isInteger(data.year)||data.year<1900||data.year>Number(new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'}).slice(0,4)))errors.push('宗教资料须填写有效统计年份');
 for(const key of ['geographic_scope','denominator','methodology'] as const)if(typeof data[key]!=='string'||!data[key].trim())errors.push(`宗教资料缺少${{geographic_scope:'地域范围',denominator:'人口分母',methodology:'统计方法'}[key]}`);
 const checkRefs=(refs:unknown)=>{
  if(!Array.isArray(refs)||!refs.length||refs.some(id=>typeof id!=='string'||!knownSources.has(id)||!sectionSources.has(id)))errors.push('宗教明细来源须存在于本档案并纳入章节引用');
 };
 if(!Array.isArray(data.groups)||!data.groups.length)errors.push('宗教人口构成须为非空列表');
 else {
  const ids=new Set<string>();let total=0,upper=0;
  for(const group of data.groups){
   if(!group||typeof group!=='object'){errors.push('宗教分组须为对象');continue}
   if(typeof group.id!=='string'||!group.id||ids.has(group.id))errors.push('宗教分组 ID 须唯一且非空');
   ids.add(group.id);
   if(typeof group.label!=='string'||!group.label.trim())errors.push('宗教分组须填写名称');
   if(!validShare(group.share)&&!validBound(group))errors.push('宗教占比须为 0–100 的数值或保留原文上限的比例');
   if(group.share!==null&&(group.upper_bound!==undefined||group.share_operator!==undefined))errors.push('上限占比须保留 null，不得当作精确占比');
   if(group.display_share!==undefined&&typeof group.display_share!=='string')errors.push('宗教占比显示值须为文本');
   if(validShare(group.share)){total+=group.share;upper+=group.share}else if(validBound(group))upper+=group.upper_bound!;
   checkRefs(group.source_ids);
  }
  const tolerance=.05*data.groups.length;
  if(total>100+tolerance+1e-9)errors.push('同一口径宗教占比合计不可超过 100%');
  if(data.composition_complete===true&&(total>100+tolerance+1e-9||upper<100-tolerance-1e-9))errors.push('完整宗教构成合计须覆盖 100%');
 }
 if(!Array.isArray(data.traditions))errors.push('宗教习俗须为列表');
 else for(const tradition of data.traditions){
  if(!tradition||typeof tradition!=='object'){errors.push('宗教习俗须为对象');continue}
  for(const key of ['id','label','introduction'] as const)if(typeof tradition[key]!=='string')errors.push('宗教习俗须填写名称与简介');
  if(['other','unaffiliated','not_stated'].includes(tradition.id)&&tradition.practices?.length)errors.push('其他宗教和无宗教归属不可设定统一禁忌');
  if(tradition.source_ids!==undefined)checkRefs(tradition.source_ids);
  if(!Array.isArray(tradition.practices)){errors.push('宗教习惯须为列表');continue}
  for(const practice of tradition.practices){
   if(!practice||typeof practice!=='object'){errors.push('宗教习惯须为对象');continue}
   for(const key of ['id','label','text','applies_to'] as const)if(typeof practice[key]!=='string'||!practice[key].trim())errors.push('宗教习惯须填写内容及适用人群');
   checkRefs(practice.source_ids);
  }
 }
 if(data.everyday!==undefined){
  if(!Array.isArray(data.everyday))errors.push('当地日常资料须为列表');
  else{
   const ids=new Set<string>();
   for(const item of data.everyday){
    if(!item||typeof item!=='object'){errors.push('当地日常资料须为对象');continue}
    for(const key of ['id','label','text','applies_to'] as const)if(typeof item[key]!=='string'||!item[key].trim())errors.push('当地日常资料须填写内容及适用人群');
    if(ids.has(item.id))errors.push('当地日常资料 ID 须唯一');
    ids.add(item.id);
    if(item.year!==undefined&&(!Number.isInteger(item.year)||item.year<1900||item.year>Number(new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'}).slice(0,4))))errors.push('当地日常资料须填写有效年份');
    checkRefs(item.source_ids);
   }
  }
 }
 return errors;
}
