import {useState} from 'react';
import {ArrowUpRight,ChevronDown,Store} from 'lucide-react';
import type {ProfileSection,Source} from './types';
import {safeUrl} from './lib';
import {visibleChannelResearch,supportedText} from './evidence-display';
import './channel-research.css';
const channelNames:Record<string,string>={public_hospital:'公立医院',private_hospital:'私立医院',clinic:'诊所',retail_pharmacy:'药房',mixed:'采购体系'};
const measureNames:Record<string,string>={sales_value:'药品销售额',sales_volume:'药品销量',pharmaceutical_expenditure:'药品支出'};
function Evidence({ids,sources}:{ids:string[];sources:Source[]}){return <div className="channel-sources">{ids.map(id=>sources.find(s=>s.id===id)).filter((s):s is Source=>!!s).map(s=><a key={s.id} href={safeUrl(s.url)} target="_blank" rel="noreferrer">{s.title}<ArrowUpRight size={12}/></a>)}</div>}
export default function ChannelResearch({section,sources}:{section:ProfileSection;sources:Source[]}){
 const [choice,setChoice]=useState('');
 const {datasets,procurement}=visibleChannelResearch(section.channel_research!,sources);
 const dataset=datasets.find(d=>d.id===choice)||datasets[0];
 if(!dataset&&!procurement.length)return null;
 return <section className="business-module channel-research"><div className="business-module-heading"><Store size={17}/><h3>销售渠道与采购</h3></div>
 {dataset?<><div className="channel-dataset-heading"><strong>{dataset.title}</strong><span>{dataset.year} · {measureNames[dataset.measure]}</span></div>{datasets.length>1&&<select aria-label="选择渠道数据口径" value={dataset.id} onChange={e=>setChoice(e.target.value)}>{datasets.map(d=><option key={d.id} value={d.id}>{d.title} · {d.year}</option>)}</select>}<p className="channel-scope">{dataset.denominator}</p><div className="channel-bars">{dataset.channels.map(c=><div className="channel-bar-row" key={c.id}><div><span>{c.label}</span><strong>{c.share==null?c.display_share:`${c.approximate?'约 ':''}${c.share.toLocaleString('zh-CN',{maximumFractionDigits:2})}%`}</strong></div>{c.share!=null&&<div className="channel-bar-track"><span style={{width:`${c.share}%`}}/></div>}</div>)}</div><details className="business-details"><summary>数据范围与来源<ChevronDown size={13}/></summary><p>{dataset.product_scope} · {dataset.geographic_scope}</p>{(Array.isArray(dataset.limitations)?dataset.limitations:[dataset.limitations]).filter(supportedText).map((s,i)=><p key={i}>{s}</p>)}{dataset.channels.filter(c=>supportedText(c.note)).map(c=><p key={c.id}>{c.label}：{c.note}</p>)}<Evidence ids={dataset.source_ids} sources={sources}/></details></>:null}
 {procurement.length>0&&<div className="procurement-list">{procurement.map(p=><article key={p.id}><h4>{channelNames[p.channel]||p.channel}</h4><p>{p.summary}</p>{!!p.shares?.length&&<div className="procurement-shares">{p.shares.map(s=><span key={s.label}>{s.label} <strong>{s.share}%</strong></span>)}</div>}<details className="business-details"><summary>采购范围与依据<ChevronDown size={13}/></summary><p>{p.scope}{p.year?`（${p.year} 年资料）`:''}</p>{p.denominator&&<p>{p.denominator}</p>}<Evidence ids={p.source_ids} sources={sources}/></details></article>)}</div>}
 </section>;
}
