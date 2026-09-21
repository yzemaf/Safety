import React, { useState, useEffect, useRef } from 'react';
import { Phone, PhoneOff, Mic, MicOff, ShieldAlert, Navigation, Radio, PhoneCall } from 'lucide-react';
import type { SafetySession } from '../types';
import { agoraService } from '../services/agoraService';
import { apiService } from '../services/apiService';
import { subscribeToCallStatus } from '../services/firebaseService';

interface EmergencyCallModalProps {
  session: SafetySession;
  agoraAppId: string;
  onClose: () => void;
}

export const EmergencyCallModal: React.FC<EmergencyCallModalProps> = ({
  session,
  agoraAppId,
  onClose,
}) => {
  const [callStatus, setCallStatus] = useState<'initiating' | 'ringing' | 'connected' | 'declined' | 'ended' | 'error'>('initiating');
  const [isMuted, setIsMuted] = useState(false);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const durationTimerRef = useRef<number | null>(null);
  const callCredentialsRef = useRef<{ appId: string; channelName: string; token: string | null; uid: number }>({
    appId: '',
    channelName: '',
    token: null,
    uid: 1,
  });
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const isExplicitlyEndingRef = useRef(false);
  // StrictMode guard: React 18 StrictMode in dev fires useEffect → cleanup → useEffect
  // immediately. Without this guard, the cleanup writes 'ended' to Firestore ~50ms after
  // the first mount, killing the ringing call on the mobile before the user can answer.
  // We only call endCall if the call has been active for > 2 seconds (real unmount).
  const callDispatchedAtRef = useRef<number>(0);
  // Stable ref for resolvedUserId so cleanup closures always read the latest value.
  // Declared before the computed resolvedUserId so the assignment on the next line is valid.
  const resolvedUserIdRef = useRef<string>('');

  // Normalize userId — it can come as a plain string or an object with _id
  const resolvedUserId = typeof session.userId === 'object' && session.userId !== null
    ? ((session.userId as any)._id || (session.userId as any).id || String(session.userId))
    : (session.userId || '');
  // Keep ref in sync on every render so cleanup closures always see the latest value
  resolvedUserIdRef.current = resolvedUserId;

  useEffect(() => {
    let isCancelled = false;
    let unsubFirebaseCall: (() => void) | null = null;
    let statusPollTimer: number | null = null;
    const callStartTime = Date.now();

    const handleCallStatusUpdate = (status: string, data?: any) => {
      if (isCancelled) return;
      console.log('[EmergencyCallModal] handleCallStatusUpdate:', status, data);

      // Protect against stale snapshots belonging to previous calls
      if (data?.channelName && callCredentialsRef.current.channelName && data.channelName !== callCredentialsRef.current.channelName) {
        console.log('[EmergencyCallModal] Ignoring signal from older call channel:', data.channelName, 'expected:', callCredentialsRef.current.channelName);
        return;
      }

      if (data?.updatedAt) {
        const updateMs = new Date(data.updatedAt).getTime();
        if (updateMs < callStartTime - 1000) {
          console.log('[EmergencyCallModal] Ignoring stale signal from past call timestamp:', data.updatedAt);
          return;
        }
      }

      if (status === 'accepted' || status === 'connected') {
        setCallStatus('connected');
        if (!durationTimerRef.current) {
          durationTimerRef.current = window.setInterval(() => {
            setDurationSeconds((s) => s + 1);
          }, 1000);
        }
      } else if (status === 'declined') {
        if (durationTimerRef.current) {
          clearInterval(durationTimerRef.current);
          durationTimerRef.current = null;
        }
        setCallStatus('declined');
        agoraService.leaveCall();
        setTimeout(() => {
          if (!isCancelled) onCloseRef.current();
        }, 1500);
      } else if (status === 'ended') {
        if (durationTimerRef.current) {
          clearInterval(durationTimerRef.current);
          durationTimerRef.current = null;
        }
        setCallStatus('ended');
        agoraService.leaveCall();
        setTimeout(() => {
          if (!isCancelled) onCloseRef.current();
        }, 1000);
      }
    };

    const startCallFlow = async () => {
      console.log('[EmergencyCallModal] Dispatching call to user:', resolvedUserId, '(session:', session.id, ')');
      setCallStatus('initiating');

      // Call the user directly — no session ID dependency
      const callRes = await apiService.initiateCall(resolvedUserId, 'Safety Command Dispatcher', 'Control Room Officer');
      
      console.log('[EmergencyCallModal] Backend initiateCall response:', callRes);

      if (isCancelled) return;

      if (!callRes.success) {
        console.error('[EmergencyCallModal] initiateCall error:', callRes.error);
        setCallStatus('error');
        setErrorMessage(callRes.error || 'Failed to dispatch call signal');
        return;
      }

      // Mark call as dispatched — used by cleanup to distinguish real unmounts
      // from React StrictMode synthetic cleanup/remount cycles.
      callDispatchedAtRef.current = Date.now();

      const effectiveAppId = callRes.appId || agoraAppId;
      const effectiveChannel = callRes.channelName || `safety_call_${resolvedUserId}_${Date.now()}`;
      const token = callRes.adminToken || null;
      const uid = callRes.adminUid || 1;
      // Use the real sessionId returned by the backend (may differ from session.id which can be fake)
      const resolvedSessionId = (callRes as any).sessionId || session.id;

      callCredentialsRef.current = {
        appId: effectiveAppId,
        channelName: effectiveChannel,
        token,
        uid,
      };

      setCallStatus('ringing');

      // 2. Admin IMMEDIATELY joins the Agora RTC audio room as host (UID 1)
      console.log('[EmergencyCallModal] Joining Agora channel:', effectiveChannel, 'uid:', uid);
      agoraService.joinVoiceCall(effectiveAppId, effectiveChannel, token, uid, {
        onRemoteJoined: (remoteUid) => {
          console.log('[EmergencyCallModal] Citizen joined Agora RTC voice link, remote UID:', remoteUid);
          handleCallStatusUpdate('connected');
        },
        onRemoteLeft: (remoteUid) => {
          console.log('[EmergencyCallModal] Citizen left Agora RTC voice link, remote UID:', remoteUid);
          handleCallStatusUpdate('ended');
        },
      }).then((joinRes) => {
        console.log('[EmergencyCallModal] Agora joinVoiceCall result:', joinRes);
      }).catch((err) => {
        console.warn('[EmergencyCallModal] Agora join warning:', err);
      });

      // 3. Multi-path Real-time Firebase subscription — keyed on resolvedUserId and
      // the backend-returned sessionId (not the potentially-fake session.id).
      unsubFirebaseCall = subscribeToCallStatus(resolvedSessionId, resolvedUserId, (status, data) => {
        console.log('[EmergencyCallModal] Firebase RTDB call status update:', status, data);
        handleCallStatusUpdate(status, data);
      });

      // 4. Fallback Polling (every 2.5s)
      statusPollTimer = window.setInterval(async () => {
        if (isCancelled) return;
        const res = await apiService.getCallStatus(session.id);
        if (res?.status && res.status !== 'idle' && res.status !== 'ringing') {
          console.log('[EmergencyCallModal] Poll status update:', res.status);
          handleCallStatusUpdate(res.status);
        }
      }, 2500);
    };

    startCallFlow();

    return () => {
      isCancelled = true;
      if (unsubFirebaseCall) unsubFirebaseCall();
      if (statusPollTimer) clearInterval(statusPollTimer);
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
        durationTimerRef.current = null;
      }
      // Clean up Agora RTC and signal call end if still active
      agoraService.leaveCall();
      if (callDispatchedAtRef.current && !isExplicitlyEndingRef.current) {
        apiService.endCall(resolvedUserIdRef.current, session.id).catch(() => {});
      }
    };
  }, [session.id, session.userId, agoraAppId]);

  const handleToggleMute = async () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    await agoraService.toggleMute(nextMuted);
  };

  const handleEndCall = async () => {
    isExplicitlyEndingRef.current = true;
    if (durationTimerRef.current) clearInterval(durationTimerRef.current);
    await agoraService.leaveCall();
    await apiService.endCall(resolvedUserId, session.id);
    setCallStatus('ended');
    setTimeout(() => onClose(), 400);
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  const gmapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${session.currentLocation.lat},${session.currentLocation.lng}`;

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ width: '420px', padding: '1.5rem', textAlign: 'center' }}>
        
        {/* Header Tag */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.2rem 0.6rem', backgroundColor: 'var(--alert-red-light)', color: 'var(--alert-red-dark)', border: '1px solid #FECACA', borderRadius: '2px', fontSize: '0.6875rem', fontWeight: 700, fontFamily: 'var(--font-mono)', marginBottom: '1.25rem' }}>
          <ShieldAlert size={12} />
          <span>EMERGENCY CALL</span>
        </div>

        {/* User Info */}
        <div style={{ marginBottom: '1.25rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.15rem' }}>
            {session.userName}
          </h2>
          <div style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
            {session.userPhone || 'No direct phone number'} • {(session.communityId || 'General').toUpperCase()}
          </div>
        </div>

        {/* Call Waveform Status */}
        <div style={{
          backgroundColor: 'var(--bg-subtle)',
          border: '1px solid var(--border-hairline)',
          borderRadius: '4px',
          padding: '1.25rem 1rem',
          marginBottom: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.5rem',
        }}>
          {callStatus === 'initiating' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-sub)', fontSize: '0.8125rem', fontFamily: 'var(--font-mono)' }}>
              <Radio size={14} className="animate-spin" />
              Dispatching call signal to mobile...
            </div>
          )}

          {callStatus === 'ringing' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#D97706', fontSize: '0.9375rem', fontWeight: 700 }}>
                <PhoneCall size={16} className="animate-bounce" />
                Ringing citizen's mobile app...
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Waiting for citizen to answer or auto-connect
              </div>
            </div>
          )}

          {callStatus === 'connected' && (
            <>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent-green-dark)', fontFamily: 'var(--font-mono)' }}>
                {formatTime(durationSeconds)}
              </div>
            
            </>
          )}

          {callStatus === 'declined' && (
            <div style={{ color: 'var(--alert-red-dark)', fontSize: '0.875rem', fontWeight: 600 }}>
              Call Declined by Citizen
            </div>
          )}

          {callStatus === 'ended' && (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', fontFamily: 'var(--font-mono)' }}>
              Call Ended
            </div>
          )}

          {callStatus === 'error' && (
            <div style={{ color: 'var(--alert-red-dark)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
              {errorMessage}
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
          {session.userPhone && (
            <a
              href={`tel:${session.userPhone}`}
              className="btn btn-outline"
              style={{ flex: 1, fontSize: '0.75rem' }}
            >
              <Phone size={12} />
              <span>Cellular Call</span>
            </a>
          )}

          <a
            href={gmapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-outline"
            style={{ flex: 1, fontSize: '0.75rem' }}
          >
            <Navigation size={12} />
            <span>GPS Route</span>
          </a>
        </div>

        {/* Hangup / Mute Controls */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem' }}>
          <button
            onClick={handleToggleMute}
            disabled={callStatus !== 'connected'}
            className="btn btn-outline"
            style={{
              padding: '0.5rem 0.85rem',
              backgroundColor: isMuted ? 'var(--alert-amber-light)' : '#FFFFFF',
              borderColor: isMuted ? '#FDE68A' : 'var(--border-hairline)',
              color: isMuted ? '#B45309' : 'var(--text-main)',
            }}
          >
            {isMuted ? <MicOff size={14} /> : <Mic size={14} />}
            <span>{isMuted ? 'Unmute' : 'Mute'}</span>
          </button>

          <button
            onClick={handleEndCall}
            className="btn btn-danger"
            style={{ padding: '0.5rem 1rem' }}
          >
            <PhoneOff size={14} />
            <span>End Call</span>
          </button>
        </div>

      </div>
    </div>
  );
};
