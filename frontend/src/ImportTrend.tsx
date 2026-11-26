import {useState} from 'react';
import type {ImportTrend as Trend} from './types';
import {splitImportTrend} from './import-trade-model';

const colors=['#b57a44','#5b8d79','#8c70a3','#4d8da1','#be6974','#8f9052'];
function TrendChart({trend,featured=false}:{trend:Trend;featured?:boolean}){
 const [selected,setSelected]=useState<string|null>(null);
 const [hoverYear,setHoverYear]=useState<number|null>(null);
 if(!trend?.series.length)return <p className="import-chart-empty">暂无可绘制的金额记录</p>;
 const visible=selected?trend.series.filter(s=>s.code===selected):trend.series;
 const maximum=Math.max(...visible.flatMap(s=>s.points.map(p=>p.amount_kusd??0)),1);
 const divisor=maximum>=100000?100000:10,unit=divisor===100000?'亿美元':'万美元';
 const scale=Math.pow(10,Math.floor(Math.log10(maximum/divisor)));
 const ceiling=Math.ceil(maximum/divisor/scale*2)/2*scale;
 const x=(year:number)=>54+(year-2023)*116;
 const baseline=featured?100:166;
 const y=(value:number)=>baseline-value/divisor/ceiling*(featured?76:130);
 const fmt=(n:number)=>n.toLocaleString('zh-CN',{maximumFractionDigits:2});
 const year=hoverYear??trend.selection_year;
 return <div className={`import-trend ${featured?'import-trend-featured':'import-trend-comparison'}`}>
  <div className="import-trend-caption"><span>{featured?'其他制剂 · HS 300490':'主要品类'}</span><small>{unit}</small></div>
  <svg viewBox={`0 0 332 ${featured?136:207}`} role="group" aria-label={`${featured?'300490':'其他主要药品编码'}2023至2025年进口金额，单位${unit}`}>
   {(featured?[0,1]:[0,0.5,1]).map(t=><g key={t}><line x1="54" x2="286" y1={y(t*ceiling*divisor)} y2={y(t*ceiling*divisor)} className="import-chart-grid"/><text x="46" y={y(t*ceiling*divisor)+4} textAnchor="end" className="import-axis">{fmt(t*ceiling)}</text></g>)}
   {[2023,2024,2025].map(yr=><text key={yr} x={x(yr)} y={baseline+25} textAnchor="middle" className="import-axis">{yr}</text>)}
   {visible.map(s=>{const color=featured?'#416f99':colors[trend.series.findIndex(a=>a.code===s.code)];return <g key={s.code}>
    {s.points.slice(1).map((p,i)=>{const prev=s.points[i];return p.amount_kusd!==null&&prev.amount_kusd!==null&&p.year-prev.year===1?<line key={p.year} x1={x(prev.year)} y1={y(prev.amount_kusd)} x2={x(p.year)} y2={y(p.amount_kusd)} stroke={color} strokeWidth="2.3"/>:null})}
    {s.points.filter(p=>p.amount_kusd!==null).map(p=><g key={p.year} tabIndex={0} role="button" aria-label={`${p.year}年 ${s.name} ${fmt(p.amount_kusd!/divisor)}${unit}`} onMouseEnter={()=>setHoverYear(p.year)} onMouseLeave={()=>setHoverYear(null)} onFocus={()=>setHoverYear(p.year)} onBlur={()=>setHoverYear(null)} onClick={()=>setHoverYear(p.year)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setHoverYear(p.year)}}}>
     <circle cx={x(p.year)} cy={y(p.amount_kusd!)} r="11" fill="transparent"/>
     <circle cx={x(p.year)} cy={y(p.amount_kusd!)} r="3.7" fill="white" stroke={color} strokeWidth="2"/>
     <title>{p.year} · HS {s.code} · {fmt(p.amount_kusd!/divisor)} {unit}</title>
    </g>)}
   </g>})}
  </svg>
  {!featured&&<div className="import-trend-legend">{trend.series.map((s,i)=><button key={s.code} className={selected&&selected!==s.code?'muted':''} aria-pressed={selected===s.code} title="点击单独查看，再次点击显示全部" onClick={()=>setSelected(selected===s.code?null:s.code)}><i style={{background:colors[i]}}/><span>{s.name}<small>HS {s.code}</small></span></button>)}</div>}
  <div className="import-trend-values"><strong>{year} 年</strong>{visible.map(s=>{const p=s.points.find(p=>p.year===year);return <span key={s.code}>{featured?'进口金额':s.code}<b>{p?.amount_kusd==null?'无金额记录':`${fmt(p.amount_kusd/divisor)} ${unit}`}</b></span>})}</div>
 </div>;
}

export default function ImportTrend({trend}:{trend?:Trend}){
 const {featured,others}=splitImportTrend(trend);
 if(!trend)return null;
 return <>{featured.length>0&&<TrendChart trend={{...trend,series:featured}} featured/>}{others.length>0&&<TrendChart trend={{...trend,series:others}}/>}</>;
}
