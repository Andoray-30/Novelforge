# NovelForge 测试使用指南

本指南提供详细的步骤和示例，帮助开发者正确使用NovelForge的测试文件。

## 环境准备

### 1. 设置Python虚拟环境

```bash
# 在novelforge-core目录下创建虚拟环境
python -m venv venv

# 激活虚拟环境
# Windows
venv\Scripts\activate
# macOS/Linux
source venv/bin/activate

# 安装项目依赖
pip install -e .
pip install pytest pytest-asyncio pytest-cov
```

### 2. 配置环境变量

复制示例环境文件并根据需要修改：

```bash
copy .env.example .env
# 编辑.env文件，设置必要的API密钥和其他配置
```

### 3. 前端依赖安装

```bash
# 进入frontend目录
cd frontend

# 安装Node.js依赖
npm install

# 返回上级目录
cd ..
```

## Python测试使用示例

### 运行所有Python测试

```bash
# 在novelforge-core目录下
python -m pytest tests/python/ -v
```

### 运行特定测试文件

```bash
# 运行后端功能测试
python -m pytest tests/python/test_backend_features.py -v

# 运行文本处理测试
python -m pytest tests/python/test_text_processing.py -v
```

### 运行特定测试函数

```bash
# 运行特定测试函数（假设函数名为test_extract_characters）
python -m pytest tests/python/test_extractor_interface.py::test_extract_characters -v
```

### 带覆盖率报告的测试

```bash
# 生成HTML覆盖率报告
python -m pytest tests/python/ --cov=novelforge --cov-report=html --cov-report=term
```

### 并行测试执行

```bash
# 安装pytest-xdist插件后可以并行运行
pip install pytest-xdist
python -m pytest tests/python/ -n auto
```

## 前端测试使用示例

### 运行所有前端测试

```bash
# 在novelforge-core/frontend目录下
npm test
```

### 运行特定前端测试

```bash
# 运行错误处理测试
npm test -- tests/error-handling.test.tsx
```

### 监听模式下的测试

```bash
# 在开发过程中自动重新运行测试
npm test -- --watch
```

### 调试前端测试

```bash
# 启用调试模式
npm test -- --inspect-brk
```

## 常见测试场景

### 场景1: 验证新功能

当你添加新功能时，创建相应的测试文件：

```python
# tests/python/test_new_feature.py
import pytest
from novelforge.core.models import Character

def test_new_character_creation():
    """测试新角色创建功能"""
    character = Character(name="Test Character", description="Test description")
    assert character.name == "Test Character"
    assert character.description == "Test description"
```

### 场景2: 回归测试

确保现有功能在代码更改后仍然正常工作：

```bash
# 运行所有回归测试
python -m pytest tests/python/ -m "not slow"  # 排除慢速测试
```

### 圏景3: 性能基准测试

比较不同实现的性能：

```bash
# 运行性能测试
python -m pytest tests/python/test_storage_performance.py --benchmark-only
```

## 测试命令参考

### Python测试命令

| 命令 | 描述 |
|------|------|
| `python -m pytest tests/python/` | 运行所有Python测试 |
| `python -m pytest tests/python/ -v` | 详细输出模式 |
| `python -m pytest tests/python/ -s` | 显示print输出 |
| `python -m pytest tests/python/ -k "text"` | 运行包含"text"的测试 |
| `python -m pytest tests/python/ --lf` | 仅运行上次失败的测试 |
| `python -m pytest tests/python/ --ff` | 先运行失败的测试 |

### 前端测试命令

| 命令 | 描述 |
|------|------|
| `npm test` | 运行所有前端测试 |
| `npm test -- --watch` | 监听文件变化自动测试 |
| `npm test -- --coverage` | 生成覆盖率报告 |
| `npm test -- --verbose` | 详细输出 |

## 故障排除

### 问题1: ImportError或ModuleNotFoundError

**解决方案**: 确保在虚拟环境中，并且已安装可编辑版本的包：

```bash
pip install -e .
```

### 问题2: 环境变量缺失

**解决方案**: 复制并配置.env文件：

```bash
copy .env.example .env
# 编辑必要的配置项
```

### 问题3: 测试超时

**解决方案**: 增加超时时间或标记为慢速测试：

```python
@pytest.mark.slow
def test_slow_function():
    # 慢速测试
    pass
```

### 问题4: 数据库连接失败

**解决方案**: 确保数据库服务正在运行，或使用内存数据库进行测试：

```python
# 在测试中使用内存存储
from novelforge.storage.memory_storage import MemoryStorage
```

## 最佳实践

1. **测试隔离**: 每个测试应该是独立的，不依赖其他测试的状态
2. **命名清晰**: 测试函数名应该清楚地描述被测试的行为
3. **覆盖边界**: 包括正常情况、边界情况和错误情况
4. **避免外部依赖**: 尽可能使用mock来隔离外部服务
5. **保持快速**: 单元测试应该快速执行（通常<100ms）
6. **定期运行**: 将测试集成到CI/CD流程中

## 示例：完整的测试工作流

```bash
# 1. 激活虚拟环境
venv\Scripts\activate

# 2. 安装依赖
pip install -e .
pip install pytest

# 3. 配置环境
copy .env.example .env

# 4. 运行特定测试
python -m pytest tests/python/test_text_processing.py -v

# 5. 运行所有测试
python -m pytest tests/python/ --cov=novelforge

# 6. 查看覆盖率报告
# 打开htmlcov/index.html
```

通过遵循这些指南，你可以有效地使用NovelForge的测试套件来确保代码质量和功能正确性。
