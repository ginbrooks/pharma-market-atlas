import {Plus,Trash2} from 'lucide-react';
import type {ChannelMix,PaymentScenario,ProfileSection} from './types';
import {sourceIds} from './market-access';
import './market-access.css';

export function newPaymentSection():ProfileSection{return {id:'patient_payment',title:'看病买药，谁来付钱',summary:'',status:'pending',as_of:null,source_ids:[],payment_scenarios:[
 {id:'public',setting:'公立医院',payer:'',coverage:'',patient_cost:'',conditions:'',source_ids:[]},
 {id:'private',setting:'私立医院',payer:'',coverage:'',patient_cost:'',conditions:'',source_ids:[]},
 {id:'retail',setting:'院外药店',payer:'',coverage:'',patient_cost:'',conditions:'',source_ids:[]}
]}}
export function newChannelMix():ChannelMix{return {status:'unavailable',year:null,measure:'not_available',scope:'',denominator:'',unit:'%',channels:[
 {id:'public_hospitals',label:'公立医院',share:null,note:'',source_ids:[]},
 {id:'private_hospitals',label:'私立医院',share:null,note:'',source_ids:[]},
 {id:'retail',label:'零售药店',share:null,note:'',source_ids:[]}
],caveat:'',source_ids:[]}}
export function newChannelsSection():ProfileSection{return {id:'sales_channels',title:'药品销售渠道',summary:'',status:'pending',as_of:null,source_ids:[],channel_mix:newChannelMix()}}
export default function BusinessSectionFields({section,onChange}:{section:ProfileSection;onChange:(change:Partial<ProfileSection>)=>void}){
 if(!['patient_payment','sales_channels'].includes(section.id))return null;
 const scenarios=section.payment_scenarios||[];
 const updateScenario=(id:string,change:Partial<PaymentScenario>)=>onChange({payment_scenarios:scenarios.map(s=>s.id===id?{...s,...change}:s)});
 const mix=section.channel_mix;
 const updateMix=(change:Partial<ChannelMix>)=>onChange({channel_mix:{...(mix||newChannelMix()),...change}});
 return <div className="business-editor"><p className="business-editor-note">明细填写的来源 ID 会自动并入本章节引用，仍须对应下方来源表里的真实 ID。</p><label>章节性质<select value={section.kind==='data_gap'?'data_gap':'research'} onChange={e=>onChange({kind:e.target.value,status:'pending'})}><option value="research">事实整理（须复核发布）</option><option value="data_gap">资料缺口（不得包含支付场景或占比数值）</option></select></label><label>资料截至日期<input type="date" value={section.as_of||''} onChange={e=>onChange({as_of:e.target.value||null})}/></label>
  {section.id==='patient_payment'&&<>
   <div className="business-editor-heading"><h4>患者支付场景</h4><button type="button" className="secondary-button small" onClick={()=>onChange({payment_scenarios:[...scenarios,{id:`scenario-${Date.now()}`,setting:'',payer:'',coverage:'',patient_cost:'',conditions:'',source_ids:[]}]})}><Plus size={13}/>新增场景</button></div>
   {!scenarios.length&&<button type="button" className="secondary-button" onClick={()=>onChange({payment_scenarios:newPaymentSection().payment_scenarios})}>建立公立、私立、药店三个空白场景</button>}
   {scenarios.map((s,i)=><details className="business-editor-item" key={s.id} open={i===0}><summary><span>{s.setting||`场景 ${i+1}`}</span><small>{s.id}</small></summary><div><label>就医或购药场景<input value={s.setting} onChange={e=>updateScenario(s.id,{setting:e.target.value})}/></label><label>谁来支付<textarea rows={2} value={s.payer} onChange={e=>updateScenario(s.id,{payer:e.target.value})}/></label><label>覆盖范围<textarea rows={2} value={s.coverage} onChange={e=>updateScenario(s.id,{coverage:e.target.value})}/></label><label>患者个人承担<textarea rows={2} value={s.patient_cost} onChange={e=>updateScenario(s.id,{patient_cost:e.target.value})}/></label><label>适用条件与限制<textarea rows={2} value={s.conditions} onChange={e=>updateScenario(s.id,{conditions:e.target.value})}/></label><label>场景来源 ID（逗号分隔）<input value={(s.source_ids||[]).join(', ')} onChange={e=>updateScenario(s.id,{source_ids:sourceIds(e.target.value)})}/></label><button type="button" className="text-button danger" onClick={()=>{if(window.confirm(`从草稿移除“${s.setting||s.id}”场景？`))onChange({payment_scenarios:scenarios.filter(x=>x.id!==s.id)})}}><Trash2 size={12}/>移除场景</button></div></details>)}
  </>}
  {section.id==='sales_channels'&&(mix?<>
   <h4>渠道份额与统计口径</h4><p className="business-editor-note">未知占比留空，保存为 null。有数值时须填写年份、销售额或销量口径、覆盖范围及分母；标记“已获得比例”需三个同口径份额合计约 100%；系统不会自动补值或归一化。</p>
   <div className="form-grid"><label>数据可得状态<select value={mix.status} onChange={e=>updateMix({status:e.target.value as ChannelMix['status']})}><option value="unavailable">暂无可用比例</option><option value="partial">部分渠道可得</option><option value="available">已获得比例</option></select></label><label>统计年度<input type="number" min="1900" max="2200" step="1" placeholder="未知留空" value={mix.year??''} onChange={e=>updateMix({year:e.target.value===''?null:Number(e.target.value)})}/></label></div>
   <label>度量口径<select value={mix.measure} onChange={e=>updateMix({measure:e.target.value as ChannelMix['measure']})}><option value="not_available">尚未确认</option><option value="sales_value">药品销售额</option><option value="sales_volume">药品销量</option></select></label>
   <label>覆盖范围<textarea rows={2} value={mix.scope} onChange={e=>updateMix({scope:e.target.value})} placeholder="明确包含哪些机构、产品及地域"/></label>
   <label>分母<textarea rows={2} value={mix.denominator} onChange={e=>updateMix({denominator:e.target.value})} placeholder="例如该年度、同一统计范围内的药品销售额；未知留空"/></label>
   {mix.channels.map(c=><div className="business-channel-editor" key={c.id}><div className="form-grid"><label>渠道名称<input value={c.label} onChange={e=>updateMix({channels:mix.channels.map(x=>x.id===c.id?{...x,label:e.target.value}:x)})}/></label><label>占比（%）<input type="number" min="0" max="100" step="any" placeholder="暂无可靠占比" value={c.share??''} onChange={e=>updateMix({channels:mix.channels.map(x=>x.id===c.id?{...x,share:e.target.value===''?null:Number(e.target.value)}:x)})}/></label></div><label>渠道说明<textarea rows={2} value={c.note} onChange={e=>updateMix({channels:mix.channels.map(x=>x.id===c.id?{...x,note:e.target.value}:x)})}/></label><label>渠道来源 ID（逗号分隔）<input value={(c.source_ids||[]).join(', ')} onChange={e=>updateMix({channels:mix.channels.map(x=>x.id===c.id?{...x,source_ids:sourceIds(e.target.value)}:x)})}/></label></div>)}
   <label>口径限制与注意事项<textarea rows={3} value={mix.caveat} onChange={e=>updateMix({caveat:e.target.value})}/></label><label>整组数据来源 ID（逗号分隔）<input value={(mix.source_ids||[]).join(', ')} onChange={e=>updateMix({source_ids:sourceIds(e.target.value)})}/></label>
  </>:<button type="button" className="secondary-button" onClick={()=>updateMix(newChannelMix())}>建立三个空白销售渠道</button>)}
 </div>;
}
