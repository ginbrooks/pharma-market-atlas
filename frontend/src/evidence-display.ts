import type {ChannelDataset,ChannelResearch,ProfileSection,Source} from './types';

// Source checks describe the available evidence; editorial review is separate.
export function hasReliableSources(ids:string[]|undefined,sources:Source[]):boolean {
 return !!ids?.length&&ids.every(id=>sources.some(s=>s.id===id&&s.check_status==='accessible'));
}
export function supportedText(text:string|undefined):boolean {
 const value=text?.trim();
 if(!value)return false;
 // Keep legal conditions such as “未取得进口许可不得销售”. Only hide research gaps.
 return !/^(?:暂无|尚无|没有可靠|缺乏可靠|待补|待核)/.test(value)
  && !/^(?:(?:本轮|本次)?(?:暂未|尚未|未)(?:找到|查到|取得|获得|核实|确认|整理)).*(?:资料|数据|来源|原文|比例|占比|执行状态|特别例外)/.test(value)
  && !/^(?:尚待核实|尚未确认|未核实|未确认)[。.]?$/.test(value);
}
export function supportedSection(section:ProfileSection|undefined,sources:Source[]):boolean {
 return !!section&&supportedText(section.summary)&&hasReliableSources(section.source_ids,sources);
}
export function supportedChannel(channel:ChannelDataset['channels'][number]):boolean {
 return channel.share!=null&&Number.isFinite(channel.share)||!!channel.display_share&&channel.share_lower_bound!=null&&Number.isFinite(channel.share_lower_bound);
}
export function visibleChannelResearch(research:ChannelResearch,sources:Source[]){
 return {
  datasets:research.datasets.filter(d=>hasReliableSources(d.source_ids,sources)).map(d=>({...d,channels:d.channels.filter(supportedChannel)})).filter(d=>d.channels.length>0),
  procurement:research.procurement.filter(p=>(!p.verification_status||p.verification_status==='supported')&&supportedText(p.summary)&&hasReliableSources(p.source_ids,sources)).sort((a,b)=>(b.checked_at||'').localeCompare(a.checked_at||'')),
 };
}
