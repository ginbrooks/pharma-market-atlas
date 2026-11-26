import {useEffect,useRef} from 'react';
import {ArrowUpRight,ChevronDown,FileText,ShieldCheck,Store,WalletCards} from 'lucide-react';
import type {Profile,ProfileSection,Rule,Source} from './types';
import {safeUrl} from './lib';
import {hasReliableSources,supportedText,supportedSection} from './evidence-display';
import {localProtectionRules,policyTiming,usefulPolicyText} from './policy-display';
import {channelMeasureText,channelShareText,isBusinessPolicy,policyCategoryText} from './market-access';
import './market-access.css';
import ChannelResearch from './ChannelResearch';

type Props={profile:Profile|null;mode?:'drawer'|'full'|'compare';modules?:('payment'|'channels'|'policies')[]};
function EvidenceLinks({ids,sources}:{ids?:string[];sources:Source[]}){
 const found=Array.from(new Set(ids||[])).map(id=>sources.find(s=>s.id===id)).filter((s):s is Source=>!!s&&s.check_status==='accessible');
 return found.length?<div className="business-evidence">{found.map(s=><a key={s.id} href={safeUrl(s.url)} target="_blank" rel="noreferrer"><FileText size={12}/><span>{s.title}</span><ArrowUpRight size={12}/></a>)}</div>:null;
}
function SectionMeta({section}:{section?:ProfileSection}){return section?.as_of?<small>资料日期 {section.as_of}</small>:null;}
function DrugPayment({brief,legacy,sources}:{brief?:ProfileSection;legacy?:ProfileSection;sources:Source[]}){
 if(!brief)return <PatientPayment section={legacy} sources={sources}/>;
 if(!supportedSection(brief,sources))return null;
 return <section className="business-module drug-payment-brief"><div className="business-module-heading"><WalletCards size={17}/><h3>药品支付</h3></div><p className="drug-payment-sentence">{brief.summary}</p>{Array.isArray(brief.term_notes)&&<p className="payment-term-notes">{(brief.term_notes as {term:string;meaning:string}[]).map(n=><span key={n.term}><b>{n.term}</b> · {n.meaning}</span>)}</p>}<details className="business-details"><summary>依据<ChevronDown size={13}/></summary><SectionMeta section={brief}/><EvidenceLinks ids={brief.source_ids} sources={sources}/>{!!brief.currency_conversion&&<PaymentConversions value={brief.currency_conversion}/>}</details></section>;
}
function PaymentConversions({value}:{value:unknown}){const fx=value as {amounts?:{original_amount:number;original_currency:string;usd_amount:number;date:string;url:string;institution:string}[]};return fx?.amounts?.length?<div className="payment-conversions"><h4>金额换算</h4>{fx.amounts.map((a,i)=><p key={i}>{a.original_amount.toLocaleString()} {a.original_currency} ≈ {a.usd_amount.toLocaleString('zh-CN',{maximumFractionDigits:2})} 美元 · <a href={safeUrl(a.url)} target="_blank" rel="noreferrer">{a.institution} {a.date}</a></p>)}</div>:null;}
function PatientPayment({section,sources}:{section?:ProfileSection;sources:Source[]}){
 const scenarios=(section?.payment_scenarios||[]).filter(s=>hasReliableSources(s.source_ids?.length?s.source_ids:section?.source_ids,sources)&&[s.payer,s.patient_cost,s.coverage].some(supportedText));
 if(!scenarios.length)return null;
 return <section className="business-module business-payment"><div className="business-module-heading"><WalletCards size={17}/><h3>看病买药，谁来付钱</h3></div><SectionMeta section={section}/><div className="payment-scenarios">{scenarios.map((s,index)=><article className="payment-scenario" key={s.id}>{supportedText(s.setting)&&<h4><span>{String(index+1).padStart(2,'0')}</span>{s.setting}</h4>}<dl className="payment-essentials">{supportedText(s.payer)&&<><dt>谁来支付</dt><dd>{s.payer}</dd></>}{supportedText(s.patient_cost)&&<><dt>个人承担</dt><dd>{s.patient_cost}</dd></>}</dl><details className="business-details"><summary>覆盖范围与依据<ChevronDown size={13}/></summary><dl className="business-detail-list">{supportedText(s.coverage)&&<><dt>覆盖内容</dt><dd>{s.coverage}</dd></>}{supportedText(s.conditions)&&<><dt>适用限制</dt><dd>{s.conditions}</dd></>}</dl><EvidenceLinks ids={s.source_ids?.length?s.source_ids:section?.source_ids} sources={sources}/></details></article>)}</div>{supportedSection(section,sources)&&<details className="business-details business-overview"><summary>制度背景<ChevronDown size={13}/></summary><p>{section!.summary}</p><EvidenceLinks ids={section!.source_ids} sources={sources}/></details>}</section>;
}
function SalesChannels({section,sources}:{section?:ProfileSection;sources:Source[]}){
 const mix=section?.channel_mix;
 const channels=(mix?.channels||[]).filter(c=>c.share!=null&&hasReliableSources(c.source_ids?.length?c.source_ids:mix?.source_ids?.length?mix.source_ids:section?.source_ids,sources));
 if(!mix||!channels.length||mix.measure==='not_available'||!supportedText(mix.denominator))return null;
 return <section className="business-module business-channels"><div className="business-module-heading"><Store size={17}/><h3>药品销售渠道</h3></div><SectionMeta section={section}/><div className="channel-definition"><strong>{channelMeasureText(mix)}</strong>{mix.year!=null&&<span>{mix.year} 年</span>}</div><p className="channel-denominator"><span>分母</span>{mix.denominator}</p><div className="channel-rows">{channels.map(c=><article className="channel-row" key={c.id}><div><h4>{c.label}</h4><strong className="share-value">{channelShareText(c.share)}</strong></div>{supportedText(c.note)&&<p>{c.note}</p>}<details className="business-details"><summary>查看渠道依据<ChevronDown size={13}/></summary><EvidenceLinks ids={c.source_ids?.length?c.source_ids:mix.source_ids?.length?mix.source_ids:section?.source_ids} sources={sources}/></details></article>)}</div>{supportedText(mix.scope)&&<details className="business-details business-overview"><summary>统计范围<ChevronDown size={13}/></summary><p>{mix.scope}</p>{supportedText(mix.caveat)&&<p>{mix.caveat}</p>}</details>}</section>;
}
function PolicyDetails({rule,sources}:{rule:Rule;sources:Source[]}){return <details className="business-policy"><summary><div className="business-policy-title"><span>{rule.title}</span><ChevronDown size={15}/></div><div className="business-policy-meta"><span>{policyCategoryText(rule)}</span></div>{usefulPolicyText(rule.business_implication,[rule.summary])&&<p>{rule.business_implication}</p>}</summary><div className="business-policy-body"><p>{rule.summary}</p><dl className="business-detail-list"><dt>适用品类</dt><dd>{rule.product_scope}</dd><dt>适用环节</dt><dd>{rule.stage}</dd>{usefulPolicyText(rule.conditions,[rule.summary,rule.business_implication||''])&&<><dt>条件</dt><dd>{rule.conditions}</dd></>}{usefulPolicyText(rule.exceptions)&&<><dt>例外</dt><dd>{rule.exceptions}</dd></>}{policyTiming(rule)&&<><dt>执行情况</dt><dd>{policyTiming(rule)}</dd></>}</dl><EvidenceLinks ids={[...rule.source_ids,...(rule.current_source_ids||[])]} sources={sources}/></div></details>}
function LocalPolicies({rules,sources}:{rules:Rule[];sources:Source[]}){if(!rules.length)return null;return <section className="business-module business-policies"><div className="business-module-heading"><ShieldCheck size={17}/><h3>本地保护政策</h3></div><div className="business-policy-list">{rules.map(rule=><PolicyDetails key={rule.id} rule={rule} sources={sources}/>)}</div></section>}
export default function MarketAccess({profile,mode='drawer',modules=['payment','channels','policies']}:Props){
 const sections=profile?.sections||[],sources=profile?.sources||[];
 const container=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  let opened:HTMLDetailsElement[]=[];
  const prepare=()=>{opened=Array.from(container.current?.querySelectorAll<HTMLDetailsElement>('details:not([open])')||[]);opened.forEach(d=>{d.open=true})};
  const restore=()=>{opened.forEach(d=>{d.open=false});opened=[]};
  window.addEventListener('beforeprint',prepare);window.addEventListener('afterprint',restore);
  return()=>{window.removeEventListener('beforeprint',prepare);window.removeEventListener('afterprint',restore);restore()};
 },[]);
 return <div ref={container} className={`market-access market-access-${mode}`}>
  {modules.includes('payment')&&<DrugPayment brief={sections.find(s=>s.id==='drug_payment')} legacy={sections.find(s=>s.id==='patient_payment')} sources={sources}/>}
  {modules.includes('channels')&&(sections.find(s=>s.id==='sales_channels_v2')?.channel_research?<ChannelResearch key={profile?.iso3} section={sections.find(s=>s.id==='sales_channels_v2')!} sources={sources}/>:<SalesChannels section={sections.find(s=>s.id==='sales_channels')} sources={sources}/>)}
  {modules.includes('policies')&&<LocalPolicies rules={localProtectionRules(profile)} sources={sources}/>}
 </div>;
}
