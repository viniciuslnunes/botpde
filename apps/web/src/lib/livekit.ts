import 'server-only'
import { requireLiveKitConfig } from '@/lib/env'

export async function createRoomToken(
  roomName: string,
  userId: string,
  userName: string,
  isHost: boolean,
): Promise<string> {
  const { apiKey, apiSecret } = requireLiveKitConfig()
  const { AccessToken } = await import('livekit-server-sdk')
  const token = new AccessToken(apiKey, apiSecret, {
    identity: userId,
    name: userName,
  })

  token.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    roomAdmin: isHost,
  })

  return token.toJwt()
}
