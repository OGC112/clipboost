import crypto from 'crypto';
import path from 'path';
import { campaignFitForCandidate, campaignCompliance } from '../campaigns/core.js';
import { renderDimensions } from './format.js';

export function registerVideoRoutes(app, deps) {
  const {
    deletedProjectIds,
    startBackgroundAnalysis,
    readMeta,
    writeMeta,
    clipTextAbsolute,
    finalizeCandidate,
    ensureCandidatePreview,
    renderEditedClip,
    updateCampaigns,
    exportsDir,
    recoverInterruptedProject
  } = deps;

  app.post('/api/videos/:id/analyze', async (req, res, next) => {
    try {
      deletedProjectIds.delete(String(req.params.id));
      const meta=await startBackgroundAnalysis(req.params.id,{clipCount:req.body?.clipCount??'auto'});
      res.status(202).json(meta);
    } catch (e) { next(e); }
  });
  
  
  app.post('/api/videos/:id/campaign-check', async (req,res,next) => {
    try {
      const meta=await readMeta(req.params.id); const index=Number(req.body?.index); const base=Number.isInteger(index)&&index>=0?meta.candidates?.[index]:null;
      if(!base)return res.status(404).json({error:'Clip candidate not found.'});
      const start=Math.max(0,Number(req.body?.start??base.start??0)); const end=Math.min(Number(meta.details?.duration||base.end||0),Number(req.body?.end??base.end??start+30));
      const selectionText=meta.transcript?clipTextAbsolute(meta.transcript,start,end):String(base.selectionText||'');
      const candidate={...base,start,end,duration:Math.max(0,end-start),selectionText}; candidate.campaignFit=campaignFitForCandidate(meta,candidate,base.quality||{});
      res.json(campaignCompliance(meta,candidate,req.body?.options||{}));
    } catch(e){next(e)}
  });
  app.post('/api/videos/:id/variants', async (req,res,next) => {
    try {
      const meta=await readMeta(req.params.id); const index=Number(req.body?.index); const base=Number.isInteger(index)&&index>=0?meta.candidates?.[index]:null;
      if(!base||!meta.transcript)return res.status(404).json({error:'Clip transcript is not ready.'});
      const duration=Number(meta.details?.duration||base.end||0); const modes=[['Tight hook',1.5,-3],['Balanced',0,0],['More context',-4,4]]; const variants=[];
      for(const [label,startDelta,endDelta] of modes){
        const start=Math.max(0,Number(base.start||0)+startDelta),end=Math.min(duration,Number(base.end||0)+endDelta);
        const c=finalizeCandidate(meta,meta.transcript,{...base,id:crypto.randomUUID(),start,end,title:`${base.title||'Clip'} · ${label}`,reason:`${label} campaign variant`,signals:{...(base.signals||{}),variant:true}});
        variants.push(c);
      }
      res.json({variants});
    } catch(e){next(e)}
  });
  
  
  app.patch('/api/videos/:id/candidates/:index/trim', async (req,res,next) => {
    try {
      const meta=await readMeta(req.params.id);
      const index=Number(req.params.index);
      if(!Number.isInteger(index)||index<0||!meta.candidates?.[index])return res.status(404).json({error:'Clip candidate not found.'});
      const current=meta.candidates[index];
      const sourceDuration=Math.max(.25,Number(meta.details?.duration||current.end||0));
      const requestedStart=Number(req.body?.start);
      const requestedEnd=Number(req.body?.end);
      if(!Number.isFinite(requestedStart)||!Number.isFinite(requestedEnd))return res.status(400).json({error:'Start and end times are required.'});
      const start=Math.max(0,Math.min(sourceDuration-.25,requestedStart));
      const end=Math.min(sourceDuration,Math.max(start+.25,requestedEnd));
      const duration=end-start;
      if(duration>.001+60)return res.status(400).json({error:'Short clips cannot exceed 60 seconds.'});
      const reset=Boolean(req.body?.reset);
      const originalAiStart=Number.isFinite(Number(current.originalAiStart))?Number(current.originalAiStart):Number(current.start||0);
      const originalAiEnd=Number.isFinite(Number(current.originalAiEnd))?Number(current.originalAiEnd):Number(current.end||end);
      const nextStart=reset?Math.max(0,Math.min(sourceDuration-.25,originalAiStart)):start;
      const nextEnd=reset?Math.min(sourceDuration,Math.max(nextStart+.25,originalAiEnd)):end;
      const next={
        ...current,
        originalAiStart,
        originalAiEnd,
        start:nextStart,
        end:nextEnd,
        duration:Math.max(.25,nextEnd-nextStart),
        selectionText:meta.transcript?clipTextAbsolute(meta.transcript,nextStart,nextEnd):String(current.selectionText||''),
        manualTrim:reset?null:{start:nextStart,end:nextEnd,updatedAt:new Date().toISOString()}
      };
      meta.candidates[index]=next;
      meta.updatedAt=new Date().toISOString();
      await writeMeta(meta);
      res.json({ok:true,candidate:next});
    } catch(e){next(e)}
  });

  app.post('/api/videos/:id/preview', async (req, res, next) => {
    try {
      const meta = await readMeta(req.params.id);
      const index = Number(req.body?.index);
      const candidate = Number.isInteger(index) && index >= 0 ? meta.candidates?.[index] : null;
      const start = Number(req.body?.start ?? candidate?.start ?? 0);
      const end = Number(req.body?.end ?? candidate?.end ?? start + 30);
      res.json(await ensureCandidatePreview(meta, start, end, req.body?.options || {}));
    } catch (e) { next(e); }
  });
  
  app.post('/api/videos/:id/export', async (req, res, next) => {
    try {
      const meta = await readMeta(req.params.id);
      const index = Number(req.body?.index);
      const candidate = Number.isInteger(index) && index >= 0 ? meta.candidates?.[index] : null;
      const start = Math.max(0, Number(req.body.start ?? candidate?.start ?? 0));
      const end = Math.min(meta.details.duration, Number(req.body.end ?? candidate?.end ?? start + 30));
      if (!(end > start)) return res.status(400).json({error:'Invalid clip range.'});
      const outName = `${meta.id}-clip-${Number.isInteger(index)&&index>=0?String(index+1).padStart(2,'0'):'custom'}-${Date.now()}.mp4`;
      const outPath = path.join(exportsDir, outName);
      const compliance=campaignCompliance(meta,candidate||{start,end,selectionText:clipTextAbsolute(meta.transcript,start,end),campaignFit:campaignFitForCandidate(meta,{start,end,selectionText:clipTextAbsolute(meta.transcript,start,end)},candidate?.quality||{})},req.body?.options||{});
      if(compliance.enabled&&!compliance.passed&&req.body?.force!==true)return res.status(409).json({error:'Campaign compliance check failed. Review the campaign checklist before export.',compliance});
      const options=req.body?.options||{};
      const dimensions=renderDimensions(meta,options,{preview:false});
      const result = await renderEditedClip(meta, start, end, outPath, options, { preview:false, width:dimensions.width, height:dimensions.height, outputFormat:dimensions.format });
      if(meta.campaignId){
        await updateCampaigns(data=>{const ci=data.campaigns.findIndex(c=>c.id===meta.campaignId);if(ci>=0){data.campaigns[ci].usedMoments=Array.isArray(data.campaigns[ci].usedMoments)?data.campaigns[ci].usedMoments:[];data.campaigns[ci].usedMoments.push({projectId:meta.id,start,end,exportedAt:new Date().toISOString(),filename:outName});data.campaigns[ci].updatedAt=new Date().toISOString();}});
      }
      res.json({ url: `/media/exports/${outName}`, filename: outName, compliance, ...result });
    } catch (e) { next(e); }
  });
  
  app.post('/api/videos/:id/export-all', async (req, res, next) => {
    try {
      const meta = await readMeta(req.params.id);
      if (!Array.isArray(meta.candidates) || !meta.candidates.length) return res.status(400).json({ error:'No clip candidates to export.' });
      const options = req.body?.options || {};
      const limit = Math.min(40, Math.max(1, Number(req.body?.limit || meta.candidates.length)));
      const results = [];
      const blocked = [];
      const newlyUsed=[];
      for (let i=0; i<Math.min(limit, meta.candidates.length); i++) {
        const c = meta.candidates[i];
        const compliance=campaignCompliance(meta,c,options);
        if(compliance.enabled&&!compliance.passed){blocked.push({index:i,title:c.title||`Clip ${i+1}`,compliance});continue;}
        const outName = `${meta.id}-clip-${String(i+1).padStart(2,'0')}-${Date.now()}.mp4`;
        const outPath = path.join(exportsDir, outName);
        const dimensions=renderDimensions(meta,options,{preview:false});
        const rendered = await renderEditedClip(meta, Number(c.start||0), Number(c.end||0), outPath, options, { preview:false, width:dimensions.width, height:dimensions.height, outputFormat:dimensions.format });
        results.push({ index:i, url:`/media/exports/${outName}`, filename:outName, compliance, ...rendered });
        if(meta.campaignId)newlyUsed.push({projectId:meta.id,start:Number(c.start||0),end:Number(c.end||0),exportedAt:new Date().toISOString(),filename:outName});
      }
      if(meta.campaignId&&newlyUsed.length){await updateCampaigns(data=>{const ci=data.campaigns.findIndex(c=>c.id===meta.campaignId);if(ci>=0){data.campaigns[ci].usedMoments=Array.isArray(data.campaigns[ci].usedMoments)?data.campaigns[ci].usedMoments:[];data.campaigns[ci].usedMoments.push(...newlyUsed);data.campaigns[ci].updatedAt=new Date().toISOString();}});}
      res.json({ exports: results, count: results.length, blocked, blockedCount:blocked.length, exportDir: exportsDir });
    } catch (e) { next(e); }
  });
  
  app.get('/api/videos/:id', async (req,res,next) => {
    try {
      let meta = await readMeta(req.params.id);
      const recovery = await recoverInterruptedProject(meta).catch(() => ({ meta, recovered:false }));
      meta = recovery.meta;
      meta.processingInterrupted = Boolean(recovery.recovered || meta.processingInterruptedAt || meta.analysis?.interrupted);
      res.json(meta);
    } catch (e) { next(e); }
  });
}
