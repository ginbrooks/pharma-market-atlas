import type {Profile} from './types';
import {hasReliableSources,supportedText} from './evidence-display.ts';

export const gmpTopics={standard:'采用标准',inspection:'境外工厂检查',reliance:'证书与报告认可',application:'申请路径',local_agent:'本地主体',timeline:'时限与有效期',fees:'官方费用',register:'注册与查询',procurement:'采购准入',protection:'本地保护'};
const topicOrder=Object.keys(gmpTopics);
const terms:Record<string,string>={
 'PIC/S':'药品检查合作计划，药监机构之间的合作机制',
 WLA:'世界卫生组织列名监管机构',ML4:'世界卫生组织监管成熟度第四级',
 CPP:'药品证明书，供出口注册使用',CTD:'通用技术文档，药品注册资料的组织格式',
 CAPA:'纠正与预防措施',SMF:'工厂主文件',MRA:'监管机构之间的互认协议',
 SRA:'严格监管机构，世界卫生组织使用的监管分类',
 CEP:'欧洲药典适用性证书',EDQM:'欧洲药品质量管理局',
 };
export function usedGmpTerms(text:string){return Object.entries(terms).filter(([key])=>new RegExp(`(^|[^A-Za-z])${key}($|[^A-Za-z])`).test(text));}

export function visibleGmp(profile:Profile|null,category:'access'|'procurement'='access'){
 const section=profile?.sections.find(s=>s.id==='gmp_access'),data=section?.gmp;
 if(!data||!Array.isArray(data.facts))return null;
 const sources=profile?.sources||[],seen=new Set<string>();
 const facts=data.facts.filter(f=>{
  if(!f||seen.has(f.id)||!topicOrder.includes(f.topic)||!supportedText(f.title)||!supportedText(f.summary)||!hasReliableSources(f.source_ids,sources)||f.source_ids.some(id=>!section?.source_ids.includes(id)))return false;
  if(category==='procurement'?f.topic!=='procurement':f.topic==='procurement')return false;
  seen.add(f.id);return true;
 }).sort((a,b)=>topicOrder.indexOf(a.topic)-topicOrder.indexOf(b.topic));
 return facts.length?{section:section!,data,facts,sources}:null;
}

export function visibleMarketContext(profile:Profile|null){
 const section=profile?.sections.find(s=>s.id==='market_context');
 const seen=new Set<string>();
 return (section?.market_context?.indicators||[]).filter(i=>{
  if(!i||seen.has(i.id)||!['inflation','gdp_growth','urban_share','population_growth'].includes(i.id)||typeof i.value!=='number'||!Number.isFinite(i.value)||i.unit!=='%'||!Number.isInteger(i.year)||i.year<1900||i.year>=new Date().getFullYear()||!hasReliableSources([i.source_id],profile?.sources||[])||!section?.source_ids.includes(i.source_id))return false;
  seen.add(i.id);return true;
 });
}
