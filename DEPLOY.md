# GitHub Pages 部署指南

由于所有代码已经在 `claude/video-player-tts-subtitle-0117Zz4wPg2jpzN3qUdpEiPW` 分支上，你需要在 GitHub 网站上手动完成部署。

## 📋 部署步骤

### 方法1：直接从 claude 分支部署（最简单）

1. **访问你的 GitHub 仓库**
   ```
   https://github.com/ruanwz/tts_video_player
   ```

2. **进入 Settings（设置）**
   - 点击仓库页面顶部的 `Settings` 标签

3. **配置 Pages**
   - 在左侧菜单找到 `Pages`
   - 在 `Source` 下拉菜单中选择分支：`claude/video-player-tts-subtitle-0117Zz4wPg2jpzN3qUdpEiPW`
   - Directory 选择 `/ (root)`
   - 点击 `Save` 按钮

4. **等待部署**
   - GitHub 会自动开始部署
   - 几分钟后，页面顶部会显示你的网站地址：
     ```
     https://ruanwz.github.io/tts_video_player/
     ```

### 方法2：合并到 main 分支后部署（推荐）

如果你希望使用标准的 main 分支：

#### 步骤 1: 在 GitHub 上创建 Pull Request

1. **访问你的仓库**
   ```
   https://github.com/ruanwz/tts_video_player
   ```

2. **创建 Pull Request**
   - 点击 `Pull requests` 标签
   - 点击 `New pull request` 按钮
   - Base 选择：`main`（如果没有main分支，需要先创建）
   - Compare 选择：`claude/video-player-tts-subtitle-0117Zz4wPg2jpzN3qUdpEiPW`
   - 点击 `Create pull request`

3. **填写 PR 信息**
   - Title: `添加 TTS 字幕视频播放器功能`
   - Description: 可以复制以下内容：
     ```markdown
     ## 功能概述

     实现了一个支持TTS（文字转语音）功能的视频播放器，可以将字幕内容朗读出来。

     ## 主要功能

     - ✅ 标准视频播放（支持所有HTML5格式）
     - ✅ 多格式字幕支持（SRT和VTT）
     - ✅ TTS朗读字幕
     - ✅ 原声/TTS模式切换
     - ✅ 智能语速自动调整
     - ✅ 可选的自动生成字幕功能（需要后端服务）

     ## 文件变更

     - `index.html` - 主页面
     - `style.css` - 样式
     - `app.js` - 核心逻辑
     - `server.py` - 可选后端服务
     - `requirements.txt` - Python依赖
     - `README.md` - 文档
     - `BACKEND_README.md` - 后端服务文档
     - `example.srt` / `example.vtt` - 示例字幕
     ```
   - 点击 `Create pull request`

4. **合并 Pull Request**
   - 检查代码无误后，点击 `Merge pull request`
   - 点击 `Confirm merge`
   - 合并完成后，可以删除 claude 分支（可选）

#### 步骤 2: 配置 GitHub Pages

1. **进入 Settings > Pages**

2. **配置 Source**
   - Branch 选择：`main`
   - Directory 选择：`/ (root)`
   - 点击 `Save`

3. **等待部署完成**
   - 几分钟后访问：`https://ruanwz.github.io/tts_video_player/`

## ✅ 验证部署

部署成功后，访问你的网站并测试：

1. **基础功能**
   - ✓ 页面正常加载
   - ✓ 可以上传视频文件
   - ✓ 可以上传字幕文件（SRT或VTT）
   - ✓ 视频正常播放
   - ✓ 字幕正常显示

2. **TTS功能**
   - ✓ 可以切换到TTS模式
   - ✓ TTS正常朗读字幕
   - ✓ 可以调整语速
   - ✓ 自动语速调整功能正常

3. **注意事项**
   - ⚠️ 后端服务（自动生成字幕）不会在 GitHub Pages 上运行
   - ⚠️ 如需使用自动生成字幕功能，需要在本地运行后端服务

## 🔧 部署后更新

如果将来需要更新网站：

1. **在本地修改代码**

2. **提交并推送到 claude 分支**
   ```bash
   git add .
   git commit -m "更新说明"
   git push
   ```

3. **在 GitHub 上创建新的 Pull Request**
   - 从 claude 分支合并到 main 分支

4. **GitHub Pages 会自动重新部署**

## 📞 需要帮助？

如果遇到问题：

1. **检查 GitHub Pages 状态**
   - 在 Settings > Pages 查看部署状态
   - 如果显示错误，查看错误信息

2. **常见问题**
   - 404 错误：检查分支和目录是否正确
   - 样式丢失：检查资源文件路径是否正确
   - 功能异常：打开浏览器控制台查看错误信息

3. **GitHub Actions**
   - 在仓库的 `Actions` 标签可以查看部署日志
   - 查找 `pages build and deployment` 工作流

---

**祝部署顺利！** 🚀
