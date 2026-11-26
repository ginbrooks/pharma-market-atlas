import {useEffect,useRef} from 'react';
import {ArrowUpRight,ChevronDown,Factory} from 'lucide-react';
import type {Profile} from './types';
import {safeUrl} from './lib';
import {gmpTopics,usedGmpTerms,visibleGmp} from './gmp-access';
import './country-workbench.css';

export default function GmpAccess({profile,mode='drawer',category='access'}:{profile:Profile|null;mode?:'drawer'|'full'|'compare';category?:'access'|'procurement'}){
 const view=visibleGmp(profile,category),root=useRef<HTMLElement>(null);
 useEffect(()=>{
  let opened:HTMLDetailsElement[]=[];
  const prepare=()=>{opened=Array.from(root.current?.querySelectorAll<HTMLDetailsElement>('details:not([open])')||[]);opened.forEach(d=>{d.open=true})};
  const restore=()=>{opened.forEach(d=>{d.open=false});opened=[]};
  window.addEventListener('beforeprint',prepare);window.addEventListener('afterprint',restore);
  return()=>{window.removeEventListener('beforeprint',prepare);window.removeEventListener('afterprint',restore)};
 },[]);
 if(!view)return null;
 const terms=usedGmpTerms(view.facts.map(f=>`${f.summary} ${f.scope}`).join(' '));
 const mentionsGmp=view.facts.some(f=>/GMP|药品生产质量/.test(`${f.title} ${f.summary}`));
 const heading=category==='procurement'?'采购要求':mentionsGmp?'GMP 与注册路径':'注册与经营要求';
 return <section ref={root} className={`gmp-access gmp-${mode}`} aria-label={heading}>
  <div className="workbench-heading"><Factory size={17}/><h3>{heading}</h3></div>
  {mentionsGmp&&<p className="gmp-definition">GMP · 药品生产质量管理规范</p>}
  {category==='access'&&view.data.authority&&<a className="gmp-authority" href={safeUrl(view.data.authority_url)} target="_blank" rel="noreferrer"><span>{view.data.authority}</span><ArrowUpRight size={13}/></a>}
  {terms.length>0&&<details className="gmp-terms"><summary>缩写说明<ChevronDown size={12}/></summary><dl>{terms.map(([term,meaning])=><div key={term}><dt>{term}</dt><dd>{meaning}</dd></div>)}</dl></details>}
  <div className="gmp-facts">{view.facts.map(fact=><article className="gmp-fact" key={fact.id}>
   <span className="gmp-topic">{gmpTopics[fact.topic]}</span><h4>{fact.title}</h4><p>{fact.summary}</p>
   <details className="gmp-evidence"><summary>适用范围与依据<ChevronDown size={12}/></summary>
    {fact.scope&&fact.scope!==fact.summary&&<p>{fact.scope}</p>}
    {view.sources.filter(s=>fact.source_ids.includes(s.id)).map(source=><div key={source.id}><a href={safeUrl(source.url)} target="_blank" rel="noreferrer"><span>{source.title}</span><ArrowUpRight size={12}/></a>{source.locator&&<small>{source.locator}</small>}</div>)}
   </details>
  </article>)}</div>
 </section>;
}
