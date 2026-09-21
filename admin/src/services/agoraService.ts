import AgoraRTC from 'agora-rtc-sdk-ng';
import type { IAgoraRTCClient, IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';

class AgoraService {
  private client: IAgoraRTCClient | null = null;
  private localAudioTrack: IMicrophoneAudioTrack | null = null;
  private isJoined = false;
  // Timestamp (ms) when we last successfully joined a channel.
  // Used to filter ghost `user-left` events that arrive within the first few
  // seconds of a new channel join (left-overs from a previous call session).
  private joinedAt = 0;
  private static readonly GHOST_EVENT_GRACE_MS = 3500;

  public async joinVoiceCall(
    appId: string,
    channelName: string,
    token: string | null = null,
    uid: string | number = 1,
    callbacks?: {
      onRemoteJoined?: (remoteUid: string | number) => void;
      onRemoteLeft?: (remoteUid: string | number) => void;
    }
  ): Promise<{ success: boolean; error?: string }> {
    if (!appId) {
      console.warn('[Agora Web] App ID not provided. Running in simulated voice link mode.');
      this.isJoined = true;
      return { success: true };
    }

    // Bug 2 fix: always tear down any existing session before creating a new
    // client. Without this, the old client's event listeners fire alongside the
    // new ones and can trigger phantom `user-left → call ended` transitions.
    if (this.isJoined || this.client) {
      console.log('[Agora Web] Existing client detected — tearing down before new join.');
      await this.leaveCall();
    }

    try {
      // Create a fresh client for each call so event listeners are clean.
      this.client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });

      // Bug 1 fix: `user-published` is the only reliable event that tells us
      // audio is actually available. Subscribe there and THEN notify the caller.
      // `user-joined` fires as soon as the remote peer enters the channel —
      // before any media is published — so we must NOT trigger "connected" from it.
      this.client.on('user-published', async (user, mediaType) => {
        console.log('[Agora Web] user-published event — remote UID:', user.uid, 'mediaType:', mediaType);
        try {
          await this.client?.subscribe(user, mediaType);
          if (mediaType === 'audio') {
            console.log('[Agora Web] Subscribed & playing remote audio for UID:', user.uid);
            user.audioTrack?.play();
            // Only notify "joined" here, after audio is confirmed live.
            callbacks?.onRemoteJoined?.(user.uid);
          }
        } catch (subErr) {
          console.error('[Agora Web] Error subscribing to remote audio:', subErr);
        }
      });

      // Bug 1 fix: do NOT call onRemoteJoined here — audio isn't published yet.
      this.client.on('user-joined', (user) => {
        console.log('[Agora Web] Remote peer joined channel (audio not yet published), UID:', user.uid);
        // Intentionally not calling onRemoteJoined here.
      });

      // Bug 5 fix: ignore `user-left` events that arrive within the grace
      // window right after we joined. These are ghost events from a previous
      // call session whose channel teardown propagated with network delay.
      this.client.on('user-left', (user) => {
        const msSinceJoin = Date.now() - this.joinedAt;
        if (msSinceJoin < AgoraService.GHOST_EVENT_GRACE_MS) {
          console.warn(
            `[Agora Web] Ignoring ghost user-left for UID ${user.uid} (only ${msSinceJoin}ms after join — grace window).`
          );
          return;
        }
        console.log('[Agora Web] Remote peer left audio room, UID:', user.uid);
        callbacks?.onRemoteLeft?.(user.uid);
      });

      console.log('[Agora Web] Joining channel:', channelName, 'uid:', uid, 'token present:', Boolean(token));
      await this.client.join(appId, channelName, token || null, uid);
      // Record join time so the grace window starts from the right moment.
      this.joinedAt = Date.now();

      try {
        this.localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
        this.localAudioTrack.setEnabled(true);
        await this.client.publish([this.localAudioTrack]);
        console.log('[Agora Web] Admin dispatcher microphone published successfully.');
      } catch (micErr) {
        console.warn('[Agora Web] Microphone not available or permission denied:', micErr);
      }

      this.isJoined = true;
      return { success: true };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown Agora error';
      console.error('[Agora Web] Failed to join audio call:', err);
      return { success: false, error: errorMsg };
    }
  }

  public async toggleMute(mute: boolean): Promise<void> {
    if (this.localAudioTrack) {
      await this.localAudioTrack.setEnabled(!mute);
    }
  }

  public async leaveCall(): Promise<void> {
    try {
      if (this.localAudioTrack) {
        this.localAudioTrack.stop();
        this.localAudioTrack.close();
        this.localAudioTrack = null;
      }
      if (this.client) {
        await this.client.leave();
        this.client = null;
      }
    } catch (err) {
      console.error('[Agora Web] Error leaving call:', err);
    } finally {
      this.isJoined = false;
      this.joinedAt = 0;
    }
  }

  public isCallActive(): boolean {
    return this.isJoined;
  }
}

export const agoraService = new AgoraService();
