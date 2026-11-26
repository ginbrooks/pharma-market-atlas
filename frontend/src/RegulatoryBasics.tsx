import {useEffect,useRef} from 'react';
import {ArrowUpRight,ChevronDown,Factory,FileText} from 'lucide-react';
import type {Profile,Rule,Source} from './types';
import {safeUrl} from './lib';
import {visiblePolicy,policyTiming,usefulPolicyText,coverageBrief} from './policy-display';
import {isRegulatoryRule,regulatoryTopics} from './regulatory';
import './regulatory.css';

function Regulation({rule,sources}:{rule:Rule;sources:Source[]}){
 const evidence=sources.filter(s=>s.check_status==='accessible'&&[...rule.source_ids,...(rule.current_source_ids||[])].includes(s.id));
 return <details className="regulatory-rule"><summary><span className="regulatory-topic">{rule.topic?regulatoryTopics[rule.topic]:'政策法规'}</span><span>{rule.title}</span><ChevronDown size={14}/></summary><div className="regulatory-body">
  <p>{rule.summary}</p>
  {usefulPolicyText(rule.business_implication,[rule.summary])&&<p className="regulatory-impact">{rule.business_implication}</p>}
  <dl><dt>适用范围</dt><dd>{rule.product_scope}</dd><dt>办理环节</dt><dd>{rule.stage}</dd>{usefulPolicyText(rule.conditions,[rule.summary,rule.business_implication||''])&&<><dt>条件要求</dt><dd>{rule.conditions}</dd></>}{usefulPolicyText(rule.exceptions)&&<><dt>例外情况</dt><dd>{rule.exceptions}</dd></>}{policyTiming(rule)&&<><dt>执行情况</dt><dd>{policyTiming(rule)}</dd></>}</dl>
  <div className="regulatory-evidence">{evidence.map(source=><div key={source.id}><a href={safeUrl(source.url)} target="_blank" rel="noreferrer"><FileText size={13}/><span>{source.title}</span><ArrowUpRight size={12}/></a>{source.locator&&<small>{source.locator}</small>}</div>)}</div>
 </div></details>;
}
export default function RegulatoryBasics({profile,mode='drawer'}:{profile:Profile|null;mode?:'drawer'|'full'|'compare'}){
 const rules=(profile?.rules||[]).filter(r=>isRegulatoryRule(r)&&visiblePolicy(r,profile?.sources||[])),root=useRef<HTMLElement>(null);
 const brief=coverageBrief(profile,'production_import');
 useEffect(()=>{let opened:HTMLDetailsElement[]=[];const prepare=()=>{opened=Array.from(root.current?.querySelectorAll<HTMLDetailsElement>('details:not([open])')||[]);opened.forEach(d=>{d.open=true})};const restore=()=>{opened.forEach(d=>{d.open=false});opened=[]};window.addEventListener('beforeprint',prepare);window.addEventListener('afterprint',restore);return()=>{window.removeEventListener('beforeprint',prepare);window.removeEventListener('afterprint',restore)}},[]);
 if(!rules.length&&!brief)return null;
 return <section ref={root} className={`regulatory-basics regulatory-${mode}`} aria-label="药品生产与进口"><div className="regulatory-heading"><Factory size={17}/><h3>药品生产与进口</h3>{rules.length>0&&<span>{rules.length} 条</span>}</div>{rules.length>0?<><div className="regulatory-rules">{rules.map(rule=><Regulation key={rule.id} rule={rule} sources={profile?.sources||[]}/>)}</div></>:brief?<><p className="regulatory-summary">{brief.summary}</p><details className="business-details"><summary>依据<ChevronDown size={13}/></summary><div className="regulatory-evidence">{profile?.sources.filter(s=>brief.source_ids.includes(s.id)).map(s=><a key={s.id} href={safeUrl(s.url)} target="_blank" rel="noreferrer">{s.title}<ArrowUpRight size={12}/></a>)}</div></details></>:null}</section>;
}
