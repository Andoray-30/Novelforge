"""
SillyTavern转换器模块
从multi_window_v5.py中提取的SillyTavern转换相关功能
"""

import json
from pathlib import Path
from typing import List, Dict, Any

from novelforge.core.models import Character, Location
from novelforge.services.tavern_converter import SillyTavernConverter


class TavernConverter:
    """SillyTavern转换器实现"""
    
    def __init__(self):
        self.converter = SillyTavernConverter()
    
    def convert_to_tavern_card(self, character: Character) -> Dict[str, Any]:
        """
        转换为SillyTavern卡片格式
        
        Args:
            character: 角色对象
            
        Returns:
            Dict[str, Any]: SillyTavern卡片格式
        """
        return self.converter.character_to_tavern_card(character)
    
    def generate_first_message(self, character: Character) -> str:
        """
        生成角色的第一句话
        
        Args:
            character: 角色对象
            
        Returns:
            str: 第一句话
        """
        if character.description:
            desc = character.description[:100] + "..." if len(character.description) > 100 else character.description
            return f"你好，我是{character.name}。{desc}"
        else:
            return f"你好，我是{character.name}。很高兴认识你！"
    
    def convert_to_character_book(self, locations: List[Location], world_info: str) -> Dict[str, Any]:
        """
        转换为角色书格式
        
        Args:
            locations: 地点列表
            world_info: 世界信息
            
        Returns:
            Dict[str, Any]: 角色书格式
        """
        return self.converter.world_setting_to_character_book(locations, world_info)
    
    def save_tavern_cards(self, characters: List[Character], output_dir: Path) -> None:
        """
        保存SillyTavern卡片
        
        Args:
            characters: 角色列表
            output_dir: 输出目录
        """
        characters_dir = output_dir / "characters"
        characters_dir.mkdir(parents=True, exist_ok=True)
        
        for character in characters:
            tavern_card = self.convert_to_tavern_card(character)
            
            # 确保文件名安全：替换Windows不支持的字符
            safe_name = self._sanitize_filename(character.name)
            filename = f"{safe_name}.json"
            filepath = characters_dir / filename
            
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(tavern_card, f, ensure_ascii=False, indent=2)
    
    def _sanitize_filename(self, filename: str) -> str:
        """
        确保文件名安全，替换Windows不支持的字符
        
        Args:
            filename: 原始文件名
            
        Returns:
            安全的文件名
        """
        # Windows文件名不支持的字符
        invalid_chars = ['<', '>', ':', '"', '/', '\\', '|', '?', '*']
        
        # 替换为下划线
        safe_name = filename
        for char in invalid_chars:
            safe_name = safe_name.replace(char, '_')
        
        # 确保文件名长度合理
        if len(safe_name) > 100:
            safe_name = safe_name[:100]
        
        # 确保文件名不为空
        if not safe_name or safe_name.isspace():
            safe_name = "unnamed_character"
        
        return safe_name
    
    def save_world_info(self, locations: List[Location], world_info: str, output_dir: Path) -> None:
        """
        保存世界信息
        
        Args:
            locations: 地点列表
            world_info: 世界信息
            output_dir: 输出目录
        """
        world_info_data = self.convert_to_character_book(locations, world_info)
        filename = "world_info.json"
        filepath = output_dir / filename
        
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(world_info_data, f, ensure_ascii=False, indent=2)