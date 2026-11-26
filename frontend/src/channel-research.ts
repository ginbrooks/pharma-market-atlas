export function validateChannelResearch(value:unknown,known:Set<string>,sectionRefs:Set<string>):string[]{
 const errors:string[]=[];
 if(!value||typeof value!=='object'||Array.isArray(value))return ['渠道研究必须为对象'];
 const research=value as Record<string,unknown>;
 for(const group of ['datasets','procurement'] as const){
  const rows=research[group];
  if(!Array.isArray(rows)){errors.push(`${group} 必须为列表`);continue}
  const ids=new Set<string>();
  for(const row of rows){
   if(!row||typeof row!=='object'){errors.push('渠道记录必须为对象');continue}
   if(typeof row.id!=='string'||!row.id||ids.has(row.id))errors.push('渠道记录 ID 必须非空且不重复');ids.add(row.id);
   if(!Array.isArray(row.source_ids)||!row.source_ids.length||row.source_ids.some((id:unknown)=>typeof id!=='string'||!known.has(id)||!sectionRefs.has(id)))errors.push('渠道来源必须存在并纳入章节引用');
   if(group==='datasets'){
    if(!Number.isInteger(row.year)||row.year<1900||row.year>new Date().getFullYear())errors.push('渠道数据必须有有效统计年度');
    if(!['sales_value','sales_volume','pharmaceutical_expenditure'].includes(row.measure))errors.push('渠道统计口径无效');
    for(const key of ['title','denominator','product_scope','geographic_scope'])if(typeof row[key]!=='string'||!row[key].trim())errors.push(`渠道数据缺少 ${key}`);
    if(!Array.isArray(row.channels)||!row.channels.length){errors.push('渠道明细必须为非空列表');continue}
    const channelIds=new Set();let total=0;
    for(const channel of row.channels){
     if(!channel||typeof channel!=='object'){errors.push('渠道明细必须为对象');continue}
     if(typeof channel.id!=='string'||!channel.id||channelIds.has(channel.id))errors.push('渠道明细 ID 必须非空且不重复');channelIds.add(channel.id);
     if(typeof channel.label!=='string'||!channel.label)errors.push('渠道名称不能为空');
     if(channel.share!==null&&(typeof channel.share!=='number'||!Number.isFinite(channel.share)||channel.share<0||channel.share>100))errors.push('占比必须为 0–100 的数值，未知用 null');
     if(typeof channel.share==='number')total+=channel.share;
     if(channel.amount!=null&&(typeof channel.amount!=='number'||!Number.isFinite(channel.amount)||channel.amount<0))errors.push('金额必须为非负有限数值');
    }
    if(total>100.20000001)errors.push('同一分母的占比合计不得超过 100%');
   }else{
    if(typeof row.summary!=='string'||!row.summary.trim()||typeof row.scope!=='string'||!row.scope.trim())errors.push('采购方式必须写明内容和适用范围');
    if(!Array.isArray(row.mechanisms)||row.mechanisms.some((m:unknown)=>typeof m!=='string'))errors.push('采购机制必须为文字列表');
    if(row.shares!==undefined){
     if(!Array.isArray(row.shares)||!row.denominator||!Number.isInteger(row.year)){errors.push('采购占比须附年份和分母');continue}
     if(row.shares.some((s:any)=>!s||typeof s.share!=='number'||!Number.isFinite(s.share)||s.share<0||s.share>100)||row.shares.reduce((n:number,s:any)=>n+(s?.share||0),0)>100.20000001)errors.push('采购占比无效');
    }
   }
  }
 }
 if(!Array.isArray(research.gaps)||research.gaps.some(g=>typeof g!=='string'))errors.push('资料缺口必须为文字列表');
 return errors;
}
