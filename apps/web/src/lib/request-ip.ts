import { headers } from 'next/headers'
import { clientIpFromHeaders } from '@/lib/public-rate-limit'

/** IP do cliente em Server Actions / RSC. */
export async function getClientIp(): Promise<string> {
  const h = await headers()
  return clientIpFromHeaders(h)
}
