import membership from './pics-members.json';
import './pics-badge.css';

const participatingCountries=new Set(Object.keys(membership.members));

export default function PicsBadge({iso2}:{iso2?:string}){
 if(!iso2||!participatingCountries.has(iso2.toUpperCase()))return null;
 return <a className="pics-badge" href={membership.source_url} target="_blank" rel="noreferrer" aria-label="PIC/S：查看官方参与机构名单" title={`该国家／地区有 PIC/S 参与监管机构；不代表所有药厂或药品均获认证。名单核对：${membership.checked_at}。点击查看官方名单。`}>PIC/S</a>;
}
