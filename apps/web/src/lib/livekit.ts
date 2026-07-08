import 'server-only'
import { randomBytes } from 'node:crypto'
import { AccessToken } from 'livekit-server-sdk'
import { env } from '@/lib/env'

export async function createRoomToken(
  roomName: string,
  userId: string,
  userName: string,
  isHost: boolean,
): Promise<string> {
  const token = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
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

export function generateInviteSlug(): string {
  return randomBytes(6).toString('base64url')
}
