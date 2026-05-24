'use client'

import { useEffect } from 'react'
import type { NovelForgeTaskEventDetail } from '@/lib/task-events'
import {
  TASK_CANCELLED_EVENT,
  TASK_COMPLETED_EVENT,
  TASK_FAILED_EVENT,
} from '@/lib/task-events'

type SessionTaskEventHandlers = {
  sessionId?: string | null
  onCompleted?: (detail: NovelForgeTaskEventDetail) => void
  onFailed?: (detail: NovelForgeTaskEventDetail) => void
  onCancelled?: (detail: NovelForgeTaskEventDetail) => void
}

function isSameSession(
  expectedSessionId: string | null | undefined,
  detail: NovelForgeTaskEventDetail
) {
  if (!expectedSessionId) {
    return true
  }
  if (!detail.sessionId) {
    return true
  }
  return detail.sessionId === expectedSessionId
}

export function useSessionTaskEvents({
  sessionId,
  onCompleted,
  onFailed,
  onCancelled,
}: SessionTaskEventHandlers) {
  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const handleCompleted = (event: Event) => {
      const detail = (event as CustomEvent<NovelForgeTaskEventDetail>).detail
      if (!detail || !onCompleted || !isSameSession(sessionId, detail)) {
        return
      }
      onCompleted(detail)
    }

    const handleFailed = (event: Event) => {
      const detail = (event as CustomEvent<NovelForgeTaskEventDetail>).detail
      if (!detail || !onFailed || !isSameSession(sessionId, detail)) {
        return
      }
      onFailed(detail)
    }

    const handleCancelled = (event: Event) => {
      const detail = (event as CustomEvent<NovelForgeTaskEventDetail>).detail
      if (!detail || !onCancelled || !isSameSession(sessionId, detail)) {
        return
      }
      onCancelled(detail)
    }

    window.addEventListener(TASK_COMPLETED_EVENT, handleCompleted as EventListener)
    window.addEventListener(TASK_FAILED_EVENT, handleFailed as EventListener)
    window.addEventListener(TASK_CANCELLED_EVENT, handleCancelled as EventListener)

    return () => {
      window.removeEventListener(TASK_COMPLETED_EVENT, handleCompleted as EventListener)
      window.removeEventListener(TASK_FAILED_EVENT, handleFailed as EventListener)
      window.removeEventListener(TASK_CANCELLED_EVENT, handleCancelled as EventListener)
    }
  }, [onCancelled, onCompleted, onFailed, sessionId])
}
