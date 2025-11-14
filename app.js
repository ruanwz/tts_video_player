// TTS字幕视频播放器
class TTSVideoPlayer {
    constructor() {
        // DOM元素
        this.videoPlayer = document.getElementById('videoPlayer');
        this.subtitleDisplay = document.getElementById('subtitleDisplay');
        this.videoFileInput = document.getElementById('videoFile');
        this.subtitleFileInput = document.getElementById('subtitleFile');
        this.toggleBtn = document.getElementById('toggleAudioBtn');
        this.modeText = document.getElementById('modeText');
        this.voiceSelect = document.getElementById('voiceSelect');
        this.rateControl = document.getElementById('rateControl');
        this.rateValue = document.getElementById('rateValue');
        this.autoRateToggle = document.getElementById('autoRateToggle');
        this.rateControlGroup = document.querySelector('.rate-control-group');
        this.statusDiv = document.getElementById('status');

        // 状态变量
        this.subtitles = [];
        this.currentSubtitleIndex = -1;
        this.isTTSMode = false;
        this.synth = window.speechSynthesis;
        this.currentUtterance = null;
        this.voices = [];
        this.ttsRate = 1.0;
        this.isAutoRate = false;

        this.init();
    }

    init() {
        // 初始化事件监听器
        this.videoFileInput.addEventListener('change', (e) => this.loadVideo(e));
        this.subtitleFileInput.addEventListener('change', (e) => this.loadSubtitle(e));
        this.toggleBtn.addEventListener('click', () => this.toggleMode());
        this.videoPlayer.addEventListener('timeupdate', () => this.onTimeUpdate());
        this.videoPlayer.addEventListener('pause', () => this.onPause());
        this.videoPlayer.addEventListener('play', () => this.onPlay());
        this.rateControl.addEventListener('input', (e) => this.updateRate(e));
        this.autoRateToggle.addEventListener('change', (e) => this.toggleAutoRate(e));

        // 初始化TTS
        this.initTTS();

        this.showStatus('欢迎使用TTS字幕视频播放器！请上传视频和字幕文件。');
    }

    // 初始化TTS语音列表
    initTTS() {
        if (!this.synth) {
            this.showStatus('您的浏览器不支持TTS功能，请使用Safari或Chrome浏览器。', 'error');
            return;
        }

        const loadVoices = () => {
            this.voices = this.synth.getVoices();

            // 优先选择中文语音
            const chineseVoices = this.voices.filter(voice =>
                voice.lang.startsWith('zh') || voice.lang.startsWith('cmn')
            );

            // 清空并填充语音选择器
            this.voiceSelect.innerHTML = '';
            const voicesToShow = chineseVoices.length > 0 ? chineseVoices : this.voices;

            voicesToShow.forEach((voice, index) => {
                const option = document.createElement('option');
                option.value = index;
                option.textContent = `${voice.name} (${voice.lang})`;
                if (voice.default) {
                    option.textContent += ' - 默认';
                }
                this.voiceSelect.appendChild(option);
            });

            // 选择第一个中文语音
            if (chineseVoices.length > 0) {
                this.voiceSelect.value = 0;
            }
        };

        // 语音列表加载（某些浏览器需要异步加载）
        loadVoices();
        if (this.synth.onvoiceschanged !== undefined) {
            this.synth.onvoiceschanged = loadVoices;
        }
    }

    // 加载视频
    loadVideo(event) {
        const file = event.target.files[0];
        if (file) {
            const url = URL.createObjectURL(file);
            this.videoPlayer.src = url;
            this.showStatus(`视频已加载: ${file.name}`);
        }
    }

    // 加载字幕文件
    loadSubtitle(event) {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                this.subtitles = this.parseSRT(e.target.result);
                this.showStatus(`字幕已加载: ${file.name}，共 ${this.subtitles.length} 条字幕`);
            };
            reader.readAsText(file);
        }
    }

    // 解析SRT字幕格式
    parseSRT(srtContent) {
        const subtitles = [];
        const blocks = srtContent.trim().split(/\n\s*\n/);

        blocks.forEach(block => {
            const lines = block.split('\n');
            if (lines.length >= 3) {
                const timeLine = lines[1];
                const timeMatch = timeLine.match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/);

                if (timeMatch) {
                    const startTime = this.timeToSeconds(
                        parseInt(timeMatch[1]),
                        parseInt(timeMatch[2]),
                        parseInt(timeMatch[3]),
                        parseInt(timeMatch[4])
                    );
                    const endTime = this.timeToSeconds(
                        parseInt(timeMatch[5]),
                        parseInt(timeMatch[6]),
                        parseInt(timeMatch[7]),
                        parseInt(timeMatch[8])
                    );

                    const text = lines.slice(2).join(' ').trim();

                    subtitles.push({
                        start: startTime,
                        end: endTime,
                        text: text
                    });
                }
            }
        });

        return subtitles;
    }

    // 时间转换为秒
    timeToSeconds(hours, minutes, seconds, milliseconds) {
        return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
    }

    // 视频时间更新事件
    onTimeUpdate() {
        if (this.subtitles.length === 0) return;

        const currentTime = this.videoPlayer.currentTime;

        // 查找当前应该显示的字幕
        let foundSubtitle = null;
        let foundIndex = -1;

        for (let i = 0; i < this.subtitles.length; i++) {
            const subtitle = this.subtitles[i];
            if (currentTime >= subtitle.start && currentTime <= subtitle.end) {
                foundSubtitle = subtitle;
                foundIndex = i;
                break;
            }
        }

        // 如果字幕发生变化
        if (foundIndex !== this.currentSubtitleIndex) {
            this.currentSubtitleIndex = foundIndex;

            if (foundSubtitle) {
                this.subtitleDisplay.textContent = foundSubtitle.text;

                // 如果是TTS模式，朗读字幕
                if (this.isTTSMode && !this.videoPlayer.paused) {
                    this.speakText(foundSubtitle.text, foundSubtitle);
                }
            } else {
                this.subtitleDisplay.textContent = '';
                this.stopSpeaking();
            }
        }
    }

    // TTS朗读文本
    speakText(text, subtitle = null) {
        // 停止当前朗读
        this.stopSpeaking();

        if (!text || !this.synth) return;

        this.currentUtterance = new SpeechSynthesisUtterance(text);

        // 设置语音
        const selectedVoiceIndex = parseInt(this.voiceSelect.value);
        if (this.voices[selectedVoiceIndex]) {
            this.currentUtterance.voice = this.voices[selectedVoiceIndex];
        }

        // 设置语速 - 自动或手动
        let rate = this.ttsRate;
        if (this.isAutoRate && subtitle) {
            rate = this.calculateOptimalRate(subtitle);
            // 更新显示的语速值（用绿色表示自动调整）
            this.rateValue.textContent = rate.toFixed(1);
            this.rateValue.classList.add('auto');
        } else {
            rate = this.ttsRate;
        }
        this.currentUtterance.rate = rate;

        // 设置音量（TTS模式下）
        this.currentUtterance.volume = 1.0;

        this.synth.speak(this.currentUtterance);
    }

    // 计算最佳语速
    calculateOptimalRate(subtitle) {
        const text = subtitle.text;
        const duration = subtitle.end - subtitle.start; // 字幕显示时长（秒）

        // 计算字符数（中文字符和英文单词）
        const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
        const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
        const punctuation = (text.match(/[，。！？、；：""''（）,.!?;:()"'()]/g) || []).length;

        // 总字符数估算（中文字符 + 英文单词 + 标点符号权重）
        const totalChars = chineseChars + englishWords * 0.7 + punctuation * 0.3;

        // 调试信息
        console.log('=== 智能语速计算 ===');
        console.log('字幕文本:', text);
        console.log('显示时长:', duration, '秒');
        console.log('中文字符:', chineseChars);
        console.log('英文单词:', englishWords);
        console.log('标点符号:', punctuation);
        console.log('总字符数:', totalChars);

        // 基准：正常语速下，中文大约每秒4-5个字
        const baseCharsPerSecond = 4.5;

        // 计算需要的语速
        const requiredCharsPerSecond = totalChars / duration;
        let optimalRate = requiredCharsPerSecond / baseCharsPerSecond;

        console.log('需要语速(字/秒):', requiredCharsPerSecond);
        console.log('初始计算语速:', optimalRate);

        // 限制语速范围在0.8-2.5之间
        optimalRate = Math.max(0.8, Math.min(2.5, optimalRate));

        // 如果计算出的语速与1.0相差不大（0.9-1.1），则使用1.0
        if (optimalRate >= 0.9 && optimalRate <= 1.1) {
            optimalRate = 1.0;
        }

        // 如果时间充裕（低于0.9倍速），使用稍慢的语速使其更自然
        if (optimalRate < 0.9) {
            optimalRate = Math.max(0.8, optimalRate * 1.05);
        }

        console.log('最终语速:', optimalRate);
        console.log('==================');

        return optimalRate;
    }

    // 停止TTS朗读
    stopSpeaking() {
        if (this.synth && this.synth.speaking) {
            this.synth.cancel();
        }
    }

    // 切换原声/TTS模式
    toggleMode() {
        this.isTTSMode = !this.isTTSMode;

        if (this.isTTSMode) {
            // 切换到TTS模式
            this.videoPlayer.muted = true;
            this.modeText.textContent = '当前: TTS字幕';
            this.toggleBtn.classList.add('tts-mode');
            this.showStatus('已切换到TTS模式，将朗读字幕内容');
        } else {
            // 切换到原声模式
            this.videoPlayer.muted = false;
            this.modeText.textContent = '当前: 原声';
            this.toggleBtn.classList.remove('tts-mode');
            this.stopSpeaking();
            this.showStatus('已切换到原声模式');
        }
    }

    // 视频暂停事件
    onPause() {
        this.stopSpeaking();
    }

    // 视频播放事件
    onPlay() {
        // 如果在TTS模式且有当前字幕，继续朗读
        if (this.isTTSMode && this.currentSubtitleIndex >= 0) {
            const currentSubtitle = this.subtitles[this.currentSubtitleIndex];
            if (currentSubtitle) {
                this.speakText(currentSubtitle.text, currentSubtitle);
            }
        }
    }

    // 切换自动语速
    toggleAutoRate(event) {
        this.isAutoRate = event.target.checked;

        if (this.isAutoRate) {
            // 启用自动语速，禁用手动控制
            this.rateControlGroup.classList.add('disabled');
            this.rateValue.classList.add('auto');
            this.showStatus('已启用自动语速调整，将根据字幕长度和时间动态调整');
        } else {
            // 禁用自动语速，启用手动控制
            this.rateControlGroup.classList.remove('disabled');
            this.rateValue.classList.remove('auto');
            this.rateValue.textContent = this.ttsRate.toFixed(1);
            this.showStatus('已切换到手动语速模式');
        }
    }

    // 更新语速
    updateRate(event) {
        this.ttsRate = parseFloat(event.target.value);
        this.rateValue.textContent = this.ttsRate.toFixed(1);
        this.rateValue.classList.remove('auto');
    }

    // 显示状态信息
    showStatus(message, type = 'success') {
        this.statusDiv.textContent = message;
        this.statusDiv.className = 'status show';

        if (type === 'error') {
            this.statusDiv.classList.add('error');
        }

        // 3秒后自动隐藏
        setTimeout(() => {
            this.statusDiv.classList.remove('show');
        }, 3000);
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    new TTSVideoPlayer();
});
