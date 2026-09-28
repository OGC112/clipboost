import argparse, json, math, os, sys


def emit(payload):
    sys.stdout.write(json.dumps(payload, ensure_ascii=False))
    sys.stdout.flush()


def iou(a, b):
    ax, ay, aw, ah = a; bx, by, bw, bh = b
    x1=max(ax,bx); y1=max(ay,by); x2=min(ax+aw,bx+bw); y2=min(ay+ah,by+bh)
    inter=max(0,x2-x1)*max(0,y2-y1)
    union=aw*ah+bw*bh-inter
    return inter/union if union>0 else 0.0


def dedupe_rects(rects):
    out=[]
    for r in sorted(rects, key=lambda x:x[2]*x[3], reverse=True):
        if any(iou(r,x)>.34 or math.hypot((r[0]+r[2]/2)-(x[0]+x[2]/2),(r[1]+r[3]/2)-(x[1]+x[3]/2)) < min(r[2],r[3],x[2],x[3])*.28 for x in out):
            continue
        out.append(r)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--input', required=True)
    ap.add_argument('--start', type=float, default=0.0)
    ap.add_argument('--end', type=float, required=True)
    ap.add_argument('--step', type=float, default=0.35)
    ap.add_argument('--mode', choices=['auto','speaker','center','split'], default='speaker')
    ap.add_argument('--movement', choices=['low','balanced','high'], default='balanced')
    args = ap.parse_args()

    try:
        import cv2
        import numpy as np
    except Exception as exc:
        emit({'ok': False, 'error': f'OpenCV tracking unavailable: {exc}', 'keyframes': [], 'summary': {'samples': 0, 'facesDetected': 0, 'faceCountMax': 0, 'speakerSwitches': 0, 'reactionPeaks': 0}})
        return 0

    cap = cv2.VideoCapture(args.input)
    if not cap.isOpened():
        emit({'ok': False, 'error': 'Could not open source video for face tracking.', 'keyframes': [], 'summary': {'samples': 0, 'facesDetected': 0, 'faceCountMax': 0, 'speakerSwitches': 0, 'reactionPeaks': 0}})
        return 0

    fps = float(cap.get(cv2.CAP_PROP_FPS) or 30.0)
    src_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    src_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    if src_w <= 0 or src_h <= 0:
        emit({'ok': False, 'error': 'Video dimensions are unavailable.', 'keyframes': [], 'summary': {'samples': 0, 'facesDetected': 0, 'faceCountMax': 0, 'speakerSwitches': 0, 'reactionPeaks': 0}})
        return 0

    start=max(0.0,args.start); end=max(start+0.25,args.end); step=max(0.20,min(1.0,args.step))
    frontal=cv2.CascadeClassifier(os.path.join(cv2.data.haarcascades,'haarcascade_frontalface_default.xml'))
    profile=cv2.CascadeClassifier(os.path.join(cv2.data.haarcascades,'haarcascade_profileface.xml'))
    if frontal.empty():
        emit({'ok': False, 'error': 'OpenCV face detector is unavailable.', 'keyframes': [], 'summary': {'samples':0,'facesDetected':0,'faceCountMax':0,'speakerSwitches':0,'reactionPeaks':0}})
        return 0

    resize_scale=min(1.0,720.0/max(src_w,src_h)); work_w=max(1,int(round(src_w*resize_scale))); work_h=max(1,int(round(src_h*resize_scale)))
    sample_frames=max(1,int(round(step*fps)))
    prev_gray=None; tracks={}; next_id=1; last_selected_id=None; speaker_switches=0; keyframes=[]; reaction_peaks=[]; last_reaction_t=-99.0
    total_faces=0; max_faces=0; sample_index=0; smooth_x,smooth_y=.5,.42
    alpha={'low':.15,'balanced':.26,'high':.42}[args.movement]
    frame_idx=int(round(start*fps)); end_frame=int(round(end*fps))

    while frame_idx<=end_frame:
        cap.set(cv2.CAP_PROP_POS_FRAMES,frame_idx); ok,frame=cap.read()
        if not ok or frame is None: break
        t_abs=frame_idx/fps; t_rel=max(0.0,t_abs-start)
        if resize_scale<.999: frame=cv2.resize(frame,(work_w,work_h),interpolation=cv2.INTER_AREA)
        gray=cv2.equalizeHist(cv2.cvtColor(frame,cv2.COLOR_BGR2GRAY))
        min_face=max(28,int(min(work_w,work_h)*.065))
        rects=[tuple(map(int,r)) for r in frontal.detectMultiScale(gray,scaleFactor=1.10,minNeighbors=5,minSize=(min_face,min_face))]
        if not profile.empty():
            rects += [tuple(map(int,r)) for r in profile.detectMultiScale(gray,scaleFactor=1.10,minNeighbors=5,minSize=(min_face,min_face))]
            flipped=cv2.flip(gray,1)
            for r in profile.detectMultiScale(flipped,scaleFactor=1.10,minNeighbors=5,minSize=(min_face,min_face)):
                x,y,w,h=map(int,r); rects.append((work_w-x-w,y,w,h))
        raw_faces=dedupe_rects(rects)
        faces=[]
        for (x,y,w,h) in raw_faces:
            cx=(x+w/2)/work_w; cy=(y+h/2)/work_h; area=(w*h)/float(work_w*work_h); activity=0.0
            if prev_gray is not None:
                mx1=max(0,int(x+w*.12)); mx2=min(work_w,int(x+w*.88)); my1=max(0,int(y+h*.48)); my2=min(work_h,int(y+h*.96))
                if mx2>mx1+4 and my2>my1+4:
                    a=gray[my1:my2,mx1:mx2]; b=prev_gray[my1:my2,mx1:mx2]
                    if a.size and b.size and a.shape==b.shape: activity=float(np.mean(cv2.absdiff(a,b)))/255.0
            faces.append({'rect':(x,y,w,h),'x':float(cx),'y':float(cy),'area':float(area),'activity':float(activity)})

        available=set(tracks.keys())
        for face in sorted(faces,key=lambda f:f['area'],reverse=True):
            best_id=None; best_dist=999.0
            for tid in list(available):
                tr=tracks[tid]; dist=math.hypot(face['x']-tr['x'],face['y']-tr['y'])
                if dist<best_dist and dist<.24: best_id,best_dist=tid,dist
            if best_id is None: best_id=next_id; next_id+=1; prev_ema=0.0
            else: available.discard(best_id); prev_ema=float(tracks.get(best_id,{}).get('activityEma',0.0))
            face['id']=best_id; face['activityEma']=prev_ema*.66+face['activity']*.34
            tracks[best_id]={'x':face['x'],'y':face['y'],'seen':sample_index,'activityEma':face['activityEma']}
        tracks={k:v for k,v in tracks.items() if sample_index-v.get('seen',sample_index)<=9}
        max_faces=max(max_faces,len(faces)); total_faces+=len(faces)

        def speaker_score(f):
            center=1.0-min(1.0,abs(f['x']-.5)*1.4)
            return f.get('activityEma',0.0)*5.4+f['area']*7.0+center*.14

        ranked=sorted(faces,key=speaker_score,reverse=True)
        selected=None; effective_mode=args.mode; safe_frame=False; spread_x=0.0
        if faces:
            if args.mode=='auto':
                meaningful=[f for f in sorted(faces,key=lambda f:f['area'],reverse=True) if f['area']>=max(.0022,max(x['area'] for x in faces)*.16)]
                if len(meaningful)>=2:
                    top=meaningful[:3]; xs=[f['x'] for f in top]; spread_x=max(xs)-min(xs)
                    weight=sum(max(.001,f['area']) for f in top)
                    selected={'id':-1,'x':sum(f['x']*max(.001,f['area']) for f in top)/weight,'y':sum(f['y']*max(.001,f['area']) for f in top)/weight,'area':sum(f['area'] for f in top),'activity':max(f['activity'] for f in top),'activityEma':max(f.get('activityEma',0) for f in top),'splitIds':[f['id'] for f in top]}
                    effective_mode='group'; safe_frame=spread_x>.20 or len(top)>=3
                else:
                    effective_mode='speaker'
            if selected is None:
                if args.mode=='split' and len(ranked)>=2:
                    top=ranked[:2]; xs=[f['x'] for f in top]; spread_x=max(xs)-min(xs)
                    selected={'id':-1,'x':sum(f['x'] for f in top)/2,'y':sum(f['y'] for f in top)/2,'area':sum(f['area'] for f in top),'activity':max(f['activity'] for f in top),'activityEma':max(f.get('activityEma',0) for f in top),'splitIds':[f['id'] for f in top]}
                    safe_frame=spread_x>.20
                else:
                    candidate=ranked[0] if ranked else None
                    current=next((f for f in faces if f['id']==last_selected_id),None)
                    if current is not None and candidate is not None and current['id']!=candidate['id']:
                        # Speaker lock: don't jump to a different face on one noisy motion sample.
                        if speaker_score(candidate) < speaker_score(current)*1.30 + .035: candidate=current
                    selected=candidate
        else:
            safe_frame=True

        if selected:
            target_x=min(.94,max(.06,float(selected['x']))); target_y=min(.82,max(.20,float(selected['y'])+.055))
            smooth_x += (target_x-smooth_x)*alpha; smooth_y += (target_y-smooth_y)*alpha
            selected_id=int(selected.get('id',-1))
            if effective_mode=='speaker' and selected_id>0 and last_selected_id and selected_id!=last_selected_id: speaker_switches+=1
            if selected_id>0: last_selected_id=selected_id
            reaction=float(min(1.0,selected.get('activityEma',selected.get('activity',0.0))*7.5))
            confidence=float(min(1.0,.48+selected.get('area',0.0)*5.2+min(.24,selected.get('activityEma',0.0)*1.6)))
            if effective_mode=='group': confidence=max(confidence,.72)
        else:
            smooth_x += (.5-smooth_x)*min(alpha,.18); smooth_y += (.44-smooth_y)*min(alpha,.18)
            selected_id=None; reaction=0.0; confidence=.12

        if confidence<.34: safe_frame=True
        if reaction>=.34 and t_rel-last_reaction_t>=1.8:
            reaction_peaks.append({'time':round(t_rel,3),'score':round(reaction,3)}); last_reaction_t=t_rel
        keyframes.append({'time':round(t_rel,3),'x':round(float(smooth_x),5),'y':round(float(smooth_y),5),'faceCount':len(faces),'activeFaceId':selected_id,'activity':round(float(selected.get('activityEma',0.0) if selected else 0.0),5),'reaction':round(reaction,4),'confidence':round(confidence,4),'mode':effective_mode,'safeFrame':bool(safe_frame),'spreadX':round(float(spread_x),4)})
        prev_gray=gray; sample_index+=1; frame_idx+=sample_frames

    cap.release()
    summary={'samples':len(keyframes),'facesDetected':total_faces,'faceCountMax':max_faces,'speakerSwitches':speaker_switches,'reactionPeaks':len(reaction_peaks),'reactionPeakTimes':reaction_peaks[:24],'mode':args.mode,'movement':args.movement,'safeFrames':sum(1 for f in keyframes if f.get('safeFrame')),'engine':'opencv-face-safe-v2'}
    emit({'ok':True,'keyframes':keyframes,'summary':summary}); return 0


if __name__=='__main__':
    raise SystemExit(main())
