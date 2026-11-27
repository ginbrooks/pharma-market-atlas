import {lazy,Suspense,useCallback,useEffect,useMemo,useRef,useState} from 'react';
import type {FormEvent,ReactNode} from 'react';
import './atlas-chrome.css';
import {ArrowDownToLine,ArrowLeft,ArrowRight,ArrowUpRight,BarChart3,BookOpen,Check,ChevronDown,ChevronRight,Database,ExternalLink,FileText,Globe2,Info,Layers3,LogIn,LogOut,MapPin,Menu,Plus,Printer,Search,Settings2,ShieldCheck,SlidersHorizontal,Users,X} from 'lucide-react';
import type {Bootstrap,Cell,Comparison,Country,Detail,Indicator,Profile,Query,Source,User} from './types';
import ViewBoundary from './ErrorBoundary';
import {allowNavigation} from './navigation-guard';
import {visiblePolicy,policyTiming,usefulPolicyText,coverageBrief} from './policy-display';
import {hasReliableSources,supportedText,supportedSection,visibleChannelResearch} from './evidence-display';
import MarketAccess from './MarketAccess';
import ImportTrade from './ImportTrade';
import GmpAccess from './GmpAccess';
import CountryOverview,{Fundamentals,MarketContext} from './CountryOverview';
import CountryLanguages from './CountryLanguages';
import {profileParts} from './country-workbench-model';
import {visibleApiImports} from './api-import-model';
import {originSourcePageUrl,visibleImportOrigins} from './import-origins-model';
import {usePublishedVersion} from './usePublishedVersion';
import ReligionBasics,{CountryHumanity} from './ReligionBasics';
import {useCountryCulture} from './useCountryCulture';
import type {CountryCultureView} from './useCountryCulture';
import MedicineSites from './MedicineSites';
import {visibleMedicineSites} from './medicine-sites';
import {visibleReligion} from './religion-display';
import {isRegulatoryRule} from './regulatory';
import CountryFlag from './CountryFlag';
import PicsBadge from './PicsBadge';
import EaeuBadge from './EaeuBadge';
import RegionalBadges from './RegionalBadges';
import {backgroundSections,isBusinessPolicy} from './market-access';
import {api,compact,dateText,defaults,exportUrl,focusCountries,matchesFilters,palette,pickYear,precise,queryCorrection,readQuery,roleName,safeUrl,status,thresholds,valueOf,valueTypeLabel,valueTypeShortLabel,write} from './lib';
import {preloadOverview} from './map-overview';
const loadMapView=()=>import('./MapView');
const MapView=lazy(loadMapView);
if(readQuery().view==='map'){
 preloadOverview();
 void loadMapView().catch(()=>{});
}
const Admin=lazy(()=>import('./Admin'));

function queryUrl(q:Query){
 const params=new URLSearchParams();
 for(const k of Object.keys(q) as (keyof Query)[]) {
  if(q[k]&&q[k]!==defaults[k]&&!(k==='view'&&q.view==='admin'))params.set(k,q[k]);
 }
 const path=q.view==='admin'?'/admin':location.pathname.replace(/^\/admin\/?$/,'/');
 return `${path}${params.size?`?${params}`:''}${location.hash}`;
}
function useQuery(){
 const[q,setQ]=useState<Query>(readQuery);const current=useRef(q);current.current=q;
 useEffect(()=>{const onPop=()=>{const next=readQuery();if(next.view!==current.current.view&&!allowNavigation()){history.pushState({},'',queryUrl(current.current));return}current.current=next;setQ(next)};window.addEventListener('popstate',onPop);return()=>window.removeEventListener('popstate',onPop)},[]);
 const patch=useCallback((p:Partial<Query>,replace=false)=>{if(p.view&&p.view!==current.current.view&&!allowNavigation())return false;const next={...current.current,...p};history[replace?'replaceState':'pushState']({},'',queryUrl(next));current.current=next;setQ(next);return true},[]);
 return [q,patch] as const;
}

export function SourceLink({source,compact:small=false}:{source:Source;compact?:boolean}){return <a className={`source-link ${small?'compact':''}`} href={safeUrl(originSourcePageUrl(source.url))} target="_blank" rel="noreferrer"><span className="source-icon"><ExternalLink size={15}/></span><span><strong>{source.title}</strong>{!small&&<><small>{source.institution||new URL(safeUrl(source.url)==='#'?'https://example.invalid':source.url).hostname} · {source.language||'原文'}</small>{source.purpose&&<p>{source.purpose}</p>}</>}</span><ArrowUpRight size={15}/></a>}
function Brand(){return <div className="brand"><span><strong>医药市场地图</strong></span></div>}
function Empty({title,children}:{title:string;children?:ReactNode}){return <div className="empty-state"><Globe2 size={30}/><h3>{title}</h3>{children&&<p>{children}</p>}</div>}
function Loading({children='正在读取资料…'}:{children?:ReactNode}){return <div className="loading"><span className="spinner"/>{children}</div>}
function Auth({onReady,onBack}:{onReady:(user:User)=>void;onBack:()=>void}){
 const [setup,setSetup]=useState(false);
 useEffect(()=>{
  let active=true;
  api<{setup_required:boolean}>('/api/auth/status').then(a=>{if(active)setSetup(a.setup_required)}).catch(()=>{});
  return ()=>{active=false};
 },[]);
 const [user,setUser]=useState(''),[password,setPassword]=useState('');
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 const submit=async(event:FormEvent)=>{
  event.preventDefault();setBusy(true);setError('');
  try{const result=await write(`/api/auth/${setup?'setup':'login'}`,{username:user,password});onReady(result.user)}
  catch(e){setError((e as Error).message)}finally{setBusy(false)}
 };
 return <main className="auth-page atlas-signin">
  <div className="auth-left">
   <Brand/>
   <div className="auth-form-wrap">
    <h1>{setup?'创建管理员账号':'账号登录'}</h1>
    <form onSubmit={submit}>
     <label>用户名<input name="username" autoComplete="username" required minLength={2} maxLength={80} autoFocus value={user} onChange={e=>setUser(e.target.value)}/></label>
     <label>密码<input name="password" type="password" autoComplete={setup?'new-password':'current-password'} required minLength={setup?10:1} value={password} onChange={e=>setPassword(e.target.value)} placeholder={setup?'至少 10 位字符':undefined}/></label>
     {error&&<p role="alert" className="error-text">{error}</p>}
     <button className="primary-button auth-submit" disabled={busy}>{busy?'正在进入…':setup?'创建账号':'登录'}<ArrowRight size={17}/></button>
    </form>
    <button className="text-link signin-back" onClick={onBack}><ArrowLeft size={14}/>返回浏览</button>
   </div>
  </div>
 </main>;
}

export default function App(){
 const[showLogin,setShowLogin]=useState(false);const shareRequest=useRef<Promise<unknown>|null>(null);const requestId=useRef(0);const[data,setData]=useState<Bootstrap|null>(null);const[error,setError]=useState('');const[q,patch]=useQuery();const[toast,setToast]=useState('');const[evidence,setEvidence]=useState<{indicator:Indicator;cell?:Cell;country?:string}|null>(null);
 const notify=useCallback((message:string)=>{setToast(message);setTimeout(()=>setToast(''),4500)},[]);
 useEffect(()=>{if(!evidence)return;const close=(e:KeyboardEvent)=>{if(e.key==='Escape')setEvidence(null)};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close)},[evidence]);
 const reload=useCallback(async()=>{
  const id=++requestId.current;
  try{
   const sharedToken=new URLSearchParams(location.hash.slice(1)).get('share');
   if(sharedToken){
    history.replaceState(history.state,'',location.pathname+location.search);
    shareRequest.current=write('/api/auth/share',{token:sharedToken}).catch(()=>notify('共享链接已失效，已打开公开地图'));
   }
   await shareRequest.current;
   const next=await api<Bootstrap>('/api/bootstrap');
   if(id===requestId.current){setData(next);setError('')}
  }catch(e){if(id===requestId.current)setError((e as Error).message)}
 },[notify]);
 usePublishedVersion(data?.version,reload,!!data&&q.view!=='admin');
 useEffect(()=>{
  void reload();
  const expire=()=>{setData(null);void reload()};
  window.addEventListener('session-expired',expire);
  return()=>window.removeEventListener('session-expired',expire);
 },[reload]);
 const leaveLogin=()=>{setShowLogin(false);if(q.view==='admin')patch({view:'map'},true)};
 const signedIn=(user:User)=>{
  setShowLogin(false);
  if(q.view==='admin'&&!['editor','admin'].includes(user.role))patch({view:'map'},true);
  void reload();
 };
 const logout=async()=>{
  if(!patch({view:'map'},true))return;
  try{await write('/api/auth/logout',{})}catch(e){notify((e as Error).message);return}
  setShowLogin(false);
  setData(null);
  void reload();
 };
 useEffect(()=>{
  if(!data)return;
  const clean=queryCorrection(data,q,location.search);
  if(clean)patch(clean,true);
 },[data,q,patch]);
 const metric=data?.indicators.find(i=>i.id===q.metric)??data?.indicators[0];const year=q.year||String(data?pickYear(data,metric?.id||'population'):'');
 const selected=data?.countries.find(c=>c.iso3===q.country);const compareIds=q.compare.split(',').filter((v,i,a)=>v&&a.indexOf(v)===i&&data?.countries.some(c=>c.iso3===v)).slice(0,4);
 const toggleCompare=useCallback((iso:string)=>{const ids=q.compare.split(',').filter(Boolean);if(ids.includes(iso)){patch({compare:ids.filter(x=>x!==iso).join(',')});return}if(ids.length>=4){notify('最多比较 4 个国家。请先移除一个，再加入新国家。');return}patch({compare:[...ids,iso].join(',')});notify('已加入国家对比')},[q.compare,patch,notify]);
 const openCountry=(iso:string)=>patch({country:iso,view:'map',search:''});
 const user=data?.user;
 const canManage=user?.role==='admin'||user?.role==='editor';
 if(showLogin||(q.view==='admin'&&!canManage&&(data||error)))return <Auth onReady={signedIn} onBack={leaveLogin}/>;
 if(!data||!metric)return <div className="fatal-error"><Brand/>{error?<><h2>地图暂时无法打开</h2><p>{error}</p><button onClick={reload} className="primary-button">重试</button></>:<Loading>正在打开地图…</Loading>}</div>;
 return <div className={`app-shell view-${q.view}`}>{q.view!=='map'&&<header className="topbar"><a className="brand-home" href="?view=map" onClick={e=>{e.preventDefault();patch({view:'map'})}}><Brand/></a><nav className="main-nav" aria-label="主导航"><button className={['map','country'].includes(q.view)?'active':''} onClick={()=>patch({view:'map'})}><Globe2 size={16}/>探索地图</button><button className={q.view==='compare'?'active':''} onClick={()=>patch({view:'compare'})}><BarChart3 size={16}/>国家对比{compareIds.length>0&&<span className="nav-count">{compareIds.length}</span>}</button><button className={q.view==='sources'?'active':''} onClick={()=>patch({view:'sources'})}><BookOpen size={16}/>数据与口径</button>{canManage&&<button className={q.view==='admin'?'active':''} onClick={()=>patch({view:'admin'})}><ShieldCheck size={16}/>内容管理</button>}</nav><div className="user-menu">{user?<><span className="local-dot"/><span className="user-name">{user.username}<small>{roleName[user.role]}</small></span><button className="icon-button" aria-label="退出登录" title="退出登录" onClick={logout}><LogOut size={16}/></button></>:<button className="icon-button" aria-label="登录" title="登录" onClick={()=>setShowLogin(true)}><LogIn size={16}/></button>}</div></header>}
 <div className="print-header"><Brand/><p>生成于 {new Date().toLocaleString('zh-CN')} · 数据版本 {data.version}</p></div>
 {q.view==='map'&&<Explore data={data} q={{...q,year}} patch={patch} metric={metric} selected={selected} compareIds={compareIds} onCompare={toggleCompare} onCountry={openCountry} onEvidence={setEvidence} onLogin={()=>setShowLogin(true)} onLogout={logout}/>}
 {q.view==='country'&&<CountryPage iso={q.country} data={data} onBack={()=>patch({view:'map'})} onCompare={()=>toggleCompare(q.country)} compared={compareIds.includes(q.country)}/>}
 {q.view==='compare'&&<ComparePage data={data} ids={compareIds} mode={q.compareMode} year={year} onMode={mode=>patch({compareMode:mode})} onRemove={toggleCompare} onExplore={()=>patch({view:'map'})} onEvidence={setEvidence}/>}
 {q.view==='sources'&&<SourcesPage data={data}/>}
 {q.view==='admin'&&canManage&&<ViewBoundary kind="admin"><Suspense fallback={<Loading/>}><Admin data={data} onChanged={reload} notify={notify}/></Suspense></ViewBoundary>}
 {q.view==='map'&&compareIds.length>0&&<div className="compare-dock"><span className="dock-caption"><BarChart3 size={18}/>候选市场 <b>{compareIds.length}<small> / 4</small></b></span><div className="dock-countries">{compareIds.map(iso=><span className="country-chip" key={iso}>{data.countries.find(c=>c.iso3===iso)?.name}<button aria-label={`移除${data.countries.find(c=>c.iso3===iso)?.name}`} onClick={()=>toggleCompare(iso)}><X size={13}/></button></span>)}</div><button className="primary-button" disabled={compareIds.length<2} onClick={()=>patch({view:'compare'})}>开始比较<ArrowRight size={16}/></button></div>}
 {toast&&<div className="toast" role="status"><Check size={17}/>{toast}</div>}
 {evidence&&<div className="modal-backdrop" onClick={()=>setEvidence(null)}><section className="evidence-modal" role="dialog" aria-modal="true" aria-labelledby="evidence-title" onClick={e=>e.stopPropagation()}><button className="modal-close icon-button" aria-label="关闭证据详情" onClick={()=>setEvidence(null)}><X size={20}/></button><span className="eyebrow">指标来源</span><h2 id="evidence-title">{evidence.indicator.name}</h2>{evidence.cell&&<div className="evidence-value">{compact(evidence.cell.value,evidence.indicator.id)}<span>{evidence.country} · {evidence.cell.year||'暂无统计年度'}</span></div>}<dl className="evidence-meta">{evidence.cell?.value!=null&&<><dt>原始数值</dt><dd>{precise(evidence.cell.value,evidence.indicator.id)} {evidence.indicator.unit}</dd></>}<dt>指标定义</dt><dd>{evidence.indicator.definition}</dd><dt>统计单位</dt><dd>{evidence.indicator.unit}</dd><dt>源指标代码</dt><dd><code>{evidence.indicator.code}</code></dd><dt>原始提供方</dt><dd>{evidence.indicator.provider}</dd><dt>分发渠道</dt><dd>{evidence.indicator.distributor||'World Bank WDI'}</dd><dt>值类型</dt><dd>{valueTypeLabel(evidence.indicator,evidence.cell)}</dd><dt>源版本</dt><dd>{evidence.indicator.source_version||'来源未载明'}</dd><dt>获取时间</dt><dd>{data.fetched_at}</dd><dt>发布版本</dt><dd>{data.version}</dd><dt>使用许可</dt><dd>{evidence.indicator.license||'按来源条款'} · {evidence.indicator.export_allowed===false?'CSV 仅导出来源链接':'允许按署名要求导出'}</dd></dl><a className="primary-button" target="_blank" rel="noreferrer" href={safeUrl(evidence.indicator.source_url)}>打开官方指标原文<ArrowUpRight size={16}/></a></section></div>}
 </div>
}

type ExploreProps={data:Bootstrap;q:Query;patch:(p:Partial<Query>,replace?:boolean)=>void;metric:Indicator;selected?:Country;compareIds:string[];onCompare:(iso:string)=>void;onCountry:(iso:string)=>void;onEvidence:(e:any)=>void;onLogin:()=>void;onLogout:()=>void};
function Explore({data,q,patch,metric,selected,compareIds,onCompare,onCountry,onEvidence,onLogin,onLogout}:ExploreProps){
 const[showFilters,setShowFilters]=useState(false);
 const[searchOpen,setSearchOpen]=useState(!!q.search);
 const[menuOpen,setMenuOpen]=useState(false);
 const[sort,setSort]=useState('desc');
 const[activeResult,setActiveResult]=useState(-1);
 const searchArea=useRef<HTMLElement>(null);
 const searchInput=useRef<HTMLInputElement>(null);
 const menuTrigger=useRef<HTMLButtonElement>(null);
 const menuBox=useRef<HTMLElement>(null);
 const [homeRequest,setHomeRequest]=useState(0);
 const thematic=q.mapMode==='thematic';
 const breaks=useMemo(()=>thresholds(data.countries,metric.id,q.year),[data.countries,metric.id,q.year]);
 const regions=useMemo(()=>Array.from(new Set(data.countries.map(c=>c.region))).filter(Boolean).sort(),[data]);
 const filtered=useMemo(()=>data.countries.filter(c=>matchesFilters(c,data,q,metric.id)).sort((a,b)=>{
  const av=valueOf(a,metric.id,q.year),bv=valueOf(b,metric.id,q.year);
  if(av===null&&bv===null)return a.name.localeCompare(b.name,'zh');
  if(av===null)return 1;if(bv===null)return -1;return sort==='desc'?bv-av:av-bv;
 }),[data,q,metric.id,sort]);
 const excludedMissing=useMemo(()=>q.includeUnknown==='false'?data.countries.filter(c=>matchesFilters(c,data,q,metric.id,true)&&!matchesFilters(c,data,q,metric.id,false)).length:0,[data,q,metric.id]);
 const visible=useMemo(()=>new Set(filtered.map(c=>c.iso3)),[filtered]);
 const valid=data.countries.filter(c=>valueOf(c,metric.id,q.year)!=null).length;
 const missing=filtered.filter(c=>valueOf(c,metric.id,q.year)==null).length;
 const activeFilters=[q.region,q.minPopulation,q.minGdp,q.minHealth,q.minAge65,q.depth].filter(Boolean).length+Number(q.includeUnknown==='false');
 const dismissSearch=()=>{setSearchOpen(false);setShowFilters(false);setActiveResult(-1)};
 const choose=(iso:string)=>{onCountry(iso);dismissSearch();setMenuOpen(false);searchInput.current?.blur()};
 useEffect(()=>{setActiveResult(-1)},[q.search,q.region]);
 useEffect(()=>{if(activeResult>=0)document.getElementById(`map-result-${filtered[activeResult]?.iso3}`)?.scrollIntoView({block:'nearest'})},[activeResult]);
 useEffect(()=>{
  const onKey=(event:KeyboardEvent)=>{
   if(event.defaultPrevented||event.isComposing||document.querySelector('[aria-modal="true"], dialog[open]'))return;
   const editing=event.target instanceof HTMLElement && (event.target.isContentEditable||!!event.target.closest('input, textarea, select'));
   if(event.key==='/'&&!editing&&!event.metaKey&&!event.ctrlKey&&!event.altKey){
    event.preventDefault();setMenuOpen(false);searchInput.current?.focus();setSearchOpen(true);
   }
   if(event.key==='Escape'){
    if(menuBox.current)menuTrigger.current?.focus();
    if(searchArea.current?.contains(document.activeElement))searchInput.current?.focus();
    dismissSearch();setMenuOpen(false);
   }
  };
  const onOutside=(event:PointerEvent)=>{
   if(!(event.target instanceof Node))return;
   if(!searchArea.current?.contains(event.target))dismissSearch();
   if(!menuBox.current?.contains(event.target)&&!menuTrigger.current?.contains(event.target))setMenuOpen(false);
  };
  window.addEventListener('keydown',onKey);document.addEventListener('pointerdown',onOutside);
  return()=>{window.removeEventListener('keydown',onKey);document.removeEventListener('pointerdown',onOutside)};
 },[]);
 return <main className={`map-workspace ${selected?'has-country':''} ${compareIds.length?'has-comparison':''} ${thematic?'thematic-mode':'base-mode'}`}>
  <div className="map-stage" aria-label="全球医药市场地图">
   <ViewBoundary kind="map"><Suspense fallback={<Loading>正在载入地图…</Loading>}>
    <MapView countries={data.countries} visible={visible} metric={metric.id} year={q.year} breaks={breaks} selected={q.country} onSelect={choose} thematic={thematic} homeRequest={homeRequest}/>
   </Suspense></ViewBoundary>
  </div>

  <section ref={searchArea} className={`maps-search-area ${searchOpen||showFilters?'is-open':''}`} aria-label="查找市场">
   <div className="maps-searchbar">
    <button className="maps-brand-icon" title="返回地图概览并清除筛选" aria-label="医药市场地图 · 返回地图概览" onClick={()=>{patch({country:'',search:'',region:'',depth:'',minPopulation:'',minGdp:'',minHealth:'',minAge65:'',includeUnknown:'true'});dismissSearch();setHomeRequest(n=>n+1)}}>医药市场地图</button>
    <Search size={17} className="maps-search-glyph" aria-hidden="true"/>
    <input ref={searchInput} autoComplete="off" spellCheck={false} aria-keyshortcuts="/" aria-label="搜索国家" role="combobox" aria-expanded={searchOpen||showFilters} aria-controls="maps-country-results" aria-autocomplete="list" aria-activedescendant={activeResult>=0?`map-result-${filtered[activeResult]?.iso3}`:undefined} placeholder="搜索国家或地区" value={q.search} onFocus={()=>{setMenuOpen(false);setSearchOpen(true)}} onClick={()=>setSearchOpen(true)} onChange={e=>{patch({search:e.target.value},true);setSearchOpen(true)}} onKeyDown={e=>{if(e.nativeEvent.isComposing||e.keyCode===229)return;if(e.key==='ArrowDown'){e.preventDefault();setSearchOpen(true);setActiveResult(i=>Math.min(i+1,filtered.length-1))}else if(e.key==='ArrowUp'){e.preventDefault();setSearchOpen(true);setActiveResult(i=>Math.max(0,i-1))}else if(e.key==='Enter'&&searchOpen){const result=filtered[Math.max(0,activeResult)];if(result){e.preventDefault();choose(result.iso3)}}}}/>
    {q.search?<button className="maps-search-clear" aria-label="清除搜索" onClick={()=>{patch({search:''},true);searchInput.current?.focus();setSearchOpen(true)}}><X size={17}/></button>:<kbd className="atlas-search-key" aria-hidden="true">/</kbd>}
    <span className="maps-search-divider"/>
    <button className={`maps-filter-button ${showFilters?'active':''}`} aria-label="筛选市场" title="筛选市场" aria-expanded={showFilters} onClick={()=>{setMenuOpen(false);setShowFilters(v=>!v);setSearchOpen(true)}}><SlidersHorizontal size={19}/>{activeFilters>0&&<b>{activeFilters}</b>}</button>
   </div>
   {(searchOpen||showFilters)&&<div className="maps-search-dropdown">
    <div className="maps-results-top"><strong>{showFilters?'筛选市场':'国家与地区'}</strong><button className="icon-button" aria-label="收起搜索结果" onClick={()=>{setSearchOpen(false);setShowFilters(false)}}><X size={16}/></button></div>
    {!q.search&&!showFilters&&<div className="maps-quick-markets"><span>重点研究</span><div>{focusCountries.map(iso=>{const c=data.countries.find(x=>x.iso3===iso);return c?<button key={iso} onClick={()=>choose(iso)}>{c.name}</button>:null})}</div></div>}
    <div className="maps-result-filters"><select aria-label="地区筛选" value={q.region} onChange={e=>patch({region:e.target.value})}><option value="">全部地区</option>{regions.map(r=><option key={r}>{r}</option>)}</select><button className="text-button" onClick={()=>setShowFilters(v=>!v)}>{showFilters?'收起条件':'更多条件'}<ChevronDown size={13}/></button></div>
    {showFilters&&<div className="filter-panel maps-filter-panel">
     <label>档案覆盖<select value={q.depth} onChange={e=>patch({depth:e.target.value})}><option value="">全部档案</option><option value="focus">五个重点市场</option><option value="deep">已复核专业档案</option></select></label>
     <div className="numeric-filters"><label>人口至少（人）<input type="number" min="0" placeholder="不限" value={q.minPopulation} onChange={e=>patch({minPopulation:e.target.value})}/></label><label>人均 GDP 至少（美元）<input type="number" min="0" placeholder="不限" value={q.minGdp} onChange={e=>patch({minGdp:e.target.value})}/></label><label>卫生支出至少（美元/人）<input type="number" min="0" placeholder="不限" value={q.minHealth} onChange={e=>patch({minHealth:e.target.value})}/></label><label>65 岁及以上占比至少（%）<input type="number" min="0" max="100" placeholder="不限" value={q.minAge65} onChange={e=>patch({minAge65:e.target.value})}/></label></div>
     <label className="checkbox-label"><input type="checkbox" checked={q.includeUnknown!=='false'} onChange={e=>patch({includeUnknown:String(e.target.checked)})}/>纳入缺少所选指标的国家</label>
     <div className="maps-filter-bottom"><span>数值条件采用 {q.year} 年</span><button className="text-button" onClick={()=>patch({region:'',depth:'',minPopulation:'',minGdp:'',minHealth:'',minAge65:'',includeUnknown:'true'})}>清除条件</button></div>
    </div>}
    <div className="country-list-heading"><span>{filtered.length} 个国家与地区{missing>0&&<small> · {missing} 个暂无数据</small>}</span><button className="text-button sort-button" aria-label="切换数值排序" onClick={()=>setSort(s=>s==='desc'?'asc':'desc')}>{q.year} · {metric.name} {sort==='desc'?'↓':'↑'}</button></div>
    {excludedMissing>0&&<div className="excluded-missing" role="status">{excludedMissing} 个国家因所选指标缺失未参与筛选</div>}
    <div className="country-list maps-results-list" id="maps-country-results" role="listbox" aria-label="国家搜索结果">
     {filtered.length?filtered.map((c,i)=><div className={`country-row ${c.iso3===q.country?'selected':''} ${i===activeResult?'keyboard-active':''}`} key={c.iso3} id={`map-result-${c.iso3}`} role="option" aria-selected={i===activeResult||c.iso3===q.country}>
      <button className="country-select" onClick={()=>choose(c.iso3)}><CountryFlag iso2={c.iso2} name={c.name} small/><span className="country-name"><strong>{c.name}{focusCountries.includes(c.iso3)&&<i title="重点研究市场"/>}</strong><small>{c.name_en}</small></span><span className="country-value"><b>{compact(valueOf(c,metric.id,q.year),metric.id)}</b></span></button>
      <button className={`list-compare ${compareIds.includes(c.iso3)?'added':''}`} aria-label={`${compareIds.includes(c.iso3)?'移除':'加入'}${c.name}对比`} title="加入或移除对比" onClick={()=>onCompare(c.iso3)}>{compareIds.includes(c.iso3)?<Check size={15}/>:<Plus size={15}/>}</button>
     </div>):<Empty title="没有匹配的国家或地区"/>}
    </div>
   </div>}
  </section>

  <div className="maps-top-tools">
   <div className="maps-layer-controls">
    <div className="maps-base-toggle" data-thematic={thematic} role="group" aria-label="地图显示方式"><button aria-pressed={!thematic} className={!thematic?'active':''} onClick={()=>patch({mapMode:'base'})}><Globe2 size={15}/>地理底图</button><button aria-pressed={thematic} className={thematic?'active':''} onClick={()=>patch({mapMode:'thematic'})}><Layers3 size={15}/>指标着色</button></div>
    {thematic&&<div className="maps-metric-control"><select aria-label="地图指标" value={metric.id} onChange={e=>patch({metric:e.target.value,year:String(pickYear(data,e.target.value))})}>{data.indicators.map(i=><option value={i.id} key={i.id}>{i.name}</option>)}</select><button className="icon-button" aria-label="查看指标定义" onClick={()=>onEvidence({indicator:metric})}><Info size={14}/></button></div>}
    <select className="maps-year-control" aria-label="地图年份" title="统计与筛选年度" value={q.year} onChange={e=>patch({year:e.target.value})}>{[...data.years].sort((a,b)=>b-a).map(y=><option key={y}>{y}</option>)}</select>
   </div>
   <nav className="maps-navigation" aria-label="主导航"><button className="maps-compare-shortcut" aria-label="国家对比" onClick={()=>patch({view:'compare'})}><BarChart3 size={16}/><span>国家对比</span>{compareIds.length>0&&<b>{compareIds.length}</b>}</button><button ref={menuTrigger} className="maps-menu-toggle" aria-label={menuOpen?'关闭工作台菜单':'打开工作台菜单'} aria-expanded={menuOpen} onClick={()=>{dismissSearch();setMenuOpen(v=>!v)}}>{menuOpen?<X size={18}/>:<Menu size={19}/>}</button></nav>
  </div>
  {menuOpen&&<aside ref={menuBox} className="maps-menu" aria-label="工作台菜单"><div className="maps-menu-brand"><Brand/></div><button onClick={()=>patch({view:'sources'})}><BookOpen size={17}/>数据与口径<ChevronRight size={15}/></button>{(data.user?.role==='admin'||data.user?.role==='editor')&&<button onClick={()=>patch({view:'admin'})}><ShieldCheck size={17}/>内容管理<ChevronRight size={15}/></button>}{data.user?<div className="maps-menu-account"><span><strong>{data.user.username}</strong><small>{roleName[data.user.role]}</small></span><button aria-label="退出登录" title="退出登录" onClick={onLogout}><LogOut size={16}/></button></div>:<button onClick={onLogin}><LogIn size={17}/>登录<ChevronRight size={15}/></button>}<p>{data.countries.length} 个国家与地区 · 数据版本 {data.version}</p></aside>}

  {selected&&<div className="map-info-panel"><CountryDrawer key={selected.iso3} iso={selected.iso3} data={data} compared={compareIds.includes(selected.iso3)} onClose={()=>patch({country:''})} onCompare={()=>onCompare(selected.iso3)} onExpand={()=>patch({view:'country'})}/></div>}

  {thematic&&<div className="map-legend maps-floating-legend">
   <div className="legend-title"><strong>{metric.name}</strong><span>{metric.unit} · {q.year}</span></div>
   {valid>0?<>
    <div className="legend-colors">{palette.map(c=><i key={c} style={{background:c}}/>)}</div><div className="legend-values"><span>低</span><span>高</span></div>
    <div className="maps-legend-coverage">世界银行 · {valid} / {data.countries.length} 个经济体有数据</div>
    <details><summary>分段与数据状态</summary><div className="legend-breaks">{breaks.map((b,i)=><span key={i}>分界 {i+1}：{compact(b,metric.id)}</span>)}<p>分段由全部经济体计算，不随筛选改变。</p></div><div className="legend-states"><span><i className="missing-swatch"/>暂无数据</span><span><i className="filtered-swatch"/>未纳入筛选</span><span><i className="selected-swatch"/>已选国家</span></div></details>
   </>:<div className="maps-legend-empty" role="status"><strong>{q.year} 年暂无该指标数据</strong><p>可在地图年份中选择其他年度。</p></div>}
  </div>}


 </main>
}

function useCountry(iso:string,version:string){const[detail,setDetail]=useState<Detail|null>(null);const[error,setError]=useState('');useEffect(()=>{let active=true;setDetail(null);setError('');if(!iso)return;api<Detail>(`/api/countries/${iso}?${new URLSearchParams({version})}`).then(d=>{if(active)setDetail(d)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[iso,version]);return {detail,error}}
function CountryDrawer({iso,data,compared,onClose,onCompare,onExpand}:{iso:string;data:Bootstrap;compared:boolean;onClose:()=>void;onCompare:()=>void;onExpand:()=>void}){
 const {detail,error}=useCountry(iso,data.version),scroll=useRef<HTMLDivElement>(null);
 const country=detail?.country??data.countries.find(item=>item.iso3===iso);
 const [selectedTab,setSelectedTab]=useState('overview');
 const parts=useMemo(()=>profileParts(detail?.profile??null),[detail?.profile]);
 const tabs=[{id:'overview',label:'概览',show:true},{id:'trade',label:'贸易',show:parts.hasImports},{id:'access',label:'准入',show:parts.access},{id:'channels',label:'渠道',show:parts.payment},{id:'reference',label:'资料',show:parts.reference}].filter(t=>t.show);
 const active=tabs.some(t=>t.id===selectedTab)?selectedTab:'overview';
 const activeIndex=tabs.findIndex(tab=>tab.id===active);
 const selectTab=(id:string)=>{setSelectedTab(id);scroll.current?.scrollTo({top:0})};
 return <aside className="country-drawer country-workbench" aria-label="国家概要">
  <header className="country-drawer-heading">
   {country&&<div className="country-title">
    <CountryFlag iso2={country.iso2} name={country.name}/>
    <div>
     <div className="country-location"><span>{country.region}</span><span className="country-iso">{country.iso3}</span></div>
     <h2 className="country-name-with-membership"><span>{country.name}</span><PicsBadge iso2={country.iso2}/><EaeuBadge iso2={country.iso2}/><RegionalBadges iso2={country.iso2}/></h2>
     <p lang="en">{country.name_en}</p>
    </div>
   </div>}
   <button type="button" className="icon-button" aria-label="关闭国家概要" onClick={onClose}><X size={17}/></button>
  </header>
  {error?<Empty title="档案暂时无法读取">{error}</Empty>:!detail?<Loading/>:<>
   <div className="country-tab-strip"><div className="country-sections-tabs" role="tablist" aria-label="国家资料分类" onKeyDown={event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(activeIndex+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
    event.preventDefault();selectTab(tabs[next].id);event.currentTarget.querySelector<HTMLButtonElement>(`[data-tab="${tabs[next].id}"]`)?.focus();
   }}>{tabs.map(tab=><button type="button" role="tab" data-tab={tab.id} id={`${iso}-tab-${tab.id}`} aria-controls={`${iso}-panel-${tab.id}`} aria-selected={active===tab.id} tabIndex={active===tab.id?0:-1} key={tab.id} onClick={()=>selectTab(tab.id)}>{tab.label}</button>)}
    <span aria-hidden="true" className="country-tab-marker" style={{width:`${100/tabs.length}%`,transform:`translateX(${activeIndex*100}%)`}}/>
   </div></div>
   <div className="drawer-scroll" ref={scroll}><div key={active} className="drawer-panel" role="tabpanel" id={`${iso}-panel-${active}`} aria-labelledby={`${iso}-tab-${active}`} tabIndex={0}>
    {active==='overview'&&<CountryOverview detail={detail}/>}
    {active==='trade'&&<ImportTrade profile={detail.profile} countries={data.countries}/>}
    {active==='access'&&<MarketAccess profile={detail.profile} modules={['policies']}/>}
    {active==='channels'&&<><MarketAccess profile={detail.profile} modules={['payment','channels']}/><GmpAccess profile={detail.profile} category="procurement"/><BackgroundNotes profile={detail.profile}/></>}
    {active==='reference'&&<><MedicineSites profile={detail.profile}/>{parts.disease.length>0&&<section className="drawer-section"><div className="workbench-heading"><h3>疾病查询入口</h3></div>{parts.disease.map(link=><a className="text-link" key={link.url} href={safeUrl(link.url)} target="_blank" rel="noreferrer">{link.title}<ArrowUpRight size={13}/></a>)}</section>}{parts.sources.length>0&&<details className="drawer-reference-sources"><summary>全部资料来源<span>{parts.sources.length} 条</span><ChevronDown size={13}/></summary><div>{parts.sources.map(source=><SourceLink source={source} key={source.id} compact/>)}</div></details>}</>}
   </div></div>
   <div className="drawer-actions"><button type="button" className={`secondary-button ${compared?'is-added':''}`} aria-pressed={compared} onClick={onCompare}>{compared?<Check size={15}/>:<Plus size={15}/>} {compared?'已加入对比':'加入对比'}</button><button type="button" className="primary-button" onClick={onExpand}>完整档案<ArrowRight size={16}/></button></div>
  </>}
 </aside>;
}

function BackgroundNotes({profile}:{profile:Profile|null}){
 const {background,sources}=profileParts(profile);
 return background.length?<details className="business-other-sections"><summary>制度与市场背景</summary>{background.map(section=><article className="profile-section" key={section.id}><h3>{section.title}</h3><p>{section.summary}</p><div className="inline-sources">{sources.filter(source=>section.source_ids?.includes(source.id)).map(source=><a href={safeUrl(source.url)} target="_blank" rel="noreferrer" key={source.id}>{source.title}<ArrowUpRight size={12}/></a>)}</div></article>)}</details>:null;
}

function ProfileSections({profile,countries,country,culture}:{profile:Profile|null;countries:Country[];country:Country;culture:CountryCultureView}){
 const {sources,payment,hasImports,access,disease,religion,medicineSites}=profileParts(profile);
 return <>
  {hasImports&&<section className="profile-module" id="imports"><div className="module-heading"><span>02</span><div><h2>药品进口</h2></div></div><ImportTrade profile={profile} countries={countries}/></section>}
  {access&&<section className="profile-module" id="access"><div className="module-heading"><span>03</span><div><h2>本地保护政策</h2></div></div><MarketAccess profile={profile} mode="full" modules={['policies']}/></section>}
  {payment&&<section className="profile-module" id="payment"><div className="module-heading"><span>04</span><div><h2>患者支付与销售渠道</h2></div></div><MarketAccess profile={profile} mode="full" modules={['payment','channels']}/><GmpAccess profile={profile} mode="full" category="procurement"/><BackgroundNotes profile={profile}/></section>}
  {(religion||culture.items.length>0||culture.failed)&&<section className="profile-module" id="religion"><div className="module-heading"><span>05</span><div><h2>宗教与当地文化</h2></div></div><CountryHumanity key={country.iso3} iso3={country.iso3} profile={profile} countryName={country.name} mode="full" culture={culture}/></section>}
  {disease.length>0&&<section className="profile-module" id="demand"><div className="module-heading"><span>06</span><div><h2>疾病查询入口</h2></div></div>{disease.map(l=><a className="text-link" key={l.url} href={safeUrl(l.url)} target="_blank" rel="noreferrer">{l.title}<ArrowUpRight size={14}/></a>)}</section>}
  {medicineSites&&<section className="profile-module" id="official-sites"><div className="module-heading"><span>07</span><div><h2>药监相关网站</h2></div></div><MedicineSites profile={profile} mode="full"/></section>}
  {sources.length>0&&<section className="profile-module" id="sources"><div className="module-heading"><span>08</span><div><h2>资料来源与证据</h2></div></div><div className="source-grid">{sources.map(source=><div className="source-card" key={source.id}><SourceLink source={source}/>{source.locator&&<p className="source-locator">原文位置：{source.locator}</p>}{source.excerpt&&<blockquote>{source.excerpt}</blockquote>}{source.evidence_note&&<p className="source-locator">核对记录：{source.evidence_note}</p>}</div>)}</div></section>}
 </>
}

function CountryPage({iso,data,onBack,onCompare,compared}:{iso:string;data:Bootstrap;onBack:()=>void;onCompare:()=>void;compared:boolean}){const{detail,error}=useCountry(iso,data.version);const culture=useCountryCulture(detail?.profile||null,detail?.country.iso3);if(!iso)return <Empty title="先选择一个国家"><button className="text-button" onClick={onBack}>返回地图</button></Empty>;if(error)return <Empty title="档案无法读取">{error}</Empty>;if(!detail)return <Loading/>;const parts=profileParts(detail.profile);return <main className="document-page country-page"><div className="document-breadcrumb no-print"><button className="text-button" onClick={onBack}><ArrowLeft size={15}/>返回地图</button><span>/</span><span>{detail.country.name}</span></div><header className="document-title"><div><span className="eyebrow">国家档案 · {detail.country.iso3}</span><h1 className="country-document-heading"><CountryFlag iso2={detail.country.iso2} name={detail.country.name}/><span><span className="country-name-with-membership"><span>{detail.country.name}</span><PicsBadge iso2={detail.country.iso2}/><EaeuBadge iso2={detail.country.iso2}/><RegionalBadges iso2={detail.country.iso2}/></span><small>{detail.country.name_en}</small></span></h1><p>{detail.country.region} · {['deep','verified'].includes(detail.profile?.coverage||'')?'专业档案':'基础档案'}</p></div><div className="document-actions no-print"><button className="secondary-button" onClick={onCompare}>{compared?<Check size={15}/>:<Plus size={15}/>} {compared?'已加入对比':'加入对比'}</button><a className="secondary-button" href={exportUrl([iso],'latest','',detail.version)}><ArrowDownToLine size={15}/>CSV</a><button className="primary-button" onClick={()=>window.print()}><Printer size={15}/>打印摘要</button></div></header><div className="document-layout"><nav className="document-nav no-print" aria-label="档案章节"><a href="#overview">01 市场概况</a>{parts.hasImports&&<a href="#imports">02 药品进口</a>}{parts.access&&<a href="#access">03 本地保护政策</a>}{parts.payment&&<a href="#payment">04 支付与渠道</a>}{(parts.religion||culture.items.length>0||culture.failed)&&<a href="#religion">05 宗教与当地文化</a>}{parts.disease.length>0&&<a href="#demand">06 疾病查询</a>}{parts.medicineSites&&<a href="#official-sites">07 药监相关网站</a>}{parts.sources.length>0&&<a href="#sources">08 资料来源</a>}<div className="nav-version"><Database size={16}/><span>当前发布版本<br/><b>{detail.version}</b></span></div></nav><div className="document-body"><section className="profile-module" id="overview"><div className="module-heading"><span>01</span><div><h2>市场概况</h2></div></div><Fundamentals detail={detail}/><CountryLanguages profile={detail.profile}/><MarketContext profile={detail.profile}/><div className="print-only">{detail.indicators.map(i=><p key={i.id}>{i.name}：{i.definition} · 原文 {i.source_url}</p>)}</div></section><ProfileSections profile={detail.profile} country={detail.country} countries={data.countries} culture={culture}/><footer className="document-footer"><p>数据版本 {detail.version} · 获取时间 {data.fetched_at} · 生成时间 {new Date().toLocaleString('zh-CN')}</p></footer></div></div></main>}

function ComparePage({data,ids,mode,year,onMode,onRemove,onExplore,onEvidence}:{data:Bootstrap;ids:string[];mode:string;year:string;onMode:(s:string)=>void;onRemove:(s:string)=>void;onExplore:()=>void;onEvidence:(e:any)=>void}){const[result,setResult]=useState<Comparison|null>(null);const[error,setError]=useState('');const[compareFocus,setCompareFocus]=useState('trade');useEffect(()=>{let active=true;setResult(null);setError('');if(ids.length<2)return;api<Comparison>(`/api/compare?${new URLSearchParams({countries:ids.join(','),mode,year,version:data.version})}`).then(r=>{if(active)setResult(r)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[ids.join(','),mode,year,data.version]);return <main className="document-page comparison-page"><header className="document-title"><div><h1>国家对比<span className="small-badge">{ids.length} / 4</span></h1></div><div className="document-actions no-print"><button className="secondary-button" onClick={onExplore}><Plus size={15}/>选择国家</button>{ids.length>=2&&<><a className="secondary-button" href={exportUrl(ids,mode,year,result?.version||data.version)}><ArrowDownToLine size={15}/>导出 CSV</a><button className="primary-button" onClick={()=>window.print()}><Printer size={15}/>打印摘要</button></>}</div></header>{ids.length<2?<Empty title="选择至少两个国家，开始比较"><span>在地图或国家列表中点击「加入对比」，最多可选择 4 个国家。</span><br/><button className="primary-button" onClick={onExplore}>去选择市场<ArrowRight size={16}/></button></Empty>:<><div className="comparison-controls"><div className="segmented" role="group" aria-label="比较年份口径">{[['common','最近共同年度'],['map',`地图固定年度 · ${year}`],['latest','各国最新值']].map(([v,l])=><button key={v} className={mode===v?'active':''} onClick={()=>onMode(v)}>{l}</button>)}</div><p><Info size={14}/>{mode==='common'?'每一行取最近五年内的共同年度，行与行之间可能不同。':mode==='map'?'全部数值严格使用地图年份，缺失值不向往年回补。':'逐格标明统计年度；异年数值不提供严格排名。'}</p></div>{error?<Empty title="无法加载对比">{error}</Empty>:!result?<Loading/>:<><div className="comparison-table-wrap"><table className="comparison-table"><thead><tr><th><strong>基础规模与支付</strong></th>{result.countries.map(c=><th key={c.iso3}><span className="compare-code">{c.iso3}</span><strong>{c.name}</strong><button className="icon-button no-print" aria-label={`移除${c.name}`} onClick={()=>onRemove(c.iso3)}><X size={15}/></button></th>)}</tr></thead><tbody>{result.rows.map(row=><tr key={row.indicator.id}><th><button onClick={()=>onEvidence({indicator:row.indicator})}>{row.indicator.name}<Info size={13}/></button><small>{row.indicator.unit}</small>{row.year&&<span className="row-year">{row.year} 年</span>}{row.warning&&<p className="row-warning">{row.warning}</p>}</th>{row.cells.map((cell,i)=><td key={cell.iso3||i}><button className="compare-number" onClick={()=>onEvidence({indicator:row.indicator,cell,country:result.countries[i]?.name})}>{compact(cell.value,row.indicator.id)}</button><small>{cell.year?`${cell.year} 年`:status(cell.status)}{mode==='latest'&&row.cells.some(x=>x.year!==cell.year)&&cell.year?' · 年份不同':''}</small>{cell.value!=null&&<small title={valueTypeLabel(row.indicator,cell)}>{valueTypeShortLabel(row.indicator,cell)}</small>}{cell.rank&&mode!=='latest'&&<span className="ranking">第 {cell.rank} / {cell.total} 位</span>}</td>)}</tr>)}</tbody></table></div><section className="compare-business"><div className="module-heading"><span>02</span><div><h2>{{trade:'贸易资料对比',access:'本地保护政策对比',channels:'支付与渠道对比',context:'经营环境对比',reference:'参考资料对比'}[compareFocus]}</h2></div></div><div className="compare-section-tabs no-print" role="group" aria-label="比较资料分类">{[['trade','贸易'],['access','准入'],['channels','渠道'],['context','经营环境'],['reference','资料']].map(([id,label])=><button type="button" key={id} aria-pressed={compareFocus===id} onClick={()=>setCompareFocus(id)}>{label}</button>)}</div><div className="compare-profiles" style={{gridTemplateColumns:`repeat(${result.countries.length},minmax(230px,1fr))`}}>{result.countries.map((c,i)=>{const raw=result.profiles as any;const p:Profile|null=Array.isArray(raw)?raw.find((x:any)=>x?.iso3===c.iso3)||raw[i]:raw?.[c.iso3];const parts=profileParts(p);return <article key={c.iso3}><h3>{c.name}</h3>{compareFocus==='trade'&&<ImportTrade profile={p} countries={data.countries}/>}{compareFocus==='access'&&<MarketAccess profile={p} mode="compare" modules={['policies']}/>}{compareFocus==='channels'&&<><MarketAccess profile={p} mode="compare" modules={['payment','channels']}/><GmpAccess profile={p} mode="compare" category="procurement"/>{p&&<BackgroundNotes profile={p}/>}</>}{compareFocus==='context'&&<MarketContext profile={p}/>} {compareFocus==='reference'&&<><MedicineSites profile={p} mode="compare"/><ReligionBasics key={c.iso3} iso3={c.iso3} countryName={c.name} profile={p} mode="compare"/>{parts.sources.length>0&&<details className="drawer-reference-sources"><summary>全部资料来源<span>{parts.sources.length} 条</span><ChevronDown size={13}/></summary><div>{parts.sources.map(s=><SourceLink key={s.id} source={s} compact/>)}</div></details>}</>}</article>})}</div></section><footer className="document-footer"><p>数据版本 {result.version} · 生成于 {new Date().toLocaleString('zh-CN')}</p><div className="print-only">{result.rows.map(r=><p key={r.indicator.id}>{r.indicator.name}：{r.indicator.source_url}</p>)}</div></footer></>}</>}</main>}
function SourcesPage({data}:{data:Bootstrap}){return <main className="document-page sources-page"><header className="document-title"><div><h1>数据与口径</h1><p>查看统计定义、原始来源与资料版本。</p></div><span className="version-pill"><Database size={16}/>{data.version}</span></header><div className="source-overview"><div><span>覆盖范围</span><b>{data.countries.length} 个国家与地区</b><small>排除世界、地区、收入组等汇总项</small></div><div><span>统计年度</span><b>{Math.min(...data.years)} — {Math.max(...data.years)}</b><small>地图与排名使用固定年度</small></div><div><span>快照获取</span><b>{dateText(data.fetched_at)}</b><small>获取日期不等于统计年度</small></div></div><section className="profile-module"><h2>六项指标字典</h2><div className="indicator-dictionary">{data.indicators.map((i,n)=><article key={i.id}><span className="dictionary-index">0{n+1}</span><div><h3>{i.name}<small>{i.unit}</small></h3><p>{i.definition}</p><div className="indicator-meta"><code>{i.code}</code><span>{valueTypeLabel(i)}</span><span>{i.export_allowed===false?'导出仅含来源链接':'可按许可导出'}</span></div><a className="text-link" target="_blank" rel="noreferrer" href={safeUrl(i.source_url)}>官方指标与原始定义<ArrowUpRight size={13}/></a></div></article>)}</div></section><section className="profile-module"><h2>怎样比较这些数字</h2><div className="method-grid"><article><span>01 / 同年</span><h3>地图、排名：固定一个年度</h3><p>只用该年度有数据的经济体排名，缺失值不补 0。并列采用相同名次，名次与有效样本数一同显示。</p></article><article><span>02 / 最新</span><h3>国家档案：每项最新可得</h3><p>逐项显示年份。对比默认逐行寻找最近五年共同年度；切换最新值时，异年值明确标识并取消严格排名。</p></article><article><span>03 / 口径</span><h3>卫生支出的统计范围</h3><p>政府支付比例指政府卫生支出在全部经常性卫生支出中的占比。平均预期寿命采用出生时口径；老龄化比例指 65 岁及以上人口占比。各来源的估计方法和年份单独列示。</p></article></div></section><section className="profile-module"><h2>来源登记与许可</h2><div className="source-grid">{data.sources?.map((s:any,i)=><div className="source-card" key={s.id||i}><SourceLink source={{...s,title:s.title||s.name||s.id,url:s.url||s.source_url||'#'}}/>{s.license&&<p>许可：{typeof s.license==='string'?s.license:JSON.stringify(s.license)}</p>}</div>)}</div><p className="subtle-note">World Bank: World Development Indicators. 原始提供方与分发渠道分别保留；第三方条款按指标记录。Natural Earth 轮廓为公有领域。</p></section></main>}
