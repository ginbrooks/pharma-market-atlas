import membership from './eaeu-members.json';
import './pics-badge.css';

const members=new Set(Object.keys(membership.members));
export default function EaeuBadge({iso2}:{iso2?:string}){
 if(!iso2||!members.has(iso2.toUpperCase()))return null;
 return <a className="pics-badge eaeu-badge" href={membership.source_url} target="_blank" rel="noreferrer" aria-label="EAEU：查看欧亚经济联盟成员" title={`欧亚经济联盟成员；药品按共同注册与认可程序进入目标国，不是一国批准后自动五国上市。名单核对：${membership.checked_at}。`}>EAEU</a>;
}
