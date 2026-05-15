// pages/ai/ai.js
// AI智能助手页面：多会话管理、语音输入、文本问答、智能反馈查询分流
// 核心能力：
//   1. 文本/语音输入 → 调用 /api/ai/chat 得到 Qwen 模型回复
//   2. 语音输入复用 /api/voice/recognize（Whisper small 模型）
//   3. 消息发送后根据关键词自动分流：查询反馈列表 / 查询反馈进度 / 通用对话
// 特色：多会话持久化存储（本地 storage），支持新建、切换、删除会话

const app = getApp();
const recorderManager = wx.getRecorderManager();

Page({
  data: {
    // 多会话管理
    conversations: [],           // 所有会话列表 [{id, title, messages, createdAt}]
    currentConversationId: '',   // 当前活跃会话ID
    showHistoryInMenu: false,    // 菜单中是否展示历史会话列表

    messages: [],                // 当前会话的消息数组
    inputMessage: '',            // 输入框内容
    isLoading: false,            // 是否等待 AI 回复
    scrollTop: 0,                // 消息列表滚动位置
    scrollToView: '',            // 滚动到指定消息ID（搜索跳转用）
    userAvatarText: '',          // 用户头像文字（取姓名首字）
    networkType: 'unknown',      // 当前网络类型
    showScrollBtn: false,        // 是否显示「滚动到底部」按钮
    showMenu: false,             // 是否显示左侧菜单
    feedbackList: [],            // 用户反馈列表（用于智能查询）
    lastScrollTop: 0,            // 上次滚动位置

    // 语音相关
    isRecording: false,          // 是否正在录音
    recordingTime: 0,            // 已录制秒数
    formattedRecordingTime: '00:00', // 格式化录音时间
    recordingTimer: null,        // 录音计时器
    hasRecordPermission: true,   // 是否有录音权限
    tempVoicePath: '',           // 录音临时文件路径
    isPlaying: false,            // 是否正在播放录音
    playPercent: 0,              // 播放进度百分比
    playPercentStyle: 'width: 0%;', // 播放进度条样式
    showVoiceInput: false,       // 是否显示语音输入面板
    recognizing: false,          // 是否正在识别语音
    showRecognizeResult: false,  // 是否展示识别结果
    recognizeError: '',          // 语音识别错误信息
    innerAudioContext: null,     // 音频播放实例

    // 搜索相关
    showSearch: false,           // 是否显示搜索面板
    searchKeyword: '',           // 搜索关键词
    searchResults: [],           // 搜索结果列表
  },

  // 生成唯一会话ID
  generateConversationId() {
    return 'conv_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  },

  // 新会话的欢迎消息
  getGreetingMessage() {
    return [{
      role: 'ai',
      content: '您好，我是AI智能助手，可以帮您查询反馈记录、反馈进度，或解答政策相关问题。有什么可以帮您？',
      time: Date.now()
    }];
  },

  // 创建新会话：生成ID，插入列表头部，保存到本地存储
  createNewConversation() {
    const conversationId = this.generateConversationId();
    const newConversation = {
      id: conversationId,
      title: '新对话',
      messages: this.getGreetingMessage(),
      createdAt: Date.now()
    };
    const conversations = [newConversation, ...this.data.conversations];
    this.setData({
      conversations: conversations,
      currentConversationId: conversationId,
      messages: newConversation.messages,
      showMenu: false,
      showHistoryInMenu: false,
      scrollTop: 0,
      scrollToView: '',
      lastScrollTop: 0,
      isLoading: false,
      showSearch: false,
      searchKeyword: '',
      searchResults: []
    }, () => {
      this.setData({ scrollTop: 0 });
      this.saveConversationsToStorage(); // 持久化
    });
    wx.showToast({ title: '已创建新对话', icon: 'success', duration: 1500 });
  },

  // 切换到指定会话
  switchConversation(e) {
    const conversationId = e.currentTarget.dataset.id;
    const conversation = this.data.conversations.find(c => c.id === conversationId);
    if (!conversation) return;
    this.setData({
      currentConversationId: conversationId,
      messages: conversation.messages,
      showMenu: false,
      showHistoryInMenu: false,
      isLoading: false,
      scrollTop: 9999
    }, () => {
      this.scrollToBottom();
    });
  },

  // 删除指定会话（长按触发）
  deleteConversation(conversationId) {
    const conversation = this.data.conversations.find(c => c.id === conversationId);
    if (!conversation) return;

    wx.showModal({
      title: '删除对话',
      content: `确定要删除"${conversation.title}"吗？此操作不可恢复。`,
      confirmText: '删除',
      confirmColor: '#ff3b30',
      success: (res) => {
        if (res.confirm) {
          let conversations = this.data.conversations.filter(c => c.id !== conversationId);
          let newCurrentId = this.data.currentConversationId;
          let newMessages = this.data.messages;

          if (conversationId === this.data.currentConversationId) {
            if (conversations.length === 0) {
              const newConvId = this.generateConversationId();
              conversations = [{
                id: newConvId,
                title: '新对话',
                messages: this.getGreetingMessage(),
                createdAt: Date.now()
              }];
              newCurrentId = newConvId;
              newMessages = conversations[0].messages;
            } else {
              newCurrentId = conversations[0].id;
              newMessages = conversations[0].messages;
            }
          }

          this.setData({
            conversations: conversations,
            currentConversationId: newCurrentId,
            messages: newMessages,
            scrollTop: 0
          }, () => {
            this.saveConversationsToStorage();
            wx.showToast({ title: '已删除', icon: 'success', duration: 1500 });
          });
        }
      }
    });
  },

  // 长按历史会话项触发删除
  onConversationLongPress(e) {
    const conversationId = e.currentTarget.dataset.id;
    this.deleteConversation(conversationId);
  },

  // 删除当前活跃会话
  deleteCurrentConversation() {
    if (this.data.conversations.length === 0) return;
    this.deleteConversation(this.data.currentConversationId);
  },

  // 将所有会话保存到本地存储
  saveConversationsToStorage() {
    try {
      const conversations = this.data.conversations.map(c => ({
        id: c.id,
        title: c.title,
        messages: c.messages,
        createdAt: c.createdAt
      }));
      wx.setStorageSync('ai_conversations', conversations);
      wx.setStorageSync('ai_current_conversation', this.data.currentConversationId);
    } catch (e) {
      console.error('保存会话失败:', e);
    }
  },

  // 从本地存储恢复上次的会话
  loadConversationsFromStorage() {
    try {
      const conversations = wx.getStorageSync('ai_conversations') || [];
      const currentId = wx.getStorageSync('ai_current_conversation') || '';

      if (conversations.length === 0) {
        this.createNewConversation();
        return;
      }

      const currentConversation = conversations.find(c => c.id === currentId) || conversations[0];
      this.setData({
        conversations: conversations,
        currentConversationId: currentConversation.id,
        messages: currentConversation.messages || this.getGreetingMessage()
      });
    } catch (e) {
      console.error('加载会话失败:', e);
      this.createNewConversation();
    }
  },

  // 更新当前会话消息，并同步到 conversations 数组、自动更新标题、保存存储
  updateCurrentMessages(messages) {
    const conversations = this.data.conversations.map(c => {
      if (c.id === this.data.currentConversationId) {
        let title = c.title;
        if (title === '新对话' && messages.length >= 2) {
          const firstUserMsg = messages.find(m => m.role === 'user');
          if (firstUserMsg) {
            title = firstUserMsg.content.substring(0, 15) + (firstUserMsg.content.length > 15 ? '...' : '');
          }
        }
        return { ...c, messages: messages, title: title };
      }
      return c;
    });

    this.setData({
      conversations: conversations,
      messages: messages
    }, () => {
      this.saveConversationsToStorage();
    });
  },

  onLoad() {
    console.log('AI智能助手页面加载');
    if (!app.globalData.isLogin) {
      wx.showToast({ title: '请先登录', icon: 'none', mask: true });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }
    const userInfo = app.globalData.userInfo || {};
    this.setData({
      userAvatarText: (userInfo.real_name || userInfo.name || '用').charAt(0).toUpperCase(),
      scrollTop: 0,
      lastScrollTop: 0
    });
    this.loadConversationsFromStorage();
    this.getNetworkType();
    this.loadUserFeedbackList();
    this.initRecorder();
    this.checkRecordPermission();
  },

  onShow() {
    this.loadUserFeedbackList();
    this.checkRecordPermission();
    if (this.data.lastScrollTop > 0) {
      this.setData({ scrollTop: this.data.lastScrollTop });
    }
    this.getNetworkType();
  },

  onUnload() {
    if (this.data.recordingTimer) clearInterval(this.data.recordingTimer);
    if (this.data.isRecording) recorderManager.stop();
    if (this.data.isPlaying && this.data.innerAudioContext) {
      this.data.innerAudioContext.stop();
      this.data.innerAudioContext.destroy();
    }
    this.setData({ isLoading: false, showMenu: false, isRecording: false, showHistoryInMenu: false, showSearch: false });
  },

  // 打开/关闭左侧菜单
  toggleMenu() {
    this.setData({ 
      showMenu: !this.data.showMenu,
      showHistoryInMenu: false
    });
  },

  // 新建对话（菜单入口）
  newChat() {
    this.createNewConversation();
  },

  // 查看历史会话列表
  viewHistory() {
    this.setData({ 
      showMenu: true,
      showHistoryInMenu: true
    });
  },

  // 从历史列表返回菜单
  backToMenu() {
    this.setData({ showHistoryInMenu: false });
  },

  // 打开搜索面板
  openSearch() {
    this.setData({ showMenu: false, showSearch: true, searchKeyword: '', searchResults: [] });
  },

  // 清除当前对话（菜单入口）
  clearHistory() {
    this.deleteCurrentConversation();
  },

  // 关闭搜索面板
  closeSearch() {
    this.setData({ showSearch: false, searchKeyword: '', searchResults: [] });
  },

  // 搜索输入防抖（300ms）
  onSearchInput(e) {
    const keyword = e.detail.value.trim();
    this.setData({ searchKeyword: keyword });
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.performSearch(keyword);
    }, 300);
  },

  // 在当前会话消息中搜索关键词
  performSearch(keyword) {
    if (!keyword) {
      this.setData({ searchResults: [] });
      return;
    }
    const results = [];
    const lowerKeyword = keyword.toLowerCase();
    this.data.messages.forEach((msg, index) => {
      if (msg.content && msg.content.toLowerCase().includes(lowerKeyword)) {
        const start = Math.max(0, msg.content.indexOf(keyword) - 20);
        const end = Math.min(msg.content.length, start + 80);
        let snippet = (start > 0 ? '...' : '') + msg.content.substring(start, end) + (end < msg.content.length ? '...' : '');
        results.push({
          index: index,
          role: msg.role,
          time: this.formatTime(msg.time),
          snippet: snippet
        });
      }
    });
    this.setData({ searchResults: results });
  },

  // 点击搜索结果跳转到对应消息位置
  goToSearchResult(e) {
    const index = e.currentTarget.dataset.index;
    this.closeSearch();
    const msgId = `msg-${index}`;
    this.setData({ scrollToView: msgId }, () => {
      setTimeout(() => this.setData({ scrollToView: '' }), 300);
    });
  },

  // 获取当前网络类型
  getNetworkType() {
    wx.getNetworkType({
      success: (res) => {
        this.setData({ networkType: res.networkType });
      }
    });
  },

  // 检查并请求录音权限
  checkRecordPermission() {
    return new Promise((resolve) => {
      wx.getSetting({
        success: (res) => {
          if (!res.authSetting['scope.record']) {
            wx.authorize({
              scope: 'scope.record',
              success: () => {
                this.setData({ hasRecordPermission: true });
                resolve(true);
              },
              fail: () => {
                this.setData({ hasRecordPermission: false });
                wx.showModal({
                  title: '提示',
                  content: '需要录音权限才能使用语音输入功能',
                  confirmText: '去设置',
                  success: (modalRes) => {
                    if (modalRes.confirm) {
                      wx.openSetting();
                    }
                  }
                });
                resolve(false);
              }
            });
          } else {
            this.setData({ hasRecordPermission: true });
            resolve(true);
          }
        },
        fail: () => {
          resolve(false);
        }
      });
    });
  },

  // 初始化录音管理器：绑定开始、停止、错误事件
  initRecorder() {
    recorderManager.onStart(() => {
      this.setData({ 
        isRecording: true,
        recordingTime: 0,
        formattedRecordingTime: '00:00',
        showVoiceInput: true,
        showRecognizeResult: false,
        recognizeError: ''
      });
      
      wx.showToast({ title: '录音中...', icon: 'none', duration: 60000 });
      
      if (this.data.recordingTimer) clearInterval(this.data.recordingTimer);
      
      const timer = setInterval(() => {
        const newTime = this.data.recordingTime + 1;
        this.setData({ recordingTime: newTime });
        const minutes = Math.floor(newTime / 60);
        const seconds = newTime % 60;
        this.setData({ formattedRecordingTime: `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}` });
        if (newTime >= 60) this.stopRecording();
      }, 1000);
      
      this.setData({ recordingTimer: timer });
    });

    recorderManager.onStop((res) => {
      wx.hideToast();
      if (this.data.recordingTimer) {
        clearInterval(this.data.recordingTimer);
        this.setData({ recordingTimer: null });
      }
      if (res.duration < 1000) {
        wx.showToast({ title: '录音时间太短', icon: 'none' });
        this.setData({ isRecording: false, showVoiceInput: false });
        return;
      }
      this.setData({ isRecording: false, tempVoicePath: res.tempFilePath });
      this.realtimeRecognize(res.tempFilePath);
    });

    recorderManager.onError((res) => {
      wx.hideToast();
      wx.showToast({ title: '录音失败，请重试', icon: 'none' });
      if (this.data.recordingTimer) clearInterval(this.data.recordingTimer);
      this.setData({ isRecording: false, showVoiceInput: false });
    });
  },

  // 上传录音到后端 Whisper 进行识别
  realtimeRecognize(filePath) {
    this.setData({ recognizing: true, recognizeError: '' });
    wx.showLoading({ title: '语音识别中...' });
    const token = wx.getStorageSync('token') || app.globalData.token;
    if (!token) {
      wx.hideLoading();
      this.setData({ recognizeError: '登录已过期，请重新登录', recognizing: false });
      wx.showToast({ title: '请重新登录', icon: 'none' });
      setTimeout(() => wx.navigateTo({ url: '/pages/login/login' }), 1500);
      return;
    }
    
    wx.uploadFile({
      url: `${app.globalData.baseUrl || 'http://localhost:5000'}/api/voice/recognize`,
      filePath: filePath,
      name: 'voice',
      formData: { language: 'auto', model_size: 'small' },
      header: { 'Authorization': `Bearer ${token}` },
      success: (res) => {
        wx.hideLoading();
        if (res.statusCode === 401) {
          this.setData({ recognizeError: '登录已过期，请重新登录', recognizing: false });
          wx.showToast({ title: '请重新登录', icon: 'none' });
          setTimeout(() => wx.navigateTo({ url: '/pages/login/login' }), 1500);
          return;
        }
        if (res.statusCode !== 200) {
          let errorMsg = `服务器错误 (${res.statusCode})`;
          try { const errorData = JSON.parse(res.data); errorMsg = errorData.message || errorMsg; } catch (e) {}
          this.setData({ recognizeError: errorMsg, recognizing: false });
          wx.showToast({ title: errorMsg, icon: 'none' });
          return;
        }
        try {
          const data = JSON.parse(res.data);
          if (data.code === 200) {
            const recognizeText = data.data.text || '';
            if (recognizeText && recognizeText.trim().length > 0) {
              this.setData({ inputMessage: recognizeText, showVoiceInput: false, recognizing: false, tempVoicePath: '' });
              wx.showToast({ title: '识别成功', icon: 'success', duration: 1500 });
            } else {
              this.setData({ recognizeError: '未能识别出有效内容，请重试', recognizing: false });
              wx.showToast({ title: '未能识别出内容', icon: 'none' });
            }
          } else {
            this.setData({ recognizeError: data.message || '识别失败', recognizing: false });
            wx.showToast({ title: data.message || '识别失败', icon: 'none' });
          }
        } catch (e) {
          this.setData({ recognizeError: '解析响应失败', recognizing: false });
          wx.showToast({ title: '识别失败', icon: 'none' });
        }
      },
      fail: (err) => {
        wx.hideLoading();
        let errorMsg = '网络错误';
        if (err.errMsg) {
          if (err.errMsg.includes('timeout')) errorMsg = '连接超时';
          else if (err.errMsg.includes('fail')) errorMsg = '连接失败';
          else errorMsg = err.errMsg;
        }
        this.setData({ recognizeError: `网络错误: ${errorMsg}`, recognizing: false });
        wx.showToast({ title: errorMsg, icon: 'none' });
      }
    });
  },

  // 开始录音（先检查权限）
  async startRecording() {
    if (this.data.isRecording) return;
    const hasPermission = await this.checkRecordPermission();
    if (!hasPermission) return;
    wx.showToast({ title: '请说出完整的句子', icon: 'none', duration: 2000 });
    const options = {
      duration: 60000,
      sampleRate: 16000,
      numberOfChannels: 1,
      encodeBitRate: 48000,
      format: 'mp3',
      frameSize: 50
    };
    try { recorderManager.start(options); } catch (e) { wx.showToast({ title: '启动录音失败', icon: 'none' }); }
  },

  // 停止录音
  stopRecording() {
    if (!this.data.isRecording) return;
    try { recorderManager.stop(); } catch (e) { console.error('停止录音失败:', e); }
  },

  // 取消录音面板
  cancelRecording() {
    if (this.data.isRecording) {
      try { recorderManager.stop(); } catch (e) {}
    }
    if (this.data.recordingTimer) clearInterval(this.data.recordingTimer);
    wx.hideToast();
    this.setData({ isRecording: false, showVoiceInput: false, recordingTime: 0, formattedRecordingTime: '00:00', tempVoicePath: '', recognizeError: '' });
  },

  // 切换语音输入面板显隐
  toggleVoiceInput() {
    if (this.data.showVoiceInput) { this.cancelRecording(); } else { this.setData({ showVoiceInput: true }); }
  },

  // 输入框内容变化
  onInputChange(e) { this.setData({ inputMessage: e.detail.value }); },

  // 试听录音文件
  playVoice() {
    if (!this.data.tempVoicePath) return;
    if (this.data.isPlaying) {
      if (this.data.innerAudioContext) { this.data.innerAudioContext.stop(); this.data.innerAudioContext.destroy(); this.setData({ innerAudioContext: null }); }
      this.setData({ isPlaying: false, playPercent: 0, playPercentStyle: 'width: 0%;' });
      return;
    }
    const innerAudioContext = wx.createInnerAudioContext();
    this.setData({ innerAudioContext });
    innerAudioContext.src = this.data.tempVoicePath;
    innerAudioContext.play();
    this.setData({ isPlaying: true });
    innerAudioContext.onTimeUpdate(() => {
      const percent = (innerAudioContext.currentTime / innerAudioContext.duration) * 100;
      this.setData({ playPercent: percent, playPercentStyle: `width: ${percent}%;` });
    });
    innerAudioContext.onEnded(() => {
      this.setData({ isPlaying: false, playPercent: 0, playPercentStyle: 'width: 0%;' });
      innerAudioContext.destroy(); this.setData({ innerAudioContext: null });
    });
    innerAudioContext.onError(() => {
      this.setData({ isPlaying: false, playPercent: 0, playPercentStyle: 'width: 0%;' });
      innerAudioContext.destroy(); this.setData({ innerAudioContext: null });
      wx.showToast({ title: '播放失败', icon: 'none' });
    });
  },

  // 重试语音识别
  retryRecognize() {
    if (this.data.tempVoicePath) {
      this.realtimeRecognize(this.data.tempVoicePath);
    }
  },

  // 关闭识别结果展示
  cancelRecognizeResult() {
    this.setData({ showRecognizeResult: false, recognizeError: '' });
  },

  // 发送消息核心函数
  sendMessage() {
    const { inputMessage, isLoading } = this.data;
    const trimmedMessage = inputMessage ? inputMessage.trim() : '';
    if (!trimmedMessage) { wx.showToast({ title: '请输入内容', icon: 'none' }); return; }
    if (isLoading) return;
    const userMessage = { role: 'user', content: trimmedMessage, time: Date.now() };
    const newMessages = [...this.data.messages, userMessage];
    this.setData({ inputMessage: '', isLoading: true }, () => {
      this.updateCurrentMessages(newMessages);
      this.scrollToBottom();
      this.processUserMessage(trimmedMessage);
    });
  },

  // 根据用户消息内容判断意图并分发处理
  processUserMessage(content) {
    if (this.isQueryFeedbackList(content)) { this.handleQueryFeedbackList(); return; }
    if (this.isQueryFeedbackProgress(content)) { this.handleQueryFeedbackProgress(content); return; }
    this.callAIService(content);
  },

  // 关键词匹配：是否查询反馈列表
  isQueryFeedbackList(content) {
    const keywords = ['反馈记录', '我的反馈', '反馈列表', '我提交的', '查询反馈', '查看反馈', '反馈历史', '我的记录'];
    return keywords.some(keyword => content.includes(keyword));
  },

  // 关键词匹配：是否查询反馈进度
  isQueryFeedbackProgress(content) {
    const keywords = ['进度', '处理到哪', '怎么样了', '状态', '处理结果', '完成没有', '办结', '结果'];
    return keywords.some(keyword => content.includes(keyword));
  },

  // 调用后端 AI 对话接口 /api/ai/chat（魔搭 Qwen 模型）
  callAIService(content) {
    const token = wx.getStorageSync('token') || app.globalData.token;
    const baseUrl = app.globalData.baseUrl || 'http://localhost:5000';
    wx.request({
      url: `${baseUrl}/api/ai/chat`,
      method: 'POST',
      header: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      data: { question: content },
      success: (res) => {
        let aiAnswer = '抱歉，我没有理解您的问题。';
        if (res.statusCode === 200) {
          if (res.data && res.data.code === 200) aiAnswer = res.data.data?.answer || res.data.data || aiAnswer;
          else if (res.data && res.data.answer) aiAnswer = res.data.answer;
          else if (typeof res.data === 'string') aiAnswer = res.data;
        } else aiAnswer = `服务器响应错误 (${res.statusCode})`;
        const parsedContent = this.parseTextWithLinks(aiAnswer);
        const aiMessage = { role: 'ai', content: aiAnswer, parsedContent, time: Date.now() };
        const newMessages = [...this.data.messages, aiMessage];
        this.updateCurrentMessages(newMessages);
        this.setData({ isLoading: false }, () => this.scrollToBottom());
      },
      fail: () => {
        const aiMessage = { role: 'ai', content: '❌ 网络连接失败，请检查网络后重试。', time: Date.now() };
        const newMessages = [...this.data.messages, aiMessage];
        this.updateCurrentMessages(newMessages);
        this.setData({ isLoading: false }, () => this.scrollToBottom());
      }
    });
  },

  // 查询反馈记录列表（调用 /api/feedback/list）
  handleQueryFeedbackList() {
    const token = wx.getStorageSync('token') || app.globalData.token;
    const baseUrl = app.globalData.baseUrl || 'http://localhost:5000';
    wx.request({
      url: `${baseUrl}/api/feedback/list`,
      method: 'GET',
      header: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { page: 1, per_page: 50 },
      success: (res) => {
        if (res.data && res.data.code === 200) {
          const feedbacks = res.data.data?.feedbacks || [];
          this.setData({ feedbackList: feedbacks });
          if (!feedbacks || feedbacks.length === 0) {
            const aiMessage = { role: 'ai', content: '您目前还没有提交过反馈记录。', time: Date.now() };
            const newMessages = [...this.data.messages, aiMessage];
            this.updateCurrentMessages(newMessages);
            this.setData({ isLoading: false }, () => this.scrollToBottom());
            return;
          }
          let response = '📋 您的反馈记录如下：\n\n';
          feedbacks.slice(0, 5).forEach((item, index) => {
            const statusIcon = item.status === 'processing' ? '🔄' : (item.status === 'completed' ? '✅' : (item.status === 'pending_ai' ? '🤖' : '⏳'));
            let statusText = item.status_display || item.status || '待处理';
            if (statusText === 'pending_manual') statusText = '待分类';
            if (statusText === 'pending_ai') statusText = 'AI处理中';
            if (statusText === 'processing') statusText = '处理中';
            if (statusText === 'completed') statusText = '已完成';
            const time = item.created_at ? new Date(item.created_at + 'Z').toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '未知时间';
            response += `${index + 1}. ${statusIcon} ${item.title || '无标题'}\n   状态：${statusText}  |  ${time}\n`;
            if (item.dept_name) response += `   部门：${item.dept_name}\n`;
            response += '\n';
          });
          if (feedbacks.length > 5) response += `... 还有 ${feedbacks.length - 5} 条记录\n\n`;
          response += '您可以点击下方按钮查看具体反馈详情。';
          const aiMessage = { role: 'ai', content: response, parsedContent: this.parseTextWithLinks(response), time: Date.now(), isFeedbackList: true };
          const newMessages = [...this.data.messages, aiMessage];
          this.updateCurrentMessages(newMessages);
          this.setData({ isLoading: false }, () => this.scrollToBottom());
        } else {
          this.callAIService('查询我的反馈');
        }
      },
      fail: () => this.callAIService('查询我的反馈')
    });
  },

  // 查询反馈进度：先确保 feedbackList 已加载，再匹配具体反馈
  handleQueryFeedbackProgress(content) {
    const { feedbackList } = this.data;
    if (!feedbackList || feedbackList.length === 0) {
      const token = wx.getStorageSync('token') || app.globalData.token;
      const baseUrl = app.globalData.baseUrl || 'http://localhost:5000';
      wx.request({
        url: `${baseUrl}/api/feedback/list`,
        method: 'GET',
        header: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        data: { page: 1, per_page: 50 },
        success: (res) => {
          if (res.data && res.data.code === 200) {
            const feedbacks = res.data.data?.feedbacks || [];
            this.setData({ feedbackList: feedbacks });
            this.continueQueryProgress(content, feedbacks);
          } else { this.callAIService(content); }
        },
        fail: () => this.callAIService(content)
      });
    } else {
      this.continueQueryProgress(content, this.data.feedbackList);
    }
  },

  // 匹配反馈（ID 或标题），调用详情接口后格式化回复
  continueQueryProgress(content, feedbackList) {
    if (!feedbackList || feedbackList.length === 0) {
      const aiMessage = { role: 'ai', content: '您目前还没有提交过反馈记录，无法查询进度。', time: Date.now() };
      const newMessages = [...this.data.messages, aiMessage];
      this.updateCurrentMessages(newMessages);
      this.setData({ isLoading: false }, () => this.scrollToBottom());
      return;
    }
    let matchedFeedback = null;
    const idMatch = content.match(/ID[：:]\s*(\d+)/i);
    if (idMatch) matchedFeedback = feedbackList.find(fb => fb.id === parseInt(idMatch[1]));
    if (!matchedFeedback) {
      for (const fb of feedbackList) { if (fb.title && content.includes(fb.title)) { matchedFeedback = fb; break; } }
    }
    if (!matchedFeedback) matchedFeedback = feedbackList[0];
    if (!matchedFeedback) {
      const aiMessage = { role: 'ai', content: '未找到相关的反馈记录，请确认您要查询的反馈。', time: Date.now() };
      const newMessages = [...this.data.messages, aiMessage];
      this.updateCurrentMessages(newMessages);
      this.setData({ isLoading: false }, () => this.scrollToBottom());
      return;
    }
    const token = wx.getStorageSync('token') || app.globalData.token;
    const baseUrl = app.globalData.baseUrl || 'http://localhost:5000';
    wx.request({
      url: `${baseUrl}/api/feedback/detail/${matchedFeedback.id}`,
      method: 'GET',
      header: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      success: (res) => {
        if (res.data && res.data.code === 200) { this.formatFeedbackProgress(res.data.data); }
        else { this.formatFeedbackProgress(matchedFeedback); }
      },
      fail: () => this.formatFeedbackProgress(matchedFeedback)
    });
  },

  // 将反馈详情格式化为结构化展示文本
  formatFeedbackProgress(feedback) {
    const statusMap = {
      'pending_ai': { text: 'AI处理中', icon: '🤖' },
      'pending_manual': { text: '待人工分类', icon: '⏳' },
      'processing': { text: '处理中', icon: '🔄' },
      'completed': { text: '已完成', icon: '✅' },
      'rejected': { text: '已驳回', icon: '❌' }
    };
    const status = statusMap[feedback.status] || { text: feedback.status_display || '未知', icon: '❓' };
    let response = `📌 您查询的反馈进度如下：\n\n**${feedback.title}**\n\n${status.icon} 当前状态：${status.text}\n🕒 提交时间：${feedback.created_at ? new Date(feedback.created_at + 'Z').toLocaleString('zh-CN') : '未知'}\n`;
    if (feedback.dept_name) response += `🏢 处理部门：${feedback.dept_name}\n`;
    if (feedback.ai_confidence) response += `🤖 AI匹配度：${Math.round(feedback.ai_confidence * 100)}%\n`;
    if (feedback.aiTags && feedback.aiTags.length > 0) response += `🏷️ 关键词：${feedback.aiTags.join('、')}\n`;
    response += `\n📝 反馈内容：\n${feedback.content || '无内容'}\n`;
    if (feedback.processed_at) response += `\n⏱️ 处理时间：${new Date(feedback.processed_at + 'Z').toLocaleString('zh-CN')}\n`;
    if (feedback.reject_reason) response += `\n❌ 驳回原因：${feedback.reject_reason}\n`;
    response += `\n点击下方按钮可查看详情。`;
    const aiMessage = { role: 'ai', content: response, parsedContent: this.parseTextWithLinks(response), time: Date.now(), isFeedbackDetail: true, feedbackId: feedback.id };
    const newMessages = [...this.data.messages, aiMessage];
    this.updateCurrentMessages(newMessages);
    this.setData({ isLoading: false }, () => this.scrollToBottom());
  },

  // 预加载用户反馈列表，用于智能查询
  loadUserFeedbackList() {
    const token = wx.getStorageSync('token') || app.globalData.token;
    wx.request({
      url: `${app.globalData.baseUrl || 'http://localhost:5000'}/api/feedback/list`,
      method: 'GET',
      header: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { page: 1, per_page: 50 },
      success: (res) => {
        if (res.data && res.data.code === 200) { this.setData({ feedbackList: res.data.data?.feedbacks || [] }); }
      },
      fail: () => { this.setData({ feedbackList: wx.getStorageSync('localFeedback') || [] }); }
    });
  },

  // 点击快捷问题自动填入并发送
  sendQuickQuestion(e) {
    const question = e.currentTarget.dataset.question;
    this.setData({ inputMessage: question }, () => { this.sendMessage(); });
  },

  // 跳转到反馈列表页
  goToFeedbackList() {
    wx.switchTab({ url: '/pages/feedback/list/list', fail: () => wx.navigateTo({ url: '/pages/feedback/list/list' }) });
  },

  // 从消息内点击查看反馈详情
  goToFeedbackDetail(e) {
    const feedbackId = e.currentTarget.dataset.id;
    if (!feedbackId) { wx.showToast({ title: '无法获取反馈ID', icon: 'none' }); return; }
    wx.navigateTo({ url: `/pages/feedback/detail/detail?id=${feedbackId}`, fail: () => wx.showToast({ title: '详情页跳转失败', icon: 'none' }) });
  },

  // 格式化时间为 HH:mm
  formatTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  },

  // 解析文本中的链接，拆分为纯文本和链接段落
  parseTextWithLinks(text) {
    if (!text) return [{ type: 'text', content: text || '' }];
    const urlRegex = /(https?:\/\/[^\s\u4e00-\u9fa5，。！？；、")》]+)/g;
    const parts = [];
    let lastIndex = 0;
    let match;
    while ((match = urlRegex.exec(text)) !== null) {
      if (match.index > lastIndex) parts.push({ type: 'text', content: text.substring(lastIndex, match.index) });
      const url = match[0];
      parts.push({ type: 'link', content: url, url: url });
      lastIndex = match.index + url.length;
    }
    if (lastIndex < text.length) parts.push({ type: 'text', content: text.substring(lastIndex) });
    return parts;
  },

  // 点击消息中的链接
  handleLinkTap(e) {
    const url = e.currentTarget?.dataset?.url;
    if (!url) { wx.showToast({ title: '无法识别链接', icon: 'none' }); return; }
    this.setData({ lastScrollTop: this.data.scrollTop });
    if (url.startsWith('http://') || url.startsWith('https://')) {
      wx.navigateTo({ url: `/pages/webview/webview?url=${encodeURIComponent(url)}`, fail: () => wx.setClipboardData({ data: url, success: () => wx.showToast({ title: '链接已复制', icon: 'success' }) }) });
    } else {
      wx.setClipboardData({ data: url, success: () => wx.showToast({ title: '链接已复制', icon: 'success' }) });
    }
  },

  // 滚动到消息列表底部
  scrollToBottom() {
    setTimeout(() => {
      wx.createSelectorQuery().select('#messageList').boundingClientRect().selectViewport().scrollOffset().exec((res) => {
        if (res[0] && res[1]) {
          const scrollHeight = res[0].height;
          const windowHeight = res[1].scrollHeight;
          this.setData({
            scrollTop: scrollHeight + 9999,
            showScrollBtn: scrollHeight > windowHeight + 100
          });
        }
      });
    }, 100);
  },

  // 监听消息列表滚动，控制「返回底部」按钮显隐
  onScroll(e) {
    const { scrollTop, scrollHeight, windowHeight } = e.detail;
    const isNearBottom = scrollHeight - scrollTop - windowHeight < 100;
    this.setData({ showScrollBtn: !isNearBottom && scrollHeight > windowHeight });
    this.data.lastScrollTop = scrollTop;
  },

  // 长按复制消息内容
  copyMessage(e) {
    const content = e.currentTarget.dataset.content;
    wx.setClipboardData({ data: content, success: () => wx.showToast({ title: '已复制', icon: 'success', duration: 1500 }) });
  },

  // 分享配置
  onShareAppMessage() {
    return { title: 'AI智能助手', path: '/pages/ai/ai', imageUrl: '/images/share-ai.png' };
  }
});