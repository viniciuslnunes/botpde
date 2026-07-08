export const SALA_MOD_TOPIC = 'sala-moderacao'

export type MidiaSalaKind = 'speak' | 'screen'

export type SalaModeracaoMessage =
  | {
      type: 'media_request'
      requestId: string
      userId: string
      userName: string
      kind: MidiaSalaKind
    }
  | {
      type: 'media_response'
      requestId: string
      userId: string
      approved: boolean
      kind: MidiaSalaKind
    }

export function encodeSalaModeracaoMessage(message: SalaModeracaoMessage): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(message))
}

export function decodeSalaModeracaoMessage(payload: Uint8Array): SalaModeracaoMessage | null {
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(payload))
    if (typeof parsed !== 'object' || parsed === null || !('type' in parsed)) return null
    return parsed as SalaModeracaoMessage
  } catch {
    return null
  }
}

export function permissionAllowsSpeak(sources: readonly number[] | undefined): boolean {
  if (!sources?.length) return false
  return sources.some((s) => s === 1 || s === 2)
}

export function permissionAllowsScreen(sources: readonly number[] | undefined): boolean {
  if (!sources?.length) return false
  return sources.some((s) => s === 3 || s === 4)
}
