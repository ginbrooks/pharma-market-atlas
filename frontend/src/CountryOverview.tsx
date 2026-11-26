import {ArrowUpRight,ChevronDown} from 'lucide-react';
import type {Cell,Detail,Indicator,Profile} from './types';
import {compact,safeUrl} from './lib';
import {visibleMarketContext} from './gmp-access';
import MarketAccess from './MarketAccess';
import ReligionBasics from './ReligionBasics';
import CountryLanguages from './CountryLanguages';
import './country-workbench.css';
import './country-sheet.css';

export function MarketContext({profile}:{profile:Profile|null}){
 const rows=visibleMarketContext(profile);
 if(!rows.length)return null;
 return <details className="market-context"><summary><span>经营环境</span><ChevronDown size={14}/></summary>
  <div>{rows.map(row=><article key={row.id}>
   <div><h4>{row.label}</h4><strong>{row.value.toLocaleString('zh-CN',{maximumFractionDigits:2})}%</strong></div>
   <p>{row.definition}</p><a href={safeUrl(row.source_url)} target="_blank" rel="noreferrer">{row.year} 年 · 世界银行<ArrowUpRight size={11}/></a>
  </article>)}</div>
 </details>;
}

function MetricValue({indicator,cell}:{indicator:Indicator;cell:Cell}){
 const formatted=compact(cell.value,indicator.id);
 if(indicator.id==='population'){
  const [number,scale='']=formatted.split(' ');
  return <strong>{number}<small>{scale}人</small></strong>;
 }
 if(formatted.startsWith('$'))return <strong>{formatted.slice(1)}<small>美元</small></strong>;
 if(formatted.endsWith('%'))return <strong>{formatted.slice(0,-1)}<small>%</small></strong>;
 return <strong>{formatted}</strong>;
}

export default function CountryOverview({detail,onEvidence}:{detail:Detail;onEvidence:(e:{indicator:Indicator;cell:Cell;country:string})=>void}){
 const primary=detail.indicators.filter(i=>['population','gdp_pc','health_pc','government_share'].includes(i.id)&&detail.latest[i.id]?.value!=null);
 const demographic=detail.indicators.filter(i=>['life_expectancy','age65_share'].includes(i.id)&&detail.latest[i.id]?.value!=null);
 const showEvidence=(indicator:Indicator)=>onEvidence({indicator,cell:detail.latest[indicator.id],country:detail.country.name});
 return <div className="country-overview">
  {(primary.length>0||demographic.length>0)&&<section className="overview-fundamentals" aria-label="市场基本面">
   <div className="workbench-heading"><h3>市场基本面</h3></div>
   {primary.length>0&&<div className="overview-core-metrics">{primary.map(indicator=>{
    const cell=detail.latest[indicator.id];
    return <button type="button" key={indicator.id} onClick={()=>showEvidence(indicator)} title={`查看${indicator.name}的统计口径与来源`}>
     <span>{indicator.name}<ArrowUpRight size={13} aria-hidden="true"/></span>
     <MetricValue indicator={indicator} cell={cell}/>
     <small className="overview-metric-meta">
      {cell.year&&<span>{cell.year} 年</span>}
      {indicator.id==='gdp_pc'&&cell.rank!=null&&cell.total!=null&&cell.rank>0&&cell.total>=cell.rank&&<span className="overview-metric-rank" title={`同年参与排名的 ${cell.total} 个经济体中排名第 ${cell.rank}`}>第 {cell.rank} / {cell.total} 位</span>}
     </small>
    </button>;
   })}</div>}
   {demographic.length>0&&<div className="overview-demographics">{demographic.map(indicator=>{
    const cell=detail.latest[indicator.id];
    return <button type="button" key={indicator.id} onClick={()=>showEvidence(indicator)} title={`查看${indicator.name}的统计口径与来源`}>
     <span>{indicator.name}{cell.year&&<small>{cell.year} 年</small>}</span>
     <strong>{compact(cell.value,indicator.id)}<ArrowUpRight size={12} aria-hidden="true"/></strong>
    </button>;
   })}</div>}
  </section>}
  <CountryLanguages profile={detail.profile}/>
  <ReligionBasics iso3={detail.country.iso3} profile={detail.profile} countryName={detail.country.name}/>
  <MarketAccess profile={detail.profile} modules={['payment']}/>
  <MarketContext profile={detail.profile}/>
 </div>;
}
