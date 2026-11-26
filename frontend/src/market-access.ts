import type {ChannelMix,Profile,ProfileSection,Rule} from './types';
import {validateChannelResearch} from './channel-research.ts';
import {validateRegulatoryProfile} from './regulatory.ts';
import {validateReligionData} from './religion-display.ts';
import {validateLocalNotes} from './local-culture.ts';
import {languageErrors} from './country-languages.ts';

export const businessSectionIds=new Set(['patient_payment','drug_payment','sales_channels','sales_channels_v2']);
export function isBusinessSection(section:ProfileSection){return businessSectionIds.has(section.id)}
export function isBusinessPolicy(rule:Rule){return rule.category==='local_protection'||rule.category==='special_policy'}
export function channelShareText(share:unknown):string {
 return typeof share==='number'&&Number.isFinite(share)&&share>=0&&share<=100
  ?`${share.toLocaleString('zh-CN',{maximumFractionDigits:2})}%`
  :'暂无可靠占比';
}
export const channelMeasureText=(mix?:ChannelMix)=>mix?.measure==='sales_value'?'药品销售额占比':mix?.measure==='sales_volume'?'药品销量占比':'占比口径尚未确认';
export const policyCategoryText=(rule:Rule)=>rule.category==='local_protection'?'本地保护':'特殊政策';
export const sourceIds=(value:string)=>Array.from(new Set(value.split(/[,，\n]/).map(v=>v.trim()).filter(Boolean)));

export function mergeBusinessSection(section:ProfileSection,change:Partial<ProfileSection>):ProfileSection {
 const next={...section,...change};
 if(!isBusinessSection(next))return next;
 const nested=[...(next.channel_research?.datasets||[]).flatMap(d=>d.source_ids||[]),...(next.channel_research?.procurement||[]).flatMap(d=>d.source_ids||[]),...(next.payment_scenarios||[]).flatMap(s=>s.source_ids||[]),...(next.channel_mix?.source_ids||[]),...(next.channel_mix?.channels||[]).flatMap(c=>c.source_ids||[])];
 next.source_ids=Array.from(new Set([...(next.source_ids||[]),...nested]));
 return next;
}
export function backgroundSections(profile:Profile):ProfileSection[] {
 const hasPatient=profile.sections.some(s=>s.id==='patient_payment'||s.id==='drug_payment');
 return profile.sections.filter(s=>!isBusinessSection(s)&&s.id!=='country_languages'&&s.id!=='production_import'&&s.id!=='trade_imports'&&s.id!=='import_origins'&&s.id!=='api_imports'&&s.id!=='gmp_access'&&s.id!=='market_context'&&s.id!=='religion'&&s.id!=='religion_life'&&s.id!=='local_culture'&&s.id!=='official_medicine_sites'&&!(hasPatient&&s.id==='payment'));
}

/** Block malformed numeric records, while allowing genuinely unknown shares and incomplete prose drafts. */
export function validateMarketAccessProfile(profile:Profile,{publication=false}:{publication?:boolean}={}):string[] {
 const errors:string[]=[];
 if(!profile||!Array.isArray(profile.sections)||!Array.isArray(profile.sources))return ['档案必须包含章节列表和来源列表'];
 const knownSources=new Set((profile.sources||[]).map(s=>s.id));
 for(const section of profile.sections||[]){
  if(!section||typeof section!=='object'){errors.push('章节必须为对象');continue}
  const refs=section.source_ids||[];
  if(!Array.isArray(refs)||refs.some(id=>typeof id!=='string')){errors.push(`${section.title}：来源 ID 必须为列表`);continue}
  const nestedRefs:string[]=[];
  errors.push(...languageErrors(section));
  if(section.payment_scenarios){
   if(!Array.isArray(section.payment_scenarios)||section.payment_scenarios.some(s=>!s||typeof s!=='object')){errors.push(`${section.title}：支付场景必须为对象列表`);continue}
   if(section.payment_scenarios.length&&section.kind==='data_gap')errors.push(`${section.title}：支付场景须作为事实整理复核，不能标为资料缺口`);
   for(const scenario of section.payment_scenarios){
    for(const field of ['id','setting','payer','coverage','patient_cost','conditions'] as const)if(typeof scenario[field]!=='string')errors.push(`${section.title}：${field} 必须为文本`);
    if(!Array.isArray(scenario.source_ids)||scenario.source_ids.some(x=>typeof x!=='string'))errors.push(`${section.title}：场景来源必须为来源 ID 列表`);
    else nestedRefs.push(...scenario.source_ids);
    if(publication&&['payer','coverage','patient_cost','conditions'].some(key=>scenario[key])&&!scenario.source_ids?.length)errors.push(`${section.title}：每个有内容的支付场景必须有可追溯的来源`);
   }
  }
  if(section.local_culture)errors.push(...validateLocalNotes(section.local_culture,'highlights',knownSources,new Set(refs)));
  if(section.religion_life)errors.push(...validateLocalNotes(section.religion_life,'everyday',knownSources,new Set(refs)));
  if(section.religion)errors.push(...validateReligionData(section.religion,knownSources,new Set(refs)));
  if(section.channel_research)errors.push(...validateChannelResearch(section.channel_research,knownSources,new Set(refs)));
  const mix=section.channel_mix;
  if(!mix){if(nestedRefs.some(id=>!knownSources.has(id)||!refs.includes(id)))errors.push(`${section.title}：明细来源须存在于本档案并纳入章节引用`);continue}
  if(typeof mix!=='object'){errors.push(`${section.title}：销售渠道结构无效`);continue}
  if(!Array.isArray(mix.source_ids)||mix.source_ids.some(x=>typeof x!=='string'))errors.push(`${section.title}：渠道数据来源必须为来源 ID 列表`);
  else nestedRefs.push(...mix.source_ids);
  if(!['unavailable','partial','available'].includes(mix.status))errors.push(`${section.title}：渠道数据状态无效`);
  if(!['sales_value','sales_volume','not_available'].includes(mix.measure))errors.push(`${section.title}：请选择销售额、销量或口径未确认`);
  if(mix.unit!=='%')errors.push(`${section.title}：渠道比例单位须为 %`);
  if(mix.year!==null&&(!Number.isInteger(mix.year)||mix.year<1900||mix.year>2200))errors.push(`${section.title}：年度须为 1900–2200 的整数，未知留空`);
  if(!Array.isArray(mix.channels)||mix.channels.some(c=>!c||typeof c!=='object')){errors.push(`${section.title}：渠道明细必须为对象列表`);continue}
  const known=mix.channels.filter(c=>c.share!==null);
  const ids=mix.channels.map(c=>c.id);
  if(ids.length!==3||!['public_hospitals','private_hospitals','retail'].every(id=>ids.includes(id)))errors.push(`${section.title}：须分别保留公立医院、私立医院、零售三个渠道`);
  for(const channel of mix.channels){
   if(channel.share!==null&&(typeof channel.share!=='number'||!Number.isFinite(channel.share)||channel.share<0||channel.share>100))errors.push(`${channel.label||channel.id}：占比只能是 0–100 的数值，未知必须留空`);
   if(channel.share!==null&&!channel.source_ids?.length)errors.push(`${channel.label||channel.id}：每项数值必须有关联来源`);
   if(!Array.isArray(channel.source_ids)||channel.source_ids.some(x=>typeof x!=='string'))errors.push(`${channel.label||channel.id}：来源必须为来源 ID 列表`);
   else nestedRefs.push(...channel.source_ids);
  }
  if(nestedRefs.some(id=>!knownSources.has(id)||!refs.includes(id)))errors.push(`${section.title}：明细来源须存在于本档案并纳入章节引用`);
  if(known.length){
   if(section.kind==='data_gap')errors.push(`${section.title}：有数值时请将章节性质改为事实整理，后续须完成内容复核`);
   if(mix.year!==null&&mix.year>new Date().getFullYear())errors.push(`${section.title}：统计年度不能晚于当前年`);
   if(mix.year===null)errors.push(`${section.title}：有数值时必须注明统计年度`);
   if(typeof mix.denominator!=='string'||!mix.denominator.trim())errors.push(`${section.title}：有数值时必须写明分母`);
   if(typeof mix.scope!=='string'||!mix.scope.trim())errors.push(`${section.title}：有数值时必须写明覆盖范围`);
   if(mix.measure==='not_available')errors.push(`${section.title}：有数值时必须区分销售额和销量`);
   if(mix.status==='unavailable')errors.push(`${section.title}：已填写占比，请把数据状态改为部分可得或已获得`);
  }
  if(mix.status==='available'&&(known.length!==3||Math.abs(known.reduce((total,c)=>total+(typeof c.share==='number'?c.share:0),0)-100)>.2+1e-8))errors.push(`${section.title}：完整占比应为同一口径的三个有效数值且合计约 100%，请核实原始资料；系统不会自动补齐`);
  if(known.reduce((total,c)=>total+(typeof c.share==='number'&&Number.isFinite(c.share)?c.share:0),0)>100.2+1e-8)errors.push(`${section.title}：同一分母的渠道占比合计不能超过 100%`);
  if(!known.length&&mix.status==='partial')errors.push(`${section.title}：没有占比数值时请选择暂无可用比例`);
 }
 return [...errors,...validateRegulatoryProfile(profile)];
}
