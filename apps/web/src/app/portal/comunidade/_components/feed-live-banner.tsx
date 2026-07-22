'use client'

import { useMemo, useState } from 'react'
import { ArrowUp } from 'lucide-react'
import { m, AnimatePresence } from 'motion/react'
import { springSnappy, fadeScale } from '@/lib/motion-presets'
import { useFeedStream } from '@/lib/use-feed-stream'
import { emitirFeedRefreshTopo, feedStreamEndpoint, isComunidadeFeedNearTop } from '@/lib/feed-live-refresh'

/**
 * Banner "N novos posts" quando o usuário está longe do topo.
 * No topo, o infinite feed refetcha via API — sem `router.refresh()`.
 */
export function FeedLiveBanner({
  escopo,
  afiliacaoId,
}: {
  filtro?: 'descobrir' | 'seguindo' | 'grupos'
  escopo?: 'nacional' | 'torcida'
  afiliacaoId?: string
}) {
  const [novos, setNovos] = useState(0)

  const streamEndpoint = useMemo(
    () =>
      feedStreamEndpoint(
        escopo === 'nacional' && afiliacaoId ? { escopo: 'nacional', afiliacaoId } : undefined,
      ),
    [afiliacaoId, escopo],
  )

  useFeedStream(() => {
    if (isComunidadeFeedNearTop()) {
      setNovos(0)
      return
    }
    setNovos((n) => n + 1)
  }, streamEndpoint)

  function verNovos() {
    setNovos(0)
    emitirFeedRefreshTopo()
  }

  const label =
    novos === 1 ? '1 novo post' : `${novos} novos posts`

  return (
    <AnimatePresence>
      {novos > 0 && (
        <m.div
          key="live-banner"
          variants={fadeScale}
          initial="hidden"
          animate="show"
          exit="hidden"
          transition={springSnappy}
          className="sticky top-28 z-10 flex justify-center lg:top-32"
        >
          <m.button
            type="button"
            onClick={verNovos}
            whileTap={{ scale: 0.95 }}
            transition={springSnappy}
            className="flex items-center gap-1.5 rounded-full bg-[rgb(var(--primary))] px-4 py-2 text-sm font-semibold text-white shadow-lg"
          >
            <ArrowUp className="h-4 w-4" />
            {label}
            {escopo === 'nacional' ? ' no clube' : ''}
          </m.button>
        </m.div>
      )}
    </AnimatePresence>
  )
}
