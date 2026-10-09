// FFmpeg encoding parameters for preview and final exports.
// Keep preview fast; prioritize detail retention in the downloadable MP4.
export function videoEncodingArgs({preview=false,hasAudio=true}={}) {
  const args=['-c:v','libx264','-preset',preview?'ultrafast':'slow','-crf',preview?'28':'18','-pix_fmt','yuv420p'];
  if(hasAudio) args.push('-c:a','aac','-b:a',preview?'96k':'192k','-ac','2');
  else args.push('-an');
  return args;
}
