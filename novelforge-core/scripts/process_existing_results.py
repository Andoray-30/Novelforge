#!/usr/bin/env python3
"""
处理现有提取结果的脚本
使用新实现的分层AI合并算法处理现有的切片分析结果
"""

import asyncio
import json
import os
from pathlib import Path
from typing import List
from novelforge.core.models import Character, Location, TimelineEvent, NetworkEdge
from novelforge.services.ai_service import AIService
from novelforge.extractors.multi_window_v5 import MultiWindowExtractor, ChunkAnalysisResult


async def load_all_results(results_dir: str) -> List[ChunkAnalysisResult]:
    """从指定目录加载所有分析结果"""
    results = []
    results_path = Path(results_dir)
    
    print(f"正在从 {results_dir} 加载结果文件...")
    
    for result_file in results_path.glob("chunk_*_analysis.json"):
        try:
            with open(result_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                
                # 创建ChunkAnalysisResult对象
                result = ChunkAnalysisResult(
                    chunk_id=int(result_file.stem.split('_')[1]),  # 从文件名提取chunk_id
                    characters=[Character(**char_data) for char_data in data.get('characters', [])],
                    locations=[Location(**loc_data) for loc_data in data.get('locations', [])],
                    timeline_events=[TimelineEvent(**event_data) for event_data in data.get('timeline_events', [])],
                    network_edges=[NetworkEdge(**edge_data) for edge_data in data.get('network_edges', [])],
                    world_info=data.get('world_info', '')
                )
                
                results.append(result)
                print(f"已加载: {result_file.name} (角色: {len(result.characters)}, 地点: {len(result.locations)})")
                
        except Exception as e:
            print(f"加载 {result_file.name} 时出错: {e}")
    
    print(f"总共加载了 {len(results)} 个结果文件")
    return results


async def main():
    """主函数"""
    print("使用分层AI合并算法处理现有结果...")
    
    # 初始化AI服务
    ai_service = AIService()
    
    # 创建提取器实例
    extractor = MultiWindowExtractor(ai_service=ai_service)
    
    # 指定结果目录路径
    results_dir = "novelforge-core/workspace/results"  # 或者根据实际情况调整
    
    if not os.path.exists(results_dir):
        # 尝试其他可能的路径
        possible_paths = [
            "novelforge-core/workspace/results",
            "archives/workspace/results",
            "archives/workspace_new/results",
            "./workspace/results"
        ]
        
        results_dir = None
        for path in possible_paths:
            if os.path.exists(path):
                results_dir = path
                print(f"找到结果目录: {path}")
                break
        
        if results_dir is None:
            print("错误: 未找到结果目录，请检查路径")
            return
    
    # 加载所有结果
    all_results = await load_all_results(results_dir)
    
    if not all_results:
        print("没有找到任何结果文件")
        return
    
    # 收集所有实体
    print("\n正在收集所有实体...")
    all_characters = []
    all_locations = []
    all_world_info = []
    all_timeline_events = []
    all_network_edges = []
    
    for result in all_results:
        all_characters.extend(result.characters)
        all_locations.extend(result.locations)
        if result.world_info:
            all_world_info.append(result.world_info)
        all_timeline_events.extend(result.timeline_events)
        all_network_edges.extend(result.network_edges)
    
    print(f"收集到: {len(all_characters)} 个角色, {len(all_locations)} 个地点, "
          f"{len(all_timeline_events)} 个时间线事件, {len(all_network_edges)} 个关系")
    
    # 使用分层AI合并算法处理
    print("\n开始分层合并处理...")
    
    # 对角色进行分层合并
    print("正在合并角色...")
    merged_characters = await extractor._hierarchical_merge_characters(all_characters)
    
    # 对地点进行分层合并（使用现有的去重方法）
    print("正在合并地点...")
    merged_locations = extractor._deduplicate_locations(all_locations)
    
    # 对时间线事件进行分层合并
    print("正在合并时间线事件...")
    merged_timeline_events = await extractor._hierarchical_merge_timeline_events(all_timeline_events)
    
    # 对关系网络进行分层合并
    print("正在合并关系网络...")
    merged_network_edges = await extractor._hierarchical_merge_relationships(all_network_edges)
    
    # 合并世界信息
    merged_world_info = " ".join(filter(None, all_world_info))
    
    # 输出结果统计
    print(f"\n合并完成!")
    print(f"最终结果: {len(merged_characters)} 个角色, {len(merged_locations)} 个地点, "
          f"{len(merged_timeline_events)} 个时间线事件, {len(merged_network_edges)} 个关系")
    
    # 保存结果
    output_dir = Path("output")
    output_dir.mkdir(exist_ok=True)
    
    # 保存角色数据
    chars_output_path = output_dir / "merged_characters.json"
    with open(chars_output_path, "w", encoding="utf-8") as f:
        json.dump([c.model_dump() for c in merged_characters], f, ensure_ascii=False, indent=2)
    
    # 保存地点数据
    locs_output_path = output_dir / "merged_locations.json"
    with open(locs_output_path, "w", encoding="utf-8") as f:
        json.dump([l.model_dump() for l in merged_locations], f, ensure_ascii=False, indent=2)
    
    # 保存时间线事件
    timeline_output_path = output_dir / "merged_timeline_events.json"
    with open(timeline_output_path, "w", encoding="utf-8") as f:
        json.dump([e.model_dump() for e in merged_timeline_events], f, ensure_ascii=False, indent=2)
    
    # 保存关系网络
    relations_output_path = output_dir / "merged_network_edges.json"
    with open(relations_output_path, "w", encoding="utf-8") as f:
        json.dump([r.model_dump() for r in merged_network_edges], f, ensure_ascii=False, indent=2)
    
    # 保存世界信息
    world_output_path = output_dir / "merged_world_info.json"
    with open(world_output_path, "w", encoding="utf-8") as f:
        json.dump(merged_world_info, f, ensure_ascii=False, indent=2)
    
    print(f"\n结果已保存到 {output_dir} 目录:")
    print(f"- {chars_output_path} ({len(merged_characters)} 个角色)")
    print(f"- {locs_output_path} ({len(merged_locations)} 个地点)")
    print(f"- {timeline_output_path} ({len(merged_timeline_events)} 个时间线事件)")
    print(f"- {relations_output_path} ({len(merged_network_edges)} 个关系)")
    print(f"- {world_output_path} (世界信息)")


if __name__ == "__main__":
    asyncio.run(main())