// pages/feedback/detail/detail.js
const app = getApp();

Page({
  data: {
    feedbackId: null,          // 当前反馈ID（从页面参数获取）
    feedbackDetail: null,      // 反馈详情数据对象
    isLoading: true,           // 是否正在加载
    // 语音播放状态
    isPlaying: false,          // 是否正在播放语音
    playPercent: 0,            // 播放进度百分比
    playPercentStyle: 'width: 0%;', // 进度条宽度样式
    currentVoiceUrl: '',       // 当前播放的语音URL
    innerAudioContext: null    // 全局复用的音频上下文实例
  },

  onLoad(options) {
    console.log('详情页参数:', options);
    const id = options.id;
    this.setData({ feedbackId: id });
    this.loadFeedbackDetail(id);

    // 创建音频播放实例，页面卸载时统一销毁
    const innerAudioContext = wx.createInnerAudioContext();
    this.setData({ innerAudioContext });
  },

  onUnload() {
    // 页面卸载时停止播放并销毁音频实例
    if (this.data.innerAudioContext) {
      this.data.innerAudioContext.stop();
      this.data.innerAudioContext.destroy();
    }
  },

  // 加载反馈详情：优先从本地存储展示，再通过服务器静默更新
  loadFeedbackDetail(id) {
    console.log('加载反馈详情，ID:', id);

    const localFeedback = wx.getStorageSync('localFeedback') || [];
    const feedback = localFeedback.find(item => item.id == id);

    if (feedback) {
      // 本地找到则立即展示，避免白屏
      const safeFeedback = this.ensureSafeData(feedback);
      this.setData({
        feedbackDetail: safeFeedback,
        isLoading: false
      });
      wx.setNavigationBarTitle({ title: safeFeedback.title || '反馈详情' });

      // 同时静默从服务器获取最新数据
      this.fetchFromServerSilent(id);
    } else {
      // 本地没有则从服务器全量加载
      this.fetchFromServer(id);
    }
  },

  // 格式化日期时间（显示年月日时分）
  formatDateTime(dateTimeStr) {
    if (!dateTimeStr) return '未知';
    
    try {
        const date = new Date(dateTimeStr);
        if (isNaN(date.getTime())) return dateTimeStr;

        // 加上 8 小时转为北京时间
        const beijingDate = new Date(date.getTime() + 8 * 60 * 60 * 1000);

        const year = beijingDate.getFullYear();
        const month = String(beijingDate.getMonth() + 1).padStart(2, '0');
        const day = String(beijingDate.getDate()).padStart(2, '0');
        const hour = String(beijingDate.getHours()).padStart(2, '0');
        const minute = String(beijingDate.getMinutes()).padStart(2, '0');

        return `${year}-${month}-${day} ${hour}:${minute}`;
    } catch (e) {
        return dateTimeStr;
    }
},

  // 数据安全处理：统一不同来源（本地/服务器）的字段名和格式，避免展示异常
  ensureSafeData(data) {
    if (!data) return {};

    // 处理图片数组：兼容 images 和 imageUrls 两种字段
    let images = [];
    if (data.images) {
      images = Array.isArray(data.images) ? data.images : [];
    } else if (data.imageUrls) {
      images = Array.isArray(data.imageUrls) ? data.imageUrls : [];
    }

    // 语音URL：兼容 voiceUrl 和 voice_url
    let voiceUrl = data.voiceUrl || data.voice_url || '';
    // 语音转写文本：兼容 voiceText 和 voice_text
    let voiceText = data.voiceText || data.voice_text || '';
    // 语音时长：兼容 voiceDuration 和 voice_duration
    let voiceDuration = data.voiceDuration || data.voice_duration || 0;

    // AI标签：兼容多种来源（aiTags、ai_result.aiTags、aiMatchedKeywords）
    let aiTags = [];
    if (data.aiTags && Array.isArray(data.aiTags)) {
      aiTags = data.aiTags;
    } else if (data.ai_result && data.ai_result.aiTags) {
      aiTags = Array.isArray(data.ai_result.aiTags) ? data.ai_result.aiTags : [];
    } else if (data.aiMatchedKeywords && Array.isArray(data.aiMatchedKeywords)) {
      aiTags = data.aiMatchedKeywords;
    } else if (data.aiTags && typeof data.aiTags === 'string') {
      try {
        aiTags = JSON.parse(data.aiTags);
      } catch (e) {
        aiTags = [data.aiTags];
      }
    }

    // AI置信度：兼容多种字段名，统一转为0-100的百分比
    let aiConfidence = 0;
    if (data.aiConfidence !== undefined && data.aiConfidence !== null) {
      aiConfidence = typeof data.aiConfidence === 'number' ? data.aiConfidence : parseInt(data.aiConfidence) || 0;
    } else if (data.ai_confidence !== undefined && data.ai_confidence !== null) {
      aiConfidence = data.ai_confidence;
    } else if (data.confidence !== undefined && data.confidence !== null) {
      aiConfidence = data.confidence;
    }
    // 如果是0-1的小数，转为百分比；如果已经是百分比则保持；否则置0
    if (aiConfidence > 1 && aiConfidence <= 100) {
      // 保持不变
    } else if (aiConfidence > 0 && aiConfidence <= 1) {
      aiConfidence = Math.round(aiConfidence * 100);
    } else {
      aiConfidence = 0;
    }

    // AI分析结果对象
    let aiResult = data.ai_result || data.aiResult || {};
    if (typeof aiResult === 'string') {
      try {
        aiResult = JSON.parse(aiResult);
      } catch (e) {
        aiResult = {};
      }
    }
    // 从 aiResult 中提取 aiTags 补充
    if (aiResult.aiTags && Array.isArray(aiResult.aiTags) && aiTags.length === 0) {
      aiTags = aiResult.aiTags;
    }

    // AI推荐的部门
    let aiRecommendedDept = '';
    if (aiResult.category) {
      aiRecommendedDept = aiResult.category;
    } else if (aiResult.recommendedDeptId) {
      aiRecommendedDept = aiResult.recommendedDeptId;
    }

    // 部门名称映射（备用）
    const deptNames = {
      'agriculture': '农业服务部',
      'infrastructure': '基建维修部',
      'environment': '环境整治部',
      'health': '医疗卫生部',
      'civil': '民政服务部',
      'general': '综合服务部'
    };

    // 状态显示文本映射
    const statusMap = {
      'pending_ai': 'AI处理中',
      'pending_manual': '待分类',
      'processing': '处理中',
      'completed': '已完成',
      'rejected': '已驳回',
      'archived': '已评分'
    };

    // 确定部门名称：兼容 dept_name、departmentName、deptId、category 等字段
    let departmentName = '待派单';
    let departmentId = data.dept_id || data.category || data.departmentId || '';

    if (data.dept_name && data.dept_name !== '待派单') {
      departmentName = data.dept_name;
      departmentId = data.dept_id || data.category;
    } else if (data.departmentName) {
      departmentName = data.departmentName;
      departmentId = data.departmentId;
    } else if (data.deptId) {
      departmentName = deptNames[data.deptId] || '待派单';
      departmentId = data.deptId;
    } else if (data.category) {
      departmentName = deptNames[data.category] || '待派单';
      departmentId = data.category;
    } else if (data.manual_category) {
      departmentName = deptNames[data.manual_category] || data.manual_category || '待派单';
      departmentId = data.manual_category;
    }

    // 确定状态的显示文本：优先 status_display，其次 statusDisplay，再查表
    let statusDisplay = '待处理';
    let statusValue = data.status || data.statusValue || 'pending_manual';

    if (data.status_display) {
      statusDisplay = data.status_display;
    } else if (data.statusDisplay) {
      statusDisplay = data.statusDisplay;
    } else if (data.status) {
      statusDisplay = statusMap[data.status] || data.status || '待处理';
    }

    // AI标签的展示文本
    let aiDisplayText = aiTags.length > 0 ? aiTags.join('、') : '';

    // AI分析的核心标签（取第一个标签或 label）
    let aiAnalysisLabel = '';
    if (aiResult.label) {
      aiAnalysisLabel = aiResult.label;
    } else if (aiTags.length > 0) {
      aiAnalysisLabel = aiTags[0] + '等';
    }

    return {
      id: data.id || 0,
      title: data.title || '无标题',
      content: data.content || '',
      status: statusValue,
      status_display: statusDisplay,
      raw_status: data.status,
      createTime: this.formatDateTime(data.created_at || data.createTime),
      submitTime: this.formatDateTime(data.created_at || data.submitTime),
      processed_at: this.formatDateTime(data.processed_at),
      departmentName: departmentName,
      departmentId: departmentId,
      dept_name: data.dept_name,
      dept_id: data.dept_id,
      category: data.category,
      typeName: data.typeName || '',
      region: data.region || '',
      // AI相关字段
      aiTags: aiTags,
      aiDisplayText: aiDisplayText,
      aiConfidence: aiConfidence,
      aiConfidencePercent: aiConfidence,
      aiResult: aiResult,
      aiAnalysisLabel: aiAnalysisLabel,
      aiRecommendedDept: aiRecommendedDept,
      hasAIAnalysis: aiConfidence > 0 || aiTags.length > 0,
      imageCount: data.imageCount || images.length || 0,
      hasVoice: data.hasVoice || !!voiceUrl,
      images: images,
      imageUrls: images,
      // 语音相关字段
      voiceUrl: voiceUrl,
      voice_url: voiceUrl,
      voiceText: voiceText,
      voice_text: voiceText,
      voiceDuration: voiceDuration,
      voice_duration: voiceDuration,
      reject_reason: data.reject_reason || '',
      user: data.user || null,
      processor: data.processor || null
    };
  },

  // 静默从服务器获取最新详情数据，不显示加载动画，更新本地缓存
  fetchFromServerSilent(id) {
    const token = wx.getStorageSync('token') || app.globalData.token;

    wx.request({
      url: `${app.globalData.baseUrl || 'http://localhost:5000'}/api/feedback/detail/${id}`,
      method: 'GET',
      header: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      success: (res) => {
        if (res.data && res.data.code === 200) {
          const serverData = res.data.data || {};
          const safeData = this.ensureSafeData(serverData);
          // 直接刷新页面数据
          this.setData({ feedbackDetail: safeData });
          // 同时更新本地存储
          this.updateLocalStorage(id, serverData);
        }
      },
      fail: (err) => {
        console.log('服务器获取失败，使用本地数据', err);
      }
    });
  },

  // 从服务器全量加载详情，显示加载动画
  fetchFromServer(id) {
    wx.showLoading({ title: '加载中...' });

    const token = wx.getStorageSync('token') || app.globalData.token;

    wx.request({
      url: `${app.globalData.baseUrl || 'http://localhost:5000'}/api/feedback/detail/${id}`,
      method: 'GET',
      header: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      success: (res) => {
        wx.hideLoading();
        if (res.data && res.data.code === 200) {
          const serverData = res.data.data || {};
          const safeData = this.ensureSafeData(serverData);
          this.setData({ feedbackDetail: safeData, isLoading: false });
          wx.setNavigationBarTitle({ title: safeData.title || '反馈详情' });
          this.updateLocalStorage(id, serverData);
        } else {
          this.showErrorAndBack(res.data?.message || '获取详情失败');
        }
      },
      fail: (err) => {
        wx.hideLoading();
        this.showErrorAndBack('网络错误，请稍后重试');
      }
    });
  },

  // 显示错误提示并自动返回上一页
  showErrorAndBack(message) {
    wx.showModal({
      title: '提示',
      content: message,
      showCancel: false,
      success: () => {
        wx.navigateBack();
      }
    });
    this.setData({ isLoading: false });
  },

  // 更新本地存储中的反馈数据（合并或新增）
  updateLocalStorage(id, newData) {
    try {
      let localFeedback = wx.getStorageSync('localFeedback') || [];
      const index = localFeedback.findIndex(item => item.id == id);

      if (index !== -1) {
        // 已有记录：合并新旧数据，保留本地特有字段
        localFeedback[index] = { 
          ...localFeedback[index], 
          ...newData,
          createTime: localFeedback[index].createTime || newData.created_at,
          status_display: localFeedback[index].status_display || newData.status_display
        };
      } else {
        // 新增记录
        const newFeedback = this.ensureSafeData(newData);
        localFeedback.unshift(newFeedback);
      }
      wx.setStorageSync('localFeedback', localFeedback);
    } catch (e) {
      console.error('更新本地存储失败:', e);
    }
  },

  // 预览图片（WXML 中 bindtap="previewImage"）
  previewImage(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) {
      wx.showToast({ title: '图片不存在', icon: 'none' });
      return;
    }
    const urls = this.data.feedbackDetail.imageUrls || this.data.feedbackDetail.images || [url];
    const validUrls = urls.filter(u => u && typeof u === 'string');
    if (validUrls.length === 0) {
      wx.showToast({ title: '暂无图片', icon: 'none' });
      return;
    }
    wx.previewImage({
      current: url,
      urls: validUrls
    });
  },

  // 播放/暂停语音（WXML 中 bindtap="playVoice"）
  playVoice() {
    const voiceUrl = this.data.feedbackDetail.voiceUrl || this.data.feedbackDetail.voice_url;
    if (!voiceUrl) {
      wx.showToast({ title: '暂无语音', icon: 'none' });
      return;
    }
    // 如果正在播放，则暂停
    if (this.data.isPlaying) {
      this.data.innerAudioContext.stop();
      this.setData({ 
        isPlaying: false, 
        playPercent: 0,
        playPercentStyle: 'width: 0%;'
      });
      return;
    }
    // 开始播放
    wx.showToast({ title: '播放中...', icon: 'none' });
    const innerAudioContext = this.data.innerAudioContext;
    innerAudioContext.src = voiceUrl;
    innerAudioContext.play();
    this.setData({ isPlaying: true, currentVoiceUrl: voiceUrl });

    innerAudioContext.onTimeUpdate(() => {
      const percent = (innerAudioContext.currentTime / innerAudioContext.duration) * 100;
      this.setData({ 
        playPercent: percent,
        playPercentStyle: `width: ${percent}%;`
      });
    });
    innerAudioContext.onEnded(() => {
      wx.showToast({ title: '播放完成', icon: 'success' });
      this.setData({ isPlaying: false, playPercent: 0, playPercentStyle: 'width: 0%;' });
    });
    innerAudioContext.onError((res) => {
      console.error('语音播放失败:', res);
      wx.showToast({ title: '播放失败', icon: 'none' });
      this.setData({ isPlaying: false, playPercent: 0, playPercentStyle: 'width: 0%;' });
    });
  },

  // 查看语音转写完整文本（WXML 中 bindtap="viewVoiceText"）
  viewVoiceText() {
    const voiceText = this.data.feedbackDetail.voiceText || this.data.feedbackDetail.voice_text;
    if (!voiceText) {
      wx.showToast({ title: '暂无语音转写内容', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '语音转写内容',
      content: voiceText,
      confirmText: '知道了',
      showCancel: false
    });
  },

  // 删除当前反馈（WXML 中 bindtap="handleDelete"）
  handleDelete() {
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这条反馈吗？此操作不可恢复。',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...' });
          const token = wx.getStorageSync('token') || app.globalData.token;
          wx.request({
            url: `${app.globalData.baseUrl || 'http://localhost:5000'}/api/feedback/${this.data.feedbackId}/delete`,
            method: 'DELETE',
            header: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            success: (res) => {
              wx.hideLoading();
              if (res.data && res.data.code === 200) {
                // 同步删除本地存储
                try {
                  let localFeedback = wx.getStorageSync('localFeedback') || [];
                  localFeedback = localFeedback.filter(item => item.id != this.data.feedbackId);
                  wx.setStorageSync('localFeedback', localFeedback);
                } catch (e) {
                  console.error('更新本地存储失败:', e);
                }
                wx.showToast({ title: '删除成功', icon: 'success' });
                // 通知列表页刷新（如果注册了回调）
                if (app.globalData.onFeedbackDeleted) {
                  app.globalData.onFeedbackDeleted(this.data.feedbackId);
                }
                setTimeout(() => wx.navigateBack(), 1500);
              } else {
                wx.showToast({ title: res.data?.message || '删除失败', icon: 'none' });
              }
            },
            fail: (err) => {
              wx.hideLoading();
              console.error('删除请求失败:', err);
              wx.showToast({ title: '网络错误', icon: 'none' });
            }
          });
        }
      }
    });
  },

  // 重新提交反馈（WXML 中 bindtap="handleResubmit"）
  handleResubmit() {
    wx.navigateTo({
      url: `/pages/feedback/submit/submit?id=${this.data.feedbackId}&type=edit`
    });
  },

  // 复制反馈内容（WXML 中 bindtap="copyContent"）
  copyContent() {
    const content = this.data.feedbackDetail.content;
    if (!content) {
      wx.showToast({ title: '暂无内容', icon: 'none' });
      return;
    }
    wx.setClipboardData({
      data: content,
      success: () => wx.showToast({ title: '已复制', icon: 'success' })
    });
  },

  // 拨打村民电话（WXML 中 bindtap="makePhoneCall"）
  makePhoneCall() {
    const phone = this.data.feedbackDetail.user?.phone;
    if (!phone) {
      wx.showToast({ title: '暂无联系方式', icon: 'none' });
      return;
    }
    wx.makePhoneCall({ phoneNumber: phone });
  },

  // 分享当前反馈详情
  onShareAppMessage() {
    const detail = this.data.feedbackDetail || {};
    return {
      title: detail.title || '反馈详情',
      path: `/pages/feedback/detail/detail?id=${this.data.feedbackId}`,
      imageUrl: detail.images && detail.images[0] ? detail.images[0] : '/images/share-default.png'
    };
  }
});