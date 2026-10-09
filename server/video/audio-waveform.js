// Measured mono PCM peaks, not synthetic waveform graphics.
// PCM is reduced by FFmpeg before reading, so long videos stay memory-bounded.
export function summarizePcmWaveform(buffer, duration, points=160) {
  const count=Math.min(400,Math.max(16,Math.floor(Number(points)||160)));
  const seconds=Number(duration)||0;
  if(!Buffer.isBuffer(buffer)||buffer.length<2||seconds<=0)return {available:false,peaks:[],energyMoments:[]};
  const samples=Math.floor(buffer.length/2);
  const buckets=Array.from({length:count},()=>({peak:0,power:0,n:0}));
  for(let i=0;i<samples;i++){
    const value=Math.abs(buffer.readInt16LE(i*2)/32768);
    const b=Math.min(count-1,Math.floor(i/samples*count));
    buckets[b].peak=Math.max(buckets[b].peak,value);
    buckets[b].power+=value*value;
    buckets[b].n++;
  }
  const rms=buckets.map(b=>Math.sqrt(b.power/Math.max(1,b.n)));
  const sorted=[...rms].sort((a,b)=>a-b);
  const median=sorted[Math.floor(sorted.length/2)]||0;
  const threshold=Math.max(.065,median*2.5);
  const energyMoments=[];
  for(let i=1;i<rms.length-1;i++){
    if(rms[i]>=threshold&&rms[i]>=rms[i-1]&&rms[i]>=rms[i+1]){
      const time=(i+.5)/count*seconds;
      if(energyMoments.length&&time-energyMoments[energyMoments.length-1].time<1.5){
        if(rms[i]>energyMoments[energyMoments.length-1].rms)energyMoments[energyMoments.length-1]={time:Number(time.toFixed(2)),rms:Number(rms[i].toFixed(3))};
      }else energyMoments.push({time:Number(time.toFixed(2)),rms:Number(rms[i].toFixed(3))});
    }
  }
  return {available:true,peaks:buckets.map(b=>Number(b.peak.toFixed(3))),energyMoments:energyMoments.slice(0,60),points:count,method:'FFmpeg PCM amplitude (not emotion recognition)'};
}
