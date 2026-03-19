"""
命令行界面 - 支持V5完全优化版
"""

import asyncio
import json
import sys
import signal
from pathlib import Path
from typing import Optional

import chardet
from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn
from rich.table import Table
from rich.panel import Panel
import click

from novelforge.core.config import Config
from novelforge.services.ai_service import AIService
from novelforge.core.models import Character
from novelforge.base import ExtractionStatus, ExtractionPhase
from novelforge.base.parser import DocumentParser, ParsedDocument
# 删除对safe和parallel的引用
# 删除对parallel的引用
from novelforge.extractors.multi_window_orchestrator import (
    MultiWindowOrchestrator,
    MultiWindowConfig,
)
from novelforge.quality.scorer import (
    QualityScorer,
    display_quality_score,
)
from novelforge.quality.evaluator import (
    QualityEvaluator,
    display_character_quality,
)
from novelforge.world_tree import WorldTreeBuilder
from novelforge.services.tavern_converter import SillyTavernConverter

console = Console()


def detect_encoding(file_path: Path) -> str:
    """读取文件内容，自动检测编码"""
    with open(file_path, 'rb') as f:
        raw_data = f.read()
        result = chardet.detect(raw_data)
        encoding = result['encoding']
        confidence = result['confidence']
        
        if confidence < 0.7:
            console.print(f"[yellow]编码检测置信度较低 ({confidence:.2f})，使用 UTF-8[/yellow]")
            return 'utf-8'
        else:
            console.print(f"[dim]检测到编码: {encoding} (置信度: {confidence:.2f})[/dim]")
            return encoding


def read_file(file_path: Path) -> str:
    """读取文件内容，自动检测编码"""
    encodings = ['utf-8', 'gbk', 'gb2312', 'ascii']
    
    # 尝试检测编码
    detected_encoding = detect_encoding(file_path)
    encodings.insert(0, detected_encoding)  # 优先使用检测到的编码
    
    for encoding in encodings:
        try:
            with open(file_path, 'r', encoding=encoding) as f:
                content = f.read()
                console.print(f"[dim]使用编码 {encoding} 成功读取文件[/dim]")
                return content
        except UnicodeDecodeError:
            continue
        except Exception as e:
            try:
                # 如果上面的编码都失败，尝试使用系统默认编码
                with open(file_path, 'r', encoding=sys.getdefaultencoding()) as f:
                    content = f.read()
                    console.print(f"[dim]使用系统默认编码 {sys.getdefaultencoding()} 成功读取文件[/dim]")
                    return content
            except Exception:
                raise

    raise ValueError(f"无法使用常见编码读取文件: {file_path}")


def get_project_name(input_file: Path) -> str:
    """从输入文件路径获取项目名称"""
    return input_file.stem


def get_output_path(output: str, default_filename: str = None, project_name: str = None) -> Path:
    """获取输出路径，支持相对路径和绝对路径"""
    path = Path(output)
    if not path.exists():
        path.mkdir(parents=True, exist_ok=True)
    
    if default_filename:
        if project_name:
            filename = default_filename.format(project_name=project_name)
        else:
            filename = default_filename
        return path / filename
    return path


def save_json(data, output_path: Path):
    """保存为 JSON 文件"""
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def display_characters(characters: list[Character]):
    """显示提取的角色信息"""
    table = Table(title="提取的角色信息")
    table.add_column("姓名", style="cyan")
    table.add_column("性别", style="magenta")
    table.add_column("年龄", style="green")
    table.add_column("角色", style="yellow")
    table.add_column("个性", style="blue")
    
    for char in characters:
        age_str = str(char.age) if char.age else "未知"
        gender_str = str(char.gender) if char.gender else "未知"
        role_str = str(char.role) if char.role else "未知"
        personality_str = ", ".join(char.personality[:3])  # 只显示前3个个性特征
        
        table.add_row(
            char.name,
            gender_str,
            age_str,
            role_str,
            personality_str
        )
    
    console.print(table)


def display_tavern_cards_with_scores(cards: list, scores: list[dict]):
    """显示评分后的酒馆卡片"""
    for card, score in zip(cards, scores):
        console.print(f"\n[yellow]角色: {card['name']}[/yellow]")
        console.print(f"总分: {score['total_score']}/100")
        console.print(f"完整性: {score['completeness']}/30")
        console.print(f"一致性: {score['consistency']}/30")
        console.print(f"相关性: {score['relevance']}/40")
        console.print("---")


def display_world(world: dict):
    """显示提取的世界观信息"""
    console.print(f"[bold cyan]世界观信息[/bold cyan]")
    console.print(f"标题: {world.get('title', 'N/A')}")
    console.print(f"作者: {world.get('author', 'N/A')}")
    console.print(f"世界观描述: {world.get('world_setting', 'N/A')[:200]}...")


@click.group()
@click.option('--config', '-c', type=click.Path(exists=True), help='配置文件路径')
@click.pass_context
def cli(ctx: click.Context, config: Optional[str]):
    """NovelForge - 小说内容提取工具
    
    重构后的提取器使用多窗口协调器，提供更好的模块化和扩展性：
    - multi-extract --v5: 使用重构后的多窗口协调器
    - complete-extract: 全新推荐的完整提取命令
    """
    config_obj = Config.load(config)
    ctx.ensure_object(dict)
    ctx.obj['config'] = config_obj


@cli.command()
@click.argument("input_file", type=click.Path(exists=True))
@click.option("--output", "-o", type=click.Path(), default="output", help="输出目录")
@click.option("--evaluate", is_flag=True, help="启用质量评估")
@click.option("--v5", is_flag=True, help="使用V5完全优化版提取器（推荐）")
@click.pass_context
def characters(ctx: click.Context, input_file: str, output: str, evaluate: bool, v5: bool):
    """从小说文件中提取角色卡"""
    config: Config = ctx.obj["config"]
    
    file_path = Path(input_file)
    output_dir = Path(output)
    project_name = get_project_name(file_path)
    
    console.print(f"[bold blue]NovelForge 角色提取[/bold blue]")
    console.print(f"文件: {file_path.name}")
    console.print(f"输出: {output_dir}")
    console.print(f"版本: {'V5完全优化版' if v5 else '原版'}")
    
    try:
        text = read_file(file_path)
        console.print(f"[dim]读取文件成功，共 {len(text)} 字符[/dim]")
    except Exception as e:
        console.print(f"[red]读取文件失败: {e}[/red]")
        sys.exit(1)
    
    async def extract():
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(),
            console=console,
        ) as progress_bar:
            task_id = progress_bar.add_task("准备中...", total=None)
            
            if v5:
                console.print("[cyan]使用重构后的多窗口协调器（协调所有提取模块）[/cyan]")
                from novelforge.extractors.multi_window_orchestrator import MultiWindowOrchestrator, MultiWindowConfig
                
                # 使用MultiWindowOrchestrator提取所有信息
                mw_config = MultiWindowConfig(
                    num_workers=2,  # 减少worker数量
                    max_concurrent_per_worker=1,  # 减少并发数
                    chunk_size=5000,
                    chunk_overlap=500,
                    workspace_dir=str(output_dir),
                    api_timeout=300.0,
                    request_delay=0.5,
                    max_retries=2,
                    retry_delay=1.0,
                )
                
                ai_service = AIService(config)
                extractor = MultiWindowOrchestrator(ai_service, config, mw_config)
                
                progress_bar.update(task_id, description="分析小说内容...")
                result = await extractor.extract_for_cli(text)
                
                # 提取角色数据
                characters = result.get("characters", [])
                
                # 转换为酒馆卡片格式
                tavern_cards = []
                for char in characters:
                    tavern_card = SillyTavernConverter.character_to_tavern_card(char)
                    tavern_cards.append(tavern_card)
            else:
                console.print("[cyan]使用传统提取器[/cyan]")
                ai_service = AIService(config)
                extractor = CharacterExtractor(ai_service, config)
                
                progress_bar.update(task_id, description="识别角色...")
                names = await extractor._identify_characters(text)
                
                progress_bar.update(task_id, description="提取角色信息...")
                characters = []
                tavern_cards = []
                
                total = len(names)
                for i, name in enumerate(names, 1):
                    progress_bar.update(task_id, description=f"提取角色信息: {name}", completed=i, total=total)
                    try:
                        char = await extractor._extract_character_info(text, name)
                        characters.append(char)
                        
                        # 转换为酒馆卡片格式
                        tavern_card = SillyTavernConverter.character_to_tavern_card(char)
                        tavern_cards.append(tavern_card)
                    except Exception as e:
                        console.print(f"[red]提取角色 {name} 失败: {e}[/red]")
                        continue
            
            # 保存角色数据
            output_dir.mkdir(parents=True, exist_ok=True)
            
            # 保存原始角色数据
            chars_output_path = get_output_path(output_dir, "{project_name}_characters.json", project_name)
            save_json([char.model_dump() for char in characters], chars_output_path)
            console.print(f"[green]角色数据已保存至: {chars_output_path}[/green]")
            
            # 保存酒馆卡片
            cards_output_path = get_output_path(output_dir, "{project_name}_tavern_cards.json", project_name)
            save_json(tavern_cards, cards_output_path)
            console.print(f"[green]酒馆卡片已保存至: {cards_output_path}[/green]")
            
            # 显示结果
            display_characters(characters)
            
            # 评估质量（如果启用）
            if evaluate and tavern_cards:
                progress_bar.update(task_id, description="评估角色卡质量...")
                evaluator = QualityEvaluator()
                scores = evaluator.evaluate_characters(tavern_cards)
                display_tavern_cards_with_scores(tavern_cards, scores)
                
                # 保存评分结果
                scores_output_path = get_output_path(output_dir, "{project_name}_quality_scores.json", project_name)
                save_json(scores, scores_output_path)
                console.print(f"[green]质量评分已保存至: {scores_output_path}[/green]")

    try:
        asyncio.run(extract())
    except KeyboardInterrupt:
        console.print("\n[yellow]提取被用户中断[/yellow]")
        sys.exit(0)
    except Exception as e:
        console.print(f"[red]提取过程中发生错误: {e}[/red]")
        import traceback
        console.print(f"[red]{traceback.format_exc()}[/red]")
        sys.exit(1)


@cli.command()
@click.argument("input_file", type=click.Path(exists=True))
@click.option("--output", "-o", type=click.Path(), default="output", help="输出目录")
@click.option("--evaluate", is_flag=True, help="启用质量评估")
@click.option("--v5", is_flag=True, help="使用V5完全优化版提取器（推荐）")
@click.pass_context
def world(ctx: click.Context, input_file: str, output: str, evaluate: bool, v5: bool):
    """从小说文件中提取世界书"""
    config: Config = ctx.obj["config"]
    
    file_path = Path(input_file)
    output_dir = Path(output)
    project_name = get_project_name(file_path)
    
    console.print(f"[bold blue]NovelForge 世界观提取[/bold blue]")
    console.print(f"文件: {file_path.name}")
    console.print(f"输出: {output_dir}")
    console.print(f"版本: {'V5完全优化版' if v5 else '原版'}")
    
    try:
        text = read_file(file_path)
        console.print(f"[dim]读取文件成功，共 {len(text)} 字符[/dim]")
    except Exception as e:
        console.print(f"[red]读取文件失败: {e}[/red]")
        sys.exit(1)
    
    async def extract():
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(),
            console=console,
        ) as progress_bar:
            task_id = progress_bar.add_task("准备中...", total=None)
            
            if v5:
                console.print("[cyan]使用重构后的多窗口协调器（协调所有提取模块）[/cyan]")
                from novelforge.extractors.multi_window_orchestrator import MultiWindowOrchestrator, MultiWindowConfig
                
                # 使用MultiWindowOrchestrator提取所有信息
                mw_config = MultiWindowConfig(
                    num_workers=2,  # 减少worker数量
                    max_concurrent_per_worker=1,  # 减少并发数
                    chunk_size=5000,
                    chunk_overlap=500,
                    workspace_dir=str(output_dir),
                    api_timeout=300.0,
                    request_delay=0.5,
                    max_retries=2,
                    retry_delay=1.0,
                )
                
                ai_service = AIService(config)
                extractor = MultiWindowOrchestrator(ai_service, config, mw_config)
                
                progress_bar.update(task_id, description="分析小说内容...")
                result = await extractor.extract_for_cli(text)
                
                # 提取世界观数据
                locations = result.get("locations", [])
                world_info = result.get("world_info", "")
                
                # 构建世界书
                world_book = SillyTavernConverter.world_setting_to_character_book(locations, world_info)
            else:
                console.print("[cyan]使用传统提取器[/cyan]")
                ai_service = AIService(config)
                extractor = WorldExtractor(ai_service, config)
                
                progress_bar.update(task_id, description="提取世界观...")
                world_info = await extractor.extract_world_info(text)
                
                # 构建简单的世界书结构
                world_book = {
                    "name": f"{project_name}_worldbook",
                    "description": world_info,
                    "entries": []
                }
            
            # 保存世界书
            output_dir.mkdir(parents=True, exist_ok=True)
            output_path = get_output_path(output_dir, "{project_name}_worldbook.json", project_name)
            save_json(world_book, output_path)
            console.print(f"[green]世界书已保存至: {output_path}[/green]")
            
            # 显示结果
            display_world(world_book)

    try:
        asyncio.run(extract())
    except KeyboardInterrupt:
        console.print("\n[yellow]提取被用户中断[/yellow]")
        sys.exit(0)
    except Exception as e:
        console.print(f"[red]提取过程中发生错误: {e}[/red]")
        import traceback
        console.print(f"[red]{traceback.format_exc()}[/red]")
        sys.exit(1)


@cli.command()
@click.argument("input_file", type=click.Path(exists=True))
@click.option("--output", "-o", type=click.Path(), default="output", help="输出目录")
@click.option("--max-characters", "-m", type=int, default=20, help="最大提取角色数")
@click.option("--workers", "-w", type=int, default=2, help="Worker数量")  # 修改默认值
@click.option("--chunk-size", type=int, default=5000, help="切片大小")
@click.option("--concurrency", type=int, default=1, help="每个Worker的并发数")  # 修改默认值
@click.option("--v5", is_flag=True, help="使用重构后的多窗口协调器（推荐）")
@click.pass_context
def multi_extract(
    ctx: click.Context,
    input_file: str,
    output: str,
    max_characters: int,
    workers: int,
    chunk_size: int,
    concurrency: int,
    v5: bool,
):
    """使用多窗口并发提取（推荐用于大文件）
    
    此命令使用磁盘缓存机制，内存占用极低（<5MB），
    支持断点续传，适合处理大型小说文件。
    
    示例:
        novelforge multi-extract novel.txt -o workspace/
        novelforge multi-extract novel.txt --v5  # 使用重构后的多窗口协调器
    """
    config: Config = ctx.obj["config"]
    config.max_characters = max_characters
    
    file_path = Path(input_file)
    output_dir = Path(output)
    project_name = get_project_name(file_path)
    
    console.print(Panel(
        f"[bold blue]NovelForge 多窗口并发提取[/bold blue]\n"
        f"文件: {file_path.name}\n"
        f"输出: {output_dir}\n"
        f"Workers: {workers}\n"
        f"切片大小: {chunk_size}\n"
        f"版本: {'重构后多窗口协调器' if v5 else '原版'}"
    ))
    
    try:
        text = read_file(file_path)
        console.print(f"[dim]读取文件成功，共 {len(text)} 字符[/dim]")
    except Exception as e:
        console.print(f"[red]读取文件失败: {e}[/red]")
        sys.exit(1)
    
    # 配置多窗口并发
    if v5:
        from novelforge.extractors.multi_window_orchestrator import MultiWindowOrchestrator, MultiWindowConfig
        
        mw_config = MultiWindowConfig(
            num_workers=workers,
            max_concurrent_per_worker=concurrency,
            chunk_size=chunk_size,
            chunk_overlap=500,
            workspace_dir=str(output_dir),
            api_timeout=300.0,
            request_delay=0.5,
            max_retries=2,
            retry_delay=1.0,
        )
        
        ai_service = AIService(config)
        extractor = MultiWindowOrchestrator(ai_service, config, mw_config)
    else:
        # 当不使用V5时，使用CharacterExtractor作为回退
        ai_service = AIService(config)
        extractor = CharacterExtractor(ai_service, config)
        
        # 为兼容性创建一个包装类，提供相同的接口
        class LegacyExtractorWrapper:
            def __init__(self, extractor):
                self.extractor = extractor
                
            async def extract(self, text, on_progress=None):
                # 使用CharacterExtractor提取角色
                if on_progress:
                    on_progress("使用传统提取器", 0, 1)
                
                characters = await self.extractor.extract(text)
                
                # 返回与V5提取器兼容的格式
                return {
                    "characters": characters,
                    "locations": [],
                    "world_info": "",
                    "timeline_events": [],
                    "network_edges": []
                }
            
            def resume(self):
                return None
        
        extractor = LegacyExtractorWrapper(extractor)
    
    async def extract():
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(),
            console=console,
        ) as progress_bar:
            task_id = progress_bar.add_task("准备中...", total=None)
            
            def on_progress(message: str, current: int, total: int):
                progress_bar.update(task_id, description=message, completed=current, total=total)
            
            progress_bar.update(task_id, description="初始化提取器...")
            
            if v5:
                # 使用extract_with_conversion来提取并保存结果
                result = await extractor.extract_with_conversion(text, output_dir, on_progress)
                
                # 显示统计信息
                console.print(f"\n[bold green]提取完成！[/bold green]")
                console.print(f"角色数: {len(result.get('characters', []))}")
                console.print(f"地点数: {len(result.get('locations', [])) if 'locations' in result else len(result.get('world_setting', {}).get('locations', []))}")
                console.print(f"时间线事件数: {len(result.get('timeline_events', []))}")
                console.print(f"关系数: {len(result.get('relationships', [])) if 'relationships' in result else len(result.get('network_edges', []))}")
                
                console.print(f"[green]结果已保存到: {output_dir}[/green]")
            else:
                # 原版提取器逻辑
                result = await extractor.extract(text, on_progress)
                
                # 保存结果
                output_dir.mkdir(parents=True, exist_ok=True)
                
                # 保存角色数据
                if 'characters' in result:
                    chars_output_path = get_output_path(output_dir, "{project_name}_characters.json", project_name)
                    save_json([char.model_dump() for char in result['characters']], chars_output_path)
                    console.print(f"[green]角色数据已保存至: {chars_output_path}[/green]")
                
                # 保存世界书数据
                if 'world_info' in result and result['world_info']:
                    world_output_path = get_output_path(output_dir, "{project_name}_worldbook.json", project_name)
                    save_json({"name": f"{project_name}_worldbook", "description": result['world_info']}, world_output_path)
                    console.print(f"[green]世界书已保存至: {world_output_path}[/green]")
                
                # 显示统计信息
                console.print(f"\n[bold green]提取完成！[/bold green]")
                console.print(f"角色数: {len(result.get('characters', []))}")
                console.print(f"地点数: {len(result.get('locations', []))}")
                console.print(f"时间线事件数: {len(result.get('timeline_events', []))}")
                console.print(f"关系数: {len(result.get('network_edges', []))}")
                
                console.print(f"[green]结果已保存到: {output_dir}[/green]")

    try:
        # 注册信号处理器以支持优雅关闭
        def signal_handler(signum, frame):
            console.print("\n[yellow]正在中断提取过程...[/yellow]")
            sys.exit(0)
        
        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)
        
        asyncio.run(extract())
    except KeyboardInterrupt:
        console.print("\n[yellow]提取被用户中断[/yellow]")
        sys.exit(0)
    except Exception as e:
        console.print(f"[red]提取过程中发生错误: {e}[/red]")
        import traceback
        console.print(f"[red]{traceback.format_exc()}[/red]")
        sys.exit(1)


@cli.command()
@click.argument("input_file", type=click.Path(exists=True))
@click.option("--output", "-o", type=click.Path(), default="output", help="输出目录")
@click.option("--workers", "-w", type=int, default=2, help="Worker数量")
@click.option("--chunk-size", type=int, default=5000, help="切片大小")
@click.option("--concurrency", type=int, default=1, help="每个Worker的并发数")
@click.pass_context
def complete_extract(
    ctx: click.Context,
    input_file: str,
    output: str,
    workers: int,
    chunk_size: int,
    concurrency: int,
):
    """使用重构后的多窗口协调器进行完整提取（推荐）
    
    此命令使用重构后的多窗口协调器，同时提取角色、世界观、时间线和关系网络，
    是未来版本的主要提取命令。
    
    示例:
        novelforge complete-extract novel.txt -o workspace/
    """
    config: Config = ctx.obj["config"]
    
    file_path = Path(input_file)
    output_dir = Path(output)
    project_name = get_project_name(file_path)
    
    console.print(Panel(
        f"[bold blue]NovelForge 完整提取（重构版）[/bold blue]\n"
        f"文件: {file_path.name}\n"
        f"输出: {output_dir}\n"
        f"Workers: {workers}\n"
        f"切片大小: {chunk_size}\n"
        f"重构后的多窗口协调器"
    ))
    
    try:
        text = read_file(file_path)
        console.print(f"[dim]读取文件成功，共 {len(text)} 字符[/dim]")
    except Exception as e:
        console.print(f"[red]读取文件失败: {e}[/red]")
        sys.exit(1)
    
    from novelforge.extractors.multi_window_orchestrator import MultiWindowOrchestrator, MultiWindowConfig
    
    mw_config = MultiWindowConfig(
        num_workers=workers,
        max_concurrent_per_worker=concurrency,
        chunk_size=chunk_size,
        chunk_overlap=500,
        workspace_dir=str(output_dir),
        api_timeout=300.0,
        request_delay=0.5,
        max_retries=2,
        retry_delay=1.0,
    )
    
    ai_service = AIService(config)
    extractor = MultiWindowOrchestrator(ai_service, config, mw_config)
    
    async def extract():
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(),
            console=console,
        ) as progress_bar:
            task_id = progress_bar.add_task("准备中...", total=None)
            
            def on_progress(message: str, current: int, total: int):
                progress_bar.update(task_id, description=message, completed=current, total=total)
            
            progress_bar.update(task_id, description="初始化重构后的多窗口协调器...")
            result = await extractor.extract_with_conversion(text, output_dir, on_progress)
            
            # 显示统计信息
            console.print(f"\n[bold green]完整提取完成！[/bold green]")
            console.print(f"角色数: {len(result.get('characters', []))}")
            console.print(f"地点数: {len(result.get('locations', [])) if 'locations' in result else len(result.get('world_setting', {}).get('locations', []))}")
            console.print(f"时间线事件数: {len(result.get('timeline_events', []))}")
            console.print(f"关系数: {len(result.get('relationships', []))}")
            
            console.print(f"[green]结果已保存到: {output_dir}[/green]")

    try:
        # 注册信号处理器以支持优雅关闭
        def signal_handler(signum, frame):
            console.print("\n[yellow]正在中断提取过程...[/yellow]")
            sys.exit(0)
        
        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)
        
        asyncio.run(extract())
    except KeyboardInterrupt:
        console.print("\n[yellow]提取被用户中断[/yellow]")
        sys.exit(0)
    except Exception as e:
        console.print(f"[red]提取过程中发生错误: {e}[/red]")
        import traceback
        console.print(f"[red]{traceback.format_exc()}[/red]")
        sys.exit(1)


@cli.command()
def version():
    """显示版本信息"""
    console.print("[bold]NovelForge v1.0.0[/bold]")
    console.print("小说内容提取工具")
