import React, { useState, useEffect } from 'react';
import { Phone, PhoneOff, Mic, MicOff, ShieldAlert, Navigation } from 'lucide-react';
import type { SafetySession } from '../types';
import { agoraService } from '../services/agoraService';

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
  const [callStatus, setCallStatus] = useState<'connecting' | 'connected' | 'ended' | 'error'>('connecting');
  const [isMuted, setIsMuted] = useState(false);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let timer: number;
    let durationTimer: number;

    const startCall = async () => {
      const channel = session.agoraChannelName || `session-${session.id}`;
      const res = await agoraService.joinVoiceCall(agoraAppId, channel);
      if (res.success) {
        setCallStatus('connected');
        durationTimer = window.setInterval(() => {
          setDurationSeconds((s) => s + 1);
        }, 1000);
      } else {
        setCallStatus('error');
        setErrorMessage(res.error || 'Could not connect audio channel');
      }
    };

    timer = window.setTimeout(() => {
      startCall();
    }, 300);

    return () => {
      clearTimeout(timer);
      clearInterval(durationTimer);
      agoraService.leaveCall();
    };
  }, [session, agoraAppId]);

  const handleToggleMute = async () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    await agoraService.toggleMute(nextMuted);
  };

  const handleEndCall = async () => {
    await agoraService.leaveCall();
    setCallStatus('ended');
    setTimeout(() => {
      onClose();
    }, 400);
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  const gmapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${session.currentLocation.lat},${session.currentLocation.lng}`;

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ width: '400px', padding: '1.5rem', textAlign: 'center' }}>
        
        {/* Header Tag */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.2rem 0.6rem', backgroundColor: 'var(--alert-red-light)', color: 'var(--alert-red-dark)', border: '1px solid #FECACA', borderRadius: '2px', fontSize: '0.6875rem', fontWeight: 700, fontFamily: 'var(--font-mono)', marginBottom: '1.25rem' }}>
          <ShieldAlert size={12} />
          <span>IN-APP VOICE CALL</span>
        </div>

        {/* User Info */}
        <div style={{ marginBottom: '1.25rem' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.15rem' }}>
            {session.userName}
          </h2>
          <div style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
            {session.userPhone}
          </div>
        </div>

        {/* Call Waveform Status */}
        <div style={{
          backgroundColor: 'var(--bg-subtle)',
          border: '1px solid var(--border-hairline)',
          borderRadius: '2px',
          padding: '1rem',
          marginBottom: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.5rem',
        }}>
          {callStatus === 'connecting' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-sub)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--alert-amber)' }} />
              Connecting voice call...
            </div>
          )}

          {callStatus === 'connected' && (
            <>
              <div style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--accent-green-dark)', fontFamily: 'var(--font-mono)' }}>
                {formatTime(durationSeconds)}
              </div>
              <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                Voice call connected
              </div>
            </>
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
          <a
            href={`tel:${session.userPhone}`}
            className="btn btn-outline"
            style={{ flex: 1, fontSize: '0.75rem' }}
          >
            <Phone size={12} />
            <span>Phone Call</span>
          </a>

          <a
            href={gmapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-outline"
            style={{ flex: 1, fontSize: '0.75rem' }}
          >
            <Navigation size={12} />
            <span>Get Directions</span>
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
