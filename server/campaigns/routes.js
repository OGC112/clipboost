import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { normalizeCampaign, campaignTotals, campaignPaymentModel, parseCampaignSourceUrl } from './core.js';
import { detectCampaignAccessWall, extractCampaignPage, extractPlatformTermsProfile, extractAuthenticatedCampaignSnapshots } from './import.js';
import { fetchPublicCampaignPage } from '../security/network.js';

export function registerCampaignRoutes(app, deps) {
  const {
    readCampaigns,
    readPlatformProfiles,
    updateCampaigns,
    updatePlatformProfiles,
    writeMeta,
    metaDir
  } = deps;

  app.get('/api/campaigns', async (req,res,next) => {
    try {
      const data=await readCampaigns();const profiles=await readPlatformProfiles();
      res.json({ campaigns:data.campaigns.map(c=>({ ...c, platformProfile:c.platformProfileKey?profiles[c.platformProfileKey]||null:null, totals:campaignTotals(c) })) });
    } catch(e){ next(e); }
  });
  app.post('/api/campaigns', async (req,res,next) => {
    try {
      const campaign=normalizeCampaign(req.body||{});
      await updateCampaigns(data=>{data.campaigns.unshift(campaign);});
      res.json({ ...campaign, totals:campaignTotals(campaign) });
    } catch(e){ next(e); }
  });
  app.post('/api/campaigns/import-snapshot', async (req,res,next) => {
    try {
      const url=String(req.body?.url||req.body?.campaign?.url||'').trim();
      if(!/^https?:\/\//i.test(url))return res.status(400).json({error:'Enter a valid campaign URL.'});
      const campaign=req.body?.campaign&&typeof req.body.campaign==='object'?req.body.campaign:{};
      const requirements=req.body?.requirements&&typeof req.body.requirements==='object'?req.body.requirements:{};
      const listing=req.body?.listing&&typeof req.body.listing==='object'?req.body.listing:{};
      const terms=req.body?.terms&&typeof req.body.terms==='object'?req.body.terms:{};
      const resourceInspections=Array.isArray(req.body?.resourceInspections)?req.body.resourceInspections:[];
      const draft=extractAuthenticatedCampaignSnapshots(campaign,requirements,url,listing,resourceInspections);
      if(!draft.name||draft.name==='Imported campaign')return res.status(422).json({error:'ClipBoost could not identify a campaign on this page. Keep the campaign page open after signing in and try again.'});
      const profile=extractPlatformTermsProfile(terms,draft.provider);if(profile&&profile.sections.length){await updatePlatformProfiles(profiles=>{profiles[profile.key]=profile;});draft.platformProfileKey=profile.key;}
      res.json({draft,summary:{name:draft.name,sources:draft.sourceUrls.length,resources:draft.resourceUrls.length,references:draft.referenceAssets.length,requirements:draft.requirements.length,violations:draft.violations.length,audience:draft.audience||'',paymentModel:draft.paymentModel||'custom',qualificationViews:Number(draft.qualificationViews||0),platformRules:Boolean(profile&&profile.sections.length)}});
    } catch(e){next(e)}
  });
  app.post('/api/campaigns/import', async (req,res,next) => {
    try {
      const url=String(req.body?.url||'').trim();
      const {response,finalUrl}=await fetchPublicCampaignPage(url);
      if(!response.ok)throw Object.assign(new Error(`Campaign page returned HTTP ${response.status}. You can still add it manually.`),{status:400});
      const type=String(response.headers.get('content-type')||'');
      if(!type.includes('text/html'))throw Object.assign(new Error('This campaign URL is not a public HTML page. Add the campaign manually.'),{status:400});
      const html=(await response.text()).slice(0,2_000_000);
      const wall=detectCampaignAccessWall(html,finalUrl);
      if(wall.blocked){
        return res.status(409).json({error:wall.reason==='login'?'Campaign details unavailable — login required. The URL was kept so you can enter the terms manually.':'Campaign details unavailable — this page is protected by anti-bot verification. The URL was kept so you can enter the terms manually.',manual:true,url,reason:wall.reason});
      }
      const draft=extractCampaignPage(html,finalUrl);
      const campaign=normalizeCampaign(draft);
      await updateCampaigns(data=>{data.campaigns.unshift(campaign);});
      res.json({ ...campaign, totals:campaignTotals(campaign), imported:true });
    } catch(e){ next(e); }
  });
  app.put('/api/campaigns/:id', async (req,res,next) => {
    try {
      let campaign=null;
      await updateCampaigns(data=>{
        const i=data.campaigns.findIndex(c=>c.id===req.params.id);
        if(i<0)return;
        campaign=normalizeCampaign(req.body||{},data.campaigns[i]);
        data.campaigns[i]=campaign;
      });
      if(!campaign)return res.status(404).json({error:'Campaign not found.'});
      res.json({ ...campaign, totals:campaignTotals(campaign) });
    } catch(e){ next(e); }
  });
  app.delete('/api/campaigns/:id', async (req,res,next) => {
    try {
      let removed=false;
      await updateCampaigns(data=>{
        const before=data.campaigns.length;
        data.campaigns=data.campaigns.filter(c=>c.id!==req.params.id);
        removed=data.campaigns.length!==before;
      });
      if(!removed)return res.status(404).json({error:'Campaign not found.'});
      res.json({ok:true});
    } catch(e){ next(e); }
  });
  app.post('/api/campaigns/:id/posts', async (req,res,next) => {
    try {
      const body=req.body||{}; let c=null;
      await updateCampaigns(data=>{
        const i=data.campaigns.findIndex(campaign=>campaign.id===req.params.id); if(i<0)return;
        c=data.campaigns[i]; c.posts=Array.isArray(c.posts)?c.posts:[];
        c.posts.unshift({id:crypto.randomUUID(),url:String(body.url||'').trim(),platform:String(body.platform||'').trim(),views:Math.max(0,Number(body.views||0)||0),publishedAt:String(body.publishedAt||new Date().toISOString()),notes:String(body.notes||'').slice(0,2000),editingMinutes:Math.max(0,Number(body.editingMinutes||0)||0),clipDuration:Math.max(0,Number(body.clipDuration||0)||0),payoutConfirmed:Math.max(0,Number(body.payoutConfirmed||0)||0),submissionStatus:['pending','accepted','rejected'].includes(String(body.submissionStatus||''))?String(body.submissionStatus):'pending',paid:Boolean(body.paid),createdAt:new Date().toISOString()});
        c.updatedAt=new Date().toISOString();
      });
      if(!c)return res.status(404).json({error:'Campaign not found.'});
      res.json({...c,totals:campaignTotals(c)});
    } catch(e){next(e)}
  });
  app.put('/api/campaigns/:id/posts/:postId', async (req,res,next) => {
    try {
      const body=req.body||{}; let c=null; let missingPost=false;
      await updateCampaigns(data=>{
        const ci=data.campaigns.findIndex(campaign=>campaign.id===req.params.id);if(ci<0)return;
        c=data.campaigns[ci];c.posts=Array.isArray(c.posts)?c.posts:[];const pi=c.posts.findIndex(p=>p.id===req.params.postId);if(pi<0){missingPost=true;return;}
        const current=c.posts[pi];
        c.posts[pi]={...current,url:body.url!==undefined?String(body.url||'').trim():current.url,platform:body.platform!==undefined?String(body.platform||'').trim():current.platform,views:body.views!==undefined?Math.max(0,Number(body.views||0)||0):current.views,clipDuration:body.clipDuration!==undefined?Math.max(0,Number(body.clipDuration||0)||0):current.clipDuration,editingMinutes:body.editingMinutes!==undefined?Math.max(0,Number(body.editingMinutes||0)||0):current.editingMinutes,payoutConfirmed:body.payoutConfirmed!==undefined?Math.max(0,Number(body.payoutConfirmed||0)||0):Math.max(0,Number(current.payoutConfirmed||0)||0),submissionStatus:body.submissionStatus!==undefined&&['pending','accepted','rejected'].includes(String(body.submissionStatus))?String(body.submissionStatus):String(current.submissionStatus||'pending'),paid:body.paid!==undefined?Boolean(body.paid):current.paid,updatedAt:new Date().toISOString()};
        c.updatedAt=new Date().toISOString();
      });
      if(!c)return res.status(404).json({error:'Campaign not found.'});
      if(missingPost)return res.status(404).json({error:'Tracked post not found.'});
      res.json({...c,totals:campaignTotals(c)});
    } catch(e){next(e)}
  });
  app.delete('/api/campaigns/:id/posts/:postId', async (req,res,next) => {
    try {
      let c=null; let removed=false;
      await updateCampaigns(data=>{
        const ci=data.campaigns.findIndex(campaign=>campaign.id===req.params.id);if(ci<0)return;
        c=data.campaigns[ci];const before=(c.posts||[]).length;c.posts=(c.posts||[]).filter(p=>p.id!==req.params.postId);removed=c.posts.length!==before;
        if(removed)c.updatedAt=new Date().toISOString();
      });
      if(!c)return res.status(404).json({error:'Campaign not found.'});
      if(!removed)return res.status(404).json({error:'Tracked post not found.'});
      res.json({...c,totals:campaignTotals(c)});
    } catch(e){next(e)}
  });
  app.post('/api/campaigns/:id/source-project', async (req,res,next) => {
    try {
      const data=await readCampaigns(); const campaign=data.campaigns.find(c=>c.id===req.params.id); if(!campaign)return res.status(404).json({error:'Campaign not found.'});
      const sourceId=String(req.body?.sourceId||''); const requested=String(req.body?.url||'').trim(); const requestedLabel=String(req.body?.label||'').trim();
      const source=campaign.sourceUrls.find(s=>s.id===sourceId)||(requested?{url:requested,label:requestedLabel||'Campaign asset'}:null);
      if(!source?.url)return res.status(400).json({error:'Campaign source not found.'});
      const parsed=parseCampaignSourceUrl(source.url); if(!parsed)return res.status(400).json({error:'Unsupported source URL.'});
      const id=crypto.randomUUID();
      const meta={id,originalName:source.label||`${campaign.name} source`,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),status:'linked',details:{duration:0},candidates:[],campaignId:campaign.id,campaign:{...campaign,totals:campaignTotals(campaign)},externalSource:{...parsed,thumbnail:null,title:source.label||null,creatorName:campaign.provider||'Campaign source',creatorId:campaign.id,viewCount:0}};
      await writeMeta(meta); res.json(meta);
    } catch(e){next(e)}
  });
  app.post('/api/campaigns/:id/batch-projects', async (req,res,next) => {
    try {
      const data=await readCampaigns(); const campaign=data.campaigns.find(c=>c.id===req.params.id); if(!campaign)return res.status(404).json({error:'Campaign not found.'});
      const existingNames=await fs.readdir(metaDir).catch(()=>[]); const existing=[];
      for(const name of existingNames.filter(n=>n.endsWith('.json'))){try{const m=JSON.parse(await fs.readFile(path.join(metaDir,name),'utf8'));if(m.campaignId===campaign.id&&m.externalSource?.url)existing.push(m.externalSource.url)}catch{}}
      const created=[];
      for(const source of (campaign.sourceUrls||[])){
        if(existing.includes(source.url))continue; const parsed=parseCampaignSourceUrl(source.url); if(!parsed)continue;
        const id=crypto.randomUUID(); const meta={id,originalName:source.label||`${campaign.name} source`,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),status:'linked',details:{duration:0},candidates:[],campaignId:campaign.id,campaign:{...campaign,totals:campaignTotals(campaign)},externalSource:{...parsed,thumbnail:null,title:source.label||null,creatorName:campaign.provider||'Campaign source',creatorId:campaign.id,viewCount:0}};
        await writeMeta(meta);created.push({id:meta.id,name:meta.originalName,url:source.url});
      }
      res.json({created,count:created.length,skipped:(campaign.sourceUrls||[]).length-created.length});
    } catch(e){next(e)}
  });
  app.get('/api/campaigns/:id/submission-pack', async (req,res,next) => {
    try {
      const data=await readCampaigns(); const campaign=data.campaigns.find(c=>c.id===req.params.id); if(!campaign)return res.status(404).json({error:'Campaign not found.'});
      const totals=campaignTotals(campaign); const pack={generatedAt:new Date().toISOString(),campaign:{id:campaign.id,name:campaign.name,provider:campaign.provider,campaignUrl:campaign.campaignUrl,status:campaign.status,accessMode:campaign.accessMode,deadline:campaign.deadline,paymentModel:campaignPaymentModel(campaign),qualificationViews:campaign.qualificationViews??campaign.viewThreshold??0,qualificationScope:campaign.qualificationScope||'per-post',rateBasisViews:campaign.rateBasisViews||100000,platformPayouts:campaign.platformPayouts||{},fixedReward:campaign.fixedReward??campaign.payout??0,bountyPool:campaign.bountyPool||0,maxPayout:campaign.maxPayout||0,confirmedPayout:campaign.confirmedPayout||0,currency:campaign.currency},totals,posts:campaign.posts||[],usedMoments:campaign.usedMoments||[],requirements:{platforms:campaign.platforms,minDuration:campaign.minDuration,maxDuration:campaign.maxDuration,requiredHashtags:campaign.requiredHashtags,requiredMentions:campaign.requiredMentions,requiredCTA:campaign.requiredCTA,forbiddenTerms:campaign.forbiddenTerms||[],audience:campaign.audience||'',requirements:campaign.requirements||[],violations:campaign.violations||[],requirementsUrl:campaign.requirementsUrl||'',resources:campaign.resourceUrls||[],referenceAssets:campaign.referenceAssets||[]},import:{source:campaign.importSource||'',importedAt:campaign.importedAt||'',startDate:campaign.startDate||'',paymentMethod:campaign.paymentMethod||'',accountLimit:campaign.accountLimit||'',campaignStats:campaign.campaignStats||{}}};
      res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Content-Disposition',`attachment; filename="clipboost-campaign-${campaign.id}.json"`);res.send(JSON.stringify(pack,null,2));
    } catch(e){next(e)}
  });
}
