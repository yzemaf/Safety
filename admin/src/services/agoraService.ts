import AgoraRTC from 'agora-rtc-sdk-ng';
import type { IAgoraRTCClient, IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';

class AgoraService {
  private client: IAgoraRTCClient | null = null;
  private localAudioTrack: IMicrophoneAudioTrack | null = null;
  private isJoined = false;

  public async joinVoiceCall(
    appId: string,
    channelName: string,
    token: string | null = null,
    uid: string | number = Math.floor(Math.random() * 10000)
  ): Promise<{ success: boolean; error?: string }> {
    if (!appId) {
      console.warn('Agora App ID not provided. Running in simulated voice link mode.');
      this.isJoined = true;
      return { success: true };
    }

    try {
      this.client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });

      this.client.on('user-published', async (user, mediaType) => {
        await this.client?.subscribe(user, mediaType);
        if (mediaType === 'audio') {
          user.audioTrack?.play();
        }
      });

      await this.client.join(appId, channelName, token || null, uid);

      try {
        this.localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
        await this.client.publish([this.localAudioTrack]);
      } catch (micErr) {
        console.warn('Microphone permission not granted or device unavailable:', micErr);
      }

      this.isJoined = true;
      return { success: true };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown Agora error';
      console.error('Failed to join Agora audio call:', err);
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
      console.error('Error leaving Agora call:', err);
    } finally {
      this.isJoined = false;
    }
  }

  public isCallActive(): boolean {
    return this.isJoined;
  }
}

export const agoraService = new AgoraService();
