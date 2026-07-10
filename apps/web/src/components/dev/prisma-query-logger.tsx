import { after } from 'next/server'
import { headers } from 'next/headers'
import { getAndResetPrismaQueryCount } from '@torcida/db'

export async function PrismaQueryLogger() {
  if (process.env.NODE_ENV !== 'development') return null

  const headersList = await headers()
  const pathname = headersList.get('x-pathname') ?? ''
  const method = headersList.get('x-method') ?? 'GET'

  after(() => {
    const count = getAndResetPrismaQueryCount()
    if (count > 0) {
      const route = pathname || '(unknown)'
      console.log(`[prisma] ${method} ${route} — ${count} queries`)
    }
  })

  return null
}
