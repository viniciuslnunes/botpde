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
    listParticipants(room: string): Promise<
      Array<{
        identity: string
        permission?: { canPublishSources?: number[] }
        tracks?: Array<{ sid?: string; source?: number }>
      }>
    >
    updateParticipant(
      room: string,
      identity: string,
      metadata?: string,
      permission?: Record<string, unknown>,
    ): Promise<unknown>
    mutePublishedTrack(
      room: string,
      identity: string,
      trackSid: string,
      muted: boolean,
    ): Promise<unknown>
    deleteRoom(room: string): Promise<void>
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
    options?: Record<string, unknown>
    className?: string
    children?: ReactNode
    onConnected?: () => void
    onDisconnected?: () => void
    onMediaDeviceFailure?: (failure: MediaDeviceFailure) => void
    onError?: (error: Error) => void
  }): ReactNode

  export function LayoutContextProvider(props: {
    value?: unknown
    children?: ReactNode
  }): ReactNode
  export function FocusLayoutContainer(props: {
    className?: string
    children?: ReactNode
  }): ReactNode
  export function FocusLayout(props: {
    trackRef?: unknown
    className?: string
  }): ReactNode
  export function CarouselLayout(props: {
    tracks: unknown[]
    className?: string
    orientation?: 'vertical' | 'horizontal'
    children?: ReactNode
  }): ReactNode
  export function useCreateLayoutContext(): unknown
  export function useLayoutContext(): unknown
  export function usePinnedTracks(layoutContext?: unknown): unknown[]
  export function isTrackReference(track: unknown): boolean

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
  export function useTracks(
    sources: unknown[],
    options?: { onlySubscribed?: boolean; updateOnlyOn?: unknown[] },
  ): unknown[]
  export function useTrackToggle(props: { source: unknown }): {
    buttonProps: Record<string, unknown>
    enabled: boolean
  }
  export function useLocalParticipant(): { localParticipant: import('livekit-client').LocalParticipant }
  export function useRoomContext(): import('livekit-client').Room
}
