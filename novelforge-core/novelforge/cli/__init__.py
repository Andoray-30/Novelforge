"""
应用层 - 命令行界面
"""

from novelforge.cli.main import cli

def main():
    """CLI入口点"""
    cli()

__all__ = [
    "cli",
    "main",
]
