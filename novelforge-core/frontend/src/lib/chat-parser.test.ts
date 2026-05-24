import { describe, expect, it } from 'vitest';
import { extractCleanText, parseSaveAssetRequests } from '@/lib/chat-parser';

describe('chat parser save asset directives', () => {
  it('parses chapter save directives from prologue responses', () => {
    const response = [
      '这是一个关于月光与重逢的序章。',
      '<save_asset>{"type":"chapter","title":"序章","data":{"chapter_title":"序章","content":"月光落在旧城的天台上。","characters":["辉夜"]}}</save_asset>',
    ].join('\n');

    expect(parseSaveAssetRequests(response)).toEqual([
      {
        type: 'chapter',
        title: '序章',
        data: {
          chapter_title: '序章',
          content: '月光落在旧城的天台上。',
          characters: ['辉夜'],
        },
      },
    ]);
  });

  it('removes save directives from visible assistant text', () => {
    const response = '序章正文\n<save_asset>{"type":"chapter","title":"序章","data":{"content":"序章正文"}}</save_asset>';

    expect(extractCleanText(response)).toBe('序章正文');
  });
});
