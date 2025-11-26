// Edge TTS 客户端 (浏览器端实现)
class EdgeTTSClient {
    constructor() {
        this.ws = null;
        this.TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
        this.VOICE_LIST_URL = "https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list?trustedclienttoken=";
        this.WSS_URL = "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=";
    }

    // 生成UUID
    _uuid() {
        return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
            (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
        );
    }

    // 创建SSML
    _createSSML(text, voice, rate) {
        return `
        <speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>
            <voice name='${voice}'>
                <prosody pitch='+0Hz' rate='${rate}' volume='+0%'>
                    ${text}
                </prosody>
            </voice>
        </speak>`;
    }

    // 获取语音列表 (直接从微软获取，不依赖后端)
    async getVoices() {
        try {
            const response = await fetch(this.VOICE_LIST_URL + this.TRUSTED_CLIENT_TOKEN);
            if (response.ok) {
                return await response.json();
            }
            throw new Error('Failed to fetch voices');
        } catch (e) {
            console.error('EdgeTTSClient: getVoices failed', e);
            return [];
        }
    }

    // 合成语音
    async synthesize(text, voice, rate = '+0%') {
        return new Promise((resolve, reject) => {
            const wsUrl = this.WSS_URL + this.TRUSTED_CLIENT_TOKEN;
            const ws = new WebSocket(wsUrl);
            const requestId = this._uuid();
            const audioChunks = [];

            ws.onopen = () => {
                console.log('EdgeTTS: WebSocket connected');

                // 1. 发送配置
                const configMsg = {
                    context: {
                        synthesis: {
                            audio: {
                                metadataoptions: {
                                    sentenceBoundaryEnabled: "false",
                                    wordBoundaryEnabled: "false"
                                },
                                outputFormat: "audio-24khz-48kbitrate-mono-mp3"
                            }
                        }
                    }
                };

                const configHeader = `X-Timestamp:${new Date().toString()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n`;
                ws.send(configHeader + JSON.stringify(configMsg));

                // 2. 发送SSML
                const ssml = this._createSSML(text, voice, rate);
                const ssmlHeader = `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n`;
                ws.send(ssmlHeader + ssml);
            };

            ws.onmessage = async (event) => {
                const data = event.data;

                if (typeof data === 'string') {
                    // 文本消息 (Headers)
                    if (data.includes('Path:turn.end')) {
                        // 结束
                        ws.close();
                        const blob = new Blob(audioChunks, { type: 'audio/mp3' });
                        resolve(blob);
                    }
                } else if (data instanceof Blob) {
                    // 二进制消息 (音频数据)
                    // 需要解析Header找到音频开始的位置
                    // Edge TTS的二进制消息格式: 2字节Header长度 + Header文本 + 音频数据

                    const arrayBuffer = await data.arrayBuffer();
                    const view = new DataView(arrayBuffer);
                    const headerLength = view.getUint16(0);

                    // 简单的检查，如果Header包含 Path:audio
                    const headerBytes = new Uint8Array(arrayBuffer, 2, headerLength);
                    const headerText = new TextDecoder().decode(headerBytes);

                    if (headerText.includes('Path:audio')) {
                        const audioData = new Uint8Array(arrayBuffer, 2 + headerLength);
                        audioChunks.push(audioData);
                    }
                }
            };

            ws.onerror = (error) => {
                console.error('EdgeTTS: WebSocket error', error);
                reject(error);
            };

            ws.onclose = () => {
                console.log('EdgeTTS: WebSocket closed');
            };
        });
    }
}

// TTS字幕视频播放器
class TTSVideoPlayer {
    constructor() {
        // DOM元素
        this.videoPlayer = document.getElementById('videoPlayer');
        this.videoPlayer = document.getElementById('videoPlayer');
        // this.subtitleDisplay = document.getElementById('subtitleDisplay'); // Removed
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
        this.previewVoiceBtn = document.getElementById('previewVoiceBtn');
        this.speedStrategy = document.getElementById('speedStrategy');
        this.speedStrategyGroup = document.getElementById('speedStrategyGroup');

        // Edge TTS 客户端
        this.edgeClient = new EdgeTTSClient();


        // 设置相关元素
        this.settingsBtn = document.getElementById('settingsBtn');
        this.settingsModal = document.getElementById('settingsModal');
        this.generateSubtitleBtn = document.getElementById('generateSubtitleBtn');
        this.saveSubtitleBtn = document.getElementById('saveSubtitleBtn');

        // 下载相关元素
        this.videoUrlInput = document.getElementById('videoUrl');
        this.downloadBtn = document.getElementById('downloadBtn');
        this.downloadStatus = document.getElementById('downloadStatus');


        // 翻译相关元素
        this.translateControls = document.getElementById('translateControls');
        // this.closeSettingsBtn = document.getElementById('closeSettings'); // Removed
        this.saveSettingsBtn = document.getElementById('saveSettingsBtn');

        // 服务器文件相关
        this.serverFilesBtn = document.getElementById('serverFilesBtn');
        this.serverFilesModal = document.getElementById('serverFilesModal');
        this.closeServerFilesBtn = document.getElementById('closeServerFiles');
        this.serverFileList = document.getElementById('serverFileList');

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
        this.currentTTSRequestId = 0; // 用于追踪TTS请求，解决竞态问题
        this.isTTSLoading = false; // 标记TTS是否正在加载中
        this.textTrack = null; // Native TextTrack
        this.savedVoice = null; // 用于恢复保存的语音选择




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
        this.rateControl.addEventListener('change', () => this.savePlayerSettings());
        this.autoRateToggle.addEventListener('change', (e) => {
            this.toggleAutoRate(e);
            this.savePlayerSettings();
        });
        this.speedStrategy.addEventListener('change', () => {
            this.updateRateControlState();
            this.savePlayerSettings();
        });
        this.ttsEngine.addEventListener('change', () => {
            this.onEngineChange();
            this.savePlayerSettings();
        });
        this.voiceSelect.addEventListener('change', () => this.savePlayerSettings());
        this.previewVoiceBtn.addEventListener('click', () => this.previewVoice());



        // 设置相关事件
        this.settingsBtn.addEventListener('click', () => this.openSettings());
        this.settingsModal.querySelector('.close').addEventListener('click', () => this.closeSettings());
        this.settingsModal.addEventListener('click', (e) => {
            if (e.target === this.settingsModal) this.closeSettings();
        });
        document.getElementById('saveSettingsBtn').addEventListener('click', () => this.saveSettings());
        document.getElementById('testBackendBtn').addEventListener('click', () => this.testBackend());
        document.getElementById('testToolsBtn').addEventListener('click', () => this.testTools());
        // document.getElementById('testToolsBtn').addEventListener('click', () => this.testTools()); // Removed duplicate
        // this.closeSettingsBtn.addEventListener('click', () => this.closeSettings()); // Removed
        this.saveSettingsBtn.addEventListener('click', () => this.saveSettings());

        // 服务器文件事件
        this.serverFilesBtn.addEventListener('click', () => this.openServerFiles());
        this.closeServerFilesBtn.addEventListener('click', () => this.closeServerFiles());
        window.addEventListener('click', (e) => {
            if (e.target === this.serverFilesModal) {
                this.closeServerFiles();
            }
        });

        this.generateSubtitleBtn.addEventListener('click', () => this.generateSubtitle());
        this.saveSubtitleBtn.addEventListener('click', () => this.saveSubtitle());
        this.downloadBtn.addEventListener('click', () => this.downloadVideo());


        // 翻译相关事件
        this.targetLanguage.addEventListener('change', () => this.onLanguageSelect());
        this.translateBtn.addEventListener('click', () => this.translateSubtitles());

        // 初始化TTS
        this.loadPlayerSettings();
        this.initTTS();

        // 加载配置到UI
        this.loadConfigToUI();



        // 初始化语速控制状态
        this.updateRateControlState();

        // 初始化语速控制状态
        this.updateRateControlState();

        // 初始化TextTrack
        this.initTextTrack();

        // 字体大小滑块事件
        const fontSizeRange = document.getElementById('fontSizeRange');
        fontSizeRange.addEventListener('input', (e) => {
            const size = e.target.value;
            document.getElementById('fontSizeValue').textContent = size;
            this.updateFontSize(size);
        });

        this.showStatus('欢迎使用TTS字幕视频播放器！请上传视频和字幕文件。');
    }

    // 初始化TextTrack
    initTextTrack() {
        // 移除已有的轨道
        const oldTracks = this.videoPlayer.querySelectorAll('track');
        oldTracks.forEach(track => track.remove());

        // 创建新的轨道
        // 注意：addTextTrack 返回的是 TextTrack 对象，不是 <track> 元素
        // 这种方式创建的轨道是 "hidden" 模式默认，我们需要设置为 "showing"
        this.textTrack = this.videoPlayer.addTextTrack("subtitles", "中文", "zh");
        this.textTrack.mode = "showing";
    }

    // 更新TextTrack
    updateTextTrack(subtitles) {
        if (!this.textTrack) {
            this.initTextTrack();
        }

        // 清除旧字幕
        const cues = this.textTrack.cues;
        if (cues) {
            // 从后往前删除，防止索引变化问题
            for (let i = cues.length - 1; i >= 0; i--) {
                this.textTrack.removeCue(cues[i]);
            }
        }

        // 添加新字幕
        subtitles.forEach(sub => {
            const cue = new VTTCue(sub.start, sub.end, sub.text);
            this.textTrack.addCue(cue);
        });
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
        } else if (engine === 'google') {
            this.loadGoogleVoices();
        } else {
            await this.loadEdgeVoices();
        }
    }

    // 加载Google TTS语音 (硬编码常用语言)
    loadGoogleVoices() {
        const voices = [
            { name: '中文 (简体)', code: 'zh-cn' },
            { name: '中文 (繁体)', code: 'zh-tw' },
            { name: 'English (US)', code: 'en' },
            { name: 'Japanese', code: 'ja' },
            { name: 'Korean', code: 'ko' },
            { name: 'French', code: 'fr' },
            { name: 'German', code: 'de' },
            { name: 'Spanish', code: 'es' }
        ];

        this.voiceSelect.innerHTML = '';
        voices.forEach(voice => {
            const option = document.createElement('option');
            option.value = voice.code;
            option.textContent = voice.name;
            this.voiceSelect.appendChild(option);
        });

        this.showStatus('Google TTS语音列表已加载');

        // 恢复保存的语音
        if (this.savedVoice) {
            const options = Array.from(this.voiceSelect.options);
            if (options.some(opt => opt.value === this.savedVoice)) {
                this.voiceSelect.value = this.savedVoice;
            }
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

            // 恢复保存的语音
            if (this.savedVoice) {
                const options = Array.from(this.voiceSelect.options);
                if (options.some(opt => opt.value === this.savedVoice)) {
                    this.voiceSelect.value = this.savedVoice;
                }
            }
        };

        loadVoices();
        if (this.synth.onvoiceschanged !== undefined) {
            this.synth.onvoiceschanged = loadVoices;
        }
    }

    // 加载Edge TTS语音
    async loadEdgeVoices() {
        // 优先使用浏览器端直接获取
        try {
            this.showStatus('正在获取Edge语音列表...', 'info');
            const voices = await this.edgeClient.getVoices();

            if (voices && voices.length > 0) {
                this.edgeVoices = voices;
                this.voiceSelect.innerHTML = '';

                // 过滤中文语音
                const chineseVoices = voices.filter(v => v.Locale.includes('zh'));
                const voicesToShow = chineseVoices.length > 0 ? chineseVoices : voices;

                voicesToShow.forEach(voice => {
                    const option = document.createElement('option');
                    option.value = voice.ShortName;
                    const name = voice.LocalName || voice.DisplayName || voice.FriendlyName || voice.Name;
                    option.textContent = `${name} (${voice.Locale})`;
                    this.voiceSelect.appendChild(option);
                });

                // 默认选中晓晓
                const xiaoxiao = voicesToShow.find(v => v.ShortName === 'zh-CN-XiaoxiaoNeural');
                if (xiaoxiao) {
                    this.voiceSelect.value = xiaoxiao.ShortName;
                }

                this.showStatus('Edge语音列表加载成功');

                // 恢复保存的语音
                if (this.savedVoice) {
                    const options = Array.from(this.voiceSelect.options);
                    if (options.some(opt => opt.value === this.savedVoice)) {
                        this.voiceSelect.value = this.savedVoice;
                    }
                }
                return;
            }
        } catch (e) {
            console.error('浏览器端获取语音失败，尝试后端...', e);
        }

        // 后备：使用后端获取 (如果浏览器端失败)
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

                // 恢复保存的语音
                if (this.savedVoice) {
                    const options = Array.from(this.voiceSelect.options);
                    if (options.some(opt => opt.value === this.savedVoice)) {
                        this.voiceSelect.value = this.savedVoice;
                    }
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

    // 下载视频
    async downloadVideo() {
        const url = this.videoUrlInput.value.trim();
        if (!url) {
            this.showStatus('请输入视频URL', 'error');
            return;
        }

        if (!this.config.backendUrl) {
            this.showStatus('请先配置后端服务地址', 'error');
            return;
        }

        this.downloadBtn.disabled = true;
        this.downloadBtn.textContent = '下载中...';

        // 倒计时逻辑
        let countdown = 61;
        this.downloadStatus.textContent = `正在下载视频和字幕，请稍候... (预计剩余 ${countdown} 秒)`;

        const countdownInterval = setInterval(() => {
            countdown--;
            if (countdown > 0) {
                this.downloadStatus.textContent = `正在下载视频和字幕，请稍候... (预计剩余 ${countdown} 秒)`;
            } else {
                this.downloadStatus.textContent = `正在下载视频和字幕，请稍候... (即将完成)`;
            }
        }, 1000);

        try {
            const response = await fetch(`${this.config.backendUrl}/api/download`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: url })
            });

            const result = await response.json();

            if (response.ok && result.success) {
                this.showStatus(`下载成功: ${result.video_name}`);
                this.downloadStatus.textContent = '下载完成，正在加载...';

                // 加载视频
                const videoUrl = `${this.config.backendUrl}${result.video_url}`;
                this.videoPlayer.src = videoUrl;
                this.currentVideoFile = { name: result.video_name }; // 模拟文件对象

                // 显示自动生成字幕按钮
                this.generateSubtitleBtn.style.display = 'inline-block';

                // 加载字幕
                if (result.subtitles && result.subtitles.length > 0) {
                    // 优先加载中文
                    let targetSub = result.subtitles.find(s => s.lang === 'zh-Hans') ||
                        result.subtitles.find(s => s.lang === 'zh-Hant') ||
                        result.subtitles.find(s => s.lang === 'zh-CN') ||
                        result.subtitles.find(s => s.lang === 'zh-TW') ||
                        result.subtitles.find(s => s.lang === 'zh') ||
                        result.subtitles.find(s => s.lang === 'default') ||
                        result.subtitles[0];

                    if (targetSub) {
                        this.loadSubtitleFromUrl(`${this.config.backendUrl}${targetSub.path}`, targetSub.name);
                    }
                } else {
                    this.showStatus('未找到字幕，您可以尝试自动生成', 'warning');
                }

            } else {
                throw new Error(result.error || '下载失败');
            }

        } catch (e) {
            console.error(e);
            this.showStatus(`下载失败: ${e.message}`, 'error');
            this.downloadStatus.textContent = '下载失败';
        } finally {
            clearInterval(countdownInterval);
            this.downloadBtn.disabled = false;
            this.downloadBtn.textContent = '下载并加载';
        }
    }

    // 从URL加载字幕
    async loadSubtitleFromUrl(url, fileName) {
        try {
            const response = await fetch(url);
            if (response.ok) {
                const content = await response.text();

                let subtitles = [];
                if (fileName.toLowerCase().endsWith('.vtt') || content.trim().startsWith('WEBVTT')) {
                    subtitles = this.parseVTT(content);
                } else {
                    subtitles = this.parseSRT(content);
                }

                this.subtitles = subtitles;
                this.originalSubtitles = JSON.parse(JSON.stringify(subtitles));

                if (subtitles.length > 0) {
                    this.showStatus(`已加载下载的字幕: ${fileName}`);
                    this.subtitleFileName.textContent = `✓ ${fileName}`;
                    this.translateControls.style.display = 'flex';
                    this.saveSubtitleBtn.style.display = 'inline-block';
                    this.updateTextTrack(subtitles);
                } else {
                    this.showStatus('字幕解析为空', 'warning');
                }
            }
        } catch (e) {
            console.error('加载字幕失败:', e);
            this.showStatus('加载字幕失败', 'error');
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

                // 尝试从服务器自动加载同名字幕
                // 注意：这里假设用户打开的本地文件在服务器的video目录下也有同名文件
                // 这是一个"尽力而为"的尝试，解决了用户使用本地文件选择器但也希望自动加载服务器字幕的需求
                console.log(`尝试为本地文件自动加载字幕: ${file.name}`);
                this.autoLoadSubtitle(file.name);
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
                    // 显示翻译控件和保存按钮
                    this.translateControls.style.display = 'flex';
                    this.saveSubtitleBtn.style.display = 'inline-block';
                    this.updateTextTrack(subtitles);
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
            this.speedStrategy.value === 'pause_video' &&
            this.speakingSubtitleEnd > 0) {

            // 如果超过了字幕结束时间 (给予0.1秒的宽容度)
            if (currentTime >= this.speakingSubtitleEnd - 0.1) {
                // 情况1: TTS正在加载中
                if (this.isTTSLoading) {
                    if (!this.videoPausedByTTS) {
                        console.log(`到达字幕结束点(${this.speakingSubtitleEnd})，TTS正在加载，暂停视频等待。`);
                        this.videoPausedByTTS = true;
                        this.videoPlayer.pause();
                    }
                    return;
                }

                // 情况2: TTS正在播放
                let isSpeaking = false;
                if (this.ttsEngine.value === 'browser') {
                    isSpeaking = this.synth && this.synth.speaking;
                } else {
                    isSpeaking = this.currentAudio && !this.currentAudio.paused;
                }

                if (isSpeaking) {
                    if (!this.videoPausedByTTS) {
                        console.log(`到达字幕结束点(${this.speakingSubtitleEnd})，暂停视频等待TTS完成。Engine=${this.ttsEngine.value}`);
                        this.videoPausedByTTS = true;
                        this.videoPlayer.pause();
                    }
                    return; // 暂停处理后续逻辑，防止触发下一条字幕
                }
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
                // 如果是TTS模式，朗读字幕
                if (this.isTTSMode) {
                    console.log(`[字幕切换] 从索引 ${this.currentSubtitleIndex} 切换到 ${foundIndex}`);
                    this.speakText(foundSubtitle.text, foundSubtitle);
                    this.lastSpokenIndex = foundIndex;
                }
            } else {
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
        } else if (engine === 'google') {
            this.speakGoogleTTS(text, subtitle);
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
        const strategy = this.speedStrategy.value;

        // 如果是"暂停视频"模式，强制使用手动语速
        if (strategy === 'pause_video') {
            rate = this.ttsRate;
            this.rateValue.classList.remove('auto');

            // 立即设置结束点，防止视频在TTS朗读期间跑过头
            if (subtitle) {
                this.speakingSubtitleEnd = subtitle.end;
                console.log(`[speakBrowserTTS] 暂停模式：立即设置字幕结束点 ${this.speakingSubtitleEnd}`);
            }
        }
        // 否则，如果开启了自动语速
        else if (this.isAutoRate && subtitle) {
            rate = this.calculateOptimalRate(subtitle);
            // 更新显示的语速值（用绿色表示自动调整）
            this.rateValue.textContent = rate.toFixed(1);
            this.rateValue.classList.add('auto');
        } else {
            rate = this.ttsRate;
        }
        this.currentUtterance.rate = rate;
        this.currentUtterance.volume = 1.0;

        // 注册结束回调，用于暂停模式下的视频恢复
        this.currentUtterance.onend = () => {
            console.log('[speakBrowserTTS] 朗读结束');
            if (strategy === 'pause_video') {
                if (this.videoPausedByTTS) {
                    console.log('[speakBrowserTTS] 视频曾被TTS暂停，现在恢复播放');
                    this.videoPausedByTTS = false;
                    this.speakingSubtitleEnd = 0;
                    this.videoPlayer.play().catch(e => console.error('视频播放失败:', e));
                } else {
                    this.speakingSubtitleEnd = 0;
                }
            }
        };

        this.synth.speak(this.currentUtterance);
    }

    // 预览当前语音
    previewVoice() {
        const engine = this.ttsEngine.value;
        const voiceSelect = this.voiceSelect;
        const selectedOption = voiceSelect.options[voiceSelect.selectedIndex];

        if (!selectedOption) return;

        const voiceName = selectedOption.text;
        let text = "你好，我是这个声音。Hello, this is a sample.";

        // 简单的语言检测，根据语音名称调整示例文本
        if (voiceName.includes('English') || voiceName.includes('en-')) {
            text = "Hello, this is a sample of my voice.";
        } else if (voiceName.includes('Japanese') || voiceName.includes('ja-')) {
            text = "こんにちは、これは私の声のサンプルです。";
        }

        console.log(`[Preview] Engine: ${engine}, Voice: ${voiceName}, Text: ${text}`);

        if (engine === 'browser') {
            this.speakBrowserTTS(text, null);
        } else if (engine === 'google') {
            this.speakGoogleTTS(text, null);
        } else {
            // 使用新的浏览器端Client
            this.speakEdgeTTS(text, 'PREVIEW');
        }
    }

    // Google TTS
    async speakGoogleTTS(text, subtitle) {
        if (!this.config.backendUrl) {
            this.showStatus('请先配置后端服务地址', 'error');
            return;
        }

        this.isTTSLoading = true;
        const strategy = this.speedStrategy.value;
        const wasPlaying = !this.videoPlayer.paused;

        // 语速参数处理 (Google TTS不支持微调，只支持 slow=True/False，这里后端gTTS接口暂未暴露slow参数，默认正常速度)
        // 如果是暂停模式，我们手动控制
        if (strategy === 'pause_video') {
            if (subtitle) {
                this.speakingSubtitleEnd = subtitle.end;
            }
        }

        try {
            const response = await fetch(`${this.config.backendUrl}/api/tts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: text,
                    voice: this.voiceSelect.value, // 这里是语言代码，如 'zh-cn'
                    engine: 'google'
                })
            });

            if (response.ok) {
                const result = await response.json();
                const audioUrl = `${this.config.backendUrl}${result.url}`;
                const audioDuration = result.duration;

                this.currentAudio = new Audio(audioUrl);
                this.currentAudio.preload = 'auto';

                this.currentAudio.onerror = (e) => {
                    console.error('Google TTS音频播放出错:', e);
                    this.isTTSLoading = false;
                    this.speakingSubtitleEnd = 0;
                    this.videoPausedByTTS = false;
                    if (this.videoPlayer.paused) this.videoPlayer.play();
                };

                let playbackRate = 1.0;

                // 策略处理
                if (strategy === 'pause_video') {
                    playbackRate = 1.0; // Google TTS原生语速

                    this.currentAudio.onended = () => {
                        this.isTTSLoading = false;
                        if (this.videoPausedByTTS) {
                            this.videoPausedByTTS = false;
                            this.speakingSubtitleEnd = 0;
                            this.videoPlayer.play();
                        } else {
                            this.speakingSubtitleEnd = 0;
                        }
                    };
                } else if (strategy === 'speed_up' && this.isAutoRate && subtitle && audioDuration > 0) {
                    const subtitleDuration = subtitle.end - subtitle.start;
                    const videoRate = this.videoPlayer.playbackRate || 1.0;
                    playbackRate = this.calculateDurationRate(audioDuration, subtitleDuration, videoRate);

                    this.rateValue.textContent = playbackRate.toFixed(1);
                    this.rateValue.classList.add('auto');
                    this.speakingSubtitleEnd = subtitle.end;

                    this.currentAudio.onended = () => { this.isTTSLoading = false; };
                } else {
                    playbackRate = this.ttsRate; // 手动语速
                    this.currentAudio.onended = () => { this.isTTSLoading = false; };
                }

                this.currentAudio.playbackRate = playbackRate;

                await this.currentAudio.play();
                this.isTTSLoading = false;

            } else {
                throw new Error('Google TTS请求失败');
            }
        } catch (e) {
            console.error('Google TTS播放失败:', e);
            this.showStatus('Google TTS播放失败', 'error');
            this.isTTSLoading = false;
            if (strategy === 'pause_video' && wasPlaying) {
                this.videoPlayer.play();
                this.videoPausedByTTS = false;
                this.speakingSubtitleEnd = 0;
            }
        }
    }

    // Edge TTS (浏览器端直接调用)
    async speakEdgeTTS(text, subtitle) {
        // 生成新的请求ID
        this.currentTTSRequestId++;
        const requestId = this.currentTTSRequestId;
        this.isTTSLoading = true;

        const voice = this.voiceSelect.value;
        const strategy = this.speedStrategy.value;
        const wasPlaying = !this.videoPlayer.paused;

        console.log(`[speakEdgeTTS] 开始 (Browser Client), wasPlaying=${wasPlaying}, strategy=${strategy}, isAutoRate=${this.isAutoRate}`);

        // 语速参数处理
        let rateParam = '+0%';
        if (strategy === 'pause_video') {
            const ratePercent = Math.round((this.ttsRate - 1.0) * 100);
            rateParam = (ratePercent >= 0 ? '+' : '') + ratePercent + '%';
            this.rateValue.classList.remove('auto');
            this.rateControlGroup.classList.remove('disabled');

            if (subtitle) {
                this.speakingSubtitleEnd = subtitle.end;
            }
        } else {
            // speed_up 或 default
            // 浏览器端合成时，我们通常请求原速(+0%)，然后在Audio对象上设置playbackRate
            // 这样音质更好，且控制更灵活
            rateParam = '+0%';
        }

        try {
            // 使用浏览器端Client直接合成
            const audioBlob = await this.edgeClient.synthesize(text, voice, rateParam);

            // 检查请求ID是否过期
            if (requestId !== this.currentTTSRequestId) {
                console.log(`[speakEdgeTTS] 请求ID不匹配，忽略结果`);
                this.isTTSLoading = false;
                return;
            }

            const audioUrl = URL.createObjectURL(audioBlob);

            // 获取音频时长 (通过创建临时Audio对象)
            const tempAudio = new Audio(audioUrl);
            // 等待元数据加载以获取时长
            await new Promise(resolve => {
                tempAudio.onloadedmetadata = resolve;
                tempAudio.onerror = resolve; // 即使出错也继续
            });
            const audioDuration = tempAudio.duration || 0;

            this.currentAudio = new Audio(audioUrl);
            this.currentAudio.preload = 'auto';

            // 添加错误监听
            this.currentAudio.onerror = (e) => {
                console.error('TTS音频播放出错:', e);
                this.isTTSLoading = false;
                this.speakingSubtitleEnd = 0;
                this.videoPausedByTTS = false;
                if (this.videoPlayer.paused) this.videoPlayer.play();
            };

            // 设置播放速度
            let playbackRate = 1.0;

            if (strategy === 'pause_video') {
                // 暂停模式：如果我们在生成时已经用了rateParam，这里就用1.0
                // 但为了统一，我们上面设置了rateParam，所以这里用1.0
                playbackRate = 1.0;

                this.currentAudio.onended = () => {
                    console.log('[onended] TTS播放结束');
                    this.isTTSLoading = false;
                    URL.revokeObjectURL(audioUrl); // 释放内存

                    if (this.videoPausedByTTS) {
                        this.videoPausedByTTS = false;
                        this.speakingSubtitleEnd = 0;
                        this.videoPlayer.play().catch(e => console.error('[onended] 视频播放失败:', e));
                    } else {
                        this.speakingSubtitleEnd = 0;
                    }
                };
            } else if (strategy === 'speed_up' && this.isAutoRate && subtitle && audioDuration > 0) {
                // 加速模式 & 自动语速
                const subtitleDuration = subtitle.end - subtitle.start;
                const videoRate = this.videoPlayer.playbackRate || 1.0;
                playbackRate = this.calculateDurationRate(audioDuration, subtitleDuration, videoRate);

                this.rateValue.textContent = playbackRate.toFixed(1);
                this.rateValue.classList.add('auto');
                this.speakingSubtitleEnd = subtitle.end;

                // 普通模式结束回调
                this.currentAudio.onended = () => {
                    this.isTTSLoading = false;
                    URL.revokeObjectURL(audioUrl);
                };
            } else {
                // 手动模式
                // 如果是手动模式且非暂停，我们希望前端控制语速
                // 上面rateParam设为了+0%，所以这里设置playbackRate
                playbackRate = this.ttsRate;

                this.currentAudio.onended = () => {
                    this.isTTSLoading = false;
                    URL.revokeObjectURL(audioUrl);
                };
            }

            this.currentAudio.playbackRate = playbackRate;

            this.currentAudio.play()
                .then(() => {
                    console.log('开始播放TTS音频');
                    this.isTTSLoading = false;
                })
                .catch(e => {
                    console.error('TTS音频play()失败:', e);
                    this.isTTSLoading = false;
                    this.speakingSubtitleEnd = 0;
                    this.videoPausedByTTS = false;
                    if (this.videoPlayer.paused) this.videoPlayer.play();
                });

        } catch (e) {
            console.error('Edge TTS播放失败 (Browser):', e);

            // 失败时尝试后端 (gTTS fallback)
            console.log('尝试后端Fallback...');
            this.speakEdgeTTSBackend(text, subtitle, requestId, strategy, wasPlaying);
        }
    }

    // 后端Edge TTS (作为Fallback)
    async speakEdgeTTSBackend(text, subtitle, requestId, strategy, wasPlaying) {
        if (!this.config.backendUrl) return;

        // ... (原有的speakEdgeTTS逻辑，改名为speakEdgeTTSBackend)
        // 为了简化，这里只保留最核心的fetch调用，或者我们可以完全依赖前端
        // 鉴于前端失败通常意味着网络问题或微软封锁，后端可能也一样
        // 但后端有gTTS fallback，所以还是值得一试

        try {
            // 简单的语速参数
            let rateParam = '+0%';
            if (strategy === 'pause_video') {
                const ratePercent = Math.round((this.ttsRate - 1.0) * 100);
                rateParam = (ratePercent >= 0 ? '+' : '') + ratePercent + '%';
            }

            const response = await fetch(`${this.config.backendUrl}/api/tts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: text,
                    voice: this.voiceSelect.value,
                    rate: rateParam
                })
            });

            if (response.ok) {
                if (requestId !== this.currentTTSRequestId) return;
                const result = await response.json();
                const audioUrl = `${this.config.backendUrl}${result.url}`;

                this.currentAudio = new Audio(audioUrl);
                // ... (简化播放逻辑)
                this.currentAudio.play();
                this.currentAudio.onended = () => {
                    this.isTTSLoading = false;
                    if (this.videoPausedByTTS) {
                        this.videoPausedByTTS = false;
                        this.videoPlayer.play();
                    }
                };
            }
        } catch (e) {
            console.error('后端TTS也失败:', e);
            this.showStatus('TTS播放失败', 'error');
            this.isTTSLoading = false;
            if (strategy === 'pause_video' && wasPlaying) {
                this.videoPlayer.play();
            }
        }
    }

    // 基于时长的智能语速计算 (纯计算，无副作用)
    calculateDurationRate(audioDuration, subtitleDuration, videoPlaybackRate = 1.0) {
        // 目标：在字幕结束前读完
        // 留出一点缓冲时间 (0.2秒)
        // 注意：如果视频加速了，字幕显示时间会变短，所以目标时长要除以倍速
        const effectiveSubtitleDuration = subtitleDuration / videoPlaybackRate;
        const targetDuration = Math.max(0.5, effectiveSubtitleDuration - 0.2);

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
        this.currentTTSRequestId++; // 使之前的请求失效
        this.isTTSLoading = false;

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

        this.savePlayerSettings();
    }
    // 视频暂停事件
    onPause() {
        // 如果是因为TTS需要赶进度而暂停视频，不要停止TTS
        if (this.videoPausedByTTS) {
            console.log('视频被TTS逻辑暂停，保持TTS播放');
            return;
        }
        // 如果是用户手动暂停，或者其他原因暂停，停止TTS
        // 但要注意，如果TTS正在加载中，我们也应该取消加载
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
        console.log(`[updateRateControlState] isAutoRate=${this.isAutoRate}, strategy=${strategy}`);

        // 如果是自动模式 且 策略是"加速音频"，则禁用手动控制
        // 如果是自动模式 且 策略是"暂停视频"，则启用手动控制 (用户决定语速，系统决定暂停)
        // 如果是手动模式，则启用手动控制

        if (this.isAutoRate && strategy === 'speed_up') {
            this.rateControlGroup.classList.add('disabled');
            this.rateValue.classList.add('auto');
            console.log('禁用手动语速控制');
        } else {
            // 暂停视频模式下，允许手动控制
            this.rateControlGroup.classList.remove('disabled');
            this.rateValue.classList.remove('auto');
            console.log('启用手动语速控制');
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

    // ========== 用户界面设置保存 ==========

    loadPlayerSettings() {
        try {
            const saved = localStorage.getItem('ttsPlayerUISettings');
            if (saved) {
                const settings = JSON.parse(saved);

                if (settings.ttsEngine) this.ttsEngine.value = settings.ttsEngine;
                if (settings.autoRate !== undefined) this.autoRateToggle.checked = settings.autoRate;
                if (settings.speedStrategy) this.speedStrategy.value = settings.speedStrategy;
                if (settings.rate) {
                    this.rateControl.value = settings.rate;
                    this.updateRate({ target: { value: settings.rate } });
                }

                this.isAutoRate = this.autoRateToggle.checked;
                this.updateRateControlState();

                if (settings.voice) {
                    this.savedVoice = settings.voice;
                }
                console.log('已加载用户界面设置');
            }
        } catch (e) {
            console.error('加载用户界面设置失败:', e);
        }
    }

    savePlayerSettings() {
        const settings = {
            ttsEngine: this.ttsEngine.value,
            voice: this.voiceSelect.value,
            autoRate: this.autoRateToggle.checked,
            speedStrategy: this.speedStrategy.value,
            rate: this.rateControl.value
        };
        localStorage.setItem('ttsPlayerUISettings', JSON.stringify(settings));
    }

    // ========== 用户界面设置保存 ==========

    loadPlayerSettings() {
        try {
            const saved = localStorage.getItem('ttsPlayerUISettings');
            if (saved) {
                const settings = JSON.parse(saved);

                if (settings.ttsEngine) this.ttsEngine.value = settings.ttsEngine;
                if (settings.autoRate !== undefined) this.autoRateToggle.checked = settings.autoRate;
                if (settings.speedStrategy) this.speedStrategy.value = settings.speedStrategy;
                if (settings.rate) {
                    this.rateControl.value = settings.rate;
                    this.updateRate({ target: { value: settings.rate } });
                }

                // 恢复TTS模式
                if (settings.isTTSMode && !this.isTTSMode) {
                    this.toggleMode();
                }

                this.isAutoRate = this.autoRateToggle.checked;

                // 同步UI可见性状态
                if (this.isAutoRate) {
                    this.speedStrategyGroup.style.display = 'flex';
                } else {
                    this.speedStrategyGroup.style.display = 'none';
                }

                this.updateRateControlState();

                if (settings.voice) {
                    this.savedVoice = settings.voice;
                }
                console.log('已加载用户界面设置');
            }
        } catch (e) {
            console.error('加载用户界面设置失败:', e);
        }
    }

    savePlayerSettings() {
        const settings = {
            ttsEngine: this.ttsEngine.value,
            voice: this.voiceSelect.value,
            autoRate: this.autoRateToggle.checked,
            speedStrategy: this.speedStrategy.value,
            rate: this.rateControl.value,
            isTTSMode: this.isTTSMode
        };
        localStorage.setItem('ttsPlayerUISettings', JSON.stringify(settings));
    }

    // ========== 配置管理 ==========

    // 加载配置
    loadConfig() {
        const defaultConfig = {
            backendUrl: 'http://localhost:5001',
            ffmpegPath: 'ffmpeg',
            whisperPath: 'whisper',
            modelPath: '',
            language: 'auto',
            fontSize: 24
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

        // 加载字体大小
        const fontSize = this.config.fontSize || 24;
        document.getElementById('fontSizeRange').value = fontSize;
        document.getElementById('fontSizeValue').textContent = fontSize;
        this.updateFontSize(fontSize);
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
        this.config.fontSize = parseInt(document.getElementById('fontSizeRange').value);

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
                timeout: 5001
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
                    // 更新UI显示已生成字幕
                    this.subtitleFileName.textContent = `✓ 已自动生成字幕 (${subtitles.length} 条)`;
                    // 显示翻译控件和保存按钮
                    this.translateControls.style.display = 'flex';
                    this.saveSubtitleBtn.style.display = 'inline-block';
                    this.updateTextTrack(subtitles);
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
            // 批量翻译
            const allTexts = this.originalSubtitles.map(s => s.text);
            const translatedTexts = [];

            // 分批处理，每批50条，避免请求体过大
            const batchSize = 50;
            const totalBatches = Math.ceil(allTexts.length / batchSize);

            for (let i = 0; i < allTexts.length; i += batchSize) {
                const batch = allTexts.slice(i, i + batchSize);
                const currentBatchNum = Math.floor(i / batchSize) + 1;

                this.showStatus(`正在翻译第 ${currentBatchNum}/${totalBatches} 批...`);

                try {
                    const results = await this.translateBatch(batch, targetLang);
                    translatedTexts.push(...results);
                } catch (e) {
                    console.error(`第 ${currentBatchNum} 批翻译失败:`, e);
                    // 失败时使用原文填充，保持索引一致
                    translatedTexts.push(...batch);
                }

                // 小短暂暂停，给UI喘息机会
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            // 组装结果
            const translatedSubtitles = this.originalSubtitles.map((subtitle, index) => ({
                ...subtitle,
                text: translatedTexts[index] || subtitle.text
            }));

            // 更新字幕
            this.subtitles = translatedSubtitles;
            this.updateTextTrack(this.subtitles);
            this.showStatus(`✓ 翻译完成！共 ${this.subtitles.length} 条`);

            // 更新UI显示
            this.subtitleFileName.textContent = `✓ 已翻译为${this.getLanguageName(targetLang)}`;

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

    // 批量翻译文本
    async translateBatch(texts, targetLang) {
        if (!this.config.backendUrl) {
            throw new Error('请先配置后端服务地址');
        }

        try {
            const response = await fetch(`${this.config.backendUrl}/api/translate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    texts: texts,
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

            return data.translatedTexts;
        } catch (e) {
            console.error('批量翻译失败:', e);
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

    // 更新字体大小
    updateFontSize(size) {
        // 使用动态样式标签来强制应用字体大小
        let styleEl = document.getElementById('subtitle-font-style');
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = 'subtitle-font-style';
            document.head.appendChild(styleEl);
        }

        styleEl.textContent = `
            video::cue {
                font-size: ${size}px !important;
                background: rgba(0, 0, 0, 0.6) !important;
                color: white !important;
                text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.9) !important;
            }
            /* 兼容 WebKit 浏览器 */
            video::-webkit-media-text-track-display {
                font-size: ${size}px !important;
            }
        `;

        // 更新显示值
        const valueDisplay = document.getElementById('fontSizeValue');
        if (valueDisplay) {
            valueDisplay.textContent = size;
        }
    }

    // ========== 服务器文件功能 ==========

    // 打开服务器文件列表
    async openServerFiles() {
        this.serverFilesModal.classList.add('show');
        this.loadServerFiles();
    }

    // 关闭服务器文件列表
    closeServerFiles() {
        this.serverFilesModal.classList.remove('show');
    }

    // 加载服务器文件列表
    async loadServerFiles() {
        if (!this.config.backendUrl) {
            this.serverFileList.innerHTML = '<div class="error">请先配置后端地址</div>';
            return;
        }

        this.serverFileList.innerHTML = '<div class="loading">加载中...</div>';

        try {
            const response = await fetch(`${this.config.backendUrl}/api/videos`);
            if (response.ok) {
                const videos = await response.json();
                this.renderServerFiles(videos);
            } else {
                this.serverFileList.innerHTML = '<div class="error">加载失败</div>';
            }
        } catch (e) {
            this.serverFileList.innerHTML = `<div class="error">连接失败: ${e.message}</div>`;
        }
    }

    // 渲染文件列表
    renderServerFiles(videos) {
        if (videos.length === 0) {
            this.serverFileList.innerHTML = '<div class="empty">没有找到视频文件</div>';
            return;
        }

        let html = '<ul class="video-list">';
        videos.forEach(video => {
            const size = (video.size / 1024 / 1024).toFixed(2) + ' MB';
            const date = new Date(video.mtime * 1000).toLocaleString();
            html += `
                <li class="video-item" onclick="player.playServerVideo('${video.name}', '${video.path}')">
                    <div class="video-info">
                        <span class="video-name">${video.name}</span>
                        <span class="video-meta">${size} - ${date}</span>
                    </div>
                    <button class="btn small">播放</button>
                </li>
            `;
        });
        html += '</ul>';
        this.serverFileList.innerHTML = html;
    }

    // 播放服务器视频
    async playServerVideo(filename, path) {
        const url = `${this.config.backendUrl}${path}`;
        this.videoPlayer.src = url;
        this.currentVideoFile = { name: filename }; // 模拟File对象
        this.showStatus(`正在播放: ${filename}`);
        this.closeServerFiles();

        // 尝试自动加载字幕
        await this.autoLoadSubtitle(filename);
    }

    // 自动加载字幕
    async autoLoadSubtitle(videoFilename) {
        if (!this.config.backendUrl) return;

        try {
            const response = await fetch(`${this.config.backendUrl}/api/match-subtitle?video_filename=${encodeURIComponent(videoFilename)}`);
            if (response.ok) {
                const result = await response.json();
                if (result.found) {
                    this.showStatus(`自动加载字幕: ${result.name}`);
                    const subtitleUrl = `${this.config.backendUrl}${result.url}`;
                    this.loadSubtitleFromUrl(subtitleUrl, result.name);
                } else {
                    console.log('未找到匹配的字幕');
                }
            }
        } catch (e) {
            console.error('自动加载字幕失败:', e);
        }
    }


}

// 全局变量以便HTML调用
let player;

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    player = new TTSVideoPlayer();
});
