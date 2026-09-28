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


def clamp(v, lo=0.0, hi=1.0):
    return max(lo, min(hi, float(v)))


def normalized_patch(cv2, gray, rect, kind='face'):
    x,y,w,h=rect
    if kind=='mouth':
        x1=max(0,int(x+w*.17)); x2=min(gray.shape[1],int(x+w*.83))
        y1=max(0,int(y+h*.55)); y2=min(gray.shape[0],int(y+h*.94))
        size=(48,24)
    else:
        x1=max(0,int(x+w*.10)); x2=min(gray.shape[1],int(x+w*.90))
        y1=max(0,int(y+h*.10)); y2=min(gray.shape[0],int(y+h*.92))
        size=(48,48)
    if x2<=x1+3 or y2<=y1+3:
        return None
    patch=gray[y1:y2,x1:x2]
    if patch.size==0:
        return None
    patch=cv2.resize(patch,size,interpolation=cv2.INTER_AREA)
    return cv2.GaussianBlur(patch,(3,3),0)


def patch_activity(cv2, np, current, previous):
    if current is None or previous is None or current.shape!=previous.shape:
        return 0.0
    return float(np.mean(cv2.absdiff(current, previous)))/255.0


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--input',required=True)
    ap.add_argument('--start',type=float,default=0.0)
    ap.add_argument('--end',type=float,required=True)
    ap.add_argument('--step',type=float,default=0.35)
    ap.add_argument('--mode',choices=['auto','speaker','center','split'],default='speaker')
    ap.add_argument('--movement',choices=['low','balanced','high'],default='balanced')
    args=ap.parse_args()

    try:
        import cv2
        import numpy as np
    except Exception as exc:
        emit({'ok':False,'error':f'OpenCV tracking unavailable: {exc}','keyframes':[],'summary':{'samples':0,'facesDetected':0,'faceCountMax':0,'speakerSwitches':0,'reactionPeaks':0}})
        return 0

    cap=cv2.VideoCapture(args.input)
    if not cap.isOpened():
        emit({'ok':False,'error':'Could not open source video for face tracking.','keyframes':[],'summary':{'samples':0,'facesDetected':0,'faceCountMax':0,'speakerSwitches':0,'reactionPeaks':0}})
        return 0

    fps=float(cap.get(cv2.CAP_PROP_FPS) or 30.0)
    src_w=int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0); src_h=int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    if src_w<=0 or src_h<=0:
        emit({'ok':False,'error':'Video dimensions are unavailable.','keyframes':[],'summary':{'samples':0,'facesDetected':0,'faceCountMax':0,'speakerSwitches':0,'reactionPeaks':0}})
        return 0

    start=max(0.0,args.start); end=max(start+.25,args.end); step=max(.20,min(.80,args.step))
    frontal=cv2.CascadeClassifier(os.path.join(cv2.data.haarcascades,'haarcascade_frontalface_default.xml'))
    profile=cv2.CascadeClassifier(os.path.join(cv2.data.haarcascades,'haarcascade_profileface.xml'))
    if frontal.empty():
        emit({'ok':False,'error':'OpenCV face detector is unavailable.','keyframes':[],'summary':{'samples':0,'facesDetected':0,'faceCountMax':0,'speakerSwitches':0,'reactionPeaks':0}})
        return 0

    resize_scale=min(1.0,760.0/max(src_w,src_h)); work_w=max(1,int(round(src_w*resize_scale))); work_h=max(1,int(round(src_h*resize_scale)))
    sample_frames=max(1,int(round(step*fps)))
    tracks={}; next_id=1; last_selected_id=None; challenger_id=None; challenger_streak=0
    speaker_switches=0; speaker_switch_times=[]; keyframes=[]; reaction_peaks=[]; last_reaction_t=-99.0
    total_faces=0; max_faces=0; sample_index=0; smooth_x,smooth_y=.5,.43
    base_alpha={'low':.20,'balanced':.34,'high':.50}[args.movement]
    frame_idx=int(round(start*fps)); end_frame=int(round(end*fps))
    confidence_sum=0.0; speaker_frames=0; group_frames=0

    while frame_idx<=end_frame:
        cap.set(cv2.CAP_PROP_POS_FRAMES,frame_idx); ok,frame=cap.read()
        if not ok or frame is None: break
        t_abs=frame_idx/fps; t_rel=max(0.0,t_abs-start)
        if resize_scale<.999: frame=cv2.resize(frame,(work_w,work_h),interpolation=cv2.INTER_AREA)
        gray=cv2.equalizeHist(cv2.cvtColor(frame,cv2.COLOR_BGR2GRAY))
        min_face=max(28,int(min(work_w,work_h)*.058))
        rects=[tuple(map(int,r)) for r in frontal.detectMultiScale(gray,scaleFactor=1.09,minNeighbors=5,minSize=(min_face,min_face))]
        if not profile.empty():
            rects += [tuple(map(int,r)) for r in profile.detectMultiScale(gray,scaleFactor=1.09,minNeighbors=5,minSize=(min_face,min_face))]
            flipped=cv2.flip(gray,1)
            for r in profile.detectMultiScale(flipped,scaleFactor=1.09,minNeighbors=5,minSize=(min_face,min_face)):
                x,y,w,h=map(int,r); rects.append((work_w-x-w,y,w,h))
        raw_faces=dedupe_rects(rects)
        faces=[]
        for x,y,w,h in raw_faces:
            faces.append({'rect':(x,y,w,h),'x':float((x+w/2)/work_w),'y':float((y+h/2)/work_h),'w':float(w/work_w),'h':float(h/work_h),'area':float((w*h)/(work_w*work_h))})

        available=set(tracks.keys())
        for face in sorted(faces,key=lambda f:f['area'],reverse=True):
            best_id=None; best_metric=999.0
            for tid in list(available):
                tr=tracks[tid]
                dist=math.hypot(face['x']-tr['x'],face['y']-tr['y'])
                size_delta=abs(math.sqrt(max(face['area'],1e-6))-math.sqrt(max(tr.get('area',face['area']),1e-6)))
                metric=dist+size_delta*.55
                if metric<best_metric and dist<.20:
                    best_id,best_metric=tid,metric
            prior=tracks.get(best_id,{}) if best_id is not None else {}
            if best_id is None:
                best_id=next_id; next_id+=1
            else:
                available.discard(best_id)
            face_patch=normalized_patch(cv2,gray,face['rect'],'face')
            mouth_patch=normalized_patch(cv2,gray,face['rect'],'mouth')
            face_motion=patch_activity(cv2,np,face_patch,prior.get('facePatch'))
            mouth_motion=patch_activity(cv2,np,mouth_patch,prior.get('mouthPatch'))
            # Remove part of general head/camera motion so lip motion dominates speaker selection.
            speech_motion=max(0.0,mouth_motion-face_motion*.42)
            face['id']=best_id
            face['mouthActivity']=speech_motion
            face['mouthEma']=float(prior.get('mouthEma',0.0))*.58+speech_motion*.42
            face['faceEma']=float(prior.get('faceEma',0.0))*.66+face_motion*.34
            face['stableSeen']=int(prior.get('stableSeen',0))+1
            tracks[best_id]={'x':face['x'],'y':face['y'],'area':face['area'],'seen':sample_index,'mouthEma':face['mouthEma'],'faceEma':face['faceEma'],'stableSeen':face['stableSeen'],'facePatch':face_patch,'mouthPatch':mouth_patch}
        tracks={k:v for k,v in tracks.items() if sample_index-v.get('seen',sample_index)<=7}
        max_faces=max(max_faces,len(faces)); total_faces+=len(faces)

        def speaker_score(f):
            continuity=.075 if f['id']==last_selected_id else 0.0
            stability=min(.14,float(f.get('stableSeen',0))*.018)
            return f.get('mouthEma',0.0)*13.5+f.get('faceEma',0.0)*1.4+f['area']*3.2+continuity+stability

        meaningful=[]
        if faces:
            max_area=max(f['area'] for f in faces)
            meaningful=[f for f in faces if f['area']>=max(.0016,max_area*.12)] or faces[:]
        ranked=sorted(meaningful,key=speaker_score,reverse=True)
        selected=None; effective_mode=args.mode; safe_frame=False; spread_x=0.0; speaker_confidence=.0

        if ranked:
            top=ranked[0]; second=ranked[1] if len(ranked)>1 else None
            current=next((f for f in ranked if f['id']==last_selected_id),None)
            candidate=top
            if current is not None and candidate['id']!=current['id']:
                cand_score=speaker_score(candidate); cur_score=speaker_score(current)
                decisive=(candidate.get('mouthEma',0.0)>=current.get('mouthEma',0.0)+.0025 and cand_score>=cur_score*1.08)
                very_decisive=(candidate.get('mouthEma',0.0)>=current.get('mouthEma',0.0)+.0080 and cand_score>=cur_score*1.20)
                if decisive:
                    if challenger_id==candidate['id']: challenger_streak+=1
                    else: challenger_id=candidate['id']; challenger_streak=1
                    if challenger_streak<2 and not very_decisive: candidate=current
                else:
                    challenger_id=None; challenger_streak=0; candidate=current
            else:
                challenger_id=None; challenger_streak=0

            top_score=speaker_score(candidate)
            other=max([speaker_score(f) for f in ranked if f['id']!=candidate['id']] or [0.0])
            margin=max(0.0,top_score-other)
            speech_signal=float(candidate.get('mouthEma',0.0))
            stability=min(1.0,float(candidate.get('stableSeen',0))/5.0)
            speaker_confidence=clamp(.18+speech_signal*12.0+margin*.85+stability*.18)

            if args.mode=='center':
                selected={'id':candidate['id'],'x':.5,'y':candidate['y'],'w':candidate['w'],'h':candidate['h'],'area':candidate['area'],'faceEma':candidate.get('faceEma',0.0),'mouthEma':candidate.get('mouthEma',0.0)}
                effective_mode='center'
            elif args.mode=='split' and len(ranked)>=2:
                top2=ranked[:2]; xs=[f['x'] for f in top2]; spread_x=max(xs)-min(xs)
                selected={'id':-1,'x':sum(f['x'] for f in top2)/2,'y':sum(f['y'] for f in top2)/2,'w':spread_x+max(f['w'] for f in top2),'h':max(f['h'] for f in top2),'area':sum(f['area'] for f in top2),'faceEma':max(f.get('faceEma',0) for f in top2),'mouthEma':max(f.get('mouthEma',0) for f in top2)}
                effective_mode='group'; safe_frame=spread_x>.22
            elif args.mode in ('auto','speaker'):
                # Speaker-first: crop the detected active speaker whenever the lip signal is usable.
                # Only fall back to a group/wide view when multiple people are present and identity is ambiguous.
                if len(ranked)>=2 and speaker_confidence<.30:
                    top_group=sorted(ranked,key=lambda f:f['area'],reverse=True)[:3]
                    xs=[f['x'] for f in top_group]; spread_x=max(xs)-min(xs)
                    weight=sum(max(.001,f['area']) for f in top_group)
                    selected={'id':-1,'x':sum(f['x']*max(.001,f['area']) for f in top_group)/weight,'y':sum(f['y']*max(.001,f['area']) for f in top_group)/weight,'w':spread_x+max(f['w'] for f in top_group),'h':max(f['h'] for f in top_group),'area':sum(f['area'] for f in top_group),'faceEma':max(f.get('faceEma',0) for f in top_group),'mouthEma':max(f.get('mouthEma',0) for f in top_group)}
                    effective_mode='group'; safe_frame=spread_x>.20 or len(top_group)>=3; group_frames+=1
                else:
                    selected=candidate; effective_mode='speaker'; speaker_frames+=1
                    # One active speaker should be re-centered rather than abandoned for a wide frame.
                    safe_frame=False
        else:
            safe_frame=True; speaker_confidence=.0

        if selected:
            target_x=clamp(selected['x'],.045,.955)
            # Slightly below the face center preserves head room and upper body in vertical crops.
            target_y=clamp(float(selected['y'])+.075,.18,.84)
            selected_id=int(selected.get('id',-1))
            changed=effective_mode=='speaker' and selected_id>0 and last_selected_id and selected_id!=last_selected_id
            move_alpha=.76 if changed else base_alpha
            smooth_x += (target_x-smooth_x)*move_alpha
            smooth_y += (target_y-smooth_y)*min(.52,move_alpha)
            if changed:
                speaker_switches+=1
                speaker_switch_times.append(round(t_rel,3))
            if effective_mode=='speaker' and selected_id>0: last_selected_id=selected_id
            reaction=clamp(float(selected.get('faceEma',0.0))*6.8)
            confidence=clamp(.36+float(selected.get('area',0.0))*5.0+speaker_confidence*.46)
            if effective_mode=='group': confidence=max(confidence,.64)
            face_w=float(selected.get('w',0.0)); face_h=float(selected.get('h',0.0))
        else:
            smooth_x += (.5-smooth_x)*min(base_alpha,.18); smooth_y += (.44-smooth_y)*min(base_alpha,.18)
            selected_id=None; reaction=0.0; confidence=.10; face_w=0.0; face_h=0.0

        confidence_sum+=speaker_confidence
        if reaction>=.34 and t_rel-last_reaction_t>=1.8:
            reaction_peaks.append({'time':round(t_rel,3),'score':round(reaction,3)}); last_reaction_t=t_rel
        keyframes.append({'time':round(t_rel,3),'x':round(float(smooth_x),5),'y':round(float(smooth_y),5),'faceCount':len(faces),'activeFaceId':selected_id,'faceWidth':round(face_w,5),'faceHeight':round(face_h,5),'mouthActivity':round(float(selected.get('mouthEma',0.0) if selected else 0.0),5),'reaction':round(reaction,4),'confidence':round(confidence,4),'speakerConfidence':round(speaker_confidence,4),'mode':effective_mode,'safeFrame':bool(safe_frame),'spreadX':round(float(spread_x),4)})
        sample_index+=1; frame_idx+=sample_frames

    cap.release()
    summary={'samples':len(keyframes),'facesDetected':total_faces,'faceCountMax':max_faces,'speakerSwitches':speaker_switches,'reactionPeaks':len(reaction_peaks),'reactionPeakTimes':reaction_peaks[:24],'mode':args.mode,'movement':args.movement,'safeFrames':sum(1 for f in keyframes if f.get('safeFrame')),'speakerFocusedFrames':speaker_frames,'groupFrames':group_frames,'averageSpeakerConfidence':round(confidence_sum/max(1,len(keyframes)),4),'speakerSwitchTimes':speaker_switch_times[:40],'engine':'opencv-speaker-reframe-v4'}
    emit({'ok':True,'keyframes':keyframes,'summary':summary}); return 0


if __name__=='__main__':
    raise SystemExit(main())
