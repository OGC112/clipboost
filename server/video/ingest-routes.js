import crypto from 'crypto';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';

export function registerVideoIngestRoutes(app, deps) {
  const {
    upload,
    readMeta,
    writeMeta,
    probe,
    run,
    uploadsDir
  } = deps;

  // Stream authenticated campaign media straight to disk. This avoids buffering the
  // entire Canto file in Electron and then rebuilding a multipart Blob.
  app.post('/api/videos/campaign-stream', async (req,res,next)=>{
    let outPath='';
    try{
      const requestedProjectId=String(req.headers['x-clipboost-project-id']||'').trim();
      const originalName=decodeURIComponent(String(req.headers['x-clipboost-file-name']||'campaign-asset.mp4'));
      let existingProject=null;
      if(/^[0-9a-f-]{36}$/i.test(requestedProjectId))existingProject=await readMeta(requestedProjectId).catch(()=>null);
      if(!existingProject)return res.status(404).json({error:'Campaign project not found.'});
      const contentType=String(req.headers['content-type']||'video/mp4').toLowerCase();
      const ext=contentType.includes('quicktime')?'.mov':contentType.includes('webm')?'.webm':path.extname(originalName)||'.mp4';
      const defaultMaxBytes=5*1024*1024*1024;
      const configuredMaxBytes=Number(process.env.CAMPAIGN_STREAM_MAX_BYTES||defaultMaxBytes);
      const maxBytes=Number.isFinite(configuredMaxBytes)&&configuredMaxBytes>0?configuredMaxBytes:defaultMaxBytes;
      const declaredBytes=Number(req.headers['content-length']||0);
      if(Number.isFinite(declaredBytes)&&declaredBytes>maxBytes)return res.status(413).json({error:'Campaign media file is too large.'});
      let filename=`${crypto.randomUUID()}${ext}`;
      outPath=path.join(uploadsDir,filename);
      await new Promise((resolve,reject)=>{
        const output=fsSync.createWriteStream(outPath);
        let received=0,settled=false;
        const finish=(err)=>{
          if(settled)return;settled=true;
          if(err)reject(err);else resolve();
        };
        req.on('data',chunk=>{
          received+=chunk.length;
          if(received<=maxBytes)return;
          req.unpipe(output);
          req.resume();
          output.destroy();
          finish(Object.assign(new Error('Campaign media file is too large.'),{status:413}));
        });
        req.on('aborted',()=>finish(new Error('Campaign media transfer aborted.')));
        req.on('error',finish);output.on('error',finish);output.on('finish',()=>finish());
        req.pipe(output);
      });
      const stat=await fs.stat(outPath);
      if(stat.size<1024)throw new Error('Canto returned an empty media file.');
      existingProject.status='preparing';
      existingProject.updatedAt=new Date().toISOString();
      existingProject.ingestion={...(existingProject.ingestion||{}),stage:'probing',progress:92,bytes:stat.size,error:null};
      await writeMeta(existingProject);
      let details=await probe(outPath);
      // Browser playback is part of the Campaign Studio workflow. Canto can expose
      // MOV/MP4 files with codecs Chromium cannot decode even though FFmpeg can.
      // Normalize those sources once at import time so Play, seek and final AI tools
      // all work from the same browser-safe source.
      const browserSafeVideo=['h264','vp8','vp9','av1'].includes(String(details.videoCodec||'').toLowerCase());
      const browserSafeAudio=!details.audioCodec||['aac','mp3','opus','vorbis'].includes(String(details.audioCodec||'').toLowerCase());
      {
        // Always rewrite Canto media into a Chromium-friendly MP4 container. Even
        // H.264/AAC assets can arrive with a non-streamable atom layout that shows
        // frame 0 and duration but refuses to start in Electron.
        const normalizedName=`${crypto.randomUUID()}.mp4`,normalizedPath=path.join(uploadsDir,normalizedName);
        if(browserSafeVideo&&browserSafeAudio){
          try{
            await run('ffmpeg',['-y','-i',outPath,'-map','0:v:0','-map','0:a:0?','-c','copy','-movflags','+faststart',normalizedPath],{timeout:60*60*1000});
          }catch{
            await run('ffmpeg',['-y','-i',outPath,'-map','0:v:0','-map','0:a:0?','-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-movflags','+faststart',normalizedPath],{timeout:60*60*1000});
          }
        }else{
          await run('ffmpeg',['-y','-i',outPath,'-map','0:v:0','-map','0:a:0?','-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-movflags','+faststart',normalizedPath],{timeout:60*60*1000});
        }
        await fs.rm(outPath,{force:true}).catch(()=>{});
        outPath=normalizedPath;filename=normalizedName;details=await probe(outPath);
      }
      const meta={...existingProject,id:existingProject.id,originalName:existingProject.originalName||originalName,filename,sourcePath:outPath,sourceUrl:`/media/uploads/${filename}`,updatedAt:new Date().toISOString(),status:'uploaded',details,candidates:[],ingestion:{...(existingProject.ingestion||{}),stage:'ready',progress:100,bytes:(await fs.stat(outPath)).size,error:null}};
      await writeMeta(meta);res.json(meta);
    }catch(e){if(outPath)await fs.rm(outPath,{force:true}).catch(()=>{});next(e)}
  });
  
  app.post('/api/videos', upload.single('video'), async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No video uploaded.' });
      const requestedProjectId = String(req.body?.projectId || '').trim();
      let existingProject = null;
      if (/^[0-9a-f-]{36}$/i.test(requestedProjectId)) {
        existingProject = await readMeta(requestedProjectId).catch(() => null);
      }
      const id = existingProject?.id || path.parse(req.file.filename).name;
      const details = await probe(req.file.path);
      const meta = {
        ...(existingProject || {}),
        id,
        originalName: existingProject?.originalName || req.file.originalname,
        filename: req.file.filename,
        sourcePath: req.file.path,
        sourceUrl: `/media/uploads/${req.file.filename}`,
        createdAt: existingProject?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'uploaded',
        details,
        candidates: []
      };
      await writeMeta(meta);
      res.json(meta);
    } catch (e) { next(e); }
  });
}
