import type {Profile,MedicineSite} from './types';

const methods=new Set(['page_content','official_directory','official_search_result']);
export function websiteUrl(value:string){
 try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password&&!/\s/.test(value)?url.href:null}catch{return null}
}
export function websiteHost(value:string){try{return new URL(value).hostname.replace(/^www\./,'')}catch{return ''}}
export function visibleMedicineSites(profile:Profile|null):MedicineSite[]{
 const section=profile?.sections.find(s=>s.id==='official_medicine_sites');
 if(!section||!Array.isArray(section.medicine_sites))return [];
 const seen=new Set<string>();
 return section.medicine_sites.filter(site=>{
  const url=websiteUrl(site.url);
  const evidence=site.source_ids?.length&&site.source_ids.every(id=>(profile?.sources||[]).some(s=>s.id===id&&(s.check_status==='accessible'||site.verification_method==='official_search_result'&&s.check_status==='search_index_only')));
  if(!url||seen.has(url.replace(/\/$/,''))||!site.title?.trim()||!site.description?.trim()||!site.checked_at||!methods.has(site.verification_method)||!evidence)return false;
  seen.add(url.replace(/\/$/,''));return true;
 });
}
