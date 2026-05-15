// pages/admin/pending-feedbacks/pending-feedbacks.js
// 待分类反馈列表页（管理员）：展示所有需要人工分类或处理中的反馈
// 支持搜索、排序、语音播放、分类选择与提交
// 涉及接口：
//   - /api/admin/feedbacks/pending-manual  获取待分类反馈列表
//   - /api/admin/feedbacks/{id}/classify   提交人工分类
//   - /api/admin/statistics                获取待处理统计数量

const app = getApp();

Page({
  data: {
    pendingFeedbacks: [],         // 反馈列表
    page: 1,                      // 当前页码
    perPage: 10,                  // 每页数量
    hasMore: true,                // 是否还有更多数据
    isLoading: false,             // 是否正在加载
    todayCount: 0,                // 今日新增待分类数量
    sortType: 'time_desc',        // 排序方式（time_desc / time_asc）
    sortText: '最新优先',         // 排序显示文本
    searchKeyword: '',            // 搜索关键词
    aiThreshold: 0.7,             // AI 置信度阈值（小于此值提示人工复核）

    // 部门选择列表
    categories: [
      { id: 1, name: '农业服务', icon: '🌾', deptId: 'agriculture' },
      { id: 2, name: '基建维修', icon: '🏗️', deptId: 'infrastructure' },
      { id: 3, name: '环境卫生', icon: '🌳', deptId: 'environment' },
      { id: 4, name: '医疗卫生', icon: '🏥', deptId: 'health' },
      { id: 5, name: '民政咨询', icon: '👥', deptId: 'civil' },
      { id: 6, name: '其他', icon: '📋', deptId: 'general' }
    ],

    // 部门ID到中文名称映射（AI 标签推断时使用）
    deptNames: {
      'agriculture': '农业服务部',
      'infrastructure': '基建维修部',
      'environment': '环境整治部',
      'health': '医疗卫生部',
      'civil': '民政服务部',
      'general': '综合服务部'
    },

    // 音频播放相关
    innerAudioContext: null,       // 音频上下文实例
    isPlaying: false,             // 是否正在播放
    currentPlayingId: null        // 当前播放的反馈ID
  },

  onLoad() {
    console.log('待分类反馈页面加载');

    // 创建全局音频实例
    const innerAudioContext = wx.createInnerAudioContext();
    this.setData({ innerAudioContext });

    // 注册反馈更新回调，其他页面操作后自动刷新
    this.feedbackUpdateCallback = () => {
      console.log('待分类界面收到更新通知，重新加载数据');
      this.setData({ page: 1, pendingFeedbacks: [], hasMore: true }, () => {
        this.loadPendingFeedbacks();
        this.loadTodayCount();
      });
    };

    if (app.onFeedbackUpdate) {
      app.onFeedbackUpdate(this.feedbackUpdateCallback);
    }

    this.loadPendingFeedbacks();
    this.loadTodayCount();
  },

  onShow() {
    console.log('待分类反馈页面显示');
    this.loadPendingFeedbacks();
    this.loadTodayCount();
  },

  onUnload() {
    // 移除反馈更新监听
    if (app.offFeedbackUpdate && this.feedbackUpdateCallback) {
      app.offFeedbackUpdate(this.feedbackUpdateCallback);
    }

    // 停止音频并销毁
    if (this.data.innerAudioContext) {
      this.data.innerAudioContext.stop();
      this.data.innerAudioContext.destroy();
    }

    // 清除搜索防抖定时器
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }
  },

  onPullDownRefresh() {
    // 下拉刷新：重置并重新加载
    this.setData({ page: 1, pendingFeedbacks: [], hasMore: true }, () => {
      Promise.all([
        this.loadPendingFeedbacks(),
        this.loadTodayCount()
      ]).then(() => {
        wx.stopPullDownRefresh();
      }).catch(() => {
        wx.stopPullDownRefresh();
      });
    });
  },

  // 加载待分类反馈列表
  loadPendingFeedbacks() {
    if (this.data.isLoading || !this.data.hasMore) return Promise.resolve();

    this.setData({ isLoading: true });

    const params = {
      page: this.data.page,
      per_page: this.data.perPage,
      sort: this.data.sortType
    };

    // 有搜索关键词时传递给后端
    if (this.data.searchKeyword && this.data.searchKeyword.trim().length > 0) {
      params.keyword = this.data.searchKeyword.trim();
    }

    console.log('请求参数:', params);

    return app.request({
      url: '/api/admin/feedbacks/pending-manual',
      data: params
    }).then(res => {
      const responseData = res.data || res;
      let newFeedbacks = responseData.feedbacks || [];
      const pagination = responseData.pagination || {};

      console.log(`获取到 ${newFeedbacks.length} 条待分类反馈`);

      // 格式化反馈数据，统一置信度、AI 推荐部门等
      const processedFeedbacks = newFeedbacks.map(fb => {
        // 统一置信度为 0-1 的小数
        let aiConfidence = 0.5;
        const rawConfidence = fb.ai_confidence;
        if (rawConfidence !== undefined && rawConfidence !== null) {
          if (typeof rawConfidence === 'number') {
            aiConfidence = rawConfidence > 1 ? rawConfidence / 100 : rawConfidence;
          } else if (typeof rawConfidence === 'string') {
            const parsed = parseFloat(rawConfidence);
            if (!isNaN(parsed)) {
              aiConfidence = parsed > 1 ? parsed / 100 : parsed;
            }
          }
        }
        aiConfidence = Math.min(1, Math.max(0, aiConfidence));

        // 需要人工复核的标记
        const needManual = aiConfidence < this.data.aiThreshold;

        // 根据 AI 标签推断推荐部门
        let aiDeptName = '待分类';
        if (fb.ai_tags && fb.ai_tags.length > 0) {
          const firstTag = fb.ai_tags[0];
          if (firstTag.includes('路灯') || firstTag.includes('道路') || firstTag.includes('维修')) {
            aiDeptName = '基建维修部';
          } else if (firstTag.includes('农业') || firstTag.includes('补贴') || firstTag.includes('种植')) {
            aiDeptName = '农业服务部';
          } else if (firstTag.includes('垃圾') || firstTag.includes('环境') || firstTag.includes('卫生')) {
            aiDeptName = '环境整治部';
          } else if (firstTag.includes('医保') || firstTag.includes('医疗') || firstTag.includes('健康')) {
            aiDeptName = '医疗卫生部';
          } else if (firstTag.includes('低保') || firstTag.includes('民政') || firstTag.includes('救助')) {
            aiDeptName = '民政服务部';
          } else {
            aiDeptName = '综合服务部';
          }
        } else if (fb.category) {
          aiDeptName = this.data.deptNames[fb.category] || '综合服务部';
        }

        // 语音转写文本截断显示
        let voiceTextDisplay = '';
        if (fb.voice_text && fb.voice_text.trim().length > 0) {
          voiceTextDisplay = fb.voice_text.length > 50 ? fb.voice_text.substring(0, 50) + '...' : fb.voice_text;
        }

        return {
          ...fb,
          selectedCategory: '',               // 用户选择的分类
          opinion: '',                        // 处理意见
          showOpinion: false,                 // 是否展开处理意见输入框
          ai_tags: fb.ai_tags || [],
          ai_confidence: aiConfidence,
          needManual: needManual,
          confidencePercent: Math.round(aiConfidence * 100),
          confidenceClass: this.getConfidenceClass(aiConfidence),
          aiDeptName: aiDeptName,
          voice_url: fb.voice_url || '',
          voice_text: fb.voice_text || '',
          voice_duration: fb.voice_duration || 0,
          voiceTextDisplay: voiceTextDisplay,
          hasVoiceText: !!voiceTextDisplay,
          isPlaying: false,
          displayTime: this.formatTime(fb.created_at)
        };
      });

      // 合并列表（首页替换，后续页去重追加）
      const feedbacks = this.data.page === 1
        ? processedFeedbacks
        : [...this.data.pendingFeedbacks, ...processedFeedbacks];

      this.setData({
        pendingFeedbacks: feedbacks,
        hasMore: processedFeedbacks.length === this.data.perPage,
        page: this.data.page + 1,
        isLoading: false
      });

      console.log(`加载完成，当前列表共 ${feedbacks.length} 条反馈`);
      return res;
    }).catch(err => {
      console.error('加载失败:', err);
      this.setData({ isLoading: false });
      throw err;
    });
  },

  // 置信度等级：高/中/低
  getConfidenceClass(confidence) {
    if (confidence >= 0.8) return 'high';
    if (confidence >= 0.6) return 'medium';
    return 'low';
  },

  // 加载今日待处理统计数量
  loadTodayCount() {
    app.request({
      url: '/api/admin/statistics',
      method: 'GET'
    }).then(res => {
      this.setData({ todayCount: res.pending_feedbacks || 0 });
    }).catch(err => {
      console.error('加载统计失败:', err);
    });
  },

  // 搜索输入（防抖 500ms）
  onSearchInput(e) {
    const keyword = e.detail.value;
    const that = this;

    if (this.searchTimer) clearTimeout(this.searchTimer);

    this.searchTimer = setTimeout(() => {
      console.log('执行搜索, 关键词:', keyword);
      that.setData({
        searchKeyword: keyword,
        page: 1,
        pendingFeedbacks: [],
        hasMore: true
      }, () => {
        that.loadPendingFeedbacks();
        that.searchTimer = null;
      });
    }, 500);
  },

  // 切换排序方式
  toggleSort() {
    const sortType = this.data.sortType === 'time_desc' ? 'time_asc' : 'time_desc';
    const sortText = sortType === 'time_desc' ? '最新优先' : '最早优先';

    this.setData({
      sortType: sortType,
      sortText: sortText,
      page: 1,
      pendingFeedbacks: [],
      hasMore: true
    }, () => {
      this.loadPendingFeedbacks();
    });
  },

  // 选择分类（点击分类按钮）
  selectCategory(e) {
    const { feedbackId, categoryName } = e.currentTarget.dataset;
    if (!feedbackId || !categoryName) return;

    const feedbacks = this.data.pendingFeedbacks.map(fb => {
      if (fb.id === feedbackId) {
        fb.selectedCategory = categoryName;
      }
      return fb;
    });
    this.setData({ pendingFeedbacks: feedbacks });
  },

  // 展开/收起处理意见输入框
  toggleOpinion(e) {
    const { id } = e.currentTarget.dataset;
    const feedbacks = this.data.pendingFeedbacks.map(fb => {
      if (fb.id === id) {
        fb.showOpinion = !fb.showOpinion;
      }
      return fb;
    });
    this.setData({ pendingFeedbacks: feedbacks });
  },

  // 输入处理意见
  onOpinionInput(e) {
    const { id } = e.currentTarget.dataset;
    const opinion = e.detail.value;
    const feedbacks = this.data.pendingFeedbacks.map(fb => {
      if (fb.id === id) {
        fb.opinion = opinion;
      }
      return fb;
    });
    this.setData({ pendingFeedbacks: feedbacks });
  },

  // 提交人工分类
  submitClassification(e) {
    const feedbackId = e.currentTarget.dataset.id;
    const feedback = this.data.pendingFeedbacks.find(fb => fb.id === feedbackId);

    if (!feedback) return;

    if (!feedback.selectedCategory) {
      wx.showToast({ title: '请选择分类', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '提交中...' });

    app.request({
      url: `/api/admin/feedbacks/${feedbackId}/classify`,
      method: 'POST',
      data: {
        category: feedback.selectedCategory,
        opinion: feedback.opinion
      }
    }).then(() => {
      wx.hideLoading();
      wx.showToast({ title: '分类成功', icon: 'success' });

      // 重置列表并刷新
      this.setData({ page: 1, pendingFeedbacks: [], hasMore: true }, () => {
        this.loadPendingFeedbacks();
        this.loadTodayCount();
      });

      // 通知其他页面更新
      if (app.triggerFeedbackUpdate) {
        app.triggerFeedbackUpdate();
      }
    }).catch((err) => {
      wx.hideLoading();
      console.error('分类失败:', err);
      wx.showToast({ title: err.message || '分类失败', icon: 'none' });
    });
  },

  // 预览图片
  previewImage(e) {
    const url = e.currentTarget.dataset.url;
    wx.previewImage({ urls: [url] });
  },

  // 播放/暂停语音
  playVoice(e) {
    const url = e.currentTarget.dataset.url;
    const id = e.currentTarget.dataset.id;

    if (!url) {
      wx.showToast({ title: '语音文件不存在', icon: 'none' });
      return;
    }

    // 如果当前正在播放同一音频，则暂停
    if (this.data.isPlaying && this.data.currentPlayingId === id) {
      if (this.data.innerAudioContext) {
        this.data.innerAudioContext.stop();
      }
      this.setData({ isPlaying: false, currentPlayingId: null });
      this.setPlayingState(id, false);
      return;
    }

    // 停止上一个音频
    if (this.data.innerAudioContext) {
      this.data.innerAudioContext.stop();
    }

    this.setData({ isPlaying: true, currentPlayingId: id });
    this.setPlayingState(id, true);

    const innerAudioContext = this.data.innerAudioContext;
    innerAudioContext.src = url;
    innerAudioContext.play();

    // 播放结束监听
    innerAudioContext.onEnded(() => {
      this.setData({ isPlaying: false, currentPlayingId: null });
      this.setPlayingState(id, false);
    });

    // 播放错误监听
    innerAudioContext.onError((err) => {
      console.error('播放失败:', err);
      wx.showToast({ title: '播放失败', icon: 'none' });
      this.setData({ isPlaying: false, currentPlayingId: null });
      this.setPlayingState(id, false);
    });
  },

  // 更新指定反馈的播放状态
  setPlayingState(feedbackId, isPlaying) {
    const feedbacks = this.data.pendingFeedbacks.map(fb => {
      if (fb.id === feedbackId) {
        fb.isPlaying = isPlaying;
      } else {
        fb.isPlaying = false;
      }
      return fb;
    });
    this.setData({ pendingFeedbacks: feedbacks });
  },

  // 查看完整的语音转写文本
  viewVoiceText(e) {
    const text = e.currentTarget.dataset.text;
    if (!text) {
      wx.showToast({ title: '无语音转写内容', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '语音转写内容',
      content: text,
      confirmText: '知道了',
      showCancel: false
    });
  },

  // 加载更多
  loadMore() {
    if (this.data.hasMore && !this.data.isLoading) {
      this.loadPendingFeedbacks();
    }
  },

  // 格式化时间为友好显示（今天/昨天/日期）
  formatTime(timeStr) {
    if (!timeStr) return '未知时间';

    try {
      const utcDate = new Date(timeStr + 'Z');
      if (isNaN(utcDate.getTime())) return '未知时间';

      const now = new Date();

      // 今天
      if (utcDate.toDateString() === now.toDateString()) {
        return `今天 ${String(utcDate.getHours()).padStart(2, '0')}:${String(utcDate.getMinutes()).padStart(2, '0')}`;
      }

      // 昨天
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      if (utcDate.toDateString() === yesterday.toDateString()) {
        return `昨天 ${String(utcDate.getHours()).padStart(2, '0')}:${String(utcDate.getMinutes()).padStart(2, '0')}`;
      }

      // 今年内
      if (utcDate.getFullYear() === now.getFullYear()) {
        return `${utcDate.getMonth()+1}-${utcDate.getDate()} ${String(utcDate.getHours()).padStart(2, '0')}:${String(utcDate.getMinutes()).padStart(2, '0')}`;
      }

      // 往年
      return `${utcDate.getFullYear()}-${utcDate.getMonth()+1}-${utcDate.getDate()}`;
    } catch (e) {
      console.error('时间格式化错误:', e);
      return '时间错误';
    }
  }
});