import { RtcTokenBuilder, RtcRole } from 'agora-token';
import { config } from '../config/env.js';

export interface AgoraTokenResponse {
  appId: string;
  channelName: string;
  token: string;
  uid: number | string;
  expiresInSeconds: number;
}

export function generateAgoraToken(
  channelName: string,
  uid: number = 0,
  role: 'publisher' | 'subscriber' = 'publisher',
  expireTimeInSeconds: number = 7200
): AgoraTokenResponse {
  const appId = config.agora.appId;
  const appCertificate = config.agora.appCertificate;

  // If no certificate configured, Agora runs in testing mode without token
  if (!appCertificate || !appId) {
    return {
      appId,
      channelName,
      token: '',
      uid,
      expiresInSeconds: expireTimeInSeconds,
    };
  }

  const token = RtcTokenBuilder.buildTokenWithUidAndPrivilege(
    appId,
    appCertificate,
    channelName,
    uid,
    expireTimeInSeconds, // tokenExpire
    expireTimeInSeconds, // joinChannelPrivilegeExpire
    expireTimeInSeconds, // pubAudioPrivilegeExpire
    expireTimeInSeconds, // pubVideoPrivilegeExpire
    expireTimeInSeconds  // pubDataStreamPrivilegeExpire
  );

  return {
    appId,
    channelName,
    token,
    uid,
    expiresInSeconds: expireTimeInSeconds,
  };
}
