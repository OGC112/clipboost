import { platformProfileKey } from './core.js';

function htmlEntityDecode(text='') {
  return String(text).replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');
}
export function detectCampaignAccessWall(html='', url='') {
  const raw=String(html||'');
  const title=htmlEntityDecode((raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||'').replace(/\s+/g,' ').trim();
  const text=htmlEntityDecode(raw.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()).slice(0,50000);
  const loginSignals=[/\bsign in\b/i,/\blog in\b/i,/continue with (?:google|discord|apple|facebook)/i,/welcome back/i,/sign in to your .*account/i,/forgot (?:your )?password/i];
  const botSignals=[/verify (?:that )?you are human/i,/checking your browser/i,/just a moment/i,/captcha/i,/access denied/i,/unusual traffic/i,/confirm you(?:'re| are) not a bot/i,/cf-chl-/i];
  const hasPassword=/<input[^>]+type=["']password["']/i.test(raw);
  const loginHits=loginSignals.filter(re=>re.test(`${title} ${text}`)).length;
  const botHit=botSignals.some(re=>re.test(`${raw.slice(0,150000)} ${text}`));
  const titleLooksAuth=/^(?:sign in|log in|login|welcome back)(?:\s*[|—-].*)?$/i.test(title);
  const campaignEvidence=/(?:campaign|bounty|payout|views? to qualify|clip(?:ping)? brief|required hashtags?)/i.test(text);
  if(botHit)return {blocked:true,reason:'verification'};
  if((hasPassword&&loginHits>=1)||(titleLooksAuth&&loginHits>=1)||(loginHits>=3&&!campaignEvidence))return {blocked:true,reason:'login'};
  return {blocked:false,reason:''};
}
export function extractCampaignPage(html='', url='') {
  const getMeta=(key)=>{
    const esc=key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const re1=new RegExp(`<meta[^>]+(?:property|name)=["']${esc}["'][^>]+content=["']([^"']+)["']`,'i');
    const re2=new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${esc}["']`,'i');
    return htmlEntityDecode((html.match(re1)||html.match(re2)||[])[1]||'').trim();
  };
  const title=getMeta('og:title')||htmlEntityDecode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||'').replace(/\s+/g,' ').trim();
  const description=getMeta('og:description')||getMeta('description');
  const cleaned=htmlEntityDecode(html.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim());
  const sourceMatches=[...String(html).matchAll(/https?:\\?\/\\?\/(?:www\.)?(?:youtube\.com\/watch\?v=[A-Za-z0-9_-]+|youtu\.be\/[A-Za-z0-9_-]+|twitch\.tv\/videos\/[0-9]+|clips\.twitch\.tv\/[A-Za-z0-9_-]+)/gi)].map(m=>m[0].replace(/\\\//g,'/'));
  const sourceUrls=[...new Set(sourceMatches)].slice(0,30);
  const lower=cleaned.toLowerCase();
  const platforms=[];if(/\btiktok\b/i.test(cleaned))platforms.push('tiktok');if(/\binstagram\b|\breels?\b/i.test(cleaned))platforms.push('instagram');if(/\byoutube\b|\bshorts?\b/i.test(cleaned))platforms.push('youtube-shorts');if(/\btwitter\b|(?:^|\s)x(?:\s|$)/i.test(cleaned))platforms.push('x');
  const compactNumber=(raw='')=>{const m=String(raw).trim().match(/([0-9]+(?:[.,][0-9]+)?)\s*([kKmM])?/);if(!m)return 0;let n=Number(m[1].replace(',','.'))||0;if(String(m[2]||'').toLowerCase()==='k')n*=1000;if(String(m[2]||'').toLowerCase()==='m')n*=1000000;return Math.round(n)};
  const minViewsMatch=cleaned.match(/(?:min(?:imum)?|at least|qualif(?:y|ication)[^0-9]{0,20})([0-9]+(?:[.,][0-9]+)?\s*[kKmM]?)[^a-z]{0,8}(?:views?)/i)||cleaned.match(/([0-9]+(?:[.,][0-9]+)?\s*[kKmM]?)\s+views?\s+to\s+qualify/i);
  const qualificationViews=minViewsMatch?compactNumber(minViewsMatch[1]):0;
  const bountyMatch=cleaned.match(/(?:bounty\s*(?:pot|pool)?)[^$€£0-9]{0,20}([$€£])?\s*([0-9]+(?:[.,][0-9]+)?\s*[kKmM]?)/i);
  const perMatch=cleaned.match(/([$€£])?\s*([0-9]+(?:[.,][0-9]+)?)\s*(?:per|\/)[^0-9]{0,12}([0-9]+(?:[.,][0-9]+)?\s*[kKmM]?)\s*(?:views?)?/i);
  const symbol=(bountyMatch?.[1]||perMatch?.[1]||'');const currency=symbol==='€'?'EUR':symbol==='£'?'GBP':'USD';
  const accessMode=/apply\s+for\s+access|application\s+required/i.test(cleaned)?'application':/\bprivate\b/i.test(cleaned)?'private':'open';
  const draft={ name:title||'Imported campaign', provider:(()=>{try{return new URL(url).hostname.replace(/^www\./,'')}catch{return ''}})(), campaignUrl:url, brief:[description,cleaned.slice(0,10000)].filter(Boolean).join('\n\n').slice(0,12000), sourceUrls, accessMode };
  if(platforms.length)draft.platforms=platforms;
  if(qualificationViews)draft.qualificationViews=qualificationViews;
  if(bountyMatch){draft.paymentModel='bounty-pool';draft.bountyPool=compactNumber(bountyMatch[2]);draft.currency=currency}
  else if(perMatch){draft.paymentModel='per-views';draft.fixedReward=Math.max(0,Number(perMatch[2].replace(',','.'))||0);draft.payout=draft.fixedReward;draft.rateBasisViews=compactNumber(perMatch[3])||100000;draft.currency=currency}
  return draft;
}

function snapshotTextLines(snapshot={}) {
  return String(snapshot?.text || '').split(/\r?\n/).map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean).slice(0,12000);
}
function snapshotCompactNumber(raw='') {
  const m=String(raw||'').replace(/,/g,'').match(/([0-9]+(?:\.[0-9]+)?)\s*([kKmM])?/);
  if(!m)return 0;
  let n=Number(m[1])||0;const suffix=String(m[2]||'').toLowerCase();
  if(suffix==='k')n*=1000;else if(suffix==='m')n*=1000000;
  return Math.round(n);
}
function snapshotMoney(raw='') {
  const m=String(raw||'').match(/([$€£])\s*([0-9]+(?:[.,][0-9]+)?)/);
  if(!m)return null;
  return { symbol:m[1], amount:Math.max(0,Number(m[2].replace(',','.'))||0), currency:m[1]==='€'?'EUR':m[1]==='£'?'GBP':'USD' };
}
function snapshotLastLineAfter(lines=[], matcher) {
  let idx=-1;
  for(let i=0;i<lines.length;i++)if(matcher.test(lines[i]))idx=i;
  if(idx<0)return '';
  for(let i=idx+1;i<Math.min(lines.length,idx+6);i++){
    const value=String(lines[i]||'').trim();
    if(value&&!/^(audience|content|clip requirements|violations|campaign info|campaign details|program structure|bounties)$/i.test(value))return value;
  }
  return '';
}
function snapshotSection(lines=[], startMatcher, endMatcher) {
  let start=-1;
  for(let i=0;i<lines.length;i++)if(startMatcher.test(lines[i]))start=i;
  if(start<0)return [];
  let end=lines.length;
  for(let i=start+1;i<lines.length;i++){if(endMatcher.test(lines[i])){end=i;break}}
  return lines.slice(start+1,end).map(x=>String(x||'').trim()).filter(Boolean);
}
function snapshotCleanRuleLines(values=[]) {
  const skip=/^(contents|audience|content|clip requirements|violations|product|blog|contact|dashboard|sign out|clipper terms and conditions)$/i;
  const noise=/^(banned on all campaigns|anything below gets your clip disqualified|the full rules every campaign runs under)$/i;
  return [...new Set(values.map(x=>String(x||'').replace(/^[-•·]\s*/,'').trim()).filter(x=>x&&x.length<=1200&&!skip.test(x)&&!noise.test(x)&&!/^https?:\/\//i.test(x)))].slice(0,120);
}
function snapshotCampaignListingBlock(snapshot={},campaignName='') {
  const name=String(campaignName||snapshot?.focusName||'').trim().toLowerCase();
  const blocks=Array.isArray(snapshot?.blocks)?snapshot.blocks:[];
  const candidates=blocks.filter(x=>!name||String(x).toLowerCase().includes(name)).sort((a,b)=>String(a).length-String(b).length);
  return String(candidates.find(x=>/views?\s+to\s+qualify|up\s+to\s+per|bounty\s+pot|platforms?/i.test(String(x)))||candidates[0]||'');
}
export function extractPlatformTermsProfile(snapshot={},provider='') {
  const key=platformProfileKey(provider);if(!key||!snapshot||!String(snapshot.text||'').trim())return null;
  const grouped=new Map();for(const item of (Array.isArray(snapshot.listItems)?snapshot.listItems:[])){
    const title=String(item?.section||'General').trim().slice(0,160)||'General', text=String(item?.text||'').replace(/^[-•·]\s*/,'').trim().slice(0,1200);if(!text)continue;
    if(!grouped.has(title))grouped.set(title,[]);const arr=grouped.get(title);if(!arr.includes(text)&&arr.length<40)arr.push(text);
  }
  const sections=[...grouped.entries()].filter(([,items])=>items.length).slice(0,30).map(([title,items])=>({title,items}));
  const text=String(snapshot.text||'');
  const postMin=text.match(/each post must reach at least\s+([0-9][0-9,._]*\s*[kKmM]?)\s+views?/i);
  const typical=text.match(/campaign minimum\s*\(typically\s+([0-9][0-9,._]*\s*[kKmM]?)\s+views?/i);
  const interval=text.match(/currently every\s+([0-9]+)\s+hours?/i);
  return {key,provider:key,sourceUrl:String(snapshot.url||'').slice(0,2000),updatedAt:new Date().toISOString(),sections,postMinimumViews:postMin?snapshotCompactNumber(postMin[1]):0,typicalCampaignMinimumViews:typical?snapshotCompactNumber(typical[1]):0,trackingIntervalHours:interval?Number(interval[1])||0:0,payoutCycleBased:/all payments are cycle-based/i.test(text)};
}
export function extractAuthenticatedCampaignSnapshots(campaignSnapshot={}, requirementsSnapshot={}, requestedUrl='', listingSnapshot={}, resourceInspections=[]) {
  const campaignLines=snapshotTextLines(campaignSnapshot), reqLines=snapshotTextLines(requirementsSnapshot||{});
  const campaignText=campaignLines.join(' '), reqText=reqLines.join(' '), combined=`${campaignText} ${reqText}`;
  const headings=Array.isArray(campaignSnapshot?.headings)?campaignSnapshot.headings:[];
  const reqHeadings=Array.isArray(requirementsSnapshot?.headings)?requirementsSnapshot.headings:[];
  const generic=/^(campaigns?|dashboard|campaign info|campaign details|program structure|bounties|payouts?|your clips)$/i;
  const name=(headings.find(h=>h.level==='h1'&&h.text&&!generic.test(h.text))?.text || headings.find(h=>h.text&&!generic.test(h.text))?.text || '').trim().slice(0,160);
  const requirementsTitle=(reqHeadings.find(h=>h.level==='h1'&&h.text&&!generic.test(h.text))?.text || '').trim().slice(0,300);
  let provider='';try{provider=new URL(requestedUrl||campaignSnapshot?.url||'').hostname.replace(/^www\./,'')}catch{}
  const snapshotUrl=String(campaignSnapshot?.url||'').trim(),requested=String(requestedUrl||'').trim();
  const isListing=url=>{try{return /^\/dashboard\/campaigns\/?$/i.test(new URL(url).pathname)}catch{return false}};
  const canonicalCampaignUrl=(snapshotUrl&&!isListing(snapshotUrl)?snapshotUrl:requested)||snapshotUrl;
  const draft={
    name:name||requirementsTitle.split(/\s+[–—-]\s+/)[0]||'Imported campaign', provider, campaignUrl:String(canonicalCampaignUrl).slice(0,2000),
    brief:'', platforms:[], sourceUrls:[], resourceUrls:[], referenceAssets:[], requirements:[], violations:[], status:/\bactive\b/i.test(campaignText)?'active':'active', accessMode:'open',
    importSource:'authenticated-browser', importedAt:new Date().toISOString(), requirementsTitle
  };
  const listingBlock=snapshotCampaignListingBlock(listingSnapshot,name||requirementsTitle.split(/\s+[–—-]\s+/)[0]);
  const qualificationMatch=listingBlock.match(/\bmin(?:imum)?\s+([0-9]+(?:[.,][0-9]+)?\s*[kKmM]?)\s+views?\s+to\s+qualify/i);
  if(qualificationMatch){draft.qualificationViews=snapshotCompactNumber(qualificationMatch[1]);draft.viewThreshold=draft.qualificationViews;draft.qualificationScope='campaign-total';}
  const daysLeft=listingBlock.match(/\b([0-9]+)\s+days?\s+left\b/i);if(daysLeft&&Number(daysLeft[1])>0){const d=new Date();d.setDate(d.getDate()+Number(daysLeft[1]));draft.deadline=d.toISOString().slice(0,10);}
  const rate1=campaignText.match(/(?:bounty\s+rate|rate)\s+per\s+([0-9]+(?:[.,][0-9]+)?\s*[kKmM]?)\s*([$€£])\s*([0-9]+(?:[.,][0-9]+)?)/i);
  const rate2=campaignText.match(/([$€£])\s*([0-9]+(?:[.,][0-9]+)?)\s*\/\s*([0-9]+(?:[.,][0-9]+)?\s*[kKmM]?)/i);
  if(rate1){draft.paymentModel='per-views';draft.rateBasisViews=snapshotCompactNumber(rate1[1])||100000;draft.fixedReward=Math.max(0,Number(rate1[3].replace(',','.'))||0);draft.payout=draft.fixedReward;draft.currency=rate1[2]==='€'?'EUR':rate1[2]==='£'?'GBP':'USD'}
  else if(rate2){draft.paymentModel='per-views';draft.fixedReward=Math.max(0,Number(rate2[2].replace(',','.'))||0);draft.payout=draft.fixedReward;draft.rateBasisViews=snapshotCompactNumber(rate2[3])||100000;draft.currency=rate2[1]==='€'?'EUR':rate2[1]==='£'?'GBP':'USD'}
  else { const money=snapshotMoney(campaignText); if(money){draft.paymentModel='custom';draft.currency=money.currency} }
  const startDate=snapshotLastLineAfter(campaignLines,/^start date$/i);if(/^\d{1,2}[\/-]\d{1,2}[\/-]\d{4}$/.test(startDate))draft.startDate=startDate;
  const paymentMethod=snapshotLastLineAfter(campaignLines,/^payment method$/i);if(paymentMethod)draft.paymentMethod=paymentMethod.slice(0,120);
  const accountLimit=snapshotLastLineAfter(campaignLines,/^account limit$/i);if(accountLimit)draft.accountLimit=accountLimit.slice(0,120);
  const audience=snapshotLastLineAfter(reqLines,/^audience$/i);if(audience&&!/^(content|clip requirements|violations)$/i.test(audience))draft.audience=audience.slice(0,500);
  const allLinks=[...(Array.isArray(campaignSnapshot?.links)?campaignSnapshot.links:[]),...(Array.isArray(requirementsSnapshot?.links)?requirementsSnapshot.links:[])];
  const reqLink=allLinks.find(x=>/\/campaigns\/doc\//i.test(String(x?.href||'')));if(reqLink)draft.requirementsUrl=String(reqLink.href).slice(0,2000);
  const seenSource=new Set(),seenResource=new Set(),seenReference=new Set();const inspectionByUrl=new Map((Array.isArray(resourceInspections)?resourceInspections:[]).map(x=>[String(x?.url||''),x]));
  for(const item of (Array.isArray(requirementsSnapshot?.links)?requirementsSnapshot.links:[])){
    const href=String(item?.href||'').trim(),label=String(item?.text||'').trim()||'Campaign resource',section=String(item?.section||'').trim();if(!/^https?:\/\//i.test(href))continue;
    let host='';try{host=new URL(href).hostname.replace(/^www\./,'').toLowerCase()}catch{}
    const directSource=/^(trailer|source(?:\s*#?\d+)?)$/i.test(label)||/^(content|sources?)$/i.test(section);
    const assetPack=/^(assets?(?:\s*#?\d+)?|media(?:\s*#?\d+)?)$/i.test(label)||(/^(content|assets?|media)$/i.test(section)&&!/^downloads?$/i.test(label));
    const referenceDownload=/^downloads?$/i.test(label)&&/clip requirements|requirements|branding|content/i.test(section);
    if(/(?:youtube\.com|youtu\.be|twitch\.tv)$/.test(host)||host.endsWith('.youtube.com')||host.endsWith('.twitch.tv')){if((directSource||assetPack)&&!seenSource.has(href)){seenSource.add(href);draft.sourceUrls.push({url:href,label:label.slice(0,160)})};continue}
    if(referenceDownload&&host){if(!seenReference.has(href)){seenReference.add(href);const watermark=/watermark|logo|brand mark/i.test(`${label} ${section} ${href}`);draft.referenceAssets.push({url:href,label:watermark?'Campaign watermark':`Reference image ${draft.referenceAssets.length+1}`,kind:watermark?'watermark':'reference-image',required:watermark})};continue}
    if(assetPack&&host&&host!==provider&&!/clipping\.net$/i.test(host)){if(!seenResource.has(href)){seenResource.add(href);const info=inspectionByUrl.get(href)||{};draft.resourceUrls.push({url:href,label:label.slice(0,160),kind:String(info.kind||'asset-pack'),videoCount:Number(info.videoCount||0),imageCount:Number(info.imageCount||0),mediaCount:Number(info.mediaCount||0),declaredItemCount:Number(info.declaredItemCount||0),visibleAssetCount:Number(info.visibleAssetCount||0),observedItemCount:Number(info.observedItemCount||0),videoCountExact:Boolean(info.videoCountExact),multipleVideoEvidence:Boolean(info.multipleVideoEvidence),inspectStatus:String(info.inspectStatus||''),items:Array.isArray(info.items)?info.items:[]})}}
  }
  // Asset viewers visited by the user are authoritative campaign resources too. This is
  // required for providers such as Frame.io where the campaign page may expose a generic
  // reference download separately from the actual video viewer.
  for(const info of resourceInspections){
    const href=String(info?.url||'').trim();if(!/^https?:\/\//i.test(href)||seenResource.has(href))continue;
    let host='';try{host=new URL(href).hostname.replace(/^www\./,'').toLowerCase()}catch{}
    if(!host||host===provider||/clipping\.net$/i.test(host))continue;
    const kind=String(info?.kind||'asset-pack');
    const videoCount=Number(info?.videoCount||0),mediaCount=Number(info?.mediaCount||0);
    if(videoCount<=0&&mediaCount<=0&&!/(?:^|\.)frame\.io$/i.test(host))continue;
    seenResource.add(href);
    draft.resourceUrls.push({url:href,label:String(info?.label||'Campaign asset').slice(0,160),kind,videoCount,imageCount:Number(info?.imageCount||0),mediaCount:Math.max(mediaCount,videoCount),declaredItemCount:Number(info?.declaredItemCount||0),visibleAssetCount:Number(info?.visibleAssetCount||0),observedItemCount:Number(info?.observedItemCount||0),videoCountExact:Boolean(info?.videoCountExact),multipleVideoEvidence:Boolean(info?.multipleVideoEvidence),inspectStatus:String(info?.inspectStatus||'visited'),items:Array.isArray(info?.items)?info.items:[]});
  }
  const reqList=(Array.isArray(requirementsSnapshot?.listItems)?requirementsSnapshot.listItems:[]).filter(x=>/clip requirements/i.test(String(x?.section||''))).map(x=>x.text);
  const vioList=(Array.isArray(requirementsSnapshot?.listItems)?requirementsSnapshot.listItems:[]).filter(x=>/violations/i.test(String(x?.section||''))).map(x=>x.text);
  draft.requirements=snapshotCleanRuleLines(reqList.length?reqList:snapshotSection(reqLines,/^clip requirements$/i,/^violations$/i));
  draft.violations=snapshotCleanRuleLines(vioList.length?vioList:snapshotSection(reqLines,/^violations$/i,/^(?:clipper terms|terms and conditions)$/i));
  const platformSection=snapshotSection(campaignLines,/^platforms?$/i,/^(?:min(?:imum)?|campaign|bount|payout|payment|start date|your clips|your views)$/i).join(' ');
  const platforms=[];if(/\btiktok\b/i.test(platformSection))platforms.push('tiktok');if(/\binstagram\b|\breels?\b/i.test(platformSection))platforms.push('instagram');if(/\byoutube\b|\bshorts?\b/i.test(platformSection))platforms.push('youtube-shorts');if(/\btwitter\b|(?:^|\s)x(?:\s|$)/i.test(platformSection))platforms.push('x');draft.platforms=[...new Set(platforms)];
  const clipValue=snapshotLastLineAfter(campaignLines,/^your clips$/i),viewValue=snapshotLastLineAfter(campaignLines,/^your views$/i);
  draft.campaignStats={ yourClips:snapshotCompactNumber(clipValue), yourViews:snapshotCompactNumber(viewValue) };
  const publicStats=campaignText.match(/([0-9]+(?:[.,][0-9]+)?\s*[kKmM]?)\s+clips?\s+([0-9]+(?:[.,][0-9]+)?\s*[kKmM]?)\s+views?/i);if(publicStats){draft.campaignStats.publicClips=snapshotCompactNumber(publicStats[1]);draft.campaignStats.publicViews=snapshotCompactNumber(publicStats[2])}
  const budget=campaignText.match(/([0-9]+(?:[.,][0-9]+)?)%\s+filled/i);if(budget)draft.campaignStats.budgetFilledPercent=Math.max(0,Math.min(100,Number(budget[1].replace(',','.'))||0));
  return draft;
}

