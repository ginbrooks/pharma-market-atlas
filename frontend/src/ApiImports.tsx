import {useRef,useState} from 'react';
import {ArrowLeft,ChevronDown,Search} from 'lucide-react';
import type {ApiImportCategory,ApiImportData,Source} from './types';
import {safeUrl} from './lib';
import {apiAmount,apiCategoryRows,apiChange,apiImportIntro,apiLeadingCategories} from './api-import-model';
import './api-imports.css';

const colors=['#416f99','#b57a44','#5b8d79','#8c70a3','#be6974'];
const number=(value:number)=>value.toLocaleString('zh-CN',{maximumFractionDigits:2});
function ApiTrendChart({categories,year,compact=false,title}:{categories:ApiImportCategory[];year:number;compact?:boolean;title:string}){
 const [only,setOnly]=useState<string|null>(null),[hoverYear,setHoverYear]=useState<number|null>(null);
 const visible=only?categories.filter(c=>c.id===only):categories;
 const values=visible.flatMap(c=>c.points.filter(p=>p.amount_kusd!==null).map(p=>p.amount_kusd!));
 if(!values.length)return null;
 const years=Array.from(new Set(categories.flatMap(c=>c.points.map(p=>p.year)))).sort((a,b)=>a-b);
 const maximum=Math.max(...values,1),divisor=maximum>=100000?100000:10,unit=divisor===100000?'亿美元':'万美元';
 const magnitude=10**Math.floor(Math.log10(maximum/divisor));
 const ceiling=Math.ceil(maximum/divisor/magnitude*2)/2*magnitude;
 const baseline=compact?108:156,height=compact?80:122;
 const x=(value:number)=>years.length===1?174:56+(value-years[0])/(years[years.length-1]-years[0])*246;
 const y=(value:number)=>baseline-value/divisor/ceiling*height;
 const currentYear=hoverYear??year;
 return <div className={`api-trend ${compact?'api-trend-single':''}`}>
  <div className="import-trend-caption"><span>{title}</span><small>{unit}</small></div>
  <svg viewBox={`0 0 330 ${baseline+38}`} role="group" aria-label={`${title}，${years.join('、')}年进口金额，单位${unit}`}>
   {(compact?[0,1]:[0,.5,1]).map(t=><g key={t}><line x1="56" x2="302" y1={y(t*ceiling*divisor)} y2={y(t*ceiling*divisor)} className="import-chart-grid"/><text x="48" y={y(t*ceiling*divisor)+4} textAnchor="end" className="import-axis">{number(t*ceiling)}</text></g>)}
   {years.map(yr=><text key={yr} x={x(yr)} y={baseline+24} textAnchor="middle" className="import-axis">{yr}</text>)}
   {visible.map(category=>{const color=colors[categories.findIndex(c=>c.id===category.id)%colors.length];return <g key={category.id}>
    {category.points.slice(1).map((point,i)=>{const previous=category.points[i];return point.amount_kusd!==null&&previous.amount_kusd!==null&&point.year-previous.year===1?<line key={point.year} x1={x(previous.year)} x2={x(point.year)} y1={y(previous.amount_kusd)} y2={y(point.amount_kusd)} stroke={color} strokeWidth="2.2"/>:null})}
    {category.points.filter(p=>p.amount_kusd!==null).map(p=><g key={p.year} tabIndex={0} role="button" aria-label={`${p.year}年${category.name}，${apiAmount(p.amount_kusd!)}`} onMouseEnter={()=>setHoverYear(p.year)} onMouseLeave={()=>setHoverYear(null)} onFocus={()=>setHoverYear(p.year)} onBlur={()=>setHoverYear(null)} onClick={()=>setHoverYear(p.year)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setHoverYear(p.year)}}}>
     <circle cx={x(p.year)} cy={y(p.amount_kusd!)} r="11" fill="transparent"/><circle cx={x(p.year)} cy={y(p.amount_kusd!)} r="3.5" fill="white" stroke={color} strokeWidth="2"/>
     <title>{p.year}年 · {category.name} · {apiAmount(p.amount_kusd!)}</title>
    </g>)}
   </g>})}
  </svg>
  {!compact&&<div className="import-trend-legend">{categories.map((category,i)=><button type="button" key={category.id} className={only&&only!==category.id?'muted':''} aria-pressed={only===category.id} title={category.name_en} onClick={()=>setOnly(only===category.id?null:category.id)}><i style={{background:colors[i%colors.length]}}/><span>{category.name}</span></button>)}</div>}
  <div className="api-trend-readout"><strong>{currentYear} 年</strong>{visible.flatMap(category=>{const point=category.points.find(p=>p.year===currentYear);return point?.amount_kusd!=null?[<span key={category.id}><span>{compact?'进口金额':category.name}</span><b>{apiAmount(point.amount_kusd)}</b></span>]:[]})}</div>
 </div>;
}

export default function ApiImports({data,source}:{data:ApiImportData;source?:Source}){
 const [year,setYear]=useState(data.latest_year),[query,setQuery]=useState(''),[sort,setSort]=useState('amount'),[selected,setSelected]=useState<string|null>(null);
 const chartRef=useRef<HTMLDivElement>(null);
 const availableYears=data.years.filter(y=>y.amount_kusd!==null).sort((a,b)=>b.year-a.year);
 const activeYear=availableYears.some(y=>y.year===year)?year:availableYears[0]?.year;
 if(!activeYear)return null;
 const leaders=apiLeadingCategories(data,activeYear),rows=apiCategoryRows(data,activeYear,query,sort);
 const focused=data.categories.find(c=>c.id===selected);
 const categoriesCount=apiCategoryRows(data,activeYear).length;
 return <div className="api-imports">
  <div className="api-title-row"><h4>原料药相关进口</h4><label><select aria-label="原料药统计年份" value={activeYear} onChange={e=>{setYear(Number(e.target.value));setSelected(null)}}>{availableYears.map(row=><option key={row.year} value={row.year}>{row.year} 年</option>)}</select></label></div>
  <p className="import-summary">{apiImportIntro(data,activeYear)}</p>
  <a className="import-attribution" href={safeUrl(source?.url||'https://product.tendata.cn/rank#/industry')} target="_blank" rel="noreferrer">数据来源：腾道</a>
  <p className="api-scope">腾道原料药行业分类 · 含疫苗、兽药及饲料添加剂</p>
  <div ref={chartRef} className={`api-chart-area ${focused?'is-focused':'is-overview'}`}>{focused?<div className="api-focused"><button className="api-return" onClick={()=>setSelected(null)}><ArrowLeft size={13}/>主要品类</button><ApiTrendChart key={focused.id} categories={[focused]} year={activeYear} compact title={focused.name}/></div>:<>
   {leaders.featured.length>0&&<ApiTrendChart key={`${activeYear}-featured`} categories={leaders.featured} year={activeYear} compact title={leaders.featured[0].name}/>}
   {leaders.others.length>0&&<ApiTrendChart key={`${activeYear}-others`} categories={leaders.others} year={activeYear} title={`其他主要品类 · 前 ${leaders.others.length} 类`}/>}
  </>}</div>
  <details className="import-details api-category-details"><summary>全部品类<span>{categoriesCount}</span><ChevronDown size={13}/></summary>
   <div className="api-category-tools"><label><Search size={13}/><input value={query} onChange={e=>setQuery(e.target.value)} aria-label="搜索原料药品类" placeholder="搜索品类"/></label><select value={sort} onChange={e=>setSort(e.target.value)} aria-label="原料药品类排序"><option value="amount">按金额</option><option value="growth">按增速</option></select></div>
   <div className="api-table-scroll"><table className="api-category-table"><thead><tr><th>品类</th><th>金额（美元）</th><th>占比</th><th>同比</th></tr></thead><tbody>{rows.map(({category,point,share})=><tr key={category.id} className={selected===category.id?'selected':''}><th><button title={category.name_en} onClick={()=>{setSelected(category.id);requestAnimationFrame(()=>chartRef.current?.scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'}))}} aria-pressed={selected===category.id}>{category.name}</button></th><td>{apiAmount(point.amount_kusd!,false)}</td><td>{share===null?'—':share>0&&share<.001?'<0.1%':`${(share*100).toFixed(1)}%`}</td><td className={point.yoy!==null?point.yoy>0?'positive':point.yoy<0?'negative':'':''}>{apiChange(point.yoy)}</td></tr>)}</tbody></table></div>
   {!rows.length&&<p className="api-search-empty">没有匹配的品类</p>}
  </details>
  <details className="import-details api-year-details"><summary>年度数据<ChevronDown size={13}/></summary><table className="import-year-table"><thead><tr><th>年份</th><th>分类合计</th><th>同比</th></tr></thead><tbody>{availableYears.map(row=><tr key={row.year}><th>{row.year}</th><td>{apiAmount(row.amount_kusd!)}</td><td>{apiChange(row.yoy)}</td></tr>)}</tbody></table></details>
 </div>;
}
