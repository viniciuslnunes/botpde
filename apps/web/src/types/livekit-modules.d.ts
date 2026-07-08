/** Ambient types when livekit packages are not yet installed (TLS/network). */
declare module 'livekit-server-sdk' {
  export class AccessToken {
    constructor(apiKey: string, apiSecret: string, options?: { identity?: string; name?: string })
    addGrant(grant: Record<string, unknown>): void
    toJwt(): Promise<string>
  }
}

declare module '@livekit/components-react' {
  import type { ReactNode } from 'react'
  export function LiveKitRoom(props: {
    token: string
    serverUrl: string
    connect?: boolean
    video?: boolean
    audio?: boolean
    className?: string
    children?: ReactNode
  }): ReactNode
  export function VideoConference(): ReactNode
  export function RoomAudioRenderer(): ReactNode
}

declare module 'livekit-client' {
  export type Room = unknown
}
