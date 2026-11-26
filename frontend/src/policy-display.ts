import type {Profile,Rule,Source} from './types';
import {hasReliableSources,supportedText} from './evidence-display.ts';

// Current enforcement is checked independently from the original commencement date.
export function visiblePolicy(rule:Rule,sources?:Source[]):boolean {
 if(!supportedText(rule.summary)&&rule.summary!==undefined)return false;
 if(sources&&!hasReliableSources(rule.current_source_ids?.length?rule.current_source_ids:rule.source_ids,sources))return false;
 if(rule.conflict)return false;
 if(rule.is_current===true)return true;
 if(rule.current_status==='in_force')return !!rule.current_checked_at&&!!rule.current_basis&&!!rule.current_source_ids?.length;
 if(rule.current_status==='future')return !!rule.current_checked_at&&!!rule.current_basis&&!!rule.current_source_ids?.length&&!!rule.effective_from&&rule.effective_from>new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'});
 return false;
}
export function coverageBrief(profile:Profile|null,field:string):{summary:string;source_ids:string[]}|null {
 const entry=(profile?.research_coverage as Record<string,{status:string;summary:string;source_ids:string[]}>|undefined)?.[field];
 if(!entry||entry.status!=='supported'||!entry.summary||!entry.source_ids?.length)return null;
 return entry.source_ids.every(id=>profile?.sources.some(s=>s.id===id&&s.check_status==='accessible'))?entry:null;
}

// The reader-facing access view is deliberately narrower than the stored research.
export function localProtectionRules(profile:Profile|null):Rule[]{
 return (profile?.rules||[]).filter(rule=>rule.category==='local_protection'&&visiblePolicy(rule,profile?.sources||[]));
}
export function usefulPolicyText(value?:string,already:string[]=[]):boolean {
 return !!value?.trim()&&!already.includes(value)&&!/^(尚未|未核实|未确认|待核|暂未|按所引官方页面)/.test(value);
}
export function policyTiming(rule:Rule):string {
 if(rule.current_status==='future'||rule.validity==='future')return rule.effective_from?`${rule.effective_from} 起实施`:'';
 if(rule.current_status==='in_force')return `现行 · ${rule.current_checked_at} 核查`;
 return rule.is_current?'现行':'';
}
