import type {Country,Profile} from './types';
import {hasReliableSources,supportedText,supportedSection,visibleChannelResearch} from './evidence-display.ts';
import {localProtectionRules} from './policy-display.ts';
import {backgroundSections} from './market-access.ts';
import {visibleApiImports} from './api-import-model.ts';
import {originPartnerName,originPartnerNames,rankedOriginPartners,visibleImportOrigins} from './import-origins-model.ts';
import {visibleReligion} from './religion-display.ts';
import {visibleLocalCulture,visibleReligionLife,readableNoteSource} from './local-culture.ts';
import {visibleMedicineSites} from './medicine-sites.ts';
import {visibleGmp,visibleMarketContext} from './gmp-access.ts';

export function profileParts(profile:Profile|null){
 const sections=profile?.sections||[],sources=(profile?.sources||[]).filter(readableNoteSource);
 const background=profile?backgroundSections(profile).filter(s=>s.id!=='disease'&&supportedSection(s,sources)):[];
 const brief=sections.find(s=>s.id==='drug_payment'),legacy=sections.find(s=>s.id==='patient_payment');
 const hasPayment=brief?supportedSection(brief,sources):(legacy?.payment_scenarios||[]).some(s=>hasReliableSources(s.source_ids?.length?s.source_ids:legacy?.source_ids,sources)&&[s.payer,s.patient_cost,s.coverage].some(supportedText));
 const research=sections.find(s=>s.id==='sales_channels_v2')?.channel_research,channelSection=sections.find(s=>s.id==='sales_channels'),mix=channelSection?.channel_mix;
 const channelData=research?visibleChannelResearch(research,sources):null;
 const channels=channelData?channelData.datasets.length>0||channelData.procurement.length>0:!!mix&&mix.measure!=='not_available'&&supportedText(mix.denominator)&&mix.channels.some(c=>c.share!=null&&hasReliableSources(c.source_ids?.length?c.source_ids:mix.source_ids?.length?mix.source_ids:channelSection?.source_ids,sources));
 const imports=sections.find(s=>s.id==='trade_imports');
 const hasImports=(!!imports&&hasReliableSources(imports.source_ids,sources)&&!!imports.import_data?.years.some(row=>row.amount_kusd!=null))||!!visibleApiImports(profile)||!!visibleImportOrigins(profile);
 const gmp=!!visibleGmp(profile),additionalProcurement=!!visibleGmp(profile,'procurement');
 const access=localProtectionRules(profile).length>0;
 const disease=(profile?.disease_links||[]).filter(l=>sources.some(s=>s.url===l.url));
 const religion=!!visibleReligion(profile)||visibleReligionLife(profile).items.length>0||visibleLocalCulture(profile).items.length>0,medicineSites=visibleMedicineSites(profile).length>0;
 return {sources,background,hasPayment,channels,payment:hasPayment||channels||additionalProcurement||background.length>0,hasImports,access,gmp,disease,religion,medicineSites,marketContext:visibleMarketContext(profile).length>0,reference:medicineSites||disease.length>0||sources.length>0};
}

export function importSnapshot(profile:Profile|null,countries:Pick<Country,'iso3'|'name'>[]){
 const view=visibleImportOrigins(profile);if(!view)return null;
 const names=originPartnerNames(countries),top=rankedOriginPartners(view.data).slice(0,3);
 return {year:view.data.year,total:view.data.total_usd,sourceUrl:view.data.source_url,
  china:view.data.groups.find(g=>g.id==='china')!.share_pct,india:view.data.groups.find(g=>g.id==='india')!.share_pct,
  topShare:top.reduce((sum,p)=>sum+p.amount_usd,0)/view.data.total_usd*100,topNames:top.map(p=>originPartnerName(p,names)),topCount:top.length};
}
