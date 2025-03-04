# 每日一词 - Wordle 求解器

## 项目简介

每日一词是一款专业的 Wordle 游戏求解工具，基于信息熵算法，帮助用户轻松破解 Wordle 谜题，提供最优猜测建议和详细分析。无论是币安平台的每日一词活动还是其他 Wordle 类游戏，本工具都能提供强大的辅助功能。

![Wordle求解器截图](https://github.com/ss7458/binanceWOTD/raw/main/screenshot.png)

## 功能特点

- **信息熵算法**：采用信息熵理论计算最优猜测词，大幅提高猜词效率
- **多长度支持**：支持3-15个字母的单词长度，适应不同难度的Wordle游戏
- **实时分析**：动态计算并显示剩余可能单词，帮助用户理解游戏进展
- **历史记录导入**：支持导入已有的猜测记录，继续未完成的游戏
- **键盘快捷操作**：支持键盘操作，提高使用效率
- **可视化反馈**：直观展示猜测结果和可能单词列表

## 使用方法

### 开始新游戏

1. 选择单词长度（3-15之间）
2. 点击「开始新游戏」按钮
3. 系统会推荐最优的首次猜测词
4. 在Wordle游戏中输入推荐的单词，获得反馈
5. 在求解器中输入相应的反馈（1=灰色，2=黄色，3=绿色）
6. 点击「提交反馈」，系统会计算下一个最优猜测词
7. 重复步骤4-6，直到解出谜题

### 继续存量游戏

1. 点击「继续存量游戏」按钮
2. 在弹出的窗口中输入历史猜测记录，格式为：`单词 反馈`（例如：`hello 01122`）
3. 点击「提交」按钮，系统会根据历史记录计算下一个最优猜测词

### 键盘快捷键

- 数字键 1/2/3：输入反馈（1=灰色，2=黄色，3=绿色）
- 方向键：移动选择位置
- 回车键：提交反馈
- R 键：重置当前反馈
- Ctrl+Z：撤销上次反馈

## 技术实现

- 前端：纯原生JavaScript、HTML、CSS实现，无需任何框架
- 算法：基于信息熵理论的最优猜测算法
- 性能优化：使用批处理和异步计算，保证大词库下的流畅体验
- 数据处理：动态加载和处理单词库，支持多种单词长度

## 本地部署

1. 克隆仓库：`git clone https://github.com/ss7458/binanceWOTD.git`
2. 直接在浏览器中打开 `index.html` 文件即可使用

## 贡献指南

欢迎提交 Issue 或 Pull Request 来帮助改进这个项目。

## 许可证

本项目采用 MIT 许可证。详见 [LICENSE](LICENSE) 文件。

## 关于作者

本项目由热爱算法和文字游戏的开发者创建，旨在帮助更多人享受 Wordle 游戏的乐趣。

---

如果您觉得这个工具有用，请在 [GitHub](https://github.com/ss7458/binanceWOTD) 上给我们一个星标 ⭐，这将鼓励我们继续改进这个项目！
