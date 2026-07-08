/** Ambient types when livekit packages are not yet installed (TLS/network). */
declare module 'livekit-server-sdk' {
  export class AccessToken {
    constructor(apiKey: string, apiSecret: string, options?: { identity?: string; name?: string })
    addGrant(grant: Record<string, unknown>): void
    toJwt(): Promise<string>
  }

  export enum TrackSource {
    UNKNOWN = 0,
    CAMERA = 1,
    MICROPHONE = 2,
    SCREEN_SHARE = 3,
    SCREEN_SHARE_AUDIO = 4,
  }

  export class RoomServiceClient {
    constructor(host: string, apiKey: string, apiSecret: string)
    listParticipants(room: string): Promise<Array<{ identity: string; permission?: { canPublishSources?: number[] } }>>
    updateParticipant(
      room: string,
      identity: string,
      metadata?: string,
      permission?: Record<string, unknown>,
    ): Promise<unknown>
  }
}

declare module '@livekit/components-styles'

declare module '@livekit/components-react' {
  import type { ReactNode } from 'react'
  import type { MediaDeviceFailure } from 'livekit-client'

  export function LiveKitRoom(props: {
    token: string
    serverUrl: string
    connect?: boolean
    video?: boolean
    audio?: boolean
    className?: string
    children?: ReactNode
    onConnected?: () => void
    onDisconnected?: () => void
    onMediaDeviceFailure?: (failure: MediaDeviceFailure) => void
    onError?: (error: Error) => void
  }): ReactNode

  export function VideoConference(): ReactNode
  export function RoomAudioRenderer(): ReactNode
  export function GridLayout(props: {
    tracks: unknown[]
    className?: string
    children?: ReactNode
  }): ReactNode
  export function ParticipantTile(): ReactNode
  export function ControlBar(props: {
    className?: string
    controls?: Record<string, boolean>
  }): ReactNode
  export function TrackToggle(props: {
    source: unknown
    className?: string
    children?: ReactNode
  }): ReactNode
  export function useTracks(sources: unknown[]): unknown[]
  export function useLocalParticipant(): { localParticipant: import('livekit-client').LocalParticipant }
  export function useRoomContext(): import('livekit-client').Room
}
