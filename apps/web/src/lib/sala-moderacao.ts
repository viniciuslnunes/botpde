import { z } from 'zod'

export const SALA_MOD_TOPIC = 'sala-moderacao'

export type MidiaSalaKind = 'speak' | 'screen'

const mediaRequestSchema = z.object({
  type: z.literal('media_request'),
  requestId: z.string().uuid(),
  userId: z.string().uuid(),
  userName: z.string().min(1).max(120),
  kind: z.enum(['speak', 'screen']),
})

const mediaResponseSchema = z.object({
  type: z.literal('media_response'),
  requestId: z.string().uuid(),
  userId: z.string().uuid(),
  approved: z.boolean(),
  kind: z.enum(['speak', 'screen']),
})

export type SalaModeracaoMessage = z.infer<typeof mediaRequestSchema> | z.infer<typeof mediaResponseSchema>

export function encodeSalaModeracaoMessage(message: SalaModeracaoMessage): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(message))
}

export function decodeSalaModeracaoMessage(payload: Uint8Array): SalaModeracaoMessage | null {
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(payload))
    const asRequest = mediaRequestSchema.safeParse(parsed)
    if (asRequest.success) return asRequest.data
    const asResponse = mediaResponseSchema.safeParse(parsed)
    if (asResponse.success) return asResponse.data
    return null
  } catch {
    return null
  }
}

/** Solicitação válida: remetente deve ser o próprio usuário declarado. */
export function isTrustedMediaRequest(senderIdentity: string | undefined, message: SalaModeracaoMessage): boolean {
  return message.type === 'media_request' && senderIdentity === message.userId
}

/** Resposta válida: somente o anfitrião pode responder. */
export function isTrustedMediaResponse(
  senderIdentity: string | undefined,
  hostId: string,
  message: SalaModeracaoMessage,
): boolean {
  return message.type === 'media_response' && senderIdentity === hostId
}

export function permissionAllowsSpeak(sources: readonly number[] | undefined): boolean {
  if (!sources?.length) return false
  return sources.some((s) => s === 1 || s === 2)
}

export function permissionAllowsScreen(sources: readonly number[] | undefined): boolean {
  if (!sources?.length) return false
  return sources.some((s) => s === 3 || s === 4)
}
