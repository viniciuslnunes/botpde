import 'server-only'
import { requireLiveKitConfig } from '@/lib/env'

export type MidiaSalaKind = 'speak' | 'screen'

export async function grantParticipantMedia(
  roomName: string,
  identity: string,
  kind: MidiaSalaKind,
): Promise<void> {
  const { url, apiKey, apiSecret } = requireLiveKitConfig()
  const { RoomServiceClient, TrackSource } = await import('livekit-server-sdk')

  const client = new RoomServiceClient(url, apiKey, apiSecret)
  const participants = await client.listParticipants(roomName)
  const participant = participants.find((p) => p.identity === identity)
  const currentSources = participant?.permission?.canPublishSources ?? []

  const addedSources =
    kind === 'speak'
      ? [TrackSource.MICROPHONE, TrackSource.CAMERA]
      : [TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO]

  const mergedSources = [...new Set([...currentSources, ...addedSources])]

  await client.updateParticipant(roomName, identity, undefined, {
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    canPublishSources: mergedSources,
  })
}
