# API 请求速率测试工具

这是一个用于测试当前环境配置下API真实请求速率上限的工具。

## 环境要求

- Python 3.7 或更高版本

## 依赖安装

```bash
pip install -r api_rate_test_requirements.txt
```

或者单独安装:

```bash
pip install aiohttp python-dotenv
```

## 使用说明

### 运行测试

```bash
python test_api_rate_limit.py
```

### 功能说明

该脚本提供以下测试选项：

1. **测试特定数量的并发请求**: 发送指定数量的并发请求并显示结果
2. **自动测试速率限制**: 自动测试不同并发数下的API响应，找到实际的速率限制
3. **单个请求测试**: 发送单个请求以测试API连通性

### 测试结果输出

测试结果包括:
- 总请求数
- 成功请求数
- 失败请求数
- 总耗时
- 成功率
- 平均响应时间
- 每分钟实际请求数 (RPM)

### 环境变量

脚本会自动从 `novelforge-core/.env` 文件中读取以下配置:
- `OPENAI_API_KEY`: API密钥
- `OPENAI_BASE_URL`: API基础URL
- `OPENAI_MODEL`: 使用的模型
- `RPM_LIMIT`: 每分钟请求数限制
- `TPM_LIMIT`: 每分钟令牌数限制

### 注意事项

- 请确保在 `novelforge-core/.env` 文件中配置了正确的API密钥和URL
- 在测试时请注意不要超出服务商的速率限制，以免被封禁
- 测试并发请求时，建议从小数值开始逐步增加

## 代码结构

- `APITester` 类: 负责处理API请求和速率测试
- `make_request()`: 发送单个API请求
- `test_concurrent_requests()`: 测试并发请求
- `find_rate_limits()`: 自动测试速率限制