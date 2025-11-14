# 后端服务说明（可选功能）

## 概述

这是一个**可选的**后端服务，用于自动从视频生成字幕。即使不运行此服务，TTS字幕视频播放器的所有核心功能仍然可以正常使用（只是无法自动生成字幕）。

## 功能

- 从视频文件提取音频（使用ffmpeg）
- 使用Whisper.cpp进行语音识别
- 自动生成VTT格式字幕

## 依赖工具

### 1. FFmpeg
用于从视频提取音频。

**安装方法：**
```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt-get install ffmpeg

# 或者下载预编译版本
# https://ffmpeg.org/download.html
```

### 2. Whisper.cpp
用于语音转文字。

**安装方法：**
```bash
# 克隆仓库
git clone https://github.com/ggerganov/whisper.cpp
cd whisper.cpp

# 编译
make

# 下载模型（例如base模型）
bash ./models/download-ggml-model.sh base

# 记住main可执行文件和模型文件的路径
# main: /path/to/whisper.cpp/main
# model: /path/to/whisper.cpp/models/ggml-base.bin
```

## 安装后端服务

### 1. 安装Python依赖

```bash
cd tts_video_player
pip install -r requirements.txt
```

### 2. 启动服务

```bash
python server.py
```

服务将在 `http://localhost:5000` 启动。

## 配置播放器

1. 打开播放器网页
2. 点击右上角的⚙️设置按钮
3. 配置以下信息：

| 配置项 | 说明 | 示例 |
|--------|------|------|
| 后端服务地址 | Flask服务地址 | `http://localhost:5000` |
| FFmpeg路径 | ffmpeg可执行文件路径 | `ffmpeg` 或 `/usr/local/bin/ffmpeg` |
| Whisper.cpp路径 | whisper main可执行文件路径 | `/path/to/whisper.cpp/main` |
| Whisper模型路径 | ggml模型文件路径 | `/path/to/whisper.cpp/models/ggml-base.bin` |
| 默认语言 | 识别语言 | 自动检测/中文/英语等 |

4. 点击"测试连接"和"测试工具"确保配置正确
5. 点击"保存设置"

## 使用方法

1. 上传视频文件
2. 点击"🤖 自动生成字幕"按钮
3. 等待处理完成（可能需要几分钟，取决于视频长度）
4. 字幕将自动加载到播放器

## 注意事项

### 模型选择

Whisper提供多种模型，精度和速度不同：

| 模型 | 大小 | 速度 | 精度 | 推荐场景 |
|------|------|------|------|---------|
| tiny | 75 MB | 最快 | 较低 | 快速测试 |
| base | 142 MB | 快 | 中等 | 日常使用 |
| small | 466 MB | 中等 | 较高 | 平衡选择 |
| medium | 1.5 GB | 慢 | 高 | 高质量需求 |
| large | 2.9 GB | 最慢 | 最高 | 专业用途 |

### 性能考虑

- 首次识别可能较慢，因为需要加载模型
- 较长视频需要更多处理时间
- 建议使用base或small模型获得速度和质量的平衡

### 常见问题

**Q: 提示"音频提取失败"？**
- 检查FFmpeg是否正确安装
- 确认FFmpeg路径配置正确
- 尝试在终端运行 `ffmpeg -version` 测试

**Q: 提示"字幕生成失败"？**
- 检查Whisper.cpp路径配置是否正确
- 确认模型文件路径正确且文件存在
- 查看服务器终端的错误日志

**Q: 识别准确度不高？**
- 尝试使用更大的模型（如medium）
- 确保音频清晰，背景噪音较少
- 指定正确的语言而不是"自动检测"

**Q: 后端服务无法连接？**
- 确认服务已启动（运行 `python server.py`）
- 检查防火墙设置
- 确认后端地址配置正确

## API接口

如果你想自己实现客户端，可以使用以下API：

### 健康检查
```http
GET /api/health
```

### 生成字幕
```http
POST /api/generate-subtitle
Content-Type: multipart/form-data

参数:
- video: 视频文件
- ffmpeg_path: ffmpeg路径
- whisper_path: whisper路径
- model_path: 模型路径
- language: 语言代码
```

### 测试工具
```http
POST /api/test-tools
Content-Type: application/json

{
  "ffmpeg_path": "ffmpeg",
  "whisper_path": "/path/to/main",
  "model_path": "/path/to/model.bin"
}
```

## 许可证

MIT License
