'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

const PULL_THRESHOLD = 72
const MAX_PULL = 120

export function useFeedPullRefresh(onRefresh: () => Promise<void>) {
  const [pullDistance, setPullDistance] = useState(0)
  const [isPullRefreshing, setIsPullRefreshing] = useState(false)
  const touchStartY = useRef(0)
  const pulling = useRef(false)
  const wheelAccum = useRef(0)
  const refreshLock = useRef(false)
  const pullDistanceRef = useRef(0)

  const triggerRefresh = useCallback(async () => {
    if (refreshLock.current) return
    refreshLock.current = true
    setIsPullRefreshing(true)
    setPullDistance(PULL_THRESHOLD)
    pullDistanceRef.current = PULL_THRESHOLD
    try {
      await onRefresh()
    } finally {
      refreshLock.current = false
      setIsPullRefreshing(false)
      setPullDistance(0)
      pullDistanceRef.current = 0
      wheelAccum.current = 0
    }
  }, [onRefresh])

  useEffect(() => {
    let rafId: number | undefined
    let pendingDistance: number | null = null

    function canPull(): boolean {
      return window.scrollY <= 8 && !refreshLock.current
    }

    // Throttle setState via rAF: touchmove/wheel disparam a 60-120Hz e um
    // setState síncrono por evento, no momento em que o usuário começa a
    // rolar, competia com o reflow do chrome sticky e travava o scroll.
    function setDistance(value: number) {
      pullDistanceRef.current = value
      pendingDistance = value
      if (rafId !== undefined) return
      rafId = window.requestAnimationFrame(() => {
        rafId = undefined
        if (pendingDistance !== null) setPullDistance(pendingDistance)
        pendingDistance = null
      })
    }

    function onTouchStart(e: TouchEvent) {
      if (!canPull()) return
      touchStartY.current = e.touches[0]?.clientY ?? 0
      pulling.current = true
    }

    function onTouchMove(e: TouchEvent) {
      if (!pulling.current || refreshLock.current) return
      if (!canPull()) {
        pulling.current = false
        setDistance(0)
        return
      }
      const y = e.touches[0]?.clientY ?? 0
      const delta = y - touchStartY.current
      if (delta > 0) {
        setDistance(Math.min(delta * 0.5, MAX_PULL))
      } else {
        setDistance(0)
      }
    }

    async function onTouchEnd() {
      if (!pulling.current) return
      pulling.current = false
      if (pullDistanceRef.current >= PULL_THRESHOLD) {
        await triggerRefresh()
      } else {
        setDistance(0)
      }
    }

    function onWheel(e: WheelEvent) {
      if (!canPull()) {
        wheelAccum.current = 0
        if (window.scrollY > 8) setDistance(0)
        return
      }
      if (e.deltaY < 0) {
        wheelAccum.current += Math.abs(e.deltaY)
        setDistance(Math.min(wheelAccum.current * 0.35, MAX_PULL))
        if (wheelAccum.current >= PULL_THRESHOLD * 2.5) {
          void triggerRefresh()
        }
      } else {
        wheelAccum.current = 0
        setDistance(0)
      }
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    window.addEventListener('wheel', onWheel, { passive: true })

    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('wheel', onWheel)
      if (rafId !== undefined) window.cancelAnimationFrame(rafId)
    }
  }, [triggerRefresh])

  const pullProgress = Math.min(pullDistance / PULL_THRESHOLD, 1)

  return {
    pullDistance,
    pullProgress,
    isPullRefreshing,
    triggerRefresh,
  }
}
