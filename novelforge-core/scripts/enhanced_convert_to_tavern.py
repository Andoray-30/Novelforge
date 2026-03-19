#!/usr/bin/env python3
"""
将合并后的角色数据转换为增强版SillyTavern兼容格式
包含更多原文信息以供AI参考
"""

import json
from pathlib import Path
from novelforge.services.tavern_converter import SillyTavernConverter
from novelforge.core.models import Character


def enhanced_convert_to_tavern_format():
    """将合并后的角色转换为增强版SillyTavern格式"""
    print("开始转换为增强版SillyTavern格式...")
    
    # 读取合并后的角色数据
    input_file = Path("novelforge-core/output/merged_characters.json")
    if not input_file.exists():
        print(f"错误：找不到输入文件 {input_file}")
        return
    
    with open(input_file, 'r', encoding='utf-8') as f:
        characters_data = json.load(f)
    
    print(f"读取到 {len(characters_data)} 个角色")
    
    # 创建输出目录
    output_dir = Path("novelforge-core/output/tavern_cards_enhanced")
    output_dir.mkdir(exist_ok=True)
    
    # 转换每个角色
    converted_count = 0
    for char_data in characters_data:
        try:
            # 创建Character对象
            character = Character(**char_data)
            
            # 构建更丰富的消息示例
            mes_example_parts = []
            
            # 添加角色描述作为上下文
            if character.description:
                mes_example_parts.append(f"{{char}}是一个名叫{character.name}的角色。{character.description}")
            
            # 添加性格特征
            if '性格' in char_data and char_data['性格']:  # 使用字典访问方式
                if isinstance(char_data['性格'], list):
                    personality_str = "，".join(char_data['性格'])
                else:
                    personality_str = str(char_data['性格'])
                mes_example_parts.append(f"{{char}}的性格特点是：{personality_str}")
            
            # 添加外貌描述
            if '外貌' in char_data and char_data['外貌']:
                mes_example_parts.append(f"{{char}}的外貌是：{char_data['外貌']}")
            
            # 添加职业信息
            if character.occupation:
                mes_example_parts.append(f"{{char}}的职业是：{character.occupation}")
            
            # 添加年龄信息
            if character.age:
                mes_example_parts.append(f"{{char}}的年龄是：{character.age}")
            
            # 添加其他特征
            if character.tags:
                tags_str = "，".join(character.tags)
                mes_example_parts.append(f"{{char}}的相关标签包括：{tags_str}")
            
            # 添加关系信息
            if 'relationships' in char_data and char_data['relationships']:
                relationships = char_data['relationships']
                if isinstance(relationships, list) and relationships:
                    # 获取关系中的目标角色名
                    rel_names = []
                    for rel in relationships[:3]:  # 只取前3个
                        if isinstance(rel, dict):
                            target = rel.get('target') or rel.get('name') or rel.get('source')
                        else:
                            target = str(rel)
                        if target:
                            rel_names.append(target)
                    
                    if rel_names:
                        mes_example_parts.append(f"{{char}}与{'、'.join(rel_names)}等人有关系")
            
            # 添加角色定位信息
            if character.role:
                role_map = {
                    "protagonist": "主角",
                    "antagonist": "反派",
                    "supporting": "配角",
                    "minor": "次要角色",
                    "narrator": "叙述者"
                }
                role_desc = role_map.get(str(character.role).lower(), str(character.role))
                mes_example_parts.append(f"{{char}}的角色定位是：{role_desc}")
            
            # 构建完整的消息示例
            mes_example = "\\n\\n".join(mes_example_parts)
            
            # 转换为SillyTavern格式，带更多信息
            tavern_card = SillyTavernConverter.character_to_tavern_card(
                character=character,
                scenario=f"{character.name}的故事背景和世界观",
                system_prompt=f"你正在扮演{character.name}。请保持角色的一致性，使用符合角色背景的语言风格和行为模式。",
                creator="NovelForge AI Extractor",
                creator_notes="由NovelForge AI系统从文本中提取并优化的角色信息，包含角色的核心特征和背景"
            )
            
            # 更新消息示例
            tavern_card.data["mes_example"] = mes_example
            
            # 保存为单独的文件
            card_filename = f"{character.name.replace('/', '_').replace('\\', '_')}_enhanced_tavern_card.json"
            card_path = output_dir / card_filename
            
            with open(card_path, 'w', encoding='utf-8') as f:
                json.dump(tavern_card.model_dump(), f, ensure_ascii=False, indent=2)
            
            converted_count += 1
            print(f"✓ 已转换: {character.name}")
            
        except Exception as e:
            print(f"✗ 转换失败 {char_data.get('name', 'Unknown')}: {e}")
            import traceback
            traceback.print_exc()
    
    print(f"\n转换完成！成功转换 {converted_count} 个角色")
    print(f"增强版SillyTavern格式的角色卡保存在: {output_dir}")


if __name__ == "__main__":
    enhanced_convert_to_tavern_format()