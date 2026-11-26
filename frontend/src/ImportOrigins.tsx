import {useMemo,useState} from 'react';
import {ChevronDown} from 'lucide-react';
import type {Country,ImportOriginData} from './types';
import {safeUrl} from './lib';
import {originAmount,originGroups,originPartnerName,originPartnerNames,originShare,originSourcePageUrl,rankedOriginPartners} from './import-origins-model';
import './import-origins.css';

export default function ImportOrigins({data,countries}:{data:ImportOriginData;countries:Country[]}){
 const[showAll,setShowAll]=useState(false);
 const[mode,setMode]=useState<'countries'|'groups'>('countries');
 const partners=useMemo(()=>rankedOriginPartners(data),[data]);
 const names=useMemo(()=>originPartnerNames(countries),[countries]);
 const groups=Object.keys(originGroups).map(id=>data.groups.find(g=>g.id===id)!);
 const rows=showAll?partners:partners.slice(0,10);
 const chartRows=mode==='countries'?rows.map(p=>({id:p.code,label:originPartnerName(p,names),amount:p.amount_usd,share:p.share_pct,color:p.code==='156'?'#477a93':p.code==='699'?'#bf8750':'#64899d'})):groups.map(g=>({id:g.id,label:originGroups[g.id].label,amount:g.amount_usd,share:g.share_pct,color:originGroups[g.id].color}));
 const maximum=Math.max(...chartRows.map(r=>r.share),1);
 const axisMax=Math.min(100,Math.ceil(maximum/10)*10);
 return <section className="import-origins" aria-label="制剂进口来源">
  <div className="origin-heading"><h4>制剂进口来源</h4><span>{originAmount(data.total_usd)}</span></div>
  <p className="origin-caption">{data.year} · HS 3004 · 按进口金额</p>
  <div className="origin-chart-tabs" role="group" aria-label="进口来源图表分类">
   <button type="button" aria-pressed={mode==='countries'} onClick={()=>{setMode('countries');setShowAll(false)}}>来源国</button>
   <button type="button" aria-pressed={mode==='groups'} onClick={()=>{setMode('groups');setShowAll(false)}}>地区分组</button>
  </div>
  <div className={`origin-chart ${showAll?'origin-chart-expanded':''}`} role="group" aria-label={mode==='countries'?'各来源国制剂进口金额占比柱状图':'各地区制剂进口金额占比柱状图'}>
   <div className="origin-axis" aria-hidden="true"><span>0%</span><span>{axisMax/2}%</span><span>{axisMax}%</span></div>
   <ol className="origin-chart-rows">{chartRows.map(row=><li key={row.id}>
    <div className="origin-row-label"><span title={row.id==='eu'?'按现有27个成员国合计':row.label}>{row.label}</span><strong>{originShare(row.share)}</strong></div>
    <div className="origin-row-body"><div className="origin-bar-track"><div className="origin-column" style={{width:`${row.share/axisMax*100}%`,background:row.color}}/></div><span>{originAmount(row.amount)}</span></div>
   </li>)}</ol>
  </div>
  {mode==='countries'&&partners.length>10&&<button className="origin-more origin-chart-more" type="button" onClick={()=>setShowAll(v=>!v)}>{showAll?'收起至前 10 个来源':`查看全部 ${partners.length} 个来源`}</button>}
  <details className="origin-details">
   <summary>查看来源国明细 <ChevronDown size={13}/></summary>
   <div className="origin-partner-scroll" tabIndex={0} aria-label="来源国进口金额与占比">
    <table><thead><tr><th>来源</th><th>进口金额</th><th>占比</th></tr></thead><tbody>{partners.map(p=><tr key={p.code}><th scope="row">{originPartnerName(p,names)}</th><td>{originAmount(p.amount_usd)}</td><td>{originShare(p.share_pct)}</td></tr>)}</tbody></table>
   </div>
  </details>
  <a className="origin-source" href={safeUrl(originSourcePageUrl(data.source_url))} target="_blank" rel="noreferrer">数据来源：UN Comtrade</a>
 </section>;
}
