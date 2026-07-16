import 'server-only'
import { requireLiveKitConfig } from '@/lib/env'

export type MidiaSalaKind = 'speak' | 'screen'

const SPEAK_SOURCES = [1, 2] as const
const SCREEN_SOURCES = [3, 4] as const

function sourcesForKind(kind: MidiaSalaKind): readonly number[] {
  return kind === 'speak' ? SPEAK_SOURCES : SCREEN_SOURCES
}

async function getRoomServiceClient() {
  const { url, apiKey, apiSecret } = requireLiveKitConfig()
  const { RoomServiceClient } = await import('livekit-server-sdk')
  return new RoomServiceClient(url, apiKey, apiSecret)
}

export async function grantParticipantMedia(
  roomName: string,
  identity: string,
  kind: MidiaSalaKind,
): Promise<void> {
  const client = await getRoomServiceClient()
  const { TrackSource } = await import('livekit-server-sdk')

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

export async function revokeParticipantMedia(
  roomName: string,
  identity: string,
  kind: MidiaSalaKind,
): Promise<void> {
  const client = await getRoomServiceClient()
  const { TrackSource } = await import('livekit-server-sdk')

  const participants = await client.listParticipants(roomName)
  const participant = participants.find((p) => p.identity === identity)
  if (!participant) return

  const revokeNums = sourcesForKind(kind)
  const currentSources = participant.permission?.canPublishSources ?? []
  const nextSources = currentSources.filter((s) => !revokeNums.includes(s))

  await client.updateParticipant(roomName, identity, undefined, {
    canPublish: nextSources.length > 0,
    canSubscribe: true,
    canPublishData: true,
    canPublishSources: nextSources,
  })

  if (kind === 'screen') {
    const screenTracks = (participant.tracks ?? []).filter(
      (t) => t.source === TrackSource.SCREEN_SHARE || t.source === TrackSource.SCREEN_SHARE_AUDIO,
    )
    for (const track of screenTracks) {
      if (track.sid) {
        await client.mutePublishedTrack(roomName, identity, track.sid, true)
      }
    }
  }
}

export async function deleteLiveKitRoom(roomName: string): Promise<void> {
  const client = await getRoomServiceClient()
  try {
    await client.deleteRoom(roomName)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('not found') || message.includes('does not exist')) return
    throw error
  }
}
