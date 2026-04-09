'use client';

import React, { useEffect, useRef } from 'react';
import { useAppStore } from '@/lib/hooks/use-app-store';
import { taskService } from '@/lib/api/novelforge-api';
import { Progress } from '@/components/ui/progress-bar';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, CheckCircle2, AlertCircle, X, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * TaskCenter 组件
 * 在全局显示后台异步任务的进度条，支持刷新后自动找回。
 */
export const TaskCenter = () => {
  const { activeTasks, updateTask, removeTask, activeConversationId } = useAppStore();
  const tasks = Object.values(activeTasks);
  
  // 使用 ref 存储定时器，避免闭包问题
  const timers = useRef<Record<string, NodeJS.Timeout>>({});

  useEffect(() => {
    // 只有当任务状态为 PENDING 或 RUNNING 时才启动轮询
    tasks.forEach(task => {
      const status = task.status?.toUpperCase();
      if ((status === 'PENDING' || status === 'RUNNING') && !timers.current[task.id]) {
        console.log(`[TaskCenter] Starting poller for task: ${task.id}`);
        
        const poll = async () => {
          try {
            const remoteStatus = await taskService.getTaskStatus(task.id);
            const currentStatus = remoteStatus.status.toUpperCase();
            
            updateTask(task.id, {
              status: currentStatus,
              progress: remoteStatus.progress,
              message: remoteStatus.message,
              result: remoteStatus.result,
              error: remoteStatus.error
            });
            
            // 如果任务已结束，停止轮询
            if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(currentStatus)) {
              if (timers.current[task.id]) {
                clearInterval(timers.current[task.id]);
                delete timers.current[task.id];
              }
            }
          } catch (error) {
            console.error(`[TaskCenter] Error polling task ${task.id}:`, error);
            // 如果连续失败多次，可以考虑停止
          }
        };

        // 立即执行一次
        poll();
        // 设置定时器
        timers.current[task.id] = setInterval(poll, 3000);
      }
    });

    // 清理函数
    return () => {
      Object.keys(timers.current).forEach(id => {
        clearInterval(timers.current[id]);
        delete timers.current[id];
      });
    };
  }, [tasks, updateTask]); // 监听任务列表变化

  // 页面加载时的任务“找 recovery”逻辑
  useEffect(() => {
    if (activeConversationId) {
      const recoverTasks = async () => {
        try {
          const remoteTasks = await taskService.getActiveTasks(activeConversationId);
          remoteTasks.forEach(rt => {
            const existingTasks = useAppStore.getState().activeTasks;
            // 如果本地没有这个任务，或者状态落后，则添加/更新
            if (!existingTasks[rt.id]) {
              useAppStore.getState().addTask({
                id: rt.id,
                type: rt.type,
                status: rt.status,
                progress: rt.progress,
                message: rt.message
              });
            }
          });
        } catch (err) {
          console.warn('[TaskCenter] Failed to recover remote tasks:', err);
        }
      };
      recoverTasks();
    }
  }, [activeConversationId]);

  if (tasks.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[60] flex flex-col gap-3 max-w-xs w-full animate-in slide-in-from-right-5 duration-300">
      {tasks.map(task => (
        <Card 
          key={task.id} 
          className={cn(
            "p-0 shadow-2xl border-primary/20 bg-background/95 backdrop-blur-md overflow-hidden",
            task.status === 'COMPLETED' ? "border-green-500/50" : ""
          )}
        >
          <CardContent className="p-4">
            <div className="flex justify-between items-start mb-3">
              <div className="flex items-center gap-2">
                <div className={cn(
                  "p-1 rounded-full",
                  task.status === 'RUNNING' ? "bg-primary/10" : 
                  task.status === 'COMPLETED' ? "bg-green-100 dark:bg-green-900/30" : 
                  "bg-muted"
                )}>
                  {task.status === 'RUNNING' && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />}
                  {task.status === 'COMPLETED' && <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />}
                  {task.status === 'FAILED' && <AlertCircle className="w-3.5 h-3.5 text-destructive" />}
                  {task.status === 'PENDING' && <Info className="w-3.5 h-3.5 text-muted-foreground" />}
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {task.type === 'novel_import' ? '小说深度解析' : '后台 AI 任务'}
                  </span>
                  <span className="text-[10px] text-muted-foreground opacity-70">ID: {task.id.slice(-6)}</span>
                </div>
              </div>
              <button 
                onClick={() => removeTask(task.id)} 
                className="text-muted-foreground hover:text-foreground transition-colors p-1"
                title="关闭"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-end">
                <p className="text-xs font-medium text-foreground line-clamp-1 flex-1 mr-2">
                  {task.message || '正在准备...'}
                </p>
                <span className="text-xs font-bold text-primary">
                  {Math.round((task.progress || 0) * 100)}%
                </span>
              </div>
              
              <Progress 
                value={(task.progress || 0) * 100} 
                className={cn(
                  "h-1.5 transition-all",
                  task.status === 'COMPLETED' ? "bg-green-100" : ""
                )}
                // indicatorClassName={task.status === 'COMPLETED' ? "bg-green-500" : ""}
              />
              
              {task.status === 'FAILED' && (
                <p className="text-[10px] text-destructive mt-1 font-medium italic">
                  任务失败，请检查网络或联系管理员
                </p>
              )}
              
              {task.status === 'COMPLETED' && (
                <div className="flex items-center gap-1.5 mt-2 bg-green-50 dark:bg-green-900/20 p-1.5 rounded text-[10px] text-green-700 dark:text-green-400 font-medium">
                  <CheckCircle2 className="w-3 h-3" />
                  解析已完成，资产树已更新
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
