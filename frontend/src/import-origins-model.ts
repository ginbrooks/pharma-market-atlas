import type {Country,ImportOriginData,ImportOriginGroupId,ImportOriginPartner,Profile} from './types';
import {hasReliableSources} from './evidence-display.ts';

export const originGroups:Record<ImportOriginGroupId,{label:string;color:string}>={
 china:{label:'中国大陆',color:'#477a93'},
 india:{label:'印度',color:'#cf9452'},
 eu:{label:'欧盟27国',color:'#738eaa'},
 uk:{label:'英国',color:'#8f7ea1'},
 switzerland:{label:'瑞士',color:'#bb7f7a'},
 usa:{label:'美国',color:'#67948a'},
 other:{label:'其他',color:'#bdc5cb'},
};
const groupIds=Object.keys(originGroups) as ImportOriginGroupId[];
const finiteAmount=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=0;

export function visibleImportOrigins(profile:Profile|null){
 const section=profile?.sections.find(s=>s.id==='import_origins');
 const data=section?.import_origin_data;
 if(!section||!data||!hasReliableSources(section.source_ids,profile?.sources||[]))return null;
 if(!Number.isInteger(data.year)||data.year<1900||data.year>=new Date().getFullYear()||data.hs_code!=='3004'||data.currency!=='USD'||data.basis!=='reporter_imports'||!finiteAmount(data.total_usd)||data.total_usd<=0)return null;
 if(!Array.isArray(data.groups)||data.groups.length!==groupIds.length||new Set(data.groups.map(g=>g.id)).size!==groupIds.length)return null;
 if(data.groups.some(g=>!groupIds.includes(g.id)||!finiteAmount(g.amount_usd)||!finiteAmount(g.share_pct)||g.share_pct>100||Math.abs(g.share_pct-g.amount_usd/data.total_usd*100)>.02))return null;
 if(Math.abs(data.groups.reduce((sum,g)=>sum+g.amount_usd,0)-data.total_usd)>Math.max(1,data.total_usd*.000001))return null;
 if(!Array.isArray(data.partners)||!data.partners.length||data.partners.some(p=>!finiteAmount(p.amount_usd)||!finiteAmount(p.share_pct)||p.share_pct>100||String(p.code)==='0'))return null;
 return {section,data};
}
export function originAmount(value:number){
 if(value>=100000000)return `${(value/100000000).toLocaleString('zh-CN',{maximumFractionDigits:2})}亿美元`;
 if(value>=10000)return `${(value/10000).toLocaleString('zh-CN',{maximumFractionDigits:1})}万美元`;
 return `${value.toLocaleString('zh-CN',{maximumFractionDigits:0})}美元`;
}
export function originShare(value:number){return value>0&&value<.01?'<0.01%':`${value.toLocaleString('zh-CN',{maximumFractionDigits:2})}%`}
export function originPartnerNames(countries:Pick<Country,'iso3'|'name'>[]){return new Map(countries.map(c=>[c.iso3,c.name]))}
const partnerLabels:Record<string,string>={'0':'全球','156':'中国大陆','344':'中国香港','446':'中国澳门','490':'其他亚洲地区','899':'未列明来源','837':'船舶燃料及物料','838':'自由区','839':'未列明特殊地区'};
export function originPartnerName(partner:ImportOriginPartner,names:Map<string,string>){return partnerLabels[partner.code]||(partner.iso3?names.get(partner.iso3):undefined)||partner.name}
export function rankedOriginPartners(data:ImportOriginData){return [...data.partners].filter(p=>p.amount_usd>0).sort((a,b)=>b.amount_usd-a.amount_usd||String(a.code).localeCompare(String(b.code)))}

// Keep the captured API URL in the record; open the same query in Comtrade's reader UI.
export function originSourcePageUrl(sourceUrl:string){
 try{
  const source=new URL(sourceUrl),q=source.searchParams;
  const reporter=q.get('reporterCode'),year=q.get('period');
  if(source.hostname!=='comtradeapi.un.org'||source.pathname!=='/public/v1/preview/C/A/HS'||q.get('cmdCode')!=='3004'||q.get('flowCode')!=='M'||!reporter||!/^\d+$/.test(reporter)||!year||!/^\d{4}$/.test(year))return sourceUrl;
  const params=new URLSearchParams({Frequency:'A',Flows:'M',CommodityCodes:'3004',Partners:'all',Reporters:reporter,period:year,AggregateBy:'none',BreakdownMode:'plus'});
  return `https://comtradeplus.un.org/TradeFlow?${params}`;
 }catch{return sourceUrl}
}
