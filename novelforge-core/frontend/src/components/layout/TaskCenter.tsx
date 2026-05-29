'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Loader2, CheckCircle2, AlertCircle, Info, X } from 'lucide-react'
import { taskService } from '@/lib/api/novelforge-api'
import { useAppStore } from '@/lib/hooks/use-app-store'
import { loadProjectPreferences, PROJECT_PREFERENCES_CHANGED_EVENT } from '@/lib/project-preferences'
import { emitTaskLifecycleEvent } from '@/lib/task-events'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress-bar'
import { cn } from '@/lib/utils'
import { getChapterIndexRecoveryDetails, getRepairApplyWrittenAssets, getRepairPreviewWritebackDetails, getTaskSummary, normalizeTaskStatus, REPAIR_PREVIEW_TASK_TYPES } from './task-summary'

const TERMINAL_STATUSES = new Set(['COMPLETED', 'FAILED', 'CANCELLED'])
const ACTIVE_STATUSES = new Set(['PENDING', 'RUNNING'])
const TASK_EVENT_STATE_STORAGE_KEY = 'novelforge-task-event-states'

function loadNotifiedTaskStates() {
  if (typeof window === 'undefined') {
    return {}
  }

  try {
    const raw = window.sessionStorage.getItem(TASK_EVENT_STATE_STORAGE_KEY)
    if (!raw) {
      return {}
    }

    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, string>)
      : {}
  } catch {
    return {}
  }
}

function persistNotifiedTaskStates(states: Record<string, string>) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.sessionStorage.setItem(TASK_EVENT_STATE_STORAGE_KEY, JSON.stringify(states))
  } catch {
    // Ignore storage write failures; eventing still works for the current runtime.
  }
}

export const TaskCenter = () => {
  const { activeTasks, updateTask, removeTask, activeConversationId, currentSessionId } = useAppStore()
  const pathname = usePathname()
  const router = useRouter()
  const tasks = Object.values(activeTasks)

  const timers = useRef<Record<string, NodeJS.Timeout>>({})
  const notifiedTaskStates = useRef<Record<string, string>>(loadNotifiedTaskStates())
  const [showTaskCenter, setShowTaskCenter] = useState(() => loadProjectPreferences(currentSessionId).show_task_center)
  const [cancellingTaskId, setCancellingTaskId] = useState<string | null>(null)
  const [applyingRepairTaskId, setApplyingRepairTaskId] = useState<string | null>(null)

  const clearAllTimers = useCallback(() => {
    Object.keys(timers.current).forEach((id) => {
      clearInterval(timers.current[id])
      delete timers.current[id]
    })
  }, [])

  useEffect(() => {
    const handlePreferencesChanged = () => {
      const nextShowTaskCenter = loadProjectPreferences(useAppStore.getState().currentSessionId).show_task_center
      setShowTaskCenter(nextShowTaskCenter)

      if (!nextShowTaskCenter) {
        clearAllTimers()
      }
    }

    window.addEventListener(PROJECT_PREFERENCES_CHANGED_EVENT, handlePreferencesChanged as EventListener)
    return () => {
      window.removeEventListener(PROJECT_PREFERENCES_CHANGED_EVENT, handlePreferencesChanged as EventListener)
    }
  }, [clearAllTimers])

  useEffect(() => {
    setShowTaskCenter(loadProjectPreferences(currentSessionId).show_task_center)
  }, [currentSessionId])

  useEffect(() => {
    if (!showTaskCenter) {
      clearAllTimers()
      return
    }

    const activeTaskIds = new Set<string>()

    tasks.forEach((task) => {
      const status = normalizeTaskStatus(task.status)
      if (ACTIVE_STATUSES.has(status)) {
        activeTaskIds.add(task.id)
      }

      if (!ACTIVE_STATUSES.has(status) || timers.current[task.id]) {
        return
      }

      const poll = async () => {
        try {
          const remoteStatus = await taskService.getTaskStatus(task.id)
          const currentStatus = normalizeTaskStatus(remoteStatus.status)

          updateTask(task.id, {
            status: currentStatus,
            progress: remoteStatus.progress,
            message: remoteStatus.message,
            result: remoteStatus.result,
            error: remoteStatus.error,
          })

            if (
              TERMINAL_STATUSES.has(currentStatus) &&
              notifiedTaskStates.current[task.id] !== currentStatus
            ) {
              notifiedTaskStates.current[task.id] = currentStatus
              persistNotifiedTaskStates(notifiedTaskStates.current)
              emitTaskLifecycleEvent({
                id: task.id,
                type: remoteStatus.type,
              status: currentStatus as 'COMPLETED' | 'FAILED' | 'CANCELLED',
              result: remoteStatus.result,
              error: remoteStatus.error,
              message: remoteStatus.message,
              parameters: remoteStatus.parameters,
            })
          }

          if (TERMINAL_STATUSES.has(currentStatus) && timers.current[task.id]) {
            clearInterval(timers.current[task.id])
            delete timers.current[task.id]
          }
        } catch (error) {
          console.error(`[TaskCenter] Error polling task ${task.id}:`, error)
        }
      }

      void poll()
      timers.current[task.id] = setInterval(() => {
        void poll()
      }, 3000)
    })

    Object.keys(timers.current).forEach((taskId) => {
      if (!activeTaskIds.has(taskId)) {
        clearInterval(timers.current[taskId])
        delete timers.current[taskId]
      }
    })
  }, [clearAllTimers, showTaskCenter, tasks, updateTask])

  useEffect(() => {
    return () => {
      clearAllTimers()
    }
  }, [clearAllTimers])

  useEffect(() => {
    if (!showTaskCenter || !activeConversationId || pathname === '/login') {
      return
    }

    const recoverTasks = async () => {
      try {
        const remoteTasks = await taskService.getActiveTasks(activeConversationId)
        remoteTasks.forEach((remoteTask) => {
          const store = useAppStore.getState()
          const normalizedStatus = normalizeTaskStatus(remoteTask.status)
          const existing = store.activeTasks[remoteTask.id]

          if (TERMINAL_STATUSES.has(normalizedStatus)) {
            if (notifiedTaskStates.current[remoteTask.id] !== normalizedStatus) {
              notifiedTaskStates.current[remoteTask.id] = normalizedStatus
              persistNotifiedTaskStates(notifiedTaskStates.current)
              emitTaskLifecycleEvent({
                id: remoteTask.id,
                type: remoteTask.type,
                status: normalizedStatus as 'COMPLETED' | 'FAILED' | 'CANCELLED',
                result: remoteTask.result,
                error: remoteTask.error,
                message: remoteTask.message,
                parameters: remoteTask.parameters,
              })
            }
            if (existing) {
              store.removeTask(remoteTask.id)
            }
            return
          }

          if (!existing) {
            store.addTask({
              id: remoteTask.id,
              type: remoteTask.type,
              status: normalizedStatus,
              progress: remoteTask.progress,
              message: remoteTask.message,
              result: remoteTask.result,
              error: remoteTask.error,
              created_at: remoteTask.created_at,
            })
          } else if (
            existing.status !== normalizedStatus ||
            existing.progress !== remoteTask.progress ||
            existing.message !== remoteTask.message ||
            existing.error !== remoteTask.error
          ) {
            store.updateTask(remoteTask.id, {
              status: normalizedStatus,
              progress: remoteTask.progress,
              message: remoteTask.message,
              result: remoteTask.result,
              error: remoteTask.error,
            })
          }

          if (
            TERMINAL_STATUSES.has(normalizedStatus) &&
            notifiedTaskStates.current[remoteTask.id] !== normalizedStatus
          ) {
            notifiedTaskStates.current[remoteTask.id] = normalizedStatus
            persistNotifiedTaskStates(notifiedTaskStates.current)
            emitTaskLifecycleEvent({
              id: remoteTask.id,
              type: remoteTask.type,
              status: normalizedStatus as 'COMPLETED' | 'FAILED' | 'CANCELLED',
              result: remoteTask.result,
              error: remoteTask.error,
              message: remoteTask.message,
              parameters: remoteTask.parameters,
            })
          }
        })
      } catch (error) {
        console.warn('[TaskCenter] Failed to recover remote tasks:', error)
      }
    }

    void recoverTasks()
  }, [activeConversationId, pathname, showTaskCenter])

  if (!showTaskCenter || tasks.length === 0) {
    return null
  }

  const handleCancelTask = async (taskId: string) => {
    setCancellingTaskId(taskId)
    try {
      await taskService.cancelTask(taskId)
      notifiedTaskStates.current[taskId] = 'CANCELLED'
      persistNotifiedTaskStates(notifiedTaskStates.current)
      updateTask(taskId, {
        status: 'CANCELLED',
        message: 'Task cancelled by user.',
      })
      const task = activeTasks[taskId]
      if (task) {
        emitTaskLifecycleEvent({
          id: taskId,
          type: task.type,
          status: 'CANCELLED',
          result: task.result,
          error: null,
          message: 'Task cancelled by user.',
          parameters: null,
        })
      }
    } catch (error) {
      console.error(`[TaskCenter] Failed to cancel task ${taskId}:`, error)
      updateTask(taskId, {
        error: error instanceof Error ? error.message : 'Failed to cancel task',
      })
    } finally {
      setCancellingTaskId(null)
    }
  }

  const handleApplyRepairPreview = async (task: { id: string; type?: string; result?: unknown; parameters?: Record<string, unknown> }) => {
    const previewResult = task.result && typeof task.result === 'object'
      ? (task.result as Record<string, unknown>)
      : null
    if (!previewResult) {
      return
    }

    setApplyingRepairTaskId(task.id)
    try {
      const sessionId =
        typeof task.parameters?.session_id === 'string'
          ? task.parameters.session_id
          : typeof previewResult.session_id === 'string'
            ? previewResult.session_id
            : currentSessionId || undefined
      const parentId =
        typeof task.parameters?.parent_id === 'string'
          ? task.parameters.parent_id
          : typeof previewResult.parent_id === 'string'
            ? previewResult.parent_id
            : undefined
      const response = await taskService.submitTask('import_repair_apply', {
        session_id: sessionId,
        parent_id: parentId || null,
        preview_task_id: task.id,
        preview_result: previewResult,
      })
      if (!response.success || !response.task_id) {
        throw new Error(response.message || '修复写回任务提交失败')
      }
      useAppStore.getState().addTask({
        id: response.task_id,
        type: 'import_repair_apply',
        status: 'PENDING',
        progress: 0,
        message: response.message || '修复写回任务已提交',
        result: {
          session_id: sessionId,
          parent_id: parentId || null,
        },
        created_at: new Date().toISOString(),
      })
    } catch (error) {
      updateTask(task.id, {
        error: error instanceof Error ? error.message : '修复写回任务提交失败',
      })
    } finally {
      setApplyingRepairTaskId(null)
    }
  }

  return (
    <div className="fixed bottom-24 left-3 right-3 z-[60] flex max-h-[42vh] flex-col gap-2 overflow-y-auto animate-in slide-in-from-bottom-4 duration-300 md:bottom-6 md:left-auto md:right-6 md:w-full md:max-w-xs md:gap-3 md:overflow-visible md:animate-in md:slide-in-from-right-5">
      {tasks.map((task) => {
        const status = normalizeTaskStatus(task.status)
        const isCompleted = status === 'COMPLETED'
        const isFailed = status === 'FAILED'
        const canApplyRepairPreview = isCompleted && REPAIR_PREVIEW_TASK_TYPES.has(task.type || '')
        const recoveryDetails = isCompleted && REPAIR_PREVIEW_TASK_TYPES.has(task.type || '')
          ? getChapterIndexRecoveryDetails(task.result)
          : null
        const writebackDetails = canApplyRepairPreview
          ? getRepairPreviewWritebackDetails(task.result)
          : null
        const writtenAssets = isCompleted && task.type === 'import_repair_apply'
          ? getRepairApplyWrittenAssets(task.result)
          : []
        const hasWrittenRelationships = writtenAssets.some((asset) => asset.type === 'relationship')
        const hasWrittenTimeline = writtenAssets.some((asset) => asset.type === 'timeline')

        return (
          <Card
            key={task.id}
            className={cn(
              'overflow-hidden border-primary/20 bg-background/95 p-0 shadow-2xl backdrop-blur-md',
              isCompleted ? 'border-green-500/50' : '',
              isFailed ? 'border-red-500/40' : ''
            )}
          >
            <CardContent className="p-4">
              <div className="mb-3 flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      'rounded-full p-1',
                      status === 'RUNNING' ? 'bg-primary/10' : '',
                      isCompleted ? 'bg-green-100 dark:bg-green-900/30' : '',
                      isFailed ? 'bg-red-100 dark:bg-red-900/30' : '',
                      status === 'PENDING' || status === 'CANCELLED' ? 'bg-muted' : ''
                    )}
                  >
                    {status === 'RUNNING' ? <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> : null}
                    {isCompleted ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> : null}
                    {isFailed ? <AlertCircle className="h-3.5 w-3.5 text-destructive" /> : null}
                    {status === 'PENDING' || status === 'CANCELLED' ? <Info className="h-3.5 w-3.5 text-muted-foreground" /> : null}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      {task.type === 'novel_import' ? 'Novel Import' : 'Background Task'}
                    </span>
                    <span className="text-[10px] opacity-70 text-muted-foreground">ID: {task.id.slice(-6)}</span>
                  </div>
                </div>
                <button
                  onClick={() => removeTask(task.id)}
                  className="p-1 text-muted-foreground transition-colors hover:text-foreground"
                  title="Dismiss"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-2">
                <div className="flex items-end justify-between">
                  <p className="mr-2 flex-1 line-clamp-2 text-xs font-medium text-foreground">
                    {getTaskSummary(task)}
                  </p>
                  <span className="text-xs font-bold text-primary">
                    {Math.round((task.progress || 0) * 100)}%
                  </span>
                </div>

                <Progress
                  value={(task.progress || 0) * 100}
                  className={cn('h-1.5 transition-all', isCompleted ? 'bg-green-100' : '')}
                />

                {isFailed ? (
                  <p className="mt-1 text-[10px] font-medium italic text-destructive">
                    Task failed. Check the error details and retry the import or generation flow.
                  </p>
                ) : null}

                {status === 'CANCELLED' ? (
                  <p className="mt-1 text-[10px] font-medium italic text-amber-500">
                    Task cancelled before the pipeline finished.
                  </p>
                ) : null}

                {ACTIVE_STATUSES.has(status) ? (
                  <button
                    type="button"
                    onClick={() => {
                      void handleCancelTask(task.id)
                    }}
                    disabled={cancellingTaskId === task.id}
                    className="mt-2 inline-flex items-center rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-200 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {cancellingTaskId === task.id ? 'Cancelling...' : 'Cancel task'}
                  </button>
                ) : null}

                {isCompleted ? (
                  <div className="mt-2 flex items-center gap-1.5 rounded bg-green-50 p-1.5 text-[10px] font-medium text-green-700 dark:bg-green-900/20 dark:text-green-400">
                    <CheckCircle2 className="h-3 w-3" />
                    {getTaskSummary(task)}
                  </div>
                ) : null}

                {recoveryDetails ? (
                  <details className="mt-2 rounded-md border border-primary/15 bg-primary/5 p-2 text-[10px] text-muted-foreground">
                    <summary className="cursor-pointer font-semibold text-foreground">
                      查看章节索引复用明细
                    </summary>
                    <div className="mt-2 space-y-2">
                      {recoveryDetails.reused.length > 0 ? (
                        <div>
                          <div className="font-semibold text-green-700 dark:text-green-300">复用历史成功章</div>
                          <ul className="mt-1 list-disc space-y-1 pl-4">
                            {recoveryDetails.reused.slice(0, 5).map((item) => <li key={`reused-${item}`}>{item}</li>)}
                          </ul>
                          {recoveryDetails.reused.length > 5 ? <div className="mt-1">还有 {recoveryDetails.reused.length - 5} 章</div> : null}
                        </div>
                      ) : null}
                      {recoveryDetails.retryable.length > 0 ? (
                        <div>
                          <div className="font-semibold text-amber-700 dark:text-amber-300">仍需重跑章节</div>
                          <ul className="mt-1 list-disc space-y-1 pl-4">
                            {recoveryDetails.retryable.slice(0, 5).map((item) => <li key={`retry-${item}`}>{item}</li>)}
                          </ul>
                          {recoveryDetails.retryable.length > 5 ? <div className="mt-1">还有 {recoveryDetails.retryable.length - 5} 章</div> : null}
                        </div>
                      ) : null}
                    </div>
                  </details>
                ) : null}

                {canApplyRepairPreview ? (
                  <div className="mt-2 rounded-md border border-green-500/20 bg-green-500/5 p-2 text-[10px] text-muted-foreground">
                    <div className="font-semibold text-green-700 dark:text-green-300">确认写回预览</div>
                    <div className="mt-1 grid grid-cols-2 gap-1">
                      <span>关系新增 {writebackDetails?.relationshipNew ?? 0}</span>
                      <span>关系跳过 {writebackDetails?.relationshipDuplicates ?? 0}</span>
                      <span>时间线新增 {writebackDetails?.timelineNew ?? 0}</span>
                      <span>时间线跳过 {writebackDetails?.timelineDuplicates ?? 0}</span>
                    </div>
                    <p className="mt-1 leading-4">
                      写回会保存为修复资产，不覆盖原始提取资产；后续 Agent 会优先读取补强后的项目记忆。
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        void handleApplyRepairPreview(task)
                      }}
                      disabled={applyingRepairTaskId === task.id || writebackDetails?.hasWritableAssets === false}
                      className="mt-2 inline-flex items-center rounded-md border border-green-500/30 bg-green-500/10 px-2 py-1 text-[10px] font-semibold text-green-700 transition hover:bg-green-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:text-green-300"
                    >
                      {applyingRepairTaskId === task.id ? '提交中...' : writebackDetails?.hasWritableAssets === false ? '无新增可写回' : '确认写回修复资产'}
                    </button>
                  </div>
                ) : null}

                {isCompleted && task.type === 'import_repair_apply' ? (
                  <div className="mt-2 rounded-md border border-primary/15 bg-primary/5 p-2 text-[10px] text-muted-foreground">
                    <div className="font-semibold text-foreground">已写入项目记忆库</div>
                    {writtenAssets.length > 0 ? (
                      <ul className="mt-1 list-disc space-y-1 pl-4">
                        {writtenAssets.slice(0, 4).map((asset) => (
                          <li key={asset.id}>{asset.type === 'relationship' ? '关系' : asset.type === 'timeline' ? '时间线' : asset.type}：{asset.title}</li>
                        ))}
                        {writtenAssets.length > 4 ? <li>还有 {writtenAssets.length - 4} 个修复资产</li> : null}
                      </ul>
                    ) : (
                      <p className="mt-1">本次写回没有新增资产，可能都被判定为重复项。</p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {hasWrittenRelationships ? (
                        <button
                          type="button"
                          onClick={() => router.push('/characters')}
                          className="rounded-md border border-primary/20 bg-background px-2 py-1 font-semibold text-foreground transition hover:bg-primary/10"
                        >
                          查看关系
                        </button>
                      ) : null}
                      {hasWrittenTimeline ? (
                        <button
                          type="button"
                          onClick={() => router.push('/world')}
                          className="rounded-md border border-primary/20 bg-background px-2 py-1 font-semibold text-foreground transition hover:bg-primary/10"
                        >
                          查看时间线
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => router.push('/analytics')}
                        className="rounded-md border border-primary/20 bg-background px-2 py-1 font-semibold text-foreground transition hover:bg-primary/10"
                      >
                        查看质量
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
