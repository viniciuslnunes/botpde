import 'server-only'
import { randomBytes } from 'node:crypto'

export function generateInviteSlug(): string {
  return randomBytes(6).toString('base64url')
}
