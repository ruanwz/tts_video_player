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
import asyncio
import edge_tts
from deep_translator import GoogleTranslator



app = Flask(__name__)
# 允许跨域请求 - 支持所有来源（包括file://协议）
CORS(app, resources={
    r"/api/*": {
        "origins": "*",
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type"],
        "supports_credentials": False
    }
})

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
        logger.info(f"工作目录: {output_dir.resolve()}")

        # 运行whisper.cpp
        result = subprocess.run(
            command,
            cwd=str(output_dir.resolve()),
            capture_output=True,
            text=True,
            timeout=3600  # 1小时超时
        )

        # 记录输出信息
        if result.stdout:
            logger.info(f"whisper输出: {result.stdout[:500]}")  # 只记录前500字符
        if result.stderr:
            logger.info(f"whisper错误流: {result.stderr[:500]}")

        if result.returncode != 0:
            logger.error(f"whisper执行失败，返回码: {result.returncode}")
            return None

        # 列出工作目录中的所有文件
        logger.info(f"工作目录中的文件: {list(output_dir.glob('*'))}")

        # 查找生成的VTT文件
        # whisper.cpp可能生成 {audio_name}.wav.vtt 而不是 {audio_name}.vtt
        audio_name = audio_path.stem

        # 尝试多种可能的文件名
        possible_names = [
            output_dir / f"{audio_name}.vtt",
            output_dir / f"{audio_path.name}.vtt",  # 包含扩展名的完整名称
            output_dir / f"{audio_name}.wav.vtt",
        ]

        # 也搜索所有.vtt文件
        vtt_files = list(output_dir.glob('*.vtt'))
        if vtt_files:
            logger.info(f"找到VTT文件: {vtt_files}")
            return vtt_files[0]  # 返回第一个找到的VTT文件

        # 尝试可能的文件名
        for vtt_file in possible_names:
            if vtt_file.exists():
                logger.info(f"找到VTT文件: {vtt_file}")
                return vtt_file

        logger.error(f"未找到生成的VTT文件，尝试过的文件名: {possible_names}")
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


@app.route('/api/voices', methods=['GET'])
def get_voices():
    """获取Edge TTS可用语音列表"""
    try:
        # 使用asyncio运行异步函数
        voices = asyncio.run(edge_tts.list_voices())
        # 过滤出中文语音
        chinese_voices = [v for v in voices if "zh" in v['Locale']]
        return jsonify(chinese_voices)
    except Exception as e:
        logger.error(f"获取语音列表失败: {str(e)}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/tts', methods=['POST'])
def tts():
    """生成TTS音频"""
    try:
        data = request.json
        text = data.get('text')
        voice = data.get('voice', 'zh-CN-XiaoxiaoNeural')
        rate = data.get('rate', '+0%')  # 格式: +0% or -10%
        
        if not text:
            return jsonify({'error': '缺少文本参数'}), 400

        # 创建临时文件
        output_file = TEMP_DIR / f"tts_{os.urandom(8).hex()}.mp3"
        
        # 调整语速格式
        # edge-tts接受 "+50%", "-20%" 这样的格式
        # 如果传入的是数字 (e.g. 1.2, 0.8), 需要转换
        if isinstance(rate, (int, float)):
            rate_percent = int((rate - 1.0) * 100)
            rate_str = f"{'+' if rate_percent >= 0 else ''}{rate_percent}%"
        else:
            rate_str = rate

        async def _generate():
            communicate = edge_tts.Communicate(text, voice, rate=rate_str)
            await communicate.save(str(output_file))

        asyncio.run(_generate())
        
        # 获取音频时长 (简单估算或使用ffmpeg获取准确时长)
        # 这里为了准确性，我们使用ffmpeg获取时长
        duration = 0
        try:
            result = subprocess.run(
                ['ffmpeg', '-i', str(output_file)],
                capture_output=True,
                text=True
            )
            # ffmpeg输出在stderr中: Duration: 00:00:05.12
            import re
            match = re.search(r"Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})", result.stderr)
            if match:
                h, m, s = map(float, match.groups())
                duration = h * 3600 + m * 60 + s
        except Exception as e:
            logger.warning(f"获取时长失败: {e}")

        return jsonify({
            'url': f"/api/static/{output_file.name}",
            'duration': duration
        })

    except Exception as e:
        logger.error(f"TTS生成失败: {str(e)}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/translate', methods=['POST'])
def translate():
    """翻译文本 (使用Google Translate)"""
    try:
        data = request.json
        text = data.get('text')
        target_lang = data.get('target_lang', 'zh-CN')
        
        if not text:
            return jsonify({'error': '缺少文本参数'}), 400

        # 映射语言代码
        # deep-translator使用 'zh-CN', 'en', 等标准代码
        # 但为了保险，做一些简单的映射
        lang_map = {
            'zh': 'zh-CN',
            'zh-CN': 'zh-CN',
            'zh-TW': 'zh-TW',
            'en': 'en',
            'ja': 'ja',
            'ko': 'ko',
            'es': 'es',
            'fr': 'fr',
            'de': 'de',
            'ru': 'ru',
            'ar': 'ar'
        }
        
        target = lang_map.get(target_lang, target_lang)
        
        # 使用deep-translator调用Google翻译
        translator = GoogleTranslator(source='auto', target=target)
        translated = translator.translate(text)
        
        return jsonify({'translatedText': translated})

    except Exception as e:
        logger.error(f"翻译失败: {str(e)}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/static/<path:filename>')

def serve_temp_file(filename):
    """提供临时生成的文件"""
    return send_from_directory(TEMP_DIR, filename)


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
    port = int(os.environ.get('PORT', 5001))
    print(f"""
╔═══════════════════════════════════════════════════════════╗
║   TTS字幕视频播放器 - 后端服务                            ║
║   服务地址: http://localhost:{port}                        ║
║   这是一个可选服务，用于自动生成字幕                        ║
║   即使不运行此服务，播放器仍可正常使用                      ║
╚═══════════════════════════════════════════════════════════╝
    """)
    app.run(host='0.0.0.0', port=port, debug=True)
