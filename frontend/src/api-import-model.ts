import type {ApiImportData,ApiImportCategory,Profile} from './types';
import {hasReliableSources} from './evidence-display.ts';

export const apiAmount=(value:number,currency=true)=>value>=100000
 ?`${(value/100000).toLocaleString('zh-CN',{maximumFractionDigits:2})}亿${currency?'美元':''}`
 :`${(value/10).toLocaleString('zh-CN',{maximumFractionDigits:2})}万${currency?'美元':''}`;
export function apiChange(value:number|null){return value===null?'—':value===0?'持平':`${value>0?'+':'−'}${(Math.abs(value)*100).toLocaleString('zh-CN',{maximumFractionDigits:1})}%`}
export function visibleApiImports(profile:Profile|null){
 const section=profile?.sections.find(s=>s.id==='api_imports');
 const data=section?.api_import_data;
 return section&&data&&hasReliableSources(section.source_ids,profile?.sources||[])&&data.years.some(y=>y.amount_kusd!==null&&Number.isFinite(y.amount_kusd))?{section,data}:null;
}
export function apiImportIntro(data:ApiImportData,year=data.latest_year){
 const row=data.years.find(y=>y.year===year);
 if(!row||row.amount_kusd===null)return '';
 const growth=row.yoy??row.common_yoy;
 const basis=row.yoy===null&&row.common_yoy!==null?'同类目同比':'同比';
 const change=growth===null?'':growth===0?`，${basis}持平`:`，${basis}${growth>0?'增长':'下降'}${(Math.abs(growth)*100).toFixed(1)}%`;
 return `${row.year}年${row.name}原料药相关进口合计${apiAmount(row.amount_kusd)}${change}。`;
}
export function apiCategoryRows(data:ApiImportData,year:number,query='',sort='amount'){
 const needle=query.trim().toLocaleLowerCase();
 const total=data.years.find(row=>row.year===year)?.amount_kusd;
 return data.categories.flatMap(category=>{
  const point=category.points.find(p=>p.year===year);
  if(point?.amount_kusd==null||!Number.isFinite(point.amount_kusd))return [];
  if(needle&&!`${category.name} ${category.name_en} ${category.id}`.toLocaleLowerCase().includes(needle))return [];
  return [{category,point,share:total!=null&&total>0?point.amount_kusd/total:null}];
 }).sort((a,b)=>sort==='growth'
  ?(b.point.yoy??-Infinity)-(a.point.yoy??-Infinity)||b.point.amount_kusd!-a.point.amount_kusd!||a.category.id.localeCompare(b.category.id)
  :b.point.amount_kusd!-a.point.amount_kusd!||a.category.id.localeCompare(b.category.id));
}
export function apiLeadingCategories(data:ApiImportData,year:number):{featured:ApiImportCategory[];others:ApiImportCategory[]}{
 const rows=apiCategoryRows(data,year).filter(row=>row.point.amount_kusd!>0).slice(0,6);
 return {featured:rows.slice(0,1).map(r=>r.category),others:rows.slice(1).map(r=>r.category)};
}
