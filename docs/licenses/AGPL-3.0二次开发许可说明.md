# SillyTavern AGPL-3.0 二次开发许可说明

## 📜 许可证类型

SillyTavern 项目使用 **GNU Affero General Public License v3.0 (AGPL-3.0)** 许可证。

## ✅ 允许的操作

### 1. 自由使用
- ✅ 可以免费使用 SillyTavern
- ✅ 可以用于商业用途
- ✅ 可以修改源代码
- ✅ 可以创建衍生作品（二次开发）
- ✅ 可以分发修改后的版本

### 2. 二次开发权限
- ✅ 可以基于 SillyTavern 开发自定义前端
- ✅ 可以修改后端代码
- ✅ 可以添加新功能
- ✅ 可以创建独立的 API 客户端

## ⚠️ 必须遵守的要求

### 1. 保留版权声明
必须在所有副本和衍生作品中保留：
- 原始版权声明
- AGPL-3.0 许可证声明
- 免责声明

### 2. 开源要求
- ✅ **必须开源修改后的源代码**
- ✅ 如果通过网络提供服务，必须向用户提供源代码
- ✅ 修改后的代码必须使用相同的 AGPL-3.0 许可证

### 3. 源代码提供方式
如果通过网络提供服务（如 SaaS），必须：
- 在用户界面中提供源代码下载链接
- 或在文档中说明如何获取源代码
- 源代码必须以 AGPL-3.0 许可证提供

## 🚫 禁止的操作

- ❌ 不能移除或修改许可证声明
- ❌ 不能添加额外的限制条件
- ❌ 不能将代码闭源
- ❌ 不能声称拥有原始代码的版权

## 📋 自定义前端开发的具体要求

### 方案 A：独立前端 + SillyTavern 后端
```
自定义前端（独立项目）
    ↓ API 调用
SillyTavern 后端（保持原样）
```

**要求**：
- ✅ 自定义前端可以使用任何许可证（包括闭源）
- ✅ SillyTavern 后端必须保持 AGPL-3.0 许可证
- ✅ 如果分发 SillyTavern 后端，必须提供源代码

### 方案 B：修改 SillyTavern 前端
```
修改后的 SillyTavern（包含自定义前端）
```

**要求**：
- ✅ 必须使用 AGPL-3.0 许可证
- ✅ 必须开源所有修改的代码
- ✅ 必须保留原始版权声明

### 方案 C：Fork 项目并深度修改
```
Fork 的 SillyTavern 项目（深度修改）
```

**要求**：
- ✅ 必须使用 AGPL-3.0 许可证
- ✅ 必须开源所有代码
- ✅ 必须在 README 中说明基于 SillyTavern
- ✅ 必须保留原始版权声明

## 🎯 推荐方案

对于你的小说生成项目，推荐使用 **方案 A**：

### 架构设计
```
┌─────────────────────────────────────┐
│   自定义前端（小说生成专用）          │
│   - 可以使用任何许可证               │
│   - 可以闭源或开源                   │
│   - 通过 API 调用 SillyTavern        │
└──────────────┬──────────────────────┘
               │ REST API
┌──────────────▼──────────────────────┐
│   SillyTavern 后端（保持原样）        │
│   - AGPL-3.0 许可证                 │
│   - 不需要修改                       │
│   - 作为 API 服务运行                │
└─────────────────────────────────────┘
```

### 优势
- ✅ 自定义前端可以使用任何许可证
- ✅ 不需要开源自定义前端代码
- ✅ SillyTavern 后端保持原样，无需修改
- ✅ 符合 AGPL-3.0 许可证要求
- ✅ 可以独立开发和维护

### 注意事项
- ⚠️ 如果分发 SillyTavern 后端，必须提供源代码
- ⚠️ 如果通过网络提供服务，必须提供 SillyTavern 源代码链接
- ⚠️ 建议在自定义前端中声明使用了 SillyTavern

## 📝 实际操作建议

### 1. 项目结构
```
novel-generator/
├── frontend/              # 自定义前端（你的许可证）
│   ├── src/
│   ├── package.json
│   └── README.md
├── backend/               # SillyTavern 后端（AGPL-3.0）
│   ├── SillyTavern/       # 原始代码
│   ├── LICENSE            # AGPL-3.0
│   └── README.md
└── README.md              # 项目说明
```

### 2. README 声明
```markdown
# 小说生成系统

本项目使用 SillyTavern 作为后端服务。

## 许可证

- **自定义前端**：[你的许可证]
- **SillyTavern 后端**：AGPL-3.0

## SillyTavern

SillyTavern 是一个开源的 LLM 前端工具，项目地址：
https://github.com/SillyTavern/SillyTavern

SillyTavern 使用 GNU Affero General Public License v3.0 许可证。
```

### 3. 源代码提供
如果通过网络提供服务，在自定义前端中添加：
```html
<footer>
  <a href="https://github.com/SillyTavern/SillyTavern" target="_blank">
    SillyTavern 源代码 (AGPL-3.0)
  </a>
</footer>
```

## 🔗 相关链接

- **AGPL-3.0 许可证全文**：https://www.gnu.org/licenses/agpl-3.0.html
- **SillyTavern 项目地址**：https://github.com/SillyTavern/SillyTavern
- **SillyTavern 许可证文件**：`SillyTavern/LICENSE`

## 💡 总结

**SillyTavern 允许二次开发**，但需要遵守 AGPL-3.0 许可证的要求：

1. ✅ 可以创建自定义前端
2. ✅ 可以商业使用
3. ⚠️ 如果修改 SillyTavern 代码，必须开源
4. ⚠️ 如果通过网络提供服务，必须提供 SillyTavern 源代码
5. ✅ 推荐使用独立前端 + SillyTavern 后端的架构

**推荐方案**：开发独立的自定义前端，通过 API 调用 SillyTavern 后端，这样可以：
- 自定义前端使用任何许可证
- SillyTavern 后端保持原样
- 符合 AGPL-3.0 许可证要求
