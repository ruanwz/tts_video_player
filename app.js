// TTS字幕视频播放器
class TTSVideoPlayer {
    constructor() {
        // DOM元素
        this.videoPlayer = document.getElementById('videoPlayer');
        this.subtitleDisplay = document.getElementById('subtitleDisplay');
        this.videoFileInput = document.getElementById('videoFile');
        this.subtitleFileInput = document.getElementById('subtitleFile');
        this.subtitleFileName = document.getElementById('subtitleFileName');
        this.toggleBtn = document.getElementById('toggleAudioBtn');
        this.modeText = document.getElementById('modeText');
        this.voiceSelect = document.getElementById('voiceSelect');
        this.rateControl = document.getElementById('rateControl');
        this.rateValue = document.getElementById('rateValue');
        this.autoRateToggle = document.getElementById('autoRateToggle');
        this.rateControlGroup = document.querySelector('.rate-control-group');
        this.statusDiv = document.getElementById('status');

        // 新增控件
        this.ttsEngine = document.getElementById('ttsEngine');
        this.speedStrategy = document.getElementById('speedStrategy');
        this.speedStrategyGroup = document.getElementById('speedStrategyGroup');


        // 设置相关元素
        this.settingsBtn = document.getElementById('settingsBtn');
        this.settingsModal = document.getElementById('settingsModal');
        this.generateSubtitleBtn = document.getElementById('generateSubtitleBtn');
        this.saveSubtitleBtn = document.getElementById('saveSubtitleBtn');


        // 翻译相关元素
        this.translateControls = document.getElementById('translateControls');
        this.targetLanguage = document.getElementById('targetLanguage');
        this.translateBtn = document.getElementById('translateBtn');

        // 状态变量
        this.subtitles = [];
        this.originalSubtitles = []; // 保存原始字幕
        this.currentSubtitleIndex = -1;
        this.lastSpokenIndex = -1; // 记录上一条朗读的字幕索引，防止重复朗读
        this.isTTSMode = false;

        this.synth = window.speechSynthesis;
        this.currentUtterance = null;
        this.voices = [];
        this.edgeVoices = []; // Edge TTS语音列表
        this.ttsRate = 1.0;
        this.isAutoRate = false;
        this.ttsRate = 1.0;
        this.isAutoRate = false;
        this.currentAudio = null; // Edge TTS音频对象
        this.speakingSubtitleEnd = 0; // 当前正在朗读的字幕结束时间
        this.videoPausedByTTS = false; // 标记视频是否被TTS暂停（防止重复日志）




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
        this.speedStrategy.addEventListener('change', () => this.updateRateControlState());
        this.ttsEngine.addEventListener('change', () => this.onEngineChange());



        // 设置相关事件
        this.settingsBtn.addEventListener('click', () => this.openSettings());
        this.settingsModal.querySelector('.close').addEventListener('click', () => this.closeSettings());
        this.settingsModal.addEventListener('click', (e) => {
            if (e.target === this.settingsModal) this.closeSettings();
        });
        document.getElementById('saveSettingsBtn').addEventListener('click', () => this.saveSettings());
        document.getElementById('testBackendBtn').addEventListener('click', () => this.testBackend());
        document.getElementById('testToolsBtn').addEventListener('click', () => this.testTools());
        document.getElementById('testToolsBtn').addEventListener('click', () => this.testTools());
        this.generateSubtitleBtn.addEventListener('click', () => this.generateSubtitle());
        this.saveSubtitleBtn.addEventListener('click', () => this.saveSubtitle());


        // 翻译相关事件
        this.targetLanguage.addEventListener('change', () => this.onLanguageSelect());
        this.translateBtn.addEventListener('click', () => this.translateSubtitles());

        // 初始化TTS
        this.initTTS();

        // 加载配置到UI
        this.loadConfigToUI();

        this.showStatus('欢迎使用TTS字幕视频播放器！请上传视频和字幕文件。');
    }

    // 初始化TTS语音列表
    initTTS() {
        this.onEngineChange();
    }

    // 引擎切换事件
    async onEngineChange() {
        const engine = this.ttsEngine.value;
        this.voiceSelect.innerHTML = '<option>加载中...</option>';

        if (engine === 'browser') {
            this.loadBrowserVoices();
        } else {
            await this.loadEdgeVoices();
        }
    }

    // 加载浏览器语音
    loadBrowserVoices() {
        if (!this.synth) {
            this.showStatus('您的浏览器不支持TTS功能', 'error');
            return;
        }

        const loadVoices = () => {
            this.voices = this.synth.getVoices();
            const chineseVoices = this.voices.filter(voice =>
                voice.lang.startsWith('zh') || voice.lang.startsWith('cmn')
            );

            this.voiceSelect.innerHTML = '';
            const voicesToShow = chineseVoices.length > 0 ? chineseVoices : this.voices;

            voicesToShow.forEach((voice, index) => {
                const option = document.createElement('option');
                option.value = index; // 浏览器语音使用索引作为value
                option.textContent = `${voice.name} (${voice.lang})`;
                if (voice.default) option.textContent += ' - 默认';
                this.voiceSelect.appendChild(option);
            });

            if (chineseVoices.length > 0) this.voiceSelect.value = 0;
        };

        loadVoices();
        if (this.synth.onvoiceschanged !== undefined) {
            this.synth.onvoiceschanged = loadVoices;
        }
    }

    // 加载Edge TTS语音
    async loadEdgeVoices() {
        if (!this.config.backendUrl) {
            this.showStatus('请先配置后端服务地址', 'error');
            this.voiceSelect.innerHTML = '<option>请配置后端</option>';
            return;
        }

        try {
            const response = await fetch(`${this.config.backendUrl}/api/voices`);
            if (response.ok) {
                this.edgeVoices = await response.json();
                this.voiceSelect.innerHTML = '';

                this.edgeVoices.forEach(voice => {
                    const option = document.createElement('option');
                    option.value = voice.ShortName; // Edge语音使用ShortName作为value
                    // 兼容新版edge-tts字段 (v7.x)
                    const name = voice.LocalName || voice.DisplayName || voice.FriendlyName || voice.Name;
                    option.textContent = `${name} (${voice.Locale || voice.Gender})`;
                    this.voiceSelect.appendChild(option);
                });


                // 默认选中晓晓
                const xiaoxiao = this.edgeVoices.find(v => v.ShortName === 'zh-CN-XiaoxiaoNeural');
                if (xiaoxiao) {
                    this.voiceSelect.value = xiaoxiao.ShortName;
                }
            } else {
                throw new Error('获取语音列表失败');
            }
        } catch (e) {
            console.error(e);
            this.showStatus('无法连接到后端服务', 'error');
            this.voiceSelect.innerHTML = '<option>连接失败</option>';
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
                this.originalSubtitles = JSON.parse(JSON.stringify(subtitles)); // 深拷贝保存原始字幕

                if (subtitles.length === 0) {
                    this.showStatus(`字幕解析失败，请检查文件格式`, 'error');
                    this.subtitleFileName.textContent = '';
                    this.translateControls.style.display = 'none';
                } else {
                    // 更新UI显示字幕文件名
                    this.subtitleFileName.textContent = `✓ ${file.name}`;
                    // 显示翻译控件和保存按钮
                    this.translateControls.style.display = 'flex';
                    this.saveSubtitleBtn.style.display = 'inline-block';
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
        const currentTime = this.videoPlayer.currentTime;

        // 策略检查：如果当前正在朗读且策略是"暂停视频"
        // 检查是否到达了当前字幕的结束时间，如果是，暂停视频等待朗读结束
        if (this.isTTSMode &&
            this.currentAudio && !this.currentAudio.paused &&
            this.speedStrategy.value === 'pause_video' &&
            this.speakingSubtitleEnd > 0) {

            // 如果超过了字幕结束时间 (给予0.1秒的宽容度)
            if (currentTime >= this.speakingSubtitleEnd - 0.1) {
                if (!this.videoPausedByTTS) {
                    console.log(`到达字幕结束点(${this.speakingSubtitleEnd})，暂停视频等待TTS完成。音频状态: paused=${this.currentAudio.paused}, ended=${this.currentAudio.ended}, time=${this.currentAudio.currentTime}/${this.currentAudio.duration}`);
                    this.videoPausedByTTS = true;
                }

                // 安全检查：如果音频已经结束但onended没触发（极罕见），强制恢复
                if (this.currentAudio.ended) {
                    console.warn('检测到音频已结束但视频仍暂停，强制恢复');
                    this.speakingSubtitleEnd = 0;
                    this.videoPausedByTTS = false;
                    this.videoPlayer.play();
                    return;
                }

                this.videoPlayer.pause();
                return; // 暂停处理后续逻辑，防止触发下一条字幕
            }


        }

        if (this.subtitles.length === 0) return;


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
                if (this.isTTSMode) {
                    console.log(`[字幕切换] 从索引 ${this.currentSubtitleIndex} 切换到 ${foundIndex}`);
                    this.speakText(foundSubtitle.text, foundSubtitle);
                    this.lastSpokenIndex = foundIndex;
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

        if (!text) return;

        const engine = this.ttsEngine.value;

        if (engine === 'browser') {
            this.speakBrowserTTS(text, subtitle);
        } else {
            this.speakEdgeTTS(text, subtitle);
        }
    }

    // 浏览器内置TTS
    speakBrowserTTS(text, subtitle) {
        if (!this.synth) return;

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
        this.currentUtterance.volume = 1.0;

        this.synth.speak(this.currentUtterance);
    }

    // Edge TTS (后端)
    async speakEdgeTTS(text, subtitle) {
        if (!this.config.backendUrl) return;

        const voice = this.voiceSelect.value;
        let rateParam = '+0%';

        if (!this.isAutoRate) {
            rateParam = this.ttsRate;
        }

        // 策略：如果是"暂停视频"模式，立即暂停视频以防止播放过头
        const strategy = this.speedStrategy.value;
        const wasPlaying = !this.videoPlayer.paused;

        console.log(`[speakEdgeTTS] 开始, wasPlaying=${wasPlaying}, strategy=${strategy}, isAutoRate=${this.isAutoRate}`);


        // 如果是"暂停视频"模式，允许手动调整语速
        // 这种情况下，我们不让后端调整语速，而是前端控制播放速度
        // 或者后端生成时就用手动语速？
        // 为了统一，如果开启了智能控制且是暂停模式，我们使用手动语速参数
        if (this.isAutoRate && strategy === 'pause_video') {
            rateParam = this.ttsRate;
        }


        if (this.isAutoRate && strategy === 'pause_video' && wasPlaying) {
            console.log('暂停视频模式：开始获取音频，暂停视频');
            this.videoPlayer.pause();
        }

        try {
            const response = await fetch(`${this.config.backendUrl}/api/tts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: text,
                    voice: voice,
                    rate: rateParam
                })
            });

            if (response.ok) {
                const result = await response.json();
                const audioUrl = `${this.config.backendUrl}${result.url}`;
                const audioDuration = result.duration;

                this.currentAudio = new Audio(audioUrl);
                this.currentAudio.preload = 'auto';

                // 添加错误监听
                this.currentAudio.onerror = (e) => {
                    console.error('TTS音频播放出错:', e);
                    // 出错时确保视频恢复
                    this.speakingSubtitleEnd = 0;
                    this.videoPausedByTTS = false;
                    if (this.videoPlayer.paused) this.videoPlayer.play();
                };


                // 智能语速控制
                if (this.isAutoRate && subtitle && audioDuration > 0) {
                    const subtitleDuration = subtitle.end - subtitle.start;

                    // 默认使用手动语速
                    let playbackRate = this.ttsRate;

                    // 只有在"加速音频"模式下，才自动计算语速
                    if (strategy === 'speed_up') {
                        playbackRate = this.calculateDurationRate(audioDuration, subtitleDuration);
                    }

                    this.currentAudio.playbackRate = playbackRate;

                    // 更新UI显示
                    if (strategy === 'speed_up') {
                        this.rateValue.textContent = playbackRate.toFixed(1);
                        this.rateValue.classList.add('auto');
                    } else {
                        // 暂停模式下显示手动语速
                        this.rateValue.textContent = this.ttsRate;
                        this.rateValue.classList.remove('auto');
                    }


                    // 记录当前字幕结束时间，用于onTimeUpdate中判断是否需要暂停
                    this.speakingSubtitleEnd = subtitle.end;

                    // 决定何时恢复视频
                    if (strategy === 'pause_video' && wasPlaying) {
                        // 新逻辑：视频和音频同时播放
                        // 只有当视频播放到字幕结束时，如果音频还没播完，才在 onTimeUpdate 中暂停视频

                        console.log('暂停视频模式：音频就绪，同时恢复视频播放');
                        this.videoPlayer.play().catch(e => console.error('视频播放失败:', e));


                        // 注册音频结束回调，确保视频继续播放
                        this.currentAudio.onended = () => {
                            console.log('[onended] TTS播放结束，恢复/保持视频播放');
                            this.speakingSubtitleEnd = 0;
                            this.videoPausedByTTS = false;
                            // 不管当前状态如何，都尝试播放（解决状态检查的时序问题）
                            console.log('[onended] 尝试恢复视频播放');
                            this.videoPlayer.play().catch(e => console.error('[onended] 视频播放失败:', e));
                        };



                    } else {
                        // 加速模式 (Speed Up) - 已经在上面设置了playbackRate
                    }


                } else if (!this.isAutoRate) {
                    this.currentAudio.playbackRate = 1.0;

                    // 即使不是自动速度，在暂停视频模式下也需要注册onended回调
                    if (strategy === 'pause_video' && wasPlaying && subtitle) {
                        this.speakingSubtitleEnd = subtitle.end;
                        this.currentAudio.onended = () => {
                            console.log('[onended] TTS播放结束（手动速度模式），恢复视频');
                            this.speakingSubtitleEnd = 0;
                            this.videoPausedByTTS = false;
                            // 不管当前状态如何，都尝试播放
                            console.log('[onended] 尝试恢复视频播放');
                            this.videoPlayer.play().catch(e => console.error('[onended] 视频播放失败:', e));
                        };



                    }
                }

                this.currentAudio.play().catch(e => {
                    console.error('TTS音频play()失败:', e);
                    // 播放失败，确保视频恢复
                    this.speakingSubtitleEnd = 0;
                    this.videoPausedByTTS = false;
                    if (this.videoPlayer.paused) this.videoPlayer.play();
                });

                console.log('开始播放TTS音频');

            } else {
                // 如果请求失败，且我们暂停了视频，需要恢复
                if (this.isAutoRate && strategy === 'pause_video' && wasPlaying) {
                    this.videoPlayer.play();
                }
            }
        } catch (e) {
            console.error('Edge TTS播放失败:', e);
            this.showStatus('TTS播放失败', 'error');
            // 发生错误，恢复视频
            if (this.isAutoRate && strategy === 'pause_video' && wasPlaying) {
                this.videoPlayer.play();
            }
        }
    }

    // 基于时长的智能语速计算 (纯计算，无副作用)
    calculateDurationRate(audioDuration, subtitleDuration) {
        // 目标：在字幕结束前读完
        // 留出一点缓冲时间 (0.2秒)
        const targetDuration = Math.max(0.5, subtitleDuration - 0.2);

        let rate = audioDuration / targetDuration;

        // 限制最大语速
        const MAX_RATE = 2.5;
        const MIN_RATE = 0.8;

        if (rate > MAX_RATE) {
            rate = MAX_RATE;
        } else if (rate < MIN_RATE) {
            rate = 1.0;
        }

        return rate;
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
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio = null;
        }
        this.speakingSubtitleEnd = 0; // 重置标记
        this.videoPausedByTTS = false; // 重置暂停标记
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
        // 如果是因为TTS需要赶进度而暂停视频，不要停止TTS
        if (this.videoPausedByTTS) {
            console.log('视频被TTS逻辑暂停，保持TTS播放');
            return;
        }
        this.stopSpeaking();
    }


    // 视频播放事件
    onPlay() {
        // 如果在TTS模式且有当前字幕，继续朗读
        if (this.isTTSMode && this.currentSubtitleIndex >= 0) {
            // 只有当当前字幕没有被朗读过时才朗读 (防止暂停/恢复时的重复朗读循环)
            if (this.currentSubtitleIndex !== this.lastSpokenIndex) {
                const currentSubtitle = this.subtitles[this.currentSubtitleIndex];
                if (currentSubtitle) {
                    this.speakText(currentSubtitle.text, currentSubtitle);
                    this.lastSpokenIndex = this.currentSubtitleIndex;
                }
            }
        }
    }


    // 切换自动语速
    toggleAutoRate(event) {
        this.isAutoRate = event.target.checked;
        this.updateRateControlState();

        if (this.isAutoRate) {
            this.showStatus('已启用智能语速控制');
            this.speedStrategyGroup.style.display = 'flex';
            // 如果当前策略是暂停视频，保持手动控制显示
            this.updateRateControlState();
        } else {

            this.showStatus('已切换为手动语速控制');
            this.speedStrategyGroup.style.display = 'none';
        }

    }

    // 更新语速控件状态
    updateRateControlState() {
        const strategy = this.speedStrategy.value;

        // 如果是自动模式 且 策略是"加速音频"，则禁用手动控制
        // 如果是自动模式 且 策略是"暂停视频"，则启用手动控制 (用户决定语速，系统决定暂停)
        // 如果是手动模式，则启用手动控制

        if (this.isAutoRate && strategy === 'speed_up') {
            this.rateControlGroup.classList.add('disabled');
            this.rateValue.classList.add('auto');
        } else {
            this.rateControlGroup.classList.remove('disabled');
            this.rateValue.classList.remove('auto');
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
                    this.originalSubtitles = JSON.parse(JSON.stringify(subtitles)); // 保存原始字幕
                    this.showStatus(`✓ 字幕生成成功！共 ${subtitles.length} 条字幕`);

                    // 更新UI显示已生成字幕
                    this.subtitleFileName.textContent = `✓ 已自动生成字幕 (${subtitles.length} 条)`;
                    // 显示翻译控件和保存按钮
                    this.translateControls.style.display = 'flex';
                    this.saveSubtitleBtn.style.display = 'inline-block';
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

    // ========== 字幕翻译功能 ==========

    // 当用户选择目标语言时
    onLanguageSelect() {
        const language = this.targetLanguage.value;
        this.translateBtn.disabled = !language;
    }

    // 翻译字幕
    async translateSubtitles() {
        const targetLang = this.targetLanguage.value;
        if (!targetLang || this.originalSubtitles.length === 0) {
            this.showStatus('请先选择目标语言', 'error');
            return;
        }

        // 禁用按钮
        this.translateBtn.disabled = true;
        this.translateBtn.textContent = '⏳ 翻译中...';
        this.showStatus(`正在翻译 ${this.originalSubtitles.length} 条字幕到 ${this.getLanguageName(targetLang)}...`);

        try {
            // 翻译所有字幕
            const translatedSubtitles = [];
            let successCount = 0;
            let failCount = 0;

            for (let i = 0; i < this.originalSubtitles.length; i++) {
                const subtitle = this.originalSubtitles[i];

                try {
                    const translatedText = await this.translateText(subtitle.text, targetLang);
                    translatedSubtitles.push({
                        ...subtitle,
                        text: translatedText
                    });
                    successCount++;

                    // 更新进度
                    if ((i + 1) % 5 === 0 || i === this.originalSubtitles.length - 1) {
                        this.showStatus(`翻译进度: ${i + 1}/${this.originalSubtitles.length} (成功: ${successCount}, 失败: ${failCount})`);
                    }

                    // 避免API限流，每5条字幕暂停一下
                    if ((i + 1) % 5 === 0 && i < this.originalSubtitles.length - 1) {
                        await this.sleep(1000); // 暂停1秒
                    }
                } catch (e) {
                    console.error(`翻译第 ${i + 1} 条字幕失败:`, e);
                    // 翻译失败时使用原文
                    translatedSubtitles.push(subtitle);
                    failCount++;
                }
            }

            // 更新字幕
            this.subtitles = translatedSubtitles;
            this.showStatus(`✓ 翻译完成！成功 ${successCount} 条，失败 ${failCount} 条`);

            // 更新UI显示
            this.subtitleFileName.textContent = `✓ 已翻译为${this.getLanguageName(targetLang)} (${successCount} 条)`;

        } catch (e) {
            console.error('翻译出错:', e);
            this.showStatus('翻译失败: ' + e.message, 'error');
        } finally {
            // 恢复按钮
            this.translateBtn.disabled = false;
            this.translateBtn.textContent = '🌐 翻译字幕';
        }
    }

    // 翻译单条文本
    async translateText(text, targetLang) {
        // 使用后端Google翻译代理 (deep-translator)
        if (!this.config.backendUrl) {
            throw new Error('请先配置后端服务地址');
        }

        try {
            const response = await fetch(`${this.config.backendUrl}/api/translate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: text,
                    target_lang: targetLang
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            if (data.error) {
                throw new Error(data.error);
            }

            return data.translatedText;
        } catch (e) {
            console.error('Google翻译失败:', e);
            throw e;
        }
    }




    // 保存字幕
    saveSubtitle() {
        if (this.subtitles.length === 0) {
            this.showStatus('没有可保存的字幕', 'error');
            return;
        }

        // 构建VTT内容
        let vttContent = "WEBVTT\n\n";
        this.subtitles.forEach((sub, index) => {
            const startTime = this.formatTime(sub.start);
            const endTime = this.formatTime(sub.end);
            vttContent += `${index + 1}\n${startTime} --> ${endTime}\n${sub.text}\n\n`;
        });

        // 创建Blob并下载
        const blob = new Blob([vttContent], { type: 'text/vtt' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;

        // 文件名
        let fileName = 'subtitle.vtt';
        if (this.currentVideoFile) {
            fileName = this.currentVideoFile.name.replace(/\.[^/.]+$/, "") + '.vtt';
        }

        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.showStatus(`字幕已保存为 ${fileName}`);
    }

    // 格式化时间 (秒 -> HH:MM:SS.mmm)
    formatTime(seconds) {
        const date = new Date(0);
        date.setMilliseconds(seconds * 1000);
        const hh = date.getUTCHours().toString().padStart(2, '0');
        const mm = date.getUTCMinutes().toString().padStart(2, '0');
        const ss = date.getUTCSeconds().toString().padStart(2, '0');
        const mmm = date.getUTCMilliseconds().toString().padStart(3, '0');
        return `${hh}:${mm}:${ss}.${mmm}`;
    }

    // 获取语言名称
    getLanguageName(langCode) {
        const langNames = {
            'zh-CN': '中文（简体）',
            'zh-TW': '中文（繁体）',
            'en': '英语',
            'ja': '日语',
            'ko': '韩语',
            'es': '西班牙语',
            'fr': '法语',
            'de': '德语',
            'ru': '俄语',
            'ar': '阿拉伯语'
        };
        return langNames[langCode] || langCode;
    }

    // 延迟函数
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    new TTSVideoPlayer();
});
