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

        // 设置相关元素
        this.settingsBtn = document.getElementById('settingsBtn');
        this.settingsModal = document.getElementById('settingsModal');
        this.generateSubtitleBtn = document.getElementById('generateSubtitleBtn');

        // 状态变量
        this.subtitles = [];
        this.currentSubtitleIndex = -1;
        this.isTTSMode = false;
        this.synth = window.speechSynthesis;
        this.currentUtterance = null;
        this.voices = [];
        this.ttsRate = 1.0;
        this.isAutoRate = false;

        // 上传的视频文件(用于自动生成字幕)
        this.currentVideoFile = null;

        // 配置
        this.config = this.loadConfig();

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

        // 设置相关事件
        this.settingsBtn.addEventListener('click', () => this.openSettings());
        this.settingsModal.querySelector('.close').addEventListener('click', () => this.closeSettings());
        this.settingsModal.addEventListener('click', (e) => {
            if (e.target === this.settingsModal) this.closeSettings();
        });
        document.getElementById('saveSettingsBtn').addEventListener('click', () => this.saveSettings());
        document.getElementById('testBackendBtn').addEventListener('click', () => this.testBackend());
        document.getElementById('testToolsBtn').addEventListener('click', () => this.testTools());
        this.generateSubtitleBtn.addEventListener('click', () => this.generateSubtitle());

        // 初始化TTS
        this.initTTS();

        // 加载配置到UI
        this.loadConfigToUI();

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
            this.currentVideoFile = file;

            // 显示自动生成字幕按钮
            if (this.config.backendUrl) {
                this.generateSubtitleBtn.style.display = 'inline-block';
            }

            this.showStatus(`视频已加载: ${file.name}`);
        }
    }

    // 加载字幕文件
    loadSubtitle(event) {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const content = e.target.result;
                const fileName = file.name.toLowerCase();

                // 根据文件扩展名或内容自动检测格式
                let subtitles = [];
                if (fileName.endsWith('.vtt') || content.trim().startsWith('WEBVTT')) {
                    subtitles = this.parseVTT(content);
                    this.showStatus(`VTT字幕已加载: ${file.name}，共 ${subtitles.length} 条字幕`);
                } else if (fileName.endsWith('.srt')) {
                    subtitles = this.parseSRT(content);
                    this.showStatus(`SRT字幕已加载: ${file.name}，共 ${subtitles.length} 条字幕`);
                } else {
                    // 尝试自动检测
                    subtitles = this.parseVTT(content);
                    if (subtitles.length === 0) {
                        subtitles = this.parseSRT(content);
                    }
                    this.showStatus(`字幕已加载: ${file.name}，共 ${subtitles.length} 条字幕`);
                }

                this.subtitles = subtitles;

                if (subtitles.length === 0) {
                    this.showStatus(`字幕解析失败，请检查文件格式`, 'error');
                }
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

    // 解析VTT字幕格式
    parseVTT(vttContent) {
        const subtitles = [];
        const lines = vttContent.split('\n');
        let i = 0;

        console.log('开始解析VTT字幕...');
        console.log('总行数:', lines.length);

        // 跳过WEBVTT头部和元数据
        while (i < lines.length && !lines[i].includes('-->')) {
            i++;
        }

        console.log('找到第一个时间轴行:', i);

        while (i < lines.length) {
            const line = lines[i].trim();

            // 查找时间轴行
            if (line.includes('-->')) {
                // VTT格式: 00:00:00.000 --> 00:00:03.000
                // 毫秒部分可以是1-3位数字，使用\d{1,3}来匹配
                const timeMatch = line.match(/(\d{2}):(\d{2}):(\d{2})\.(\d{1,3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})\.(\d{1,3})/);

                if (timeMatch) {
                    // 确保毫秒部分是3位（补齐0）
                    const startMs = timeMatch[4].padEnd(3, '0');
                    const endMs = timeMatch[8].padEnd(3, '0');

                    const startTime = this.timeToSeconds(
                        parseInt(timeMatch[1]),
                        parseInt(timeMatch[2]),
                        parseInt(timeMatch[3]),
                        parseInt(startMs)
                    );
                    const endTime = this.timeToSeconds(
                        parseInt(timeMatch[5]),
                        parseInt(timeMatch[6]),
                        parseInt(timeMatch[7]),
                        parseInt(endMs)
                    );

                    console.log(`时间轴: ${timeMatch[0]}`);
                    console.log(`  开始: ${startTime.toFixed(3)}s, 结束: ${endTime.toFixed(3)}s`);

                    // 收集字幕文本（可能多行）
                    i++;
                    const textLines = [];
                    while (i < lines.length && lines[i].trim() !== '') {
                        const textLine = lines[i].trim();
                        // 过滤VTT样式标签 <v Name> 等
                        const cleanText = textLine.replace(/<[^>]+>/g, '').trim();
                        if (cleanText) {
                            textLines.push(cleanText);
                        }
                        i++;
                    }

                    const text = textLines.join(' ').trim();
                    if (text) {
                        subtitles.push({
                            start: startTime,
                            end: endTime,
                            text: text
                        });
                        console.log(`  文本: ${text}`);
                    }
                } else {
                    console.warn('时间轴格式不匹配:', line);
                }
            }
            i++;
        }

        console.log(`VTT解析完成，共解析 ${subtitles.length} 条字幕`);
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

        // 防止除以0或无效数据
        if (duration <= 0 || totalChars < 1) {
            console.log('⚠️ 无效数据，使用默认语速1.0');
            console.log('==================');
            return 1.0;
        }

        // 基准：根据实际测试，TTS在1.0倍速下约2.5字/秒（保守估计）
        // 这个值偏低是为了确保字幕能读完，留有余量
        const baseCharsPerSecond = 2.5;

        // 计算需要的语速
        const requiredCharsPerSecond = totalChars / duration;
        let optimalRate = requiredCharsPerSecond / baseCharsPerSecond;

        console.log('需要语速(字/秒):', requiredCharsPerSecond.toFixed(2));
        console.log('初始计算语速:', optimalRate.toFixed(2));

        // 加入安全系数：让语速快20%，确保有时间读完
        // 这是因为TTS启动、停止都有延迟，实际可用时间比字幕时长短
        const safetyFactor = 1.2;
        optimalRate = optimalRate * safetyFactor;
        console.log('加安全系数(×' + safetyFactor + '):', optimalRate.toFixed(2));

        // 限制语速范围在0.8-2.5之间
        const minRate = 0.8;
        const maxRate = 2.5;
        optimalRate = Math.max(minRate, Math.min(maxRate, optimalRate));

        console.log('范围限制后:', optimalRate.toFixed(2));

        // 如果计算出的语速与1.0相差不大（0.9-1.15），则使用1.0保持自然
        if (optimalRate >= 0.9 && optimalRate <= 1.15) {
            console.log('✓ 接近标准语速，归一化为1.0');
            optimalRate = 1.0;
        }

        console.log('最终语速:', optimalRate.toFixed(2) + 'x');
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

    // ========== 配置管理 ==========

    // 加载配置
    loadConfig() {
        const defaultConfig = {
            backendUrl: 'http://localhost:5000',
            ffmpegPath: 'ffmpeg',
            whisperPath: 'whisper',
            modelPath: '',
            language: 'auto'
        };

        try {
            const saved = localStorage.getItem('ttsPlayerConfig');
            return saved ? { ...defaultConfig, ...JSON.parse(saved) } : defaultConfig;
        } catch (e) {
            console.error('加载配置失败:', e);
            return defaultConfig;
        }
    }

    // 保存配置
    saveConfig(config) {
        try {
            localStorage.setItem('ttsPlayerConfig', JSON.stringify(config));
            return true;
        } catch (e) {
            console.error('保存配置失败:', e);
            return false;
        }
    }

    // 加载配置到UI
    loadConfigToUI() {
        document.getElementById('backendUrl').value = this.config.backendUrl || '';
        document.getElementById('ffmpegPath').value = this.config.ffmpegPath || 'ffmpeg';
        document.getElementById('whisperPath').value = this.config.whisperPath || 'whisper';
        document.getElementById('modelPath').value = this.config.modelPath || '';
        document.getElementById('languageSelect').value = this.config.language || 'auto';
    }

    // ========== 设置界面 ==========

    // 打开设置
    openSettings() {
        this.settingsModal.classList.add('show');
    }

    // 关闭设置
    closeSettings() {
        this.settingsModal.classList.remove('show');
    }

    // 保存设置
    saveSettings() {
        this.config.backendUrl = document.getElementById('backendUrl').value;
        this.config.ffmpegPath = document.getElementById('ffmpegPath').value;
        this.config.whisperPath = document.getElementById('whisperPath').value;
        this.config.modelPath = document.getElementById('modelPath').value;
        this.config.language = document.getElementById('languageSelect').value;

        if (this.saveConfig(this.config)) {
            this.showStatus('设置已保存');
            this.closeSettings();

            // 如果有视频且配置了后端,显示生成按钮
            if (this.currentVideoFile && this.config.backendUrl) {
                this.generateSubtitleBtn.style.display = 'inline-block';
            }
        } else {
            this.showStatus('设置保存失败', 'error');
        }
    }

    // 测试后端连接
    async testBackend() {
        const backendUrl = document.getElementById('backendUrl').value;
        const statusEl = document.getElementById('backendStatus');

        if (!backendUrl) {
            statusEl.textContent = '请输入后端地址';
            statusEl.className = 'status-indicator error';
            return;
        }

        statusEl.textContent = '测试中...';
        statusEl.className = 'status-indicator warning';

        try {
            const response = await fetch(`${backendUrl}/api/health`, {
                method: 'GET',
                timeout: 5000
            });

            if (response.ok) {
                statusEl.textContent = '✓ 连接成功';
                statusEl.className = 'status-indicator success';
            } else {
                statusEl.textContent = '✗ 连接失败';
                statusEl.className = 'status-indicator error';
            }
        } catch (e) {
            statusEl.textContent = '✗ 无法连接';
            statusEl.className = 'status-indicator error';
        }
    }

    // 测试工具
    async testTools() {
        const backendUrl = document.getElementById('backendUrl').value;
        const ffmpegPath = document.getElementById('ffmpegPath').value;
        const whisperPath = document.getElementById('whisperPath').value;
        const modelPath = document.getElementById('modelPath').value;
        const statusEl = document.getElementById('toolsStatus');

        if (!backendUrl) {
            statusEl.innerHTML = '<div class="tool-error">请先配置后端地址</div>';
            return;
        }

        statusEl.innerHTML = '<div>测试中...</div>';

        try {
            const response = await fetch(`${backendUrl}/api/test-tools`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ffmpeg_path: ffmpegPath,
                    whisper_path: whisperPath,
                    model_path: modelPath
                })
            });

            if (response.ok) {
                const results = await response.json();
                let html = '';
                html += `<div class="${results.ffmpeg ? 'tool-ok' : 'tool-error'}">FFmpeg: ${results.ffmpeg ? '✓ 可用' : '✗ 不可用'}</div>`;
                html += `<div class="${results.whisper ? 'tool-ok' : 'tool-error'}">Whisper: ${results.whisper ? '✓ 可用' : '✗ 不可用'}</div>`;
                html += `<div class="${results.model ? 'tool-ok' : 'tool-error'}">模型文件: ${results.model ? '✓ 找到' : '✗ 未找到'}</div>`;
                statusEl.innerHTML = html;
            } else {
                statusEl.innerHTML = '<div class="tool-error">测试失败</div>';
            }
        } catch (e) {
            statusEl.innerHTML = '<div class="tool-error">无法连接到后端服务</div>';
        }
    }

    // ========== 自动生成字幕 ==========

    // 生成字幕
    async generateSubtitle() {
        if (!this.currentVideoFile) {
            this.showStatus('请先上传视频文件', 'error');
            return;
        }

        if (!this.config.backendUrl) {
            this.showStatus('请先配置后端服务地址', 'error');
            this.openSettings();
            return;
        }

        if (!this.config.modelPath) {
            this.showStatus('请先配置Whisper模型路径', 'error');
            this.openSettings();
            return;
        }

        // 禁用按钮
        this.generateSubtitleBtn.disabled = true;
        this.generateSubtitleBtn.textContent = '⏳ 生成中...';
        this.showStatus('正在生成字幕，请稍候...');

        try {
            const formData = new FormData();
            formData.append('video', this.currentVideoFile);
            formData.append('ffmpeg_path', this.config.ffmpegPath);
            formData.append('whisper_path', this.config.whisperPath);
            formData.append('model_path', this.config.modelPath);
            formData.append('language', this.config.language);

            const response = await fetch(`${this.config.backendUrl}/api/generate-subtitle`, {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                const result = await response.json();

                if (result.success) {
                    // 解析生成的字幕
                    const subtitles = this.parseVTT(result.subtitle);
                    this.subtitles = subtitles;
                    this.showStatus(`✓ 字幕生成成功！共 ${subtitles.length} 条字幕`);
                } else {
                    this.showStatus('字幕生成失败: ' + result.error, 'error');
                }
            } else {
                const error = await response.json();
                this.showStatus('生成失败: ' + (error.error || '未知错误'), 'error');
            }
        } catch (e) {
            console.error('生成字幕出错:', e);
            this.showStatus('生成失败: ' + e.message, 'error');
        } finally {
            // 恢复按钮
            this.generateSubtitleBtn.disabled = false;
            this.generateSubtitleBtn.textContent = '🤖 自动生成字幕';
        }
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    new TTSVideoPlayer();
});
