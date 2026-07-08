/** Ambient types when livekit packages are not yet installed (TLS/network). */
declare module 'livekit-server-sdk' {
  export class AccessToken {
    constructor(apiKey: string, apiSecret: string, options?: { identity?: string; name?: string })
    addGrant(grant: Record<string, unknown>): void
    toJwt(): Promise<string>
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
    controls?: {
      microphone?: boolean
      camera?: boolean
      screenShare?: boolean
      chat?: boolean
      leave?: boolean
    }
  }): ReactNode
  export function useTracks(sources: unknown[]): unknown[]
}

declare module 'livekit-client' {
  export enum MediaDeviceFailure {
    PermissionDenied = 'PermissionDenied',
    NotFound = 'NotFound',
    DeviceInUse = 'DeviceInUse',
  }

  export namespace Track {
    enum Source {
      Camera = 'camera',
      Microphone = 'microphone',
      ScreenShare = 'screen_share',
    }
  }
}
