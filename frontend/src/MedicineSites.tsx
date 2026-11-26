import {ArrowUpRight,Globe} from 'lucide-react';
import type {Profile} from './types';
import {visibleMedicineSites,websiteHost,websiteUrl} from './medicine-sites';
import './medicine-sites.css';

export default function MedicineSites({profile,mode='drawer'}:{profile:Profile|null;mode?:'drawer'|'full'|'compare'}){
 const sites=visibleMedicineSites(profile);
 if(!sites.length)return null;
 return <section className={`medicine-sites medicine-sites-${mode}`} aria-label="药监相关网站">
  {mode!=='full'&&<div className="medicine-sites-heading"><Globe size={17}/><h3>药监相关网站</h3></div>}
  <div className="medicine-sites-list">{sites.map(site=><article className="medicine-site" key={site.id}>
   <a href={websiteUrl(site.url)!} target="_blank" rel="noreferrer"><span>{site.title}</span><ArrowUpRight size={15}/></a>
   <p>{site.description}</p>
   <div className="medicine-site-meta"><span title={site.url}>{websiteHost(site.url)}</span>{site.access!=='public'&&<span>{site.access==='login_required'?'查询需登录':'部分功能需登录'}</span>}</div>
  </article>)}</div>
 </section>;
}
