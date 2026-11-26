import type {Profile,ProfileSection} from './types';
import {hasReadableNoteSources} from './local-culture.ts';
import {supportedText} from './evidence-display.ts';

export function languageErrors(section:ProfileSection):string[]{
 if(section.id!=='country_languages')return [];
 const errors:string[]=[];
 if(typeof section.primary!=='string'||!section.primary.trim())errors.push('语言：须填写第一语言');
 if(section.secondary!=null&&typeof section.secondary!=='string')errors.push('语言：第二语言须为文字或留空');
 for(const key of ['primary_context','secondary_context'])if(section[key]!=null&&typeof section[key]!=='string')errors.push('语言：使用范围须为文字');
 if(!section.source_ids?.length)errors.push('语言：须填写来源');
 return errors;
}
export function visibleCountryLanguages(profile:Profile|null){
 const section=profile?.sections.find(s=>s.id==='country_languages');
 if(!section||languageErrors(section).length||!hasReadableNoteSources(section.source_ids,profile?.sources||[]))return null;
 const rows=[{id:'primary',label:'第一语言',value:section.primary as string,context:section.primary_context as string|undefined},
  {id:'secondary',label:'第二语言',value:section.secondary as string|null,context:section.secondary_context as string|undefined}]
  .filter(row=>supportedText(row.value||''));
 return rows.length?{rows,sources:(profile?.sources||[]).filter(s=>section.source_ids.includes(s.id))}:null;
}
