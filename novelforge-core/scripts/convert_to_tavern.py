#!/usr/bin/env python3
"""
将合并后的角色数据转换为SillyTavern兼容格式
"""

import json
from pathlib import Path
from novelforge.services.tavern_converter import SillyTavernConverter
from novelforge.core.models import Character


def convert_to_tavern_format():
    """将合并后的角色转换为SillyTavern格式"""
    print("开始转换为SillyTavern格式...")
    
    # 读取合并后的角色数据
    input_file = Path("novelforge-core/output/merged_characters.json")
    if not input_file.exists():
        print(f"错误：找不到输入文件 {input_file}")
        return
    
    with open(input_file, 'r', encoding='utf-8') as f:
        characters_data = json.load(f)
    
    print(f"读取到 {len(characters_data)} 个角色")
    
    # 创建输出目录
    output_dir = Path("novelforge-core/output/tavern_cards")
    output_dir.mkdir(exist_ok=True)
    
    # 转换每个角色
    converted_count = 0
    for char_data in characters_data:
        try:
            # 创建Character对象
            character = Character(**char_data)
            
            # 转换为SillyTavern格式
            tavern_card = SillyTavernConverter.character_to_tavern_card(
                character=character,
                creator="NovelForge AI Extractor",
                creator_notes="由NovelForge AI系统从文本中提取并优化的角色信息"
            )
            
            # 保存为单独的文件
            card_filename = f"{character.name.replace('/', '_').replace('\\', '_')}_tavern_card.json"
            card_path = output_dir / card_filename
            
            with open(card_path, 'w', encoding='utf-8') as f:
                json.dump(tavern_card.model_dump(), f, ensure_ascii=False, indent=2)
            
            converted_count += 1
            print(f"✓ 已转换: {character.name}")
            
        except Exception as e:
            print(f"✗ 转换失败 {char_data.get('name', 'Unknown')}: {e}")
    
    print(f"\n转换完成！成功转换 {converted_count} 个角色")
    print(f"SillyTavern格式的角色卡保存在: {output_dir}")


if __name__ == "__main__":
    convert_to_tavern_format()