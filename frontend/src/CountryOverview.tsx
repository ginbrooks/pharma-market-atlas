import type {ReactNode} from 'react';
import {ChevronDown} from 'lucide-react';
import type {Cell,Detail,Indicator,Profile} from './types';
import {compact,safeUrl} from './lib';
import {visibleMarketContext} from './gmp-access';
import MarketAccess from './MarketAccess';
import ReligionBasics from './ReligionBasics';
import CountryLanguages from './CountryLanguages';
import './country-workbench.css';
import './country-sheet.css';

type MetricProps = {
 label:string;
 value:ReactNode;
 year:number|null;
 url:string;
 rank?:string;
};

function OverviewMetric({label,value,year,url,rank}:MetricProps){
 const href=safeUrl(url);
 const source=href==='#'?'':new URL(href).hostname;
 const sourceName=source.endsWith('.worldbank.org')?'世界银行':source;
 return <details className="overview-metric">
  <summary>
   <span>{label}</span>
   <strong>{value}</strong>
   {rank&&<small className="overview-metric-rank">{rank}</small>}
  </summary>
  <div className="overview-metric-source">
   {sourceName&&<a href={href} target="_blank" rel="noreferrer">{sourceName}</a>}
   {year!=null&&<time dateTime={String(year)}>{year} 年</time>}
  </div>
 </details>;
}

export function MarketContext({profile}:{profile:Profile|null}){
 const rows=visibleMarketContext(profile);
 if(!rows.length)return null;
 return <details className="market-context"><summary><span>经营环境</span><ChevronDown size={14}/></summary>
  <div className="overview-metric-list">{rows.map(row=>
   <OverviewMetric key={row.id} label={row.label}
    value={row.value.toLocaleString('zh-CN',{maximumFractionDigits:2})+'%'}
    year={row.year} url={row.source_url}/>
  )}</div>
 </details>;
}

function metricValue(indicator:Indicator,cell:Cell){
 const formatted=compact(cell.value,indicator.id);
 if(indicator.id==='population'){
  const [number,scale='']=formatted.split(' ');
  return <>{number}<small>{scale}人</small></>;
 }
 if(formatted.startsWith('$'))return <>{formatted.slice(1)}<small>美元</small></>;
 if(formatted.endsWith('%'))return <>{formatted.slice(0,-1)}<small>%</small></>;
 return formatted;
}

export function Fundamentals({detail}:{detail:Detail}){
 const available=detail.indicators.filter(indicator=>detail.latest[indicator.id]?.value!=null);
 const primary=available.filter(indicator=>['population','gdp_pc','health_pc','government_share'].includes(indicator.id));
 const demographic=available.filter(indicator=>['life_expectancy','age65_share'].includes(indicator.id));
 function renderMetric(indicator:Indicator){
  const cell=detail.latest[indicator.id];
  const rank=indicator.id==='gdp_pc'&&cell.rank&&cell.total&&cell.rank<=cell.total
   ?`第 ${cell.rank} / ${cell.total} 位`:undefined;
  return <OverviewMetric key={indicator.id} label={indicator.name} value={metricValue(indicator,cell)}
   year={cell.year} url={indicator.source_url} rank={rank}/>;
 }
 return <>
  {primary.length>0&&<div className="overview-core-metrics">{primary.map(renderMetric)}</div>}
  {demographic.length>0&&<div className="overview-demographics overview-metric-list">{demographic.map(renderMetric)}</div>}
 </>;
}

export default function CountryOverview({detail}:{detail:Detail}){
 return <div className="country-overview">
  {detail.indicators.some(indicator=>detail.latest[indicator.id]?.value!=null)&&<section className="overview-fundamentals" aria-label="市场基本面">
   <div className="workbench-heading"><h3>市场基本面</h3></div>
   <Fundamentals detail={detail}/>
  </section>}
  <CountryLanguages profile={detail.profile}/>
  <ReligionBasics iso3={detail.country.iso3} profile={detail.profile} countryName={detail.country.name}/>
  <MarketAccess profile={detail.profile} modules={['payment']}/>
  <MarketContext profile={detail.profile}/>
 </div>;
}
