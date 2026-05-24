/**
 * AI规划服务 Hook
 * 封装AI规划相关的业务逻辑
 */

import { useCallback, useState } from 'react';
import {
  StoryOutlineParams,
  StoryOutline,
  CharacterDesignRequest,
  CharacterDesign,
  WorldBuildingRequest,
  WorldSetting,
  NovelType,
  LengthType,
  TargetAudience,
} from '@/types';
import { aiPlanningService } from '@/lib/api';

export function useAIPlanning() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * 生成故事大纲
   */
  const generateStoryOutline = useCallback(async (
    params: StoryOutlineParams
  ): Promise<StoryOutline> => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await aiPlanningService.generateStoryOutline(params);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : '生成故事大纲失败';
      setError(message);
      throw new Error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * 设计角色
   */
  const designCharacter = useCallback(async (
    request: CharacterDesignRequest
  ): Promise<CharacterDesign> => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await aiPlanningService.designCharacter(request);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : '设计角色失败';
      setError(message);
      throw new Error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * 构建世界设定
   */
  const buildWorld = useCallback(async (
    request: WorldBuildingRequest
  ): Promise<WorldSetting> => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await aiPlanningService.buildWorld(request);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : '构建世界设定失败';
      setError(message);
      throw new Error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * 获取小说类型列表
   */
  const getNovelTypes = useCallback(async (): Promise<NovelType[]> => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await aiPlanningService.getNovelTypes();
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : '获取小说类型失败';
      setError(message);
      throw new Error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * 获取长度类型列表
   */
  const getLengthTypes = useCallback(async (): Promise<LengthType[]> => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await aiPlanningService.getLengthTypes();
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : '获取长度类型失败';
      setError(message);
      throw new Error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * 获取目标受众列表
   */
  const getTargetAudiences = useCallback(async (): Promise<TargetAudience[]> => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await aiPlanningService.getTargetAudiences();
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : '获取目标受众失败';
      setError(message);
      throw new Error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    isLoading,
    error,
    generateStoryOutline,
    designCharacter,
    buildWorld,
    getNovelTypes,
    getLengthTypes,
    getTargetAudiences,
  };
}
