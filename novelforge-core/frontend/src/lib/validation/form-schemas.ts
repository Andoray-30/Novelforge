/**
 * 表单验证 Schema
 * 使用 Zod 进行表单验证
 */

import { z } from 'zod';

/**
 * 会话创建表单验证
 */
export const createSessionSchema = z.object({
  title: z.string().min(1, '会话标题不能为空').max(100, '标题不能超过100个字符'),
});

export type CreateSessionFormData = z.infer<typeof createSessionSchema>;

/**
 * 文件上传验证
 */
export const fileUploadSchema = z.object({
  file: z.instanceof(File).refine(
    (file) => file.size <= 10 * 1024 * 1024,
    '文件大小不能超过10MB'
  ).refine(
    (file) => ['text/plain', 'text/markdown', 'text/x-markdown'].includes(file.type) ||
              file.name.endsWith('.txt') ||
              file.name.endsWith('.md'),
    '只支持 .txt 和 .md 文件'
  ),
});

export type FileUploadFormData = z.infer<typeof fileUploadSchema>;

/**
 * 故事大纲参数验证
 * 与后端 StoryOutlineParams 保持一致
 */
export const storyOutlineSchema = z.object({
  novel_type: z.enum(['fantasy', 'science_fiction', 'romance', 'mystery', 'historical', 'wuxia']),
  theme: z.string().min(1, '主题不能为空').max(200, '主题不能超过200个字符'),
  length: z.enum(['short', 'medium', 'long']),
  constraints: z.array(z.string()).optional(),
  target_audience: z.enum(['general', 'young_adult', 'adult']).optional(),
});

export type StoryOutlineFormData = z.infer<typeof storyOutlineSchema>;

/**
 * 角色设计请求验证
 */
export const characterDesignSchema = z.object({
  name: z.string().min(1, '角色名称不能为空').max(50, '名称不能超过50个字符'),
  role_type: z.enum(['protagonist', 'antagonist', 'supporting', 'minor']),
  description: z.string().min(10, '角色描述至少需要10个字符').max(1000, '描述不能超过1000个字符'),
  world_context: z.string().max(2000, '世界观背景不能超过2000个字符').optional(),
  special_requirements: z.string().max(500, '特殊要求不能超过500个字符').optional(),
});

export type CharacterDesignFormData = z.infer<typeof characterDesignSchema>;

/**
 * 世界构建请求验证
 */
export const worldBuildingSchema = z.object({
  name: z.string().min(1, '世界名称不能为空').max(50, '名称不能超过50个字符'),
  world_type: z.enum(['realistic', 'fantasy', 'scifi', 'xianxia', 'wuxia', 'other']),
  description: z.string().min(10, '世界描述至少需要10个字符').max(2000, '描述不能超过2000个字符'),
  special_requirements: z.string().max(500, '特殊要求不能超过500个字符').optional(),
});

export type WorldBuildingFormData = z.infer<typeof worldBuildingSchema>;

/**
 * 搜索请求验证
 */
export const searchSchema = z.object({
  query: z.string().min(1, '搜索关键词不能为空').max(100, '关键词不能超过100个字符'),
  content_types: z.array(z.enum(['character', 'world', 'timeline', 'relationship'])).optional(),
  tags: z.array(z.string()).optional(),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
});

export type SearchFormData = z.infer<typeof searchSchema>;

/**
 * 内容项更新验证
 */
export const contentItemUpdateSchema = z.object({
  name: z.string().min(1, '名称不能为空').max(100, '名称不能超过100个字符').optional(),
  description: z.string().max(5000, '描述不能超过5000个字符').optional(),
  tags: z.array(z.string()).max(20, '标签不能超过20个').optional(),
  importance: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type ContentItemUpdateFormData = z.infer<typeof contentItemUpdateSchema>;

/**
 * 导出请求验证
 */
export const exportSchema = z.object({
  item_ids: z.array(z.string()).min(1, '至少选择一个项目'),
  format: z.enum(['json', 'markdown', 'html', 'tavern']),
});

export type ExportFormData = z.infer<typeof exportSchema>;

/**
 * 验证表单数据
 */
export function validateForm<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; errors: string[] } {
  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors = result.error.issues.map((err) => err.message);
  return { success: false, errors };
}

/**
 * 获取字段错误
 */
export function getFieldError<T>(
  schema: z.ZodSchema<T>,
  field: keyof T,
  value: unknown
): string | null {
  const objectSchema = schema as z.ZodObject<z.ZodRawShape>;
  const shapeEntry = objectSchema.shape[field as string];
  if (!shapeEntry) {
    return null;
  }
  const fieldSchema = z.object({ [field as string]: shapeEntry });
  const result = fieldSchema.safeParse({ [field]: value });

  if (!result.success) {
    return result.error.issues[0]?.message || null;
  }

  return null;
}
