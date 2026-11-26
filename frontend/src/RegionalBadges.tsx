import programs from './regional-programs.json';
import './pics-badge.css';

const byCountry=new Map<string,typeof programs.programs>();
for(const program of programs.programs){for(const iso of program.iso2){byCountry.set(iso,[...(byCountry.get(iso)||[]),program])}}
export default function RegionalBadges({iso2}:{iso2?:string}){
 return <>{(byCountry.get(iso2?.toUpperCase()||'')||[]).map(program=><a key={program.id} className="pics-badge regional-badge" href={program.source_url} target="_blank" rel="noreferrer" aria-label={`${program.label}：${program.name}`} title={`${program.name}。${program.note} 核对：${programs.checked_at}。`}>{program.label}{program.kind==='joint'&&<small>联审</small>}</a>)}</>;
}
