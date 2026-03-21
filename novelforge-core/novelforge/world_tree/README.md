# NovelForge 世界树构建 (World Tree) 模块逻辑架构文档

世界树 (World Tree) 是整个项目的巅峰产物。前面那些所有的 `extractors` 虽然提取了许多 JSON，但是它们是散乱的。本目录代码负责建立层级，把“人——地点——事件”交叉相连，生成一座立体的宏大百科。

## 1. 内部代码内联逻辑图 (Internal Logic Flow)

```text
[ 散乱的角色网络 / 破碎的时间线 ]
             |
       [ builder.py ] (逻辑构筑器：根据外键寻找关系并挂载节点)
             |
       [ models.py ] (组装完成极度庞大且关联严密的世界树实体模型)
             |
    +--------+--------+
    v                 v
[ exporter.py ]   [ st_converter.py ]
 (传统形式导出) (专为第三方聊天软件 SillyTavern 设计的 Lorebook 转换器)
```

## 2. 核心文件职责说明

| 文件名 | 职责描述 |
| :--- | :--- |
| **`builder.py`** | **拼图游戏**。它像数据库的 JOIN 操作一样遍历独立的存储库中的小对象，建立人物所在城镇、事件相关联人物等硬连接。 |
| **`st_converter.py`** | 将构建好的 NovelForge 格式世界设定，无缝转化为著名角色扮演 AI 客户端的 **SillyTavern 世界书 (World Info) 规范格式**。这是核心生态护城河之一。 |
| **`exporter.py`** | 用于转义输出常规人类可阅读格式（如 Markdown 文档档案或 PDF 等准备）。 |
