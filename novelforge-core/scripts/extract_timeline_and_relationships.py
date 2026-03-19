#!/usr/bin/env python3
"""
提取NovelForge输出中的时间线和关系数据
将时间线事件和关系数据分别保存到单独的文件夹中
"""

import json
import os
from pathlib import Path

def extract_timeline_and_relationships():
    # 定义输入和输出路径
    input_file = "novelforge-core/output_kaguya_new/final/worldbook.json"
    output_dir = "novelforge-core/output_kaguya_new/extracted"
    
    # 创建输出目录
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    timeline_dir = Path(output_dir) / "timeline_events"
    relationships_dir = Path(output_dir) / "relationships"
    
    timeline_dir.mkdir(exist_ok=True)
    relationships_dir.mkdir(exist_ok=True)
    
    print(f"正在从 {input_file} 中提取数据...")
    
    # 读取worldbook.json文件
    with open(input_file, 'r', encoding='utf-8') as f:
        worldbook_data = json.load(f)
    
    # 提取时间线事件
    timeline_events = worldbook_data.get("timeline_events", [])
    print(f"找到 {len(timeline_events)} 个时间线事件")
    
    # 保存时间线事件到单独的文件
    timeline_file = timeline_dir / "timeline_events.json"
    with open(timeline_file, 'w', encoding='utf-8') as f:
        json.dump(timeline_events, f, ensure_ascii=False, indent=2)
    print(f"时间线事件已保存到 {timeline_file}")
    
    # 提取关系数据
    relationships = worldbook_data.get("relationships", [])
    print(f"找到 {len(relationships)} 个关系")
    
    # 保存关系数据到单独的文件
    relationships_file = relationships_dir / "relationships.json"
    with open(relationships_file, 'w', encoding='utf-8') as f:
        json.dump(relationships, f, ensure_ascii=False, indent=2)
    print(f"关系数据已保存到 {relationships_file}")
    
    # 创建摘要报告
    summary = {
        "total_timeline_events": len(timeline_events),
        "total_relationships": len(relationships),
        "timeline_events_sample": timeline_events[:3],  # 前3个作为示例
        "relationships_sample": relationships[:3]  # 前3个作为示例
    }
    
    summary_file = Path(output_dir) / "summary.json"
    with open(summary_file, 'w', encoding='utf-8') as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    print(f"摘要报告已保存到 {summary_file}")
    
    print(f"\n提取完成！数据已保存到 {output_dir} 目录中")
    print(f"- 时间线事件: {timeline_dir}/timeline_events.json")
    print(f"- 关系数据: {relationships_dir}/relationships.json")

if __name__ == "__main__":
    extract_timeline_and_relationships()