import {useState} from 'react';
import {Globe2} from 'lucide-react';
import flagCodes from './flag-codes.json';

const available = new Set(flagCodes);

/** Local artwork only. Unknown region codes never borrow a neighbouring flag. */
export default function CountryFlag({iso2,name,small=false}:{iso2?:string;name:string;small?:boolean}){
 const code=(iso2||'').toLowerCase();
 const [failedCode,setFailedCode]=useState('');
 const present=available.has(code)&&failedCode!==code;
 return <span className={`country-flag ${small?'country-flag-small':''} ${present?'':'country-flag-fallback'}`}>
  {present?<img src={`/flags/${code}.svg`} alt={`${name}旗帜`} width={56} height={42} decoding="async" onError={()=>setFailedCode(code)}/>:<Globe2 role="img" aria-label={`${name}：暂无对应旗帜图案`} size={small?22:28} strokeWidth={1.4}/>}
 </span>;
}
