import {ChevronDown,ArrowUpRight} from 'lucide-react';
import type {Profile} from './types';
import {visibleCountryLanguages} from './country-languages';
import {safeUrl} from './lib';
import './country-workbench.css';

export default function CountryLanguages({profile}:{profile:Profile|null}){
 const data=visibleCountryLanguages(profile);if(!data)return null;
 return <section className="country-languages" aria-label="国家语言"><div className="country-language-heading"><h3>语言</h3><details><summary>来源<ChevronDown size={11}/></summary><div>{data.sources.map(s=><a key={s.id} href={safeUrl(s.url)} target="_blank" rel="noreferrer">{s.title}<ArrowUpRight size={11}/></a>)}</div></details></div>
  <dl>{data.rows.map(row=><div key={row.id}><dt>{row.label}</dt><dd><strong>{row.value}</strong>{row.context&&<small>{row.context}</small>}</dd></div>)}</dl>
 </section>;
}
