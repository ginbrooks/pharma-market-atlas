import type {ImportData,ImportTrend} from './types';

export function importIntro(data:ImportData){
 const row=data.years.find(y=>y.year===data.latest_year);
 if(!row)return '';
 if(row.amount_kusd===null)return `${row.year}年${row.name}进口制剂金额待更新。`;
 const value=row.amount_kusd>=100000?`${(row.amount_kusd/100000).toFixed(2)}亿美元`:`${(row.amount_kusd/10).toLocaleString('zh-CN',{maximumFractionDigits:1})}万美元`;
 const change=row.common_yoy===null?'':row.common_yoy===0?'，同比持平':`，同比${row.common_yoy>0?'增长':'下降'}${(Math.abs(row.common_yoy)*100).toFixed(1)}%`;
 return `${row.year}年${row.name}进口制剂金额为${value}${change}。`;
}
export function splitImportTrend(trend?:ImportTrend){
 return {featured:trend?.series.filter(s=>s.code==='300490')??[],others:trend?.series.filter(s=>s.code!=='300490').slice(0,6)??[]};
}
