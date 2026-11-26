import type {Profile,Rule} from './types';

export const regulatoryTopics={manufacturing:'生产资质',registration:'产品注册',import:'进口许可',customs:'通关与批次',restriction:'限制与特殊政策'};
export const isRegulatoryRule=(rule:Rule)=>rule.module==='production_import';
export function synchronizeRegulatoryReferences(profile:Profile):Profile {
 const rules=(profile.rules||[]).filter(isRegulatoryRule);
 let sections=profile.sections||[];
 if(rules.length&&!sections.some(s=>s.id==='production_import'))sections=[...sections,{id:'production_import',title:'药品生产与进口',summary:'',source_ids:[],rule_ids:[],status:'pending'}];
 return {...profile,sections:sections.map(s=>s.id==='production_import'?{...s,rule_ids:rules.map(r=>r.id),source_ids:Array.from(new Set([...s.source_ids,...rules.flatMap(r=>r.source_ids)]))}:s)};
}
export function regulatoryTiming(rule:Rule):string {
 if(rule.validity==='future')return `尚未生效${rule.effective_from?` · ${rule.effective_from} 起`:''}`;
 if(['expired','replaced','superseded'].includes(rule.validity))return '历史规则，不能作为当前办理依据';
 if(rule.conflict)return '原文或版本存在差异，适用性待核';
 if(rule.is_current)return `已复核现行规则${rule.effective_from?` · ${rule.effective_from} 起`:''}`;
 return rule.effective_from?`原文载明 ${rule.effective_from} 起；现行适用性待复核`:'生效时间或现行适用性待核实';
}
export function validateRegulatoryProfile(profile:Profile):string[]{
 const errors:string[]=[],rules=Array.isArray(profile.rules)?profile.rules:[];
 const sections=profile.sections.filter(s=>s.id==='production_import');
 const relevant=rules.filter(isRegulatoryRule),section=sections[0];
 if(!relevant.length&&!section)return errors;
 if(sections.length!==1)errors.push('生产与进口必须对应一个独立章节');
 const ids=section?.rule_ids;
 if(!Array.isArray(ids)||ids.some(id=>typeof id!=='string')||new Set(ids).size!==ids.length)errors.push('生产与进口的规则引用必须为不重复的 ID 列表');
 else if(ids.some(id=>!relevant.some(r=>r.id===id))||relevant.some(r=>!ids.includes(r.id)))errors.push('生产与进口章节引用与规则不一致');
 const sources=new Set(profile.sources.map(s=>s.id));
 for(const rule of relevant){
  if(['title','summary','product_scope','stage','conditions','exceptions'].some(key=>typeof rule[key as keyof Rule]!=='string'))errors.push(`${rule.title}：法规说明必须为文本`);
  if(!rule.topic||!(rule.topic in regulatoryTopics))errors.push(`${rule.title}：生产与进口主题无效`);
  if(!Array.isArray(rule.source_ids)||!rule.source_ids.length||rule.source_ids.some(id=>!sources.has(id)||!Array.isArray(section?.source_ids)||!section.source_ids.includes(id)))errors.push(`${rule.title}：规则必须有来源，并纳入生产与进口章节引用`);
 }
 return errors;
}
