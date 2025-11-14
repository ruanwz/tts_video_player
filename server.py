#!/usr/bin/env python3
"""
TTS字幕视频播放器 - 可选后端服务
提供视频转字幕的功能（使用ffmpeg + whisper.cpp）
"""

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import subprocess
import os
import tempfile
import shutil
from pathlib import Path
import json
import logging

app = Flask(__name__)
CORS(app)  # 允许跨域请求

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 临时文件目录
TEMP_DIR = Path(tempfile.gettempdir()) / 'tts_video_player'
TEMP_DIR.mkdir(exist_ok=True)


def extract_audio(video_path, audio_path, ffmpeg_path='ffmpeg'):
    """从视频提取音频"""
    try:
        command = [
            ffmpeg_path,
            '-i', str(video_path),
            '-ar', '16000',  # 16kHz采样率
            '-ac', '1',      # 单声道
            '-c:a', 'pcm_s16le',  # 16位PCM编码
            '-y',            # 覆盖已存在的文件
            str(audio_path)
        ]

        logger.info(f"提取音频: {' '.join(command)}")

        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=300  # 5分钟超时
        )

        if result.returncode != 0:
            logger.error(f"ffmpeg错误: {result.stderr}")
            return False

        return True

    except subprocess.TimeoutExpired:
        logger.error("ffmpeg超时")
        return False
    except Exception as e:
        logger.error(f"提取音频失败: {str(e)}")
        return False


def transcribe_audio(audio_path, output_dir, whisper_path, model_path, language='auto'):
    """使用whisper.cpp转录音频"""
    try:
        # 构建whisper.cpp命令
        command = [
            whisper_path,
            '-m', model_path,
            '-f', str(audio_path.resolve()),
            '-ovtt',  # 输出VTT格式
            '-l', language if language != 'auto' else 'auto'
        ]

        logger.info(f"转录音频: {' '.join(command)}")

        # 运行whisper.cpp
        result = subprocess.run(
            command,
            cwd=str(output_dir.resolve()),
            capture_output=True,
            text=True,
            timeout=3600  # 1小时超时
        )

        if result.returncode != 0:
            logger.error(f"whisper错误: {result.stderr}")
            return None

        # 查找生成的VTT文件
        audio_name = audio_path.stem
        vtt_file = output_dir / f"{audio_name}.vtt"

        if vtt_file.exists():
            return vtt_file
        else:
            logger.error(f"未找到生成的VTT文件: {vtt_file}")
            return None

    except subprocess.TimeoutExpired:
        logger.error("whisper超时")
        return None
    except Exception as e:
        logger.error(f"转录失败: {str(e)}")
        return None


@app.route('/')
def index():
    """返回主页"""
    return send_from_directory('.', 'index.html')


@app.route('/<path:path>')
def serve_static(path):
    """提供静态文件"""
    return send_from_directory('.', path)


@app.route('/api/health', methods=['GET'])
def health_check():
    """健康检查"""
    return jsonify({'status': 'ok', 'message': '后端服务运行正常'})


@app.route('/api/generate-subtitle', methods=['POST'])
def generate_subtitle():
    """生成字幕"""
    try:
        # 检查是否有上传的文件
        if 'video' not in request.files:
            return jsonify({'error': '未找到视频文件'}), 400

        video_file = request.files['video']
        if video_file.filename == '':
            return jsonify({'error': '未选择视频文件'}), 400

        # 获取配置参数
        ffmpeg_path = request.form.get('ffmpeg_path', 'ffmpeg')
        whisper_path = request.form.get('whisper_path', 'whisper')
        model_path = request.form.get('model_path', '')
        language = request.form.get('language', 'auto')

        if not model_path:
            return jsonify({'error': '未配置Whisper模型路径'}), 400

        # 创建临时工作目录
        work_dir = TEMP_DIR / f"job_{os.urandom(8).hex()}"
        work_dir.mkdir(exist_ok=True)

        try:
            # 保存上传的视频
            video_path = work_dir / video_file.filename
            video_file.save(str(video_path))
            logger.info(f"视频已保存: {video_path}")

            # 提取音频
            audio_path = work_dir / f"{video_path.stem}.wav"
            logger.info("开始提取音频...")
            if not extract_audio(video_path, audio_path, ffmpeg_path):
                return jsonify({'error': '音频提取失败，请检查ffmpeg路径'}), 500

            logger.info("音频提取成功")

            # 转录音频
            logger.info("开始转录音频...")
            vtt_file = transcribe_audio(audio_path, work_dir, whisper_path, model_path, language)
            if not vtt_file:
                return jsonify({'error': '字幕生成失败，请检查whisper路径和模型路径'}), 500

            logger.info(f"字幕生成成功: {vtt_file}")

            # 读取VTT内容
            with open(vtt_file, 'r', encoding='utf-8') as f:
                vtt_content = f.read()

            return jsonify({
                'success': True,
                'subtitle': vtt_content,
                'format': 'vtt'
            })

        finally:
            # 清理临时文件
            try:
                shutil.rmtree(work_dir)
                logger.info(f"清理临时目录: {work_dir}")
            except Exception as e:
                logger.warning(f"清理临时文件失败: {str(e)}")

    except Exception as e:
        logger.error(f"生成字幕时出错: {str(e)}", exc_info=True)
        return jsonify({'error': f'服务器错误: {str(e)}'}), 500


@app.route('/api/test-tools', methods=['POST'])
def test_tools():
    """测试工具是否可用"""
    data = request.json
    ffmpeg_path = data.get('ffmpeg_path', 'ffmpeg')
    whisper_path = data.get('whisper_path', 'whisper')
    model_path = data.get('model_path', '')

    results = {
        'ffmpeg': False,
        'whisper': False,
        'model': False
    }

    # 测试ffmpeg
    try:
        result = subprocess.run(
            [ffmpeg_path, '-version'],
            capture_output=True,
            timeout=5
        )
        results['ffmpeg'] = result.returncode == 0
    except:
        pass

    # 测试whisper
    try:
        result = subprocess.run(
            [whisper_path, '-h'],
            capture_output=True,
            timeout=5
        )
        results['whisper'] = result.returncode == 0
    except:
        pass

    # 测试模型文件
    if model_path and os.path.isfile(model_path):
        results['model'] = True

    return jsonify(results)


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f"""
╔═══════════════════════════════════════════════════════════╗
║   TTS字幕视频播放器 - 后端服务                            ║
║   服务地址: http://localhost:{port}                        ║
║   这是一个可选服务，用于自动生成字幕                        ║
║   即使不运行此服务，播放器仍可正常使用                      ║
╚═══════════════════════════════════════════════════════════╝
    """)
    app.run(host='0.0.0.0', port=port, debug=True)
