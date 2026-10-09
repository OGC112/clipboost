import crypto from 'crypto';

function clampScore(value, fallback=50) {
  const n=Number(value);
  return Math.max(0,Math.min(100,Math.round(Number.isFinite(n)?n:fallback)));
}

export function platformProfileKey(provider='') { return String(provider||'').trim().toLowerCase().replace(/^www\./,'').slice(0,120); }
export function campaignArray(value) {
  if (Array.isArray(value)) return value.map(x=>String(x||'').trim()).filter(Boolean);
  return String(value||'').split(/[\n,]/).map(x=>x.trim()).filter(Boolean);
}
export function campaignPaymentModel(campaign={}) {
  const explicit=String(campaign.paymentModel||'').trim();
  if(['per-views','bounty-pool','fixed-reward','custom'].includes(explicit))return explicit;
  const legacy=String(campaign.payoutMode||'');
  if(legacy==='per-1000-views')return 'per-views';
  if(legacy==='threshold')return 'fixed-reward';
  return 'custom';
}
export function campaignPlatformKey(value='') {
  const x=String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  if(x.includes('tiktok'))return 'tiktok';
  if(x.includes('instagram')||x.includes('reel'))return 'instagram';
  if(x.includes('youtube')||x.includes('short'))return 'youtube';
  if(x==='x'||x.includes('twitter'))return 'x';
  return x||'default';
}
export function normalizePlatformPayouts(value={}) {
  let source=value;
  if(typeof source==='string'){try{source=JSON.parse(source)}catch{source={}}}
  if(!source||typeof source!=='object'||Array.isArray(source))return {};
  const out={};
  for(const [key,val] of Object.entries(source)){
    const n=Math.max(0,Number(val||0)||0);const k=campaignPlatformKey(key);if(k&&n>0)out[k]=n;
  }
  return out;
}
export function campaignPlatformRate(campaign={}, platform='') {
  const rates=normalizePlatformPayouts(campaign.platformPayouts||{});const key=campaignPlatformKey(platform);
  if(Number(rates[key]||0)>0)return Number(rates[key]);
  if(Number(rates.default||0)>0)return Number(rates.default);
  return Math.max(0,Number(campaign.payout||campaign.fixedReward||0)||0);
}
export function normalizeCampaign(input={}, existing={}) {
  const now = new Date().toISOString();
  const minDuration = Math.max(0, Number(input.minDuration ?? existing.minDuration ?? 0) || 0);
  const maxDurationRaw = Number(input.maxDuration ?? existing.maxDuration ?? 60) || 60;
  const maxDuration = Math.max(minDuration || 1, maxDurationRaw);
  const sourceUrlsRaw = input.sourceUrls ?? existing.sourceUrls ?? [];
  const sourceUrls = (Array.isArray(sourceUrlsRaw) ? sourceUrlsRaw : campaignArray(sourceUrlsRaw)).map((item, index) => {
    if (typeof item === 'string') return { id: crypto.createHash('sha1').update(item).digest('hex').slice(0,12), url:item.trim(), label:`Source ${index+1}`, addedAt:now };
    const url=String(item?.url||'').trim();
    return { id:String(item?.id||crypto.createHash('sha1').update(url||String(index)).digest('hex').slice(0,12)), url, label:String(item?.label||`Source ${index+1}`), addedAt:item?.addedAt||now };
  }).filter(x=>/^https?:\/\//i.test(x.url));
  const legacyMode=String(input.payoutMode ?? existing.payoutMode ?? '');
  const paymentModelRaw=String(input.paymentModel ?? existing.paymentModel ?? (legacyMode==='per-1000-views'?'per-views':legacyMode==='threshold'?'fixed-reward':'custom'));
  const paymentModel=['per-views','bounty-pool','fixed-reward','custom'].includes(paymentModelRaw)?paymentModelRaw:'custom';
  const qualificationViews=Math.max(0,Number(input.qualificationViews ?? input.viewThreshold ?? existing.qualificationViews ?? existing.viewThreshold ?? 0)||0);
  const scopeRaw=String(input.qualificationScope ?? existing.qualificationScope ?? (paymentModel==='per-views'?'per-post':'campaign-total'));
  const qualificationScope=['per-post','campaign-total'].includes(scopeRaw)?scopeRaw:(paymentModel==='per-views'?'per-post':'campaign-total');
  const legacyBasis=legacyMode==='per-1000-views'?1000:100000;
  const rateBasisViews=Math.max(1,Number(input.rateBasisViews ?? existing.rateBasisViews ?? legacyBasis)||legacyBasis);
  const fixedReward=Math.max(0,Number(input.fixedReward ?? input.payout ?? existing.fixedReward ?? existing.payout ?? 0)||0);
  const platformPayouts=normalizePlatformPayouts(input.platformPayouts ?? existing.platformPayouts ?? {});
  const accessRaw=String(input.accessMode ?? existing.accessMode ?? 'open');
  const accessMode=['open','private','application'].includes(accessRaw)?accessRaw:'open';
  const statusRaw=String(input.status ?? existing.status ?? 'active');
  const status=['active','paused','completed','closed'].includes(statusRaw)?statusRaw:'active';
  return {
    id: String(existing.id || input.id || crypto.randomUUID()),
    name: String(input.name ?? existing.name ?? 'Untitled campaign').trim().slice(0,160) || 'Untitled campaign',
    provider: String(input.provider ?? existing.provider ?? '').trim().slice(0,120),
    campaignUrl: String(input.campaignUrl ?? existing.campaignUrl ?? '').trim().slice(0,2000),
    brief: String(input.brief ?? existing.brief ?? '').trim().slice(0,30000),
    audience: String(input.audience ?? existing.audience ?? '').trim().slice(0,500),
    startDate: String(input.startDate ?? existing.startDate ?? '').trim().slice(0,80),
    paymentMethod: String(input.paymentMethod ?? existing.paymentMethod ?? '').trim().slice(0,120),
    accountLimit: String(input.accountLimit ?? existing.accountLimit ?? '').trim().slice(0,120),
    requirementsUrl: String(input.requirementsUrl ?? existing.requirementsUrl ?? '').trim().slice(0,2000),
    requirementsTitle: String(input.requirementsTitle ?? existing.requirementsTitle ?? '').trim().slice(0,300),
    requirements: campaignArray(input.requirements ?? existing.requirements ?? []).slice(0,120),
    violations: campaignArray(input.violations ?? existing.violations ?? []).slice(0,120),
    resourceUrls: (Array.isArray(input.resourceUrls ?? existing.resourceUrls) ? (input.resourceUrls ?? existing.resourceUrls) : []).map((item,index)=>({
      url:String(item?.url||item||'').trim().slice(0,2000),label:String(item?.label||`Resource ${index+1}`).trim().slice(0,160),
      kind:String(item?.kind||'external').trim().slice(0,40),videoCount:Math.max(0,Number(item?.videoCount||0)||0),imageCount:Math.max(0,Number(item?.imageCount||0)||0),mediaCount:Math.max(0,Number(item?.mediaCount||0)||0),inspectStatus:String(item?.inspectStatus||'').trim().slice(0,40),
      items:(Array.isArray(item?.items)?item.items:[]).map((child,childIndex)=>({url:String(child?.url||'').trim().slice(0,2000),label:String(child?.label||`Asset ${childIndex+1}`).trim().slice(0,160),kind:String(child?.kind||'media').trim().slice(0,30),videoCount:Math.max(0,Number(child?.videoCount||0)||0),imageCount:Math.max(0,Number(child?.imageCount||0)||0)})).filter(child=>/^https?:\/\//i.test(child.url)).slice(0,24)
    })).filter(x=>/^https?:\/\//i.test(x.url)).slice(0,80),
    referenceAssets: (Array.isArray(input.referenceAssets ?? existing.referenceAssets) ? (input.referenceAssets ?? existing.referenceAssets) : []).map((item,index)=>({
      url:String(item?.url||item||'').trim().slice(0,2000),label:String(item?.label||`Reference ${index+1}`).trim().slice(0,160),kind:String(item?.kind||'reference-image').trim().slice(0,40),required:Boolean(item?.required)
    })).filter(x=>/^https?:\/\//i.test(x.url)).slice(0,40),
    platformProfileKey: String(input.platformProfileKey ?? existing.platformProfileKey ?? '').trim().toLowerCase().slice(0,120),
    campaignStats: (input.campaignStats && typeof input.campaignStats==='object' ? input.campaignStats : existing.campaignStats && typeof existing.campaignStats==='object' ? existing.campaignStats : {}),
    importSource: String(input.importSource ?? existing.importSource ?? '').trim().slice(0,80),
    importedAt: String(input.importedAt ?? existing.importedAt ?? '').trim().slice(0,80),
    status,
    accessMode,
    platforms: campaignArray(input.platforms ?? existing.platforms ?? ['tiktok','instagram','youtube-shorts']).slice(0,10),
    minDuration,
    maxDuration,
    requiredHashtags: campaignArray(input.requiredHashtags ?? existing.requiredHashtags ?? []).slice(0,40),
    requiredMentions: campaignArray(input.requiredMentions ?? existing.requiredMentions ?? []).slice(0,40),
    requiredCTA: String(input.requiredCTA ?? existing.requiredCTA ?? '').trim().slice(0,1000),
    forbiddenTerms: campaignArray(input.forbiddenTerms ?? existing.forbiddenTerms ?? []).slice(0,80),
    deadline: String(input.deadline ?? existing.deadline ?? '').trim().slice(0,80),
    paymentModel,
    qualificationViews,
    qualificationScope,
    viewThreshold: qualificationViews,
    rateBasisViews,
    platformPayouts,
    fixedReward,
    payout: fixedReward,
    bountyPool: Math.max(0,Number(input.bountyPool ?? existing.bountyPool ?? 0)||0),
    maxPayout: Math.max(0,Number(input.maxPayout ?? existing.maxPayout ?? 0)||0),
    confirmedPayout: Math.max(0,Number(input.confirmedPayout ?? existing.confirmedPayout ?? 0)||0),
    currency: String(input.currency ?? existing.currency ?? 'USD').trim().toUpperCase().slice(0,8) || 'USD',
    payoutMode: paymentModel==='per-views'?'per-1000-views':paymentModel==='fixed-reward'?'threshold':'manual',
    sourceUrls,
    posts: Array.isArray(input.posts ?? existing.posts) ? (input.posts ?? existing.posts).slice(0,500) : [],
    usedMoments: Array.isArray(input.usedMoments ?? existing.usedMoments) ? (input.usedMoments ?? existing.usedMoments).slice(-1000) : [],
    createdAt: existing.createdAt || input.createdAt || now,
    updatedAt: now
  };
}
export function campaignTotals(campaign={}) {
  const posts = Array.isArray(campaign.posts) ? campaign.posts : [];
  const totalViews = posts.reduce((sum,p)=>sum+Math.max(0,Number(p?.views||0)),0);
  const qualificationViews=Math.max(0,Number(campaign.qualificationViews ?? campaign.viewThreshold ?? 0)||0);
  const paymentModel=campaignPaymentModel(campaign);
  const rateBasisViews=Math.max(1,Number(campaign.rateBasisViews||100000)||100000);
  const confirmedPostPayout=posts.reduce((sum,p)=>sum+Math.max(0,Number(p?.payoutConfirmed||0)),0);
  const confirmedRevenue=Math.max(Math.max(0,Number(campaign.confirmedPayout||0)),confirmedPostPayout);
  const qualificationScope=String(campaign.qualificationScope|| (paymentModel==='per-views'?'per-post':'campaign-total'));
  const campaignQualified=qualificationViews<=0||totalViews>=qualificationViews;
  const eligiblePosts=qualificationScope==='campaign-total'?(campaignQualified?posts:[]):posts.filter(p=>qualificationViews<=0||Number(p?.views||0)>=qualificationViews);
  let estimatedRevenue=0;
  if(paymentModel==='per-views'){
    estimatedRevenue=eligiblePosts.reduce((sum,p)=>sum+(Math.max(0,Number(p?.views||0))/rateBasisViews)*campaignPlatformRate(campaign,p?.platform),0);
    const cap=Math.max(0,Number(campaign.maxPayout||0));if(cap>0)estimatedRevenue=Math.min(estimatedRevenue,cap);
  }else if(paymentModel==='fixed-reward'){
    const reward=Math.max(0,Number(campaign.fixedReward ?? campaign.payout ?? 0)||0);
    estimatedRevenue=qualificationViews>0&&totalViews>=qualificationViews?reward:0;
  }else{
    estimatedRevenue=confirmedRevenue;
  }
  const qualificationProgressViews=qualificationScope==='per-post'?posts.reduce((best,p)=>Math.max(best,Math.max(0,Number(p?.views||0))),0):totalViews;
  const remainingViews = qualificationViews>0 ? Math.max(0,qualificationViews-qualificationProgressViews) : 0;
  const progress = qualificationViews>0 ? Math.min(100,Math.round(qualificationProgressViews/qualificationViews*100)) : 0;
  const editingMinutes=posts.reduce((sum,p)=>sum+Math.max(0,Number(p?.editingMinutes||0)),0);
  const bestViews=posts.reduce((best,p)=>Math.max(best,Math.max(0,Number(p?.views||0))),0);
  const avgViews=posts.length?Math.round(totalViews/posts.length):0;
  const bestPost=posts.filter(p=>Number(p?.clipDuration||0)>0).sort((a,b)=>Number(b?.views||0)-Number(a?.views||0))[0]||null;
  const bestDuration=bestPost?Math.round(Number(bestPost.clipDuration||0)):0;
  const revenueForEfficiency=Math.max(estimatedRevenue,confirmedRevenue);
  const revenuePerHour=editingMinutes>0?(revenueForEfficiency/(editingMinutes/60)):0;
  const payoutPotential=paymentModel==='bounty-pool'?Math.max(0,Number(campaign.bountyPool||0)):paymentModel==='fixed-reward'?Math.max(0,Number(campaign.fixedReward??campaign.payout??0)):Math.max(0,Number(campaign.maxPayout||0));
  return { totalViews, estimatedRevenue:Number(estimatedRevenue.toFixed(2)), confirmedRevenue:Number(confirmedRevenue.toFixed(2)), remainingViews, progress, postCount:posts.length, usedMomentCount:(campaign.usedMoments||[]).length, editingMinutes, bestViews, avgViews, bestDuration, revenuePerHour:Number(revenuePerHour.toFixed(2)), qualificationViews, qualificationScope, qualificationProgressViews, paymentModel, rateBasisViews, payoutPotential, qualifiedPostCount:eligiblePosts.length, pendingPostCount:posts.filter(p=>String(p?.submissionStatus||'pending')==='pending').length, acceptedPostCount:posts.filter(p=>String(p?.submissionStatus||'')==='accepted').length };
}
export function campaignSearchTerms(campaign={}) {
  const text=[campaign.name,campaign.brief,campaign.audience,campaign.requiredCTA,...(campaign.requiredHashtags||[]),...(campaign.requiredMentions||[]),...(campaign.requirements||[])].join(' ').toLowerCase();
  const stop=new Set(['this','that','with','from','your','have','will','pour','avec','dans','vous','nous','une','des','les','the','and','for','are','est','sur','mais','plus','moins','campagne','campaign']);
  return [...new Set((text.match(/[a-zà-ÿ0-9#@_-]{4,}/gi)||[]).map(x=>x.toLowerCase()).filter(x=>!stop.has(x)))].slice(0,32);
}
export function campaignFitForCandidate(meta, candidate, quality={}) {
  const campaign = meta?.campaign;
  if (!campaign?.id) return null;
  const text=String(candidate?.selectionText||candidate?.hook||candidate?.reason||'').toLowerCase();
  const terms=campaignSearchTerms(campaign);
  const hits=terms.filter(t=>text.includes(t.replace(/^[@#]/,''))||text.includes(t)).length;
  const relevance=terms.length ? Math.min(100,Math.round(48+(hits/Math.min(10,terms.length))*52)) : 70;
  const duration=Math.max(0,Number(candidate?.end||0)-Number(candidate?.start||0));
  const minD=Math.max(0,Number(campaign.minDuration||0));
  const maxD=Math.max(minD||1,Number(campaign.maxDuration||60));
  const durationFit=duration>=minD&&duration<=maxD ? 100 : Math.max(20,100-Math.round(Math.min(Math.abs(duration-minD),Math.abs(duration-maxD))*6));
  const forbidden=(campaign.forbiddenTerms||[]).filter(x=>x&&text.includes(String(x).toLowerCase()));
  const used=(campaign.usedMoments||[]).some(m=>m.projectId===meta.id && Math.max(Number(m.start||0),Number(candidate.start||0)) < Math.min(Number(m.end||0),Number(candidate.end||0)));
  const history=campaignTotals(campaign);
  const historyDuration=history.bestDuration?Math.max(35,100-Math.round(Math.abs(duration-history.bestDuration)*5)):70;
  let fit=Math.round(relevance*.40+durationFit*.20+Number(quality?.retention||70)*.18+Number(quality?.completeness||70)*.14+historyDuration*.08);
  if(forbidden.length)fit=Math.min(fit,45);
  if(used)fit=Math.min(fit,55);
  return { score:clampScore(fit), relevance, durationFit, historyDuration, learnedBestDuration:history.bestDuration||0, forbidden, used, termsMatched:hits, termsTotal:terms.length };
}
export function campaignCompliance(meta, candidate, options={}) {
  const campaign=meta?.campaign;
  if(!campaign?.id)return { enabled:false, passed:true, checks:[] };
  const duration=Math.max(0,Number(candidate?.end||0)-Number(candidate?.start||0));
  const text=String(candidate?.selectionText||candidate?.hook||'').toLowerCase();
  const checks=[];
  const add=(label,ok,detail)=>checks.push({label,ok:Boolean(ok),detail});
  add('Duration', duration>=Number(campaign.minDuration||0)&&duration<=Number(campaign.maxDuration||60), `${Math.round(duration)}s · required ${Number(campaign.minDuration||0)}–${Number(campaign.maxDuration||60)}s`);
  const forbidden=(campaign.forbiddenTerms||[]).filter(x=>text.includes(String(x).toLowerCase()));
  add('Forbidden terms', forbidden.length===0, forbidden.length?`Found: ${forbidden.join(', ')}`:'No blocked terms detected');
  add('Campaign brief relevance', Number(candidate?.campaignFit?.relevance||0)>=55, `${Math.round(candidate?.campaignFit?.relevance||0)} relevance score`);
  add('Vertical export', true, '1080×1920 final render');
  add('Captions', options?.captions!==false, options?.captions===false?'Captions disabled':'Captions enabled');
  if((campaign.requiredHashtags||[]).length)add('Required hashtags', true, `${campaign.requiredHashtags.join(' ')} saved for publishing`);
  if(campaign.requiredCTA)add('CTA', true, 'CTA saved in campaign publishing checklist');
  return { enabled:true, passed:checks.every(x=>x.ok), checks };
}
export function parseCampaignSourceUrl(raw='') {
  const url=String(raw||'').trim();
  if(!/^https?:\/\//i.test(url))return null;
  try{
    const u=new URL(url); const host=u.hostname.replace(/^www\./,'').toLowerCase();
    if(host==='drive.google.com' && /^\/drive\/folders\/[^/]+/.test(u.pathname)){
      const folderId=u.pathname.split('/').filter(Boolean)[2];
      return {platform:'google-drive',mediaType:'folder',id:folderId,url};
    }
    if(host==='docs.google.com' && /^\/document\/d\/[^/]+/.test(u.pathname)){
      return {platform:'google-docs',mediaType:'document',id:u.pathname.split('/').filter(Boolean)[2],url};
    }
    if(host==='youtu.be')return {platform:'youtube',mediaType:'video',id:u.pathname.split('/').filter(Boolean)[0]||url,url};
    if(host.endsWith('youtube.com'))return {platform:'youtube',mediaType:'video',id:u.searchParams.get('v')||u.pathname.split('/').filter(Boolean).pop()||url,url};
    if(host==='clips.twitch.tv')return {platform:'twitch',mediaType:'clip',id:u.pathname.split('/').filter(Boolean)[0]||url,url};
    if(host.endsWith('twitch.tv')){
      const parts=u.pathname.split('/').filter(Boolean); const vi=parts.indexOf('videos');
      if(vi>=0&&parts[vi+1])return {platform:'twitch',mediaType:'vod',id:parts[vi+1],url};
      return {platform:'twitch',mediaType:'vod',id:parts.pop()||url,url};
    }
    return {platform:'external',mediaType:'video',id:crypto.createHash('sha1').update(url).digest('hex').slice(0,16),url};
  }catch{return null}
}
