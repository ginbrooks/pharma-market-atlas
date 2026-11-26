import type {Bootstrap,Country,Query,Indicator,Cell} from './types';
export const defaults: Query={mapMode:'base',country:'',metric:'population',year:'',search:'',region:'',minPopulation:'',minGdp:'',minHealth:'',minAge65:'',includeUnknown:'true',depth:'',compare:'',view:'map',compareMode:'common'};
export function readQuery():Query {const p=new URLSearchParams(location.search);const q={...defaults}; for(const k of Object.keys(q) as (keyof Query)[]) if(p.has(k))q[k]=p.get(k)!;if(/^\/admin\/?$/.test(location.pathname))q.view='admin';if(!['map','country','compare','sources','admin'].includes(q.view))q.view='map';return q;}
export async function api<T=any>(path:string,options?:RequestInit):Promise<T>{const r=await fetch(path,{credentials:'same-origin',...options,headers:{...(options?.body?{'Content-Type':'application/json'}:{}),...options?.headers}});if(!r.ok){let message=`请求失败（${r.status}）`;try{const d=await r.json();message=typeof d.detail==='string'?d.detail:JSON.stringify(d.detail)}catch{/* HTTP fallback */}if(r.status===401&&!path.startsWith('/api/auth/'))window.dispatchEvent(new Event('session-expired'));throw new Error(message)}if(r.status===204)return undefined as T;return r.json();}
export const write=(path:string,body:unknown,method='POST')=>api(path,{method,body:JSON.stringify(body)});
export function valueOf(c:Country,metric:string,year:number|string):number|null {const n=c.metrics?.[metric]?.[String(year)];return typeof n==='number'&&Number.isFinite(n)?n:null;}
export function compact(n:number|null|undefined,metric:string):string{if(n==null)return '暂无数据';if(metric==='population'){if(n>=1e8)return `${(n/1e8).toLocaleString('zh-CN',{maximumFractionDigits:2})} 亿`;if(n>=1e4)return `${(n/1e4).toLocaleString('zh-CN',{maximumFractionDigits:1})} 万`;return Math.round(n).toLocaleString('zh-CN')}if(metric==='life_expectancy')return `${n.toLocaleString('zh-CN',{maximumFractionDigits:1})} 岁`;if(['health_gdp','government_share','oop_share','age65_share'].includes(metric))return `${n.toLocaleString('zh-CN',{maximumFractionDigits:1})}%`;return `$${n.toLocaleString('en-US',{maximumFractionDigits:0})}`;}
export function precise(n:number|null|undefined,metric:string):string {if(n==null)return '—';return n.toLocaleString('zh-CN',{maximumFractionDigits:metric==='population'?0:20});}
export function pickYear(data:Bootstrap,metric:string):number {const ys=[...data.years].sort((a,b)=>b-a).slice(0,5);const counts=ys.map(y=>({y,n:data.countries.filter(c=>valueOf(c,metric,y)!==null).length}));return counts.find(x=>x.n/data.countries.length>=.8)?.y??counts.sort((a,b)=>b.n-a.n||b.y-a.y)[0]?.y??new Date().getFullYear()-1;}
export function thresholds(countries:Country[],metric:string,year:string|number):number[]{const vals=countries.map(c=>valueOf(c,metric,year)).filter((n):n is number=>n!=null).sort((a,b)=>a-b);return [0.2,0.4,0.6,0.8].map(p=>vals[Math.min(vals.length-1,Math.floor(vals.length*p))]??0)}
export const palette=['#d6e5d9','#a8cbb2','#78ad91','#43856a','#19563f'];
export function colorFor(n:number|null,breaks:number[]){if(n===null)return '#e3e3dc';return palette[breaks.filter(b=>n>=b).length]}
export const focusCountries=['PHL','UZB','LAO','KHM','LKA'];
export const roleName:Record<string,string>={admin:'管理员',editor:'编辑',reader:'读者',research_reader:'研究读者'};
export const statusName:Record<string,string>={pending:'待人工复核',available:'有值',dynamic:'动态页面待人工确认',timeout:'连接超时',search_only:'仅搜索定位',search_index_only:'仅搜索索引可读',content_unavailable:'正文暂不可读',not_found:'页面不存在',blocked:'连接受限',needs_review:'需要复核',unrelated_redirect:'无关跳转',login_required:'需要登录',failed:'连接失败',draft:'草稿',reviewed:'已复核',published:'已发布',basic:'基础档案',deep:'专业档案',verified:'已复核',unknown:'日期不明',active:'生效',effective:'生效',future:'未生效',expired:'已失效',superseded:'已替代',replaced:'已替代',accessible:'技术连通',unverified:'未核验',not_compiled:'尚未整理',not_reported:'来源未报告',missing:'来源未报告',source_unavailable:'来源失效',under_review:'正在复核',valid:'有值'};
export const status=(v:string|undefined|null)=>v?(statusName[v]??v):'尚未核实';
export const dateText=(value:unknown)=>typeof value==='string'?value.slice(0,10):'未记录';
export function exportUrl(countries:string[],mode:string,year:string,version?:string){const params=new URLSearchParams({countries:countries.join(','),mode});if(year)params.set('year',year);if(version)params.set('version',version);return `/api/export.csv?${params}`}
export function safeUrl(url:string){try{const u=new URL(url);return ['https:','http:'].includes(u.protocol)?u.href:'#'}catch{return '#'}}

export function matchesFilters(c:Country,data:Bootstrap,q:Query,metric:string,includeUnknown=q.includeUnknown!=='false'):boolean {
 const search=q.search.trim().toLocaleLowerCase();
 if(search&&![c.name,c.name_en,c.iso3,c.iso2,...(c.aliases||[])].some(v=>v.toLocaleLowerCase().includes(search)))return false;
 if(q.region&&c.region!==q.region)return false;
 if(q.depth==='focus'&&!focusCountries.includes(c.iso3))return false;
 if(q.depth==='deep'&&!['deep','verified'].includes(data.profile_coverage?.[c.iso3]))return false;
 let missing=valueOf(c,metric,q.year)==null;
 const conditions:[string,string,boolean][]=[['population',q.minPopulation,true],['gdp_pc',q.minGdp,true],['health_pc',q.minHealth,true],['age65_share',q.minAge65,true]];
 for(const [id,input,isMin] of conditions){if(!input)continue;const n=valueOf(c,id,q.year);if(n==null){missing=true;continue}if(isMin?n<Number(input):n>Number(input))return false}
 return includeUnknown||!missing;
}

/** Use each source's own estimate/projection description; never infer its author from a type flag. */
export function valueTypeLabel(indicator:Indicator,cell?:Cell):string {
 const note=cell?.value_type_note?.trim()||indicator.value_type_note?.trim();
 if(note)return note;
 const kind=cell?.value_type||indicator.value_type;
 if(kind==='estimate')return '来源估计值';
 if(kind==='forecast'||kind==='projection')return '来源预测值';
 if(kind==='observed')return '来源观测值';
 return '来源发布值；估计与观测按原文定义';
}

export function queryCorrection(data:Bootstrap,q:Query,urlSearch:string):Partial<Query>|null {
 if(!data.indicators.length)return null;
 const valid=data.indicators.find(i=>i.id===q.metric);
 const current=valid??data.indicators.find(i=>i.id==='population')??data.indicators[0];
 const clean:Partial<Query>={};
 if(!valid){clean.metric=current.id;clean.year=String(pickYear(data,current.id))}
 else if(!q.year||!data.years.includes(Number(q.year)))clean.year=String(pickYear(data,current.id));
 return Object.keys(clean).length||new URLSearchParams(urlSearch).has('maxOop')?clean:null;
}

/** Compact metadata for cards; the full source note remains in title and evidence details. */
export function valueTypeShortLabel(indicator:Indicator,cell?:Cell):string {
 const kind=cell?.value_type||indicator.value_type;
 if(kind==='forecast'||kind==='projection')return '来源预测值';
 if(['health_pc','government_share','health_gdp','oop_share'].includes(indicator.id))return '卫生账户数据';
 if(indicator.id==='life_expectancy')return '生命表估计';
 if(indicator.id==='population'||indicator.id==='age65_share'){
  const note=valueTypeLabel(indicator,cell);
  return kind==='estimate'||/估计|估算|estimat/i.test(note)?'人口估计':'来源发布值';
 }
 if(kind==='estimate')return '来源估计值';
 if(kind==='observed')return '来源观测值';
 return '来源发布值';
}
