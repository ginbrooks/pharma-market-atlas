import {useState} from 'react';
import {ChevronDown,PackageOpen} from 'lucide-react';
import type {Country,Profile} from './types';
import {safeUrl} from './lib';
import {hasReliableSources} from './evidence-display';
import './import-trade.css';
import ImportTrend from './ImportTrend';
import {importIntro} from './import-trade-model';
import ApiImports from './ApiImports';
import {visibleApiImports} from './api-import-model';
import ImportOrigins from './ImportOrigins';
import {visibleImportOrigins} from './import-origins-model';

const amount=(value:number|null)=>value===null?'—':value>=100000?`${(value/100000).toLocaleString('zh-CN',{maximumFractionDigits:2})} 亿美元`:`${(value/10).toLocaleString('zh-CN',{maximumFractionDigits:1})} 万美元`;
function ImportTradeContent({profile,countries}:{profile:Profile|null;countries:Country[]}){
 const [tab,setTab]=useState<'formulations'|'api'>('formulations');
 const section=profile?.sections.find(s=>s.id==='trade_imports');
 const data=section?.import_data;
 const hasTrends=!!section&&!!data&&hasReliableSources(section.source_ids,profile?.sources||[])&&data.years.some(row=>row.amount_kusd!=null);
 const origins=visibleImportOrigins(profile);
 const hasFormulations=hasTrends||!!origins;
 const api=visibleApiImports(profile);
 if(!hasFormulations&&!api)return null;
 const source=profile?.sources.find(s=>section?.source_ids.includes(s.id)&&s.id.startsWith('tendata-import-'));
 const apiSource=profile?.sources.find(s=>api?.section.source_ids.includes(s.id));
 const active=hasFormulations&&api?tab:api?'api':'formulations';
 return <section className="import-trade" aria-label="药品进口">
  <div className="import-heading"><PackageOpen size={17}/><h3>药品进口</h3></div>
  {hasFormulations&&api&&<div className="import-tabs" role="tablist" aria-label="进口数据类型"><button type="button" role="tab" aria-selected={active==='formulations'} onClick={()=>setTab('formulations')}>制剂</button><button type="button" role="tab" aria-selected={active==='api'} onClick={()=>setTab('api')}>原料药</button></div>}
  {active==='api'&&api?<ApiImports data={api.data} source={apiSource}/>:hasFormulations?<>
  {origins&&<ImportOrigins data={origins.data} countries={countries}/>}
  {hasTrends&&data&&<div className="formulation-trends">
  <p className="import-summary">{importIntro(data)}</p>
  <a className="import-attribution" href={safeUrl(source?.url||'https://product.tendata.cn/rank#/hs-code')} target="_blank" rel="noreferrer">数据来源：腾道</a>
  <ImportTrend key={profile?.iso3} trend={data.trend}/>
  <details className="import-details"><summary>年度数据<ChevronDown size={13}/></summary>
   <table className="import-year-table"><thead><tr><th>年份</th><th>进口金额</th></tr></thead><tbody>{data.years.filter(row=>row.amount_kusd!=null).map(row=><tr key={row.year}><th>{row.year}</th><td>{amount(row.amount_kusd)}</td></tr>)}</tbody></table>
  </details>
  </div>}
  </>:null}
 </section>;
}
export default function ImportTrade({profile,countries}:{profile:Profile|null;countries:Country[]}){return <ImportTradeContent key={profile?.iso3} profile={profile} countries={countries}/>}
