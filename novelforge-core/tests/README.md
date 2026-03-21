# NovelForge 测试套件

本目录包含NovelForge项目的所有正式测试文件，按照语言和类型进行组织。

## 目录结构

```
tests/
├── python/                    # Python后端测试文件
│   ├── test_backend_features.py      # 后端功能测试
│   ├── test_config_validation.py     # 配置验证测试
│   ├── test_enum.py                  # 枚举类型测试
│   ├── test_error_handling.py        # 错误处理测试
│   ├── test_extractor_interface.py   # 提取器接口测试
│   ├── test_storage_performance.py   # 存储性能测试
│   └── test_text_processing.py       # 文本处理测试
└── frontend/                 # 前端测试文件
    └── error-handling.test.tsx       # 前端错误处理测试
```

## 测试文件用途

### Python测试文件

- **test_backend_features.py**: 测试后端核心功能和API端点
- **test_config_validation.py**: 验证配置文件和环境变量的正确性
- **test_enum.py**: 测试枚举类型的定义和使用
- **test_error_handling.py**: 验证错误处理机制和异常捕获
- **test_extractor_interface.py**: 测试提取器接口的一致性和功能
- **test_storage_performance.py**: 评估存储系统的性能指标
- **test_text_processing.py**: 测试文本处理和分析功能

### 前端测试文件

- **error-handling.test.tsx**: 测试前端组件的错误处理和用户反馈

## 运行测试

所有测试文件都设计为在虚拟环境中运行，确保依赖隔离和测试一致性。

### Python测试

使用pytest或unittest框架运行Python测试：

```bash
# 在novelforge-core目录下
python -m pytest tests/python/
# 或者
python -m unittest discover tests/python/
```

### 前端测试

使用Jest或Vitest运行前端测试：

```bash
# 在novelforge-core/frontend目录下
npm test
# 或者运行特定测试
npm test -- tests/error-handling.test.tsx
```

## 虚拟环境要求

为确保测试的稳定性和可重复性，请使用Python虚拟环境：

1. 创建虚拟环境：

   ```bash
   python -m venv venv
   ```

2. 激活虚拟环境：
   - Windows: `venv\Scripts\activate`
   - macOS/Linux: `source venv/bin/activate`

3. 安装依赖：

   ```bash
   pip install -e .
   pip install pytest pytest-asyncio
   ```

4. 运行测试（在虚拟环境中）：

   ```bash
   python -m pytest tests/python/
   ```

## 测试维护

- 所有新的测试文件都应该添加到相应的子目录中
- 保持测试文件的命名一致性（以`test_`开头）
- 确保测试覆盖关键功能和边界情况
- 定期运行测试以验证代码更改不会破坏现有功能

## 注意事项

- 测试文件依赖于项目的正确配置和环境变量
- 某些测试可能需要网络连接或外部API访问
- 性能测试可能需要较长的执行时间
- 确保在运行测试前设置正确的`.env`文件
