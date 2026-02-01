#!/usr/bin/env python3
"""
批量修复模型文件中的 schema 定义，兼容 SQLite
"""

import re
from pathlib import Path

def fix_table_args(content: str) -> str:
    """
    将形如：
        __table_args__ = (
            Index(...),
            get_table_args(schema="admin")
        )

    替换为：
        __table_args__ = get_table_args(
            Index(...),
            schema="admin"
        )
    """
    # 匹配 __table_args__ = ( ... get_table_args(schema="xxx") )
    pattern = r'(__table_args__\s*=\s*)\(\s*((.*?),\s*)?get_table_args\(schema="([^"]+)"\)\s*\)'

    def replacer(match):
        prefix = match.group(1)
        indices = match.group(3) or ""  # 索引部分（可能为None）
        schema = match.group(4)

        if indices:
            return f'{prefix}get_table_args(\n        {indices},\n        schema="{schema}"\n    )'
        else:
            return f'{prefix}get_table_args(schema="{schema}")'

    return re.sub(pattern, replacer, content, flags=re.DOTALL)


def process_file(file_path: Path):
    """处理单个文件"""
    print(f"Processing {file_path}...")

    content = file_path.read_text()
    original_content = content

    # 修复 table_args
    content = fix_table_args(content)

    if content != original_content:
        file_path.write_text(content)
        print(f"  ✅ Fixed")
    else:
        print(f"  ⏭  No changes needed")


def main():
    backend_dir = Path(__file__).parent.parent

    # 查找所有 models.py
    models_files = [
        backend_dir / "uteki/domains/admin/models.py",
        backend_dir / "uteki/domains/agent/models.py",
    ]

    for file_path in models_files:
        if file_path.exists():
            process_file(file_path)
        else:
            print(f"⚠️  File not found: {file_path}")


if __name__ == "__main__":
    main()
    print("\n✅ All done!")
