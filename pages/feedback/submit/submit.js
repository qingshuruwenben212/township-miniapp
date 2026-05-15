// pages/feedback/submit/submit.js
// 反馈提交页面：支持文字、图片、语音三种输入方式
// 核心流程：
//   1. 语音输入 → Whisper 语音识别（/api/voice/recognize，使用微调后的 small 模型）
//   2. 文本输入或语音转写文本 → 自动调用 AI 分类接口（/api/ai/classify）
//   3. 用户确认或修改 AI 推荐的部门 → 最终提交调用 /api/feedback/submit
// 亮点：
//   - 语音识别自动触发 AI 分类推荐，降低村民使用门槛
//   - 粤语/普通话统一使用微调后的 small 模型，识别率高
//   - 提交前本地保存备份，防止网络问题丢失数据

const app = getApp();
const Storage = require('../../../utils/storage.js');
const dateFormat = require('../../../utils/dateFormat.js');

// 后端部门分类常量，与数据库中的 category 字段值保持一致
const DEPARTMENTS = {
  AGRICULTURE: 'agriculture',
  INFRASTRUCTURE: 'infrastructure',
  ENVIRONMENT: 'environment',
  MEDICAL: 'health',
  CIVIL_AFFAIRS: 'civil',
  GENERAL: 'general'
};

// 部门 ID 到中文名称的映射，供页面展示使用
const DEPARTMENT_NAMES = {
  [DEPARTMENTS.AGRICULTURE]: '农业服务部',
  [DEPARTMENTS.INFRASTRUCTURE]: '基建维修部',
  [DEPARTMENTS.ENVIRONMENT]: '环境整治部',
  [DEPARTMENTS.MEDICAL]: '医疗卫生部',
  [DEPARTMENTS.CIVIL_AFFAIRS]: '民政服务部',
  [DEPARTMENTS.GENERAL]: '综合服务部'
};

Page({
  data: {
    region: '',              // 用户所在区域（乡镇+村），通过手动选择获取
    feedbackTypes: [         // 反馈类型列表，每个类型关联到对应部门 ID，并配置 AI 关键词
      { id: 1, name: '农业服务', deptId: DEPARTMENTS.AGRICULTURE, aiTag: ["农业补贴", "农技指导", "种植养殖", "农田", "庄稼", "收成"] },
      { id: 2, name: '基建维修', deptId: DEPARTMENTS.INFRASTRUCTURE, aiTag: ["道路", "路灯", "水利", "房屋维修", "破损", "维修", "施工"] },
      { id: 3, name: '民政咨询', deptId: DEPARTMENTS.CIVIL_AFFAIRS, aiTag: ["低保", "补贴", "救助", "婚姻", "户口", "证明", "申请"] },
      { id: 4, name: '医疗卫生', deptId: DEPARTMENTS.MEDICAL, aiTag: ["医保", "疫苗", "医疗", "健康", "医院", "看病", "药品"] },
      { id: 5, name: '环境整治', deptId: DEPARTMENTS.ENVIRONMENT, aiTag: ["垃圾", "污水", "绿化", "卫生", "污染", "清洁", "脏乱"] },
      { id: 6, name: '其他问题', deptId: DEPARTMENTS.GENERAL, aiTag: ["其他", "建议", "投诉", "咨询"] }
    ],
    selectedType: null,          // 用户手动选择的反馈类型 id
    selectedDeptId: null,        // 对应的部门 ID
    aiRecommendType: '',         // AI 推荐展示文本
    aiRecommendDept: null,       // AI 推荐的部门 ID
    aiConfidence: 0,             // AI 推荐置信度
    aiMatchedKeywords: [],       // AI 匹配到的关键词列表
    title: '',                   // 反馈标题
    content: '',                 // 反馈正文
    imageList: [],               // 待上传的图片本地临时路径列表
    voiceInfo: {                 // 语音信息对象，记录上传、识别、播放等状态
      url: '',                   // 服务器返回的音频文件 URL
      text: '',                  // 语音转写后的文字
      localPath: '',             // 本地临时文件路径（用于播放）
      duration: 0,               // 录音时长（秒）
      status: 'none',            // 语音状态：none / uploading / recognizing / completed / failed
      needConfirm: false,        // 是否需要用户二次确认（预留）
      uploadTime: 0              // 上传时间戳
    },
    isRecording: false,          // 是否正在录音
    isSubmitting: false,         // 是否正在提交表单（防重复提交）
    isAnalyzing: false,          // 是否正在执行 AI 分析
    recordManager: null,         // 录音管理器实例
    isLogin: false,              // 当前是否已登录
    
    // 语音录制相关字段
    recordingTime: 0,            // 已录制秒数
    formattedRecordingTime: '00:00', // 格式化的时间显示
    recordingTimer: null,        // 录音计时器 id
    hasRecordPermission: true,   // 是否有录音权限
    recognizing: false,          // 是否正在进行语音识别
    recognizeResult: '',         // 识别结果文本（暂存）
    showRecognizeResult: false,  // 是否显示识别结果弹层
    recognizeError: '',          // 识别失败的错误信息
    detectLanguage: '',          // 检测到的语言类型（普通话/粤语）
    
    // 语音播放相关字段
    isPlaying: false,            // 是否正在播放录音
    playPercent: 0,              // 播放进度百分比
    playPercentStyle: 'width: 0%;', // 进度条样式字符串
    
    // 提交状态锁，防止识别结果覆盖已提交的表单
    hasSubmitted: false
  },

  onLoad() {
    console.log('反馈提交页面加载');
    this.checkLoginStatus();   // 检查登录状态，未登录弹引导
    this.setData({ recordManager: wx.getRecorderManager() });// 获取全局录音管理器
    this.initRecordListener(); // 绑定录音事件
    // 从缓存加载区域（用户之前手动选择过的）
    const cachedRegion = wx.getStorageSync('userRegion');
    if (cachedRegion) {
      this.setData({ region: cachedRegion });
    }
  },

  onShow() {
    this.refreshPageData();    // 每次显示时刷新登录状态和区域缓存
    console.log('当前区域:', this.data.region);
  },

  onUnload() {
    console.log('页面卸载，清理录音资源');
    // 离开页面时，清理所有定时器和音频资源
    const { recordManager, isRecording, recordingTimer } = this.data;
    
    if (isRecording) {
      try {
        recordManager.stop();
      } catch (e) {
        console.error('停止录音失败:', e);
      }
    }
    
    if (recordingTimer) {
      clearInterval(recordingTimer);
      this.setData({ recordingTimer: null });
    }
    
    if (this.innerAudioContext) {
      this.innerAudioContext.destroy();
      this.innerAudioContext = null;
    }
    
    this.setData({
      isSubmitting: false,
      isAnalyzing: false,
      isRecording: false
    });
  },

  // 检查登录状态，未登录时弹出强制登录对话框
  checkLoginStatus() {
    const token = app.globalData.token || wx.getStorageSync('token');
    const isLogin = !!token;
    this.setData({ isLogin: isLogin });
    
    if (!isLogin) {
      this.showLoginModal();
    }
  },

  // 刷新页面数据（登录状态和区域信息），通常在 onShow 中调用
  refreshPageData() {
    const token = app.globalData.token || wx.getStorageSync('token');
    const isLogin = !!token;
    
    // 获取用户信息
    const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo');
    
    this.setData({
      isLogin: isLogin,
      userInfo: userInfo || {}
    });
    
    // 刷新区域数据（仅从缓存加载）
    const cachedRegion = wx.getStorageSync('userRegion');
    if (cachedRegion) {
      this.setData({ region: cachedRegion });
    }
    
    console.log('页面数据已刷新, isLogin:', isLogin);
  },


  // 未登录提示弹窗，引导用户去“我的”页面登录
  showLoginModal() {
    wx.showModal({
      title: '提示',
      content: '请先登录后再提交反馈',
      confirmText: '去登录',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          wx.switchTab({
            url: '/pages/my/my'
          });
        } else {
          wx.navigateBack();
        }
      }
    });
  },

  // 初始化录音管理器的监听事件：开始录音、停止录音、录音错误
  initRecordListener() {
    const { recordManager } = this.data;
    
    // 录音开始回调：重置计时，显示录音界面
    recordManager.onStart(() => {
      console.log('录音开始');
      this.setData({ 
        isRecording: true,
        recordingTime: 0,
        formattedRecordingTime: '00:00',
        showVoiceInput: true,
        showRecognizeResult: false,
        recognizeError: ''
      });
      
      if (this.data.recordingTimer) {
        clearInterval(this.data.recordingTimer);
      }
      
      const timer = setInterval(() => {
        const newTime = this.data.recordingTime + 1;
        this.setData({ recordingTime: newTime });
        
        const minutes = Math.floor(newTime / 60);
        const seconds = newTime % 60;
        const formatted = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        this.setData({ formattedRecordingTime: formatted });
        
        if (newTime >= 60) {
          this.stopRecording(); // 最长录制 60 秒自动停止
        }
      }, 1000);
      
      this.setData({ recordingTimer: timer });
    });

    // 录音结束回调：检查时长，若有效则上传到后端进行识别
    recordManager.onStop((res) => {
      console.log('录音结束', res);
      wx.hideToast();
      
      if (this.data.recordingTimer) {
        clearInterval(this.data.recordingTimer);
        this.setData({ recordingTimer: null });
      }
      
      if (res.duration < 1000) {
        wx.showToast({
          title: '录音时间太短',
          icon: 'none'
        });
        this.setData({ 
          isRecording: false,
          showVoiceInput: false
        });
        return;
      }
      
      this.setData({ 
        isRecording: false,
        showVoiceInput: false,
        voiceInfo: {
          ...this.data.voiceInfo,
          localPath: res.tempFilePath,
          duration: Math.floor(res.duration / 1000),
          status: 'uploading'
        }
      });
      
      this.uploadVoice(res.tempFilePath); // 核心：调用语音识别接口
    });

    // 录音错误处理
    recordManager.onError((res) => {
      console.error('录音错误', res);
      wx.hideToast();
      wx.showToast({ title: '录音失败，请重试', icon: 'none' });
      
      if (this.data.recordingTimer) {
        clearInterval(this.data.recordingTimer);
        this.setData({ recordingTimer: null });
      }
      
      this.setData({ 
        isRecording: false,
        showVoiceInput: false
      });
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

  // 开始录音
  async startRecord() {
    if (this.data.isRecording) return;
    
    const hasPermission = await this.checkRecordPermission();
    if (!hasPermission) return;
    
    const options = {
      duration: 60000,          // 最长录制时长 60 秒
      sampleRate: 16000,        // 采样率 16k（Whisper 推荐）
      numberOfChannels: 1,      // 单声道
      encodeBitRate: 48000,     // 码率 48kbps
      format: 'm4a',            // 设置音频格式为m4a，兼容性好且文件较小
      frameSize: 50,            // 帧大小
      audioSource: 'auto'       // 自动选择音频源
    };
    
    console.log('录音参数:', options);
    
    try {
      this.data.recordManager.start(options);
    } catch (e) {
      console.error('启动录音失败:', e);
      wx.showToast({ title: '启动录音失败', icon: 'none' });
    }
  },

  stopRecording() {
    if (!this.data.isRecording) return;
    try {
      this.data.recordManager.stop();
    } catch (e) {
      console.error('停止录音失败:', e);
    }
  },

  // 取消录音（不保存）
  cancelRecording() {
    if (this.data.isRecording) {
      try {
        this.data.recordManager.stop();
      } catch (e) {
        console.error('取消录音失败:', e);
      }
    }
    
    if (this.data.recordingTimer) {
      clearInterval(this.data.recordingTimer);
      this.setData({ recordingTimer: null });
    }
    
    wx.hideToast();
    
    this.setData({ 
      isRecording: false,
      showVoiceInput: false,
      recordingTime: 0,
      formattedRecordingTime: '00:00',
      voiceInfo: {
        ...this.data.voiceInfo,
        status: 'none'
      }
    });
  },

  // 上传录音文件到后端 Whisper 识别接口
  uploadVoice(filePath) {
    // 打印完整URL用于调试
    const baseUrl = app.globalData.baseUrl || 'http://localhost:5000';
    const fullUrl = `${baseUrl}/api/voice/recognize`;
    console.log('完整请求URL:', fullUrl);
    
    this.setData({ 
      recognizing: true,
      recognizeError: '',
      voiceInfo: {
        ...this.data.voiceInfo,
        localPath: filePath,
        status: 'recognizing'
      }
    });
    
    wx.showLoading({ title: '语音识别中...' });
    
    const token = wx.getStorageSync('token') || app.globalData.token;
    
    if (!token) {
      wx.hideLoading();
      this.setData({
        recognizeError: '登录已过期，请重新登录',
        recognizing: false,
        voiceInfo: {
          ...this.data.voiceInfo,
          status: 'failed'
        }
      });
      wx.showToast({ title: '请重新登录', icon: 'none' });
      setTimeout(() => {
        wx.navigateTo({ url: '/pages/login/login' });
      }, 1500);
      return;
    }
    
    console.log('识别语音文件:', filePath);
    
    // 文件大小校验：太小则视为无效录音
    const fs = wx.getFileSystemManager();
    try {
      const fileInfo = fs.statSync(filePath);
      console.log('录音文件大小:', fileInfo.size, '字节');
      if (fileInfo.size < 2000) {
        wx.hideLoading();
        this.setData({
          recognizeError: '录音太短，请重试',
          recognizing: false,
          voiceInfo: {
            ...this.data.voiceInfo,
            status: 'failed'
          }
        });
        wx.showToast({ title: '录音太短', icon: 'none' });
        return;
      }
    } catch (e) {
      console.log('获取文件信息失败', e);
    }
    
    // 调用后端识别接口
    wx.uploadFile({
      url: `${baseUrl}/api/voice/recognize`,
      filePath: filePath,
      name: 'voice',
      formData: {
        language: 'auto',
        model_size: 'small' // 固定使用 small 模型（已微调）
      },
      header: {
        'Authorization': `Bearer ${token}`
      },
      success: (res) => {
        wx.hideLoading();
        
        console.log('识别响应状态码:', res.statusCode);
        console.log('识别响应数据:', res.data);

        // 处理可能的 HTML 错误页面
        if (res.data && res.data.trim().startsWith('<')) {
          console.error('服务器返回了HTML页面，可能接口不存在');
          this.setData({
            recognizeError: '服务器接口不存在，请检查后端',
            recognizing: false,
            voiceInfo: {
              ...this.data.voiceInfo,
              status: 'failed'
            }
          });
          wx.showToast({ title: '识别失败：接口不存在', icon: 'none' });
          return;
        }
        
        try {
          const data = JSON.parse(res.data);
          
          if (data.code === 200) {
            const recognizeText = data.data.text || '';
            const voiceUrl = data.data.voice_url || '';
            const detectedLanguage = data.data.language_display || '中文';
            
            console.log(`语音识别成功: ${recognizeText}`);
            console.log(`   检测到语种: ${detectedLanguage}`);
            
            // 如果未提交，将识别结果展示给用户，并自动触发 AI 分类
            if (!this.data.hasSubmitted) {
              const updatedVoiceInfo = {
                url: voiceUrl,
                text: recognizeText,
                localPath: filePath,
                duration: this.data.voiceInfo.duration,
                status: 'completed',
                uploadTime: Date.now(),
                detectLanguage: detectedLanguage
              };
              
              this.setData({ 
                voiceInfo: updatedVoiceInfo,
                recognizing: false,
                recognizeResult: recognizeText,
                showRecognizeResult: true,
                voiceInputText: recognizeText,
                detectLanguage: detectedLanguage
              }, () => {
                // 语音识别完成后，使用转写文本自动触发 AI 分类推荐
                if (recognizeText && recognizeText.length >= 5) {
                  this.doAIAnalysis(recognizeText); 
                }
              });
            } else {
              // 已提交，只更新后台数据，不更新界面
              console.log('反馈已提交，语音识别结果将在下次加载时显示');
              this.setData({ 
                recognizing: false,
                voiceInfo: {
                  ...this.data.voiceInfo,
                  url: voiceUrl,
                  text: recognizeText,
                  status: 'completed'
                }
              });
            }
            
            wx.showToast({ title: '语音识别完成', icon: 'success' });
            
          } else {
            this.setData({
              recognizeError: data.message || '识别失败',
              recognizing: false,
              voiceInfo: {
                ...this.data.voiceInfo,
                status: 'failed'
              }
            });
            wx.showToast({ title: data.message || '识别失败', icon: 'none' });
          }
        } catch (e) {
          console.error('解析响应失败', e);
          this.setData({
            recognizeError: '解析响应失败',
            recognizing: false,
            voiceInfo: {
              ...this.data.voiceInfo,
              status: 'failed'
            }
          });
          wx.showToast({ title: '识别失败', icon: 'none' });
        }
      },
      fail: (err) => {
        wx.hideLoading();
        console.error('识别请求失败', err);
        
        let errorMsg = '网络错误';
        if (err.errMsg) {
          if (err.errMsg.includes('timeout')) errorMsg = '连接超时';
          else errorMsg = err.errMsg;
        }
        
        this.setData({
          recognizeError: `网络错误: ${errorMsg}`,
          recognizing: false,
          voiceInfo: {
            ...this.data.voiceInfo,
            status: 'failed'
          }
        });
        wx.showToast({ title: errorMsg, icon: 'none' });
      }
    });
  },

  // 播放已录制的语音（优先播放本地文件，若不存在则尝试服务器 URL）
  handleRecordVoice() {
    const { isRecording, recordManager, voiceInfo, isSubmitting } = this.data;
    if (isSubmitting) return;
    
    if (isRecording) {
      console.log('手动停止录音');
      wx.showToast({
        title: '录音停止',
        icon: 'none',
        duration: 1000
      });
      try {
        recordManager.stop();
      } catch (e) {
        console.error('停止录音失败:', e);
      }
    } else {
      this.startRecord();
    }
  },

  // 播放已录制的语音
  handlePlayVoice() {
    const { voiceInfo, isPlaying } = this.data;

    // 优先使用本地路径，其次使用服务器 URL
    const playPath = voiceInfo.localPath || voiceInfo.url;
    if (!playPath) {
      wx.showToast({ title: '没有可播放的录音', icon: 'none' });
      return;
    }
    
    if (isPlaying) {
      // 如果正在播放，则暂停
      if (this.innerAudioContext) {
        this.innerAudioContext.stop();
      }
      this.setData({ 
        isPlaying: false, 
        playPercent: 0,
        playPercentStyle: 'width: 0%;'
      });
      return;
    }
    
    const innerAudioContext = wx.createInnerAudioContext();
    this.innerAudioContext = innerAudioContext;
    
    innerAudioContext.src = playPath;
    innerAudioContext.play();

    this.setData({ isPlaying: true });

    // 播放事件监听
    innerAudioContext.onPlay(() => {
      wx.showToast({ title: '语音播放中', icon: 'none', duration: 2000 });
    });
    
    innerAudioContext.onTimeUpdate(() => {
      const percent = (innerAudioContext.currentTime / innerAudioContext.duration) * 100;
      this.setData({ 
        playPercent: percent,
        playPercentStyle: `width: ${percent}%;`
      });
    });
    
    innerAudioContext.onEnded(() => {
      wx.showToast({ title: '播放完成', icon: 'none' });
      this.setData({ 
        isPlaying: false, 
        playPercent: 0,
        playPercentStyle: 'width: 0%;'
      });
      innerAudioContext.destroy();
      this.innerAudioContext = null;
    });
    
    innerAudioContext.onError((err) => {
      console.error('播放失败', err);
      wx.showToast({ title: '播放失败', icon: 'none' });
      this.setData({ 
        isPlaying: false, 
        playPercent: 0,
        playPercentStyle: 'width: 0%;'
      });
      innerAudioContext.destroy();
      this.innerAudioContext = null;
    });
  },

  // 删除录音及相关识别结果
  handleDeleteVoice() {
    const { isSubmitting } = this.data;
    if (isSubmitting) return;
    
    if (this.data.isPlaying && this.innerAudioContext) {
      this.innerAudioContext.stop();
      this.innerAudioContext.destroy();
      this.innerAudioContext = null;
    }
    
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这条录音吗？',
      success: (res) => {
        if (res.confirm) {
          this.setData({ 
            voiceInfo: {
              url: '',
              text: '',
              localPath: '',
              duration: 0,
              status: 'none',
              needConfirm: false,
              uploadTime: 0
            },
            isPlaying: false,
            playPercent: 0,
            playPercentStyle: 'width: 0%;',
            recognizeResult: '',
            showRecognizeResult: false,
            recognizing: false,
            recognizeError: ''
          });
          wx.showToast({ title: '已删除', icon: 'success' });
        }
      }
    });
  },

  // 重试语音识别
  retryRecognize() {
    if (this.data.voiceInfo.localPath) {
      this.uploadVoice(this.data.voiceInfo.localPath);
    }
  },

  // 手动选择区域（仅用预设数据，不使用定位）
  handleRegionSelect() {
    wx.showActionSheet({
      itemList: ['XX乡镇XX村', 'XX乡镇YY村', 'XX乡镇ZZ村', 'YY乡镇AA村', 'YY乡镇BB村'],
      success: (res) => {
        if (res.tapIndex !== -1) {
          const regions = ['XX乡镇XX村', 'XX乡镇YY村', 'XX乡镇ZZ村', 'YY乡镇AA村', 'YY乡镇BB村'];
          const selectedRegion = regions[res.tapIndex];
          console.log('用户选择区域:', selectedRegion);
          this.setData({ region: selectedRegion });
          Storage.set('userRegion', selectedRegion);
        }
      },
      fail: () => {
        wx.showToast({ title: '选择失败，请重试', icon: 'none' });
      }
    });
  },

  // 手动选择反馈类型
  // 选择后清除 AI 推荐，使用用户选择的分类
  handleTypeSelect(e) {
    const typeId = parseInt(e.currentTarget.dataset.typeid);
    const selectedType = this.data.feedbackTypes.find(t => t.id === typeId);
    
    this.setData({ 
      selectedType: typeId,
      selectedDeptId: selectedType ? selectedType.deptId : null,
      aiRecommendType: '',
      aiRecommendDept: null,
      aiConfidence: 0,
      aiMatchedKeywords: []
    });
  },

  // 标题输入时触发 AI 分析
  handleTitleInput(e) {
    const title = e.detail.value ? e.detail.value.trim() : '';
    this.setData({ title });
    
    const fullText = (title + ' ' + this.data.content).trim();
    if (fullText.length >= 5) {
      this.doAIAnalysis(fullText);
    } else {
      this.clearAIRecommend();
    }
  },

  // 内容输入时触发 AI 分析
  handleContentInput(e) {
    const content = e.detail.value ? e.detail.value.trim() : '';
    this.setData({ content });
    
    const fullText = (this.data.title + ' ' + content).trim();
    if (fullText.length >= 5) {
      this.doAIAnalysis(fullText);
    } else if (this.data.aiRecommendType) {
      this.clearAIRecommend();
    }
  },

  // 调用后端 AI 分类接口，获取推荐部门
  doAIAnalysis(text) {
    if (this.data.isAnalyzing) return;
    
    if (text.length < 5) {
      console.log('文本太短，不进行分析');
      return;
    }
    
    this.setData({ isAnalyzing: true });
    
    console.log('开始AI分析，文本:', text);
    
    app.request({
      url: '/api/ai/classify',
      method: 'POST',
      data: { content: text }
    }).then((res) => {
      console.log('AI分析结果:', res);
      
      if (res) {
        const aiResult = res.data || res;
        const confidence = aiResult.confidence || 0;
        const deptId = aiResult.category;
        const deptName = aiResult.dept_name || DEPARTMENT_NAMES[deptId] || '综合服务部';
        const matchedType = this.data.feedbackTypes.find(t => t.deptId === deptId);
        
        let recommendText = '';
        
        // 根据置信度生成不同级别的推荐提示
        if (confidence >= 0.7) {
          recommendText = `AI智能推荐：${matchedType ? matchedType.name : deptName}（${Math.round(confidence * 100)}%匹配）`;
        } else if (confidence >= 0.5) {
          recommendText = `AI建议：${matchedType ? matchedType.name : deptName}（${Math.round(confidence * 100)}%匹配）`;
        } else {
          recommendText = `AI仅供参考：可能属于${matchedType ? matchedType.name : deptName}`;
        }
        
        this.setData({
          aiRecommendType: recommendText,
          aiRecommendDept: deptId,
          aiConfidence: Math.round(confidence * 100),
          aiMatchedKeywords: aiResult.aiTags || [],
          isAnalyzing: false
        });
        
        // 高置信度且未手动选择时自动提示
        if (confidence >= 0.7 && matchedType && !this.data.selectedType) {
          wx.showToast({
            title: `AI推荐：${matchedType.name}`,
            icon: 'none',
            duration: 3000
          });
        }
      } else {
        this.setData({ isAnalyzing: false });
      }
    }).catch((err) => {
      console.error('AI分析失败:', err);
      this.setData({ isAnalyzing: false });
    });
  },

  // 清除 AI 推荐结果
  clearAIRecommend() {
    this.setData({
      aiRecommendType: '',
      aiRecommendDept: null,
      aiConfidence: 0,
      aiMatchedKeywords: []
    });
  },

  // 选择图片
  handleChooseImage() {
    const { imageList, isSubmitting } = this.data;
    if (isSubmitting) return;
    
    if (imageList.length >= 5) {
      wx.showToast({ title: '最多可上传5张图片', icon: 'none' });
      return;
    }

    wx.chooseImage({
      count: 5 - imageList.length,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        this.setData({ imageList: [...imageList, ...res.tempFilePaths] });
      },
      fail: () => {
        wx.showToast({ title: '图片选择失败', icon: 'none' });
      }
    });
  },

  // 删除已选图片
  handleDeleteImage(e) {
    const index = e.currentTarget.dataset.index;
    const { imageList, isSubmitting } = this.data;
    if (isSubmitting) return;
    
    imageList.splice(index, 1);
    this.setData({ imageList });
  },

  // 表单提交入口
  handleFormSubmit() {
    const { title, content, region, isSubmitting, isLogin, voiceInfo } = this.data;
    
    if (!isLogin) {
      this.showLoginModal();
      return;
    }
    
    // 基础非空验证
    if (!title.trim()) {
      wx.showToast({ title: '请填写反馈标题', icon: 'none' });
      return;
    }
    if (!content.trim()) {
      wx.showToast({ title: '请填写反馈详情', icon: 'none' });
      return;
    }
    if (!region.trim()) {
      wx.showToast({ title: '请选择所属区域', icon: 'none' });
      return;
    }
    
    if (isSubmitting) {
      wx.showToast({ title: '正在提交中，请稍候', icon: 'none' });
      return;
    }
    
    // 标记已提交，防止识别结果覆盖
    this.setData({ 
      isSubmitting: true,
      hasSubmitted: true
    });
    
    // 合并标题、内容和语音转写文字用于 AI 分类
    let fullText = title + ' ' + content;
    if (voiceInfo.text) {
      fullText += ' ' + voiceInfo.text;
      console.log('包含语音转写内容:', voiceInfo.text);
    }
    
    if (voiceInfo.url) {
      console.log('包含录音文件:', voiceInfo.url);
      if (voiceInfo.status === 'uploaded' || voiceInfo.status === 'processing') {
        console.log('语音识别中，将随反馈提交');
      }
    }
    
    // 提交前再次调用 AI 分类，确保分类基于最新完整内容
    app.request({
      url: '/api/ai/classify',
      method: 'POST',
      data: { content: fullText }
    }).then((aiRes) => {
      this.submitWithAI(title, content, region, aiRes.data || aiRes);
    }).catch((err) => {
      console.error('AI处理失败:', err);
      // AI 服务故障时降级为无 AI 提交
      this.submitWithoutAI(title, content, region);
    });
  },

  getTypeNameByDept(deptId) {
    const type = this.data.feedbackTypes.find(t => t.deptId === deptId);
    return type ? type.name : '其他问题';
  },

  getDeptName(deptId) {
    return DEPARTMENT_NAMES[deptId] || '综合服务部';
  },

  // 带有 AI 分类结果的提交逻辑
  // 根据置信度和用户选择决定最终分类、状态和优先级
  submitWithAI(title, content, region, aiRes) {
    const { selectedType, selectedDeptId, voiceInfo } = this.data;
    
    // 确定目标部门
    let targetDeptId = selectedDeptId;
    let targetTypeId = selectedType;
    let targetTypeName = '';
    
    if (selectedType) {
      const selectedTypeObj = this.data.feedbackTypes.find(t => t.id === selectedType);
      targetTypeName = selectedTypeObj ? selectedTypeObj.name : '';
    }
    
    if (!targetDeptId && aiRes) {
      targetDeptId = aiRes.category;
      targetTypeName = aiRes.label || this.getTypeNameByDept(aiRes.category);
      const matchedType = this.data.feedbackTypes.find(t => t.deptId === aiRes.category);
      targetTypeId = matchedType ? matchedType.id : 6;
    }
    
    if (!targetDeptId) {
      targetDeptId = 'general';
      targetTypeName = '其他问题';
      targetTypeId = 6;
    }
    
    // 根据置信度和语音情况决定初始状态
    let status = 'pending_manual';
    let statusDisplay = '待分类';
    const confidence = aiRes?.confidence || 0;
    
    if (voiceInfo.url && confidence < 0.8) {
      // 有语音且置信度不够高，强制人工审核
      status = 'pending_manual';
      statusDisplay = '待分类（含语音）';
      console.log('包含语音文件且置信度<0.8，强制人工分类');
    } else if (confidence >= 0.8) {
      status = 'processing'; // 高置信度直接进入处理
      statusDisplay = '处理中';
    } else if (confidence >= 0.6) {
      status = 'pending_ai'; // 中等置信度进入 AI 处理中
      statusDisplay = 'AI处理中';
    } else {
      status = 'pending_manual';
      statusDisplay = '待分类';
    }
    
    const submitData = {
      typeId: targetTypeId,
      typeName: targetTypeName,
      deptId: targetDeptId,
      deptName: this.getDeptName(targetDeptId),
      title: title.trim(),
      content: content.trim(),
      region: region.trim(),
      imageCount: this.data.imageList.length,
      hasVoice: !!voiceInfo.url,
      voiceUrl: voiceInfo.url || '',
      voiceText: voiceInfo.text || '',
      voiceDuration: voiceInfo.duration || 0,
      voiceStatus: voiceInfo.status || 'none',
      submitTime: dateFormat.formatDate(new Date(), 'YYYY-MM-DD HH:mm:ss'),
      aiProcessed: true,
      aiCategory: aiRes?.category || '',
      aiLabel: aiRes?.label || '',
      aiTags: aiRes?.aiTags || [],
      aiConfidence: confidence,
      aiMatchedKeywords: this.data.aiMatchedKeywords || [],
      aiRecommendDept: this.data.aiRecommendDept,
      status: status,
      statusDisplay: statusDisplay,
      priority: this.calculatePriority(aiRes)
    };
    
    console.log('提交数据包含语音:', submitData.voiceUrl ? '有录音文件' : '无录音');
    console.log('语音识别状态:', submitData.voiceStatus);
    console.log('语音转写文本:', submitData.voiceText || '无');

    this.uploadAndSubmit(submitData);
  },

  // 无 AI 结果时的降级提交（状态全部设为待人工分类）
  submitWithoutAI(title, content, region) {
    const { selectedType, selectedDeptId, voiceInfo } = this.data;
    
    let targetDeptId = selectedDeptId || 'general';
    let targetTypeId = selectedType || 6;
    let targetTypeName = '';
    
    if (selectedType) {
      const selectedTypeObj = this.data.feedbackTypes.find(t => t.id === selectedType);
      targetTypeName = selectedTypeObj ? selectedTypeObj.name : '其他问题';
    } else {
      targetTypeName = '其他问题';
    }
    
    const submitData = {
      typeId: targetTypeId,
      typeName: targetTypeName,
      deptId: targetDeptId,
      deptName: this.getDeptName(targetDeptId),
      title: title.trim(),
      content: content.trim(),
      region: region.trim(),
      imageCount: this.data.imageList.length,
      hasVoice: !!voiceInfo.url,
      voiceUrl: voiceInfo.url || '',
      voiceText: voiceInfo.text || '',
      voiceDuration: voiceInfo.duration || 0,
      voiceStatus: voiceInfo.status || 'none',
      submitTime: dateFormat.formatDate(new Date(), 'YYYY-MM-DD HH:mm:ss'),
      aiProcessed: false,
      aiTags: [],
      aiConfidence: 0,
      aiMatchedKeywords: [],
      aiRecommendDept: null,
      status: 'pending_manual',
      statusDisplay: '待分类',
      priority: 'normal'
    };

    this.uploadAndSubmit(submitData);
  },

  // 根据 AI 标签判断是否属于紧急事件，返回优先级
  calculatePriority(aiRes) {
    let priority = 'normal';
    
    if (aiRes && aiRes.aiTags) {
      const urgentKeywords = ['紧急', '危险', '安全事故', '倒塌', '火灾', '急救', '停电', '断水'];
      
      const hasUrgent = aiRes.aiTags.some(tag => 
        urgentKeywords.some(keyword => tag.includes(keyword))
      );
      
      if (hasUrgent) {
        priority = 'urgent';
      }
    }
    
    return priority;
  },

  // 先上传图片（如果有），然后提交表单数据
  uploadAndSubmit(submitData) {
    if (this.data.imageList.length > 0) {
      this.uploadImages(this.data.imageList)
        .then((imageUrls) => {
          submitData.imageUrls = imageUrls;
          this.doSubmit(submitData);
        })
        .catch((err) => {
          console.error('图片上传失败:', err);
          this.doSubmit(submitData);
        });
    } else {
      this.doSubmit(submitData);
    }
  },

  // 上传多张图片到后端 /api/upload/image
  uploadImages(imageList) {
    return new Promise((resolve, reject) => {
      const imageUrls = [];
      const uploadPromises = [];

      imageList.forEach((imgPath, index) => {
        uploadPromises.push(
          new Promise((resolveImg) => {
            wx.uploadFile({
              url: `${app.globalData.baseUrl || 'http://localhost:5000'}/api/upload/image`,
              filePath: imgPath,
              name: `image${index}`,
              header: {
                'Authorization': `Bearer ${app.globalData.token}`
              },
              success: (res) => {
                try {
                  const data = JSON.parse(res.data);
                  if (data.code === 200) {
                    imageUrls.push(data.data.url);
                  }
                } catch (e) {
                  console.error('解析图片上传响应失败:', e);
                }
                resolveImg(); // 单张失败不影响其他图片
              },
              fail: (err) => {
                console.error('图片上传失败:', err);
                resolveImg();
              }
            });
          })
        );
      });

      Promise.all(uploadPromises).then(() => {
        resolve(imageUrls);
      }).catch(reject);
    });
  },

  // 最终提交反馈到后端 /api/feedback/submit
  doSubmit(submitData) {
    console.log('提交数据:', submitData);
    
    // 本地保存备份（网络失败时可恢复）
    this.saveToLocal(submitData);
    
    app.request({
      url: '/api/feedback/submit',
      method: 'POST',
      data: submitData
    })
    .then((res) => {
      console.log('提交成功响应:', res);
      
      if (res.data && res.data.status) {
        submitData.status = res.data.status;
        submitData.statusDisplay = res.data.status_display || 
          (res.data.status === 'processing' ? '处理中' : 
           res.data.status === 'pending_ai' ? 'AI处理中' : '待分类');
      }
      
      // 通知其他页面有新的反馈提交
      if (app.globalData.onFeedbackSubmitted) {
        app.globalData.onFeedbackSubmitted(submitData);
      }
      
      wx.showToast({ 
        title: '反馈提交成功',
        icon: 'success',
        duration: 2000
      });
      
      Storage.remove('userRegion');
      
      this.setData({ isSubmitting: false });
      
      this.resetForm();
      
      setTimeout(() => {
        wx.navigateBack({
          delta: 1
        });
      }, 1500);
    })
    .catch((err) => {
      console.error('提交失败详细错误:', err);
      
      wx.showToast({ 
        title: '已保存到本地',
        icon: 'success',
        duration: 2000
      });
      
      this.setData({ isSubmitting: false });
      
      this.resetForm();
      
      setTimeout(() => {
        wx.navigateBack({
          delta: 1
        });
      }, 1500);
    });
  },

   // 本地保存反馈草稿，用于离线或提交失败后恢复
  saveToLocal(feedbackData) {
    console.log('保存反馈到本地存储');
    
    let localFeedback = wx.getStorageSync('localFeedback') || [];
    const now = new Date();
    const formattedTime = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    let status = feedbackData.status || 'pending_manual';
    let statusDisplay = feedbackData.statusDisplay || '待分类';
    let departmentName = feedbackData.deptName || '待派单';
    
    // 美化本地存储的状态显示
    if (status === 'processing') {
      statusDisplay = '处理中';
      departmentName = feedbackData.deptName || '处理中';
    } else if (status === 'pending_ai' || (feedbackData.aiConfidence && feedbackData.aiConfidence >= 0.5)) {
      statusDisplay = 'AI处理中';
      if (feedbackData.deptName) {
        departmentName = `AI推荐:${feedbackData.deptName}`;
      }
    }
    
    const hasVoice = !!(feedbackData.voiceUrl || feedbackData.voiceText);
    
    const newFeedback = {
      id: Date.now(), // 本地临时 ID
      title: feedbackData.title || '新反馈',
      content: feedbackData.content || '',
      status: statusDisplay,
      statusValue: status,
      imageCount: feedbackData.imageCount || 0,
      hasVoice: hasVoice,
      voiceText: feedbackData.voiceText || '',
      voiceUrl: feedbackData.voiceUrl || '',
      voiceDuration: feedbackData.voiceDuration || 0,
      voiceStatus: feedbackData.voiceStatus || 'none',
      createTime: formattedTime,
      departmentName: departmentName,
      departmentId: feedbackData.deptId,
      typeName: feedbackData.typeName || '其他问题',
      priority: feedbackData.priority || 'normal',
      aiTags: feedbackData.aiTags || [],
      aiConfidence: feedbackData.aiConfidence ? Math.round(feedbackData.aiConfidence * 100) : 0,
      aiCategory: feedbackData.aiCategory || ''
    };
    
    localFeedback.unshift(newFeedback);
    wx.setStorageSync('localFeedback', localFeedback);
    
    console.log('本地存储成功，现有', localFeedback.length, '条反馈，状态:', statusDisplay);
    if (hasVoice) {
      console.log('包含语音反馈');
    }
  },

  // 重置表单所有字段到初始状态
  resetForm() {
    console.log('重置表单');
    this.setData({
      selectedType: null,
      selectedDeptId: null,
      title: '',
      content: '',
      imageList: [],
      voiceInfo: {
        url: '',
        text: '',
        localPath: '',
        duration: 0,
        status: 'none',
        needConfirm: false,
        uploadTime: 0
      },
      aiRecommendType: '',
      aiRecommendDept: null,
      aiConfidence: 0,
      aiMatchedKeywords: [],
      isAnalyzing: false,
      recognizeResult: '',
      showRecognizeResult: false,
      detectLanguage: '',
      isPlaying: false,
      playPercent: 0,
      playPercentStyle: 'width: 0%;',
      recognizing: false,
      recognizeError: '',
      isSubmitting: false,
      hasSubmitted: false
    });
    
    if (this.innerAudioContext) {
      this.innerAudioContext.destroy();
      this.innerAudioContext = null;
    }
  }
});