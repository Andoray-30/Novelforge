import { describe, expect, it } from 'vitest';
import { cleanAiResponse, parseSaveAssetRequests } from '@/lib/chat-parser';

describe('parseSaveAssetRequests', () => {
  it('parses multiple save asset directives', () => {
    const result = parseSaveAssetRequests(`正文
<save_asset>{"type":"character","title":"阿岚","data":{"name":"阿岚","description":"守灯人"}}</save_asset>
<save_asset>{"type":"relationship","title":"阿岚与雾港","id":"rel-1","data":{"source":"阿岚","target":"雾港","relationship_type":"guardian"}}</save_asset>`);

    expect(result).toEqual([
      {
        type: 'character',
        title: '阿岚',
        data: { name: '阿岚', description: '守灯人' },
      },
      {
        type: 'relationship',
        title: '阿岚与雾港',
        id: 'rel-1',
        data: { source: '阿岚', target: '雾港', relationship_type: 'guardian' },
      },
    ]);
  });

  it('ignores malformed or unsupported save directives', () => {
    const result = parseSaveAssetRequests(`
<save_asset>{"type":"unknown","title":"坏数据","data":{"x":1}}</save_asset>
<save_asset>{"type":"world","title":"缺 data"}</save_asset>
<save_asset>not json</save_asset>`);

    expect(result).toEqual([]);
  });

  it('removes save directives from clean AI response', () => {
    const result = cleanAiResponse('请保存这个角色。<save_asset>{"type":"character","title":"阿岚","data":{"name":"阿岚"}}</save_asset>');

    expect(result).toBe('请保存这个角色。');
  });

  it('accepts chapter save directives for prologue write-back', () => {
    const result = parseSaveAssetRequests(
      '<save_asset>{"type":"chapter","title":"序章","data":{"content":"雨夜里，林墨听见旧钟声。"}}</save_asset>',
    );

    expect(result).toEqual([
      {
        type: 'chapter',
        title: '序章',
        data: { content: '雨夜里，林墨听见旧钟声。' },
      },
    ]);
  });
});
