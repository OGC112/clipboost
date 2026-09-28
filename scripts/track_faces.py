import argparse, json, math, os, sys


def emit(payload):
    sys.stdout.write(json.dumps(payload, ensure_ascii=False))
    sys.stdout.flush()


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

    start = max(0.0, args.start)
    end = max(start + 0.25, args.end)
    step = max(0.20, min(1.0, args.step))
    cap.set(cv2.CAP_PROP_POS_MSEC, start * 1000.0)

    cascade_path = os.path.join(cv2.data.haarcascades, 'haarcascade_frontalface_default.xml')
    detector = cv2.CascadeClassifier(cascade_path)
    if detector.empty():
        emit({'ok': False, 'error': 'OpenCV face detector is unavailable.', 'keyframes': [], 'summary': {'samples': 0, 'facesDetected': 0, 'faceCountMax': 0, 'speakerSwitches': 0, 'reactionPeaks': 0}})
        return 0

    resize_scale = min(1.0, 720.0 / max(src_w, src_h))
    work_w = max(1, int(round(src_w * resize_scale)))
    work_h = max(1, int(round(src_h * resize_scale)))
    sample_frames = max(1, int(round(step * fps)))

    prev_gray = None
    tracks = {}
    next_id = 1
    last_selected_id = None
    speaker_switches = 0
    keyframes = []
    reaction_peaks = []
    last_reaction_t = -99.0
    total_faces = 0
    max_faces = 0
    sample_index = 0
    smooth_x, smooth_y = 0.5, 0.42
    alpha = {'low': 0.18, 'balanced': 0.32, 'high': 0.52}[args.movement]

    frame_idx = int(round(start * fps))
    end_frame = int(round(end * fps))

    while frame_idx <= end_frame:
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
        ok, frame = cap.read()
        if not ok or frame is None:
            break
        t_abs = frame_idx / fps
        t_rel = max(0.0, t_abs - start)

        if resize_scale < 0.999:
            frame = cv2.resize(frame, (work_w, work_h), interpolation=cv2.INTER_AREA)
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        gray = cv2.equalizeHist(gray)

        min_face = max(30, int(min(work_w, work_h) * 0.075))
        raw_faces = detector.detectMultiScale(gray, scaleFactor=1.12, minNeighbors=5, minSize=(min_face, min_face))
        faces = []
        for (x, y, w, h) in raw_faces:
            cx = (x + w / 2) / work_w
            cy = (y + h / 2) / work_h
            area = (w * h) / float(work_w * work_h)
            activity = 0.0
            if prev_gray is not None:
                # Mouth/lower-face motion is a useful local proxy for the active speaker.
                mx1 = max(0, int(x + w * 0.12)); mx2 = min(work_w, int(x + w * 0.88))
                my1 = max(0, int(y + h * 0.48)); my2 = min(work_h, int(y + h * 0.95))
                if mx2 > mx1 + 4 and my2 > my1 + 4:
                    a = gray[my1:my2, mx1:mx2]
                    b = prev_gray[my1:my2, mx1:mx2]
                    if a.size and b.size and a.shape == b.shape:
                        activity = float(np.mean(cv2.absdiff(a, b))) / 255.0
            faces.append({'rect': (int(x), int(y), int(w), int(h)), 'x': float(cx), 'y': float(cy), 'area': float(area), 'activity': float(activity)})

        # Lightweight identity continuity by nearest previous face center.
        available_ids = set(tracks.keys())
        for face in sorted(faces, key=lambda f: f['area'], reverse=True):
            best_id = None; best_dist = 999.0
            for track_id in list(available_ids):
                tx, ty = tracks[track_id]['x'], tracks[track_id]['y']
                dist = math.hypot(face['x'] - tx, face['y'] - ty)
                if dist < best_dist and dist < 0.22:
                    best_id, best_dist = track_id, dist
            if best_id is None:
                best_id = next_id; next_id += 1
            else:
                available_ids.discard(best_id)
            face['id'] = best_id
            tracks[best_id] = {'x': face['x'], 'y': face['y'], 'seen': sample_index}

        # Drop very old tracks.
        tracks = {k:v for k,v in tracks.items() if sample_index - v.get('seen', sample_index) <= 8}
        max_faces = max(max_faces, len(faces))
        total_faces += len(faces)

        selected = None
        mode = args.mode
        ranked_faces = sorted(faces, key=lambda f: (f['area'] + f['activity'] * 0.9), reverse=True)
        effective_mode = mode
        if mode == 'auto':
            meaningful_pair = (
                len(ranked_faces) >= 2
                and ranked_faces[1]['area'] >= max(0.0035, ranked_faces[0]['area'] * 0.30)
            )
            effective_mode = 'split' if meaningful_pair else 'speaker'
        if faces:
            if effective_mode == 'split' and len(ranked_faces) >= 2:
                top = ranked_faces[:2]
                selected = {
                    'id': -1,
                    'x': sum(f['x'] for f in top) / len(top),
                    'y': sum(f['y'] for f in top) / len(top),
                    'area': sum(f['area'] for f in top),
                    'activity': max(f['activity'] for f in top),
                    'splitIds': [f['id'] for f in top]
                }
            else:
                def score(f):
                    center_bonus = 1.0 - min(1.0, abs(f['x'] - 0.5) * 1.6)
                    if effective_mode == 'speaker':
                        return f['activity'] * 4.2 + f['area'] * 7.0 + center_bonus * 0.22
                    return f['area'] * 7.5 + center_bonus * 0.65
                selected = max(faces, key=score)

        if selected:
            target_x = min(0.94, max(0.06, float(selected['x'])))
            # Slight headroom: center a little below face center so forehead is not clipped.
            target_y = min(0.82, max(0.20, float(selected['y']) + 0.055))
            smooth_x = smooth_x + (target_x - smooth_x) * alpha
            smooth_y = smooth_y + (target_y - smooth_y) * alpha
            selected_id = int(selected.get('id', -1))
            if effective_mode == 'speaker' and selected_id > 0 and last_selected_id and selected_id != last_selected_id:
                speaker_switches += 1
            if selected_id > 0:
                last_selected_id = selected_id
            reaction = float(min(1.0, selected.get('activity', 0.0) * 8.0))
            confidence = float(min(1.0, 0.45 + selected.get('area', 0.0) * 5.0 + min(0.25, selected.get('activity', 0.0) * 1.5)))
        else:
            # No face: ease back to safe center rather than jumping.
            smooth_x = smooth_x + (0.5 - smooth_x) * min(alpha, 0.20)
            smooth_y = smooth_y + (0.44 - smooth_y) * min(alpha, 0.20)
            selected_id = None
            reaction = 0.0
            confidence = 0.18

        if reaction >= 0.34 and t_rel - last_reaction_t >= 1.8:
            reaction_peaks.append({'time': round(t_rel, 3), 'score': round(reaction, 3)})
            last_reaction_t = t_rel

        keyframes.append({
            'time': round(t_rel, 3),
            'x': round(float(smooth_x), 5),
            'y': round(float(smooth_y), 5),
            'faceCount': len(faces),
            'activeFaceId': selected_id,
            'activity': round(float(selected.get('activity', 0.0) if selected else 0.0), 5),
            'reaction': round(reaction, 4),
            'confidence': round(confidence, 4),
            'mode': effective_mode
        })

        prev_gray = gray
        sample_index += 1
        frame_idx += sample_frames

    cap.release()

    summary = {
        'samples': len(keyframes),
        'facesDetected': total_faces,
        'faceCountMax': max_faces,
        'speakerSwitches': speaker_switches,
        'reactionPeaks': len(reaction_peaks),
        'reactionPeakTimes': reaction_peaks[:24],
        'mode': args.mode,
        'movement': args.movement,
        'engine': 'opencv-haar-motion-v1'
    }
    emit({'ok': True, 'keyframes': keyframes, 'summary': summary})
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
