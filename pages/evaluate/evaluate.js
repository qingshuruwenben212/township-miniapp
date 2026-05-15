// pages/evaluate/evaluate.js
const app = getApp();

Page({
  data: {
    completedFeedbacks: [],     // 已完成反馈列表
    isLoading: false,           // 是否正在加载
    page: 1,                   // 当前页码
    size: 10,                  // 每页数量
    hasMore: true,             // 是否还有更多数据
    totalCount: 0,             // 已完成总数
    evaluatedCount: 0,         // 已评价数量
    pendingEvaluateCount: 0,   // 待评价数量
    
    // 评价弹窗相关
    showEvaluateModal: false,   // 是否显示评价弹窗
    currentFeedback: null,      // 当前正在评价的反馈对象
    rating: 0,                  // 当前选择的评分（1-5）
    comment: '',                // 评价文字内容
    isSubmitting: false         // 是否正在提交评价
  },

  onLoad() {
    console.log('满意度评价页面加载');
    this.checkLoginStatus();
  },

  onShow() {
    this.checkLoginStatus();
    // 每次显示页面都重新加载数据，确保数据最新
    this.loadCompletedFeedbacks(true);
  },

  onPullDownRefresh() {
    this.loadCompletedFeedbacks(true).then(() => {
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom() {
    this.loadMore();
  },

  // 检查登录状态，未登录时引导去登录
  checkLoginStatus() {
    const token = app.globalData.token || wx.getStorageSync('token');
    const isLogin = !!token;
    
    if (!isLogin) {
      wx.showModal({
        title: '提示',
        content: '请先登录后再使用此功能',
        confirmText: '去登录',
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({
              url: '/pages/login/login'
            });
          } else {
            wx.navigateBack();
          }
        }
      });
      return false;
    }
    return true;
  },

  // 加载已完成反馈列表
  loadCompletedFeedbacks(reset = false) {
    // 重置时清空已有数据，从第一页重新加载
    if (reset) {
      this.setData({
        page: 1,
        completedFeedbacks: [],
        hasMore: true
      });
    }

    const { page, size, isLoading, hasMore } = this.data;
    
    if (isLoading || !hasMore) return Promise.resolve();
    
    this.setData({ isLoading: true });
    
    const token = wx.getStorageSync('token') || app.globalData.token;
    
    return new Promise((resolve, reject) => {
      wx.request({
        url: `${app.globalData.baseUrl || 'http://localhost:5000'}/api/feedback/list`,
        method: 'GET',
        header: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        data: {
          page: page,
          per_page: size,
          status: 'completed' // 只获取已完成的反馈
        },
        success: (res) => {
          if (res.data && res.data.code === 200) {
            const responseData = res.data.data || {};
            const feedbacks = responseData.feedbacks || [];
            const pagination = responseData.pagination || {};
            
            // 将接口数据转为页面需要的格式
            const formattedFeedbacks = feedbacks.map(item => {
              return {
                id: item.id,
                title: item.title || '无标题',
                content: item.content || '',
                category: item.category,
                status: item.status_display || '已完成',
                createTime: this.formatDateTime(item.created_at),
                completeTime: this.formatDateTime(item.processed_at) || '未知',
                // 处理部门名称：优先 dept_name，其次按 dept_id 映射
                deptName: item.dept_name || 
                         (item.dept_id ? this.getDeptNameById(item.dept_id) : '待派单'),
                hasEvaluated: item.has_evaluated || false,
                rating: item.rating || 0,
                comment: item.comment || ''
              };
            });
            
            const newList = page === 1 ? formattedFeedbacks : [...this.data.completedFeedbacks, ...formattedFeedbacks];
            const hasMore = formattedFeedbacks.length === size;
            
            // 统计已评价和待评价数量
            let evaluatedCount = 0;
            let pendingEvaluateCount = 0;
            for (let i = 0; i < newList.length; i++) {
              if (newList[i].hasEvaluated) {
                evaluatedCount++;
              } else {
                pendingEvaluateCount++;
              }
            }
            
            this.setData({
              completedFeedbacks: newList,
              hasMore: hasMore,
              totalCount: pagination.total || newList.length,
              evaluatedCount: evaluatedCount,
              pendingEvaluateCount: pendingEvaluateCount,
              isLoading: false,
              page: page + 1
            });
            
            resolve();
          } else {
            this.setData({ isLoading: false });
            reject(new Error(res.data?.message || '加载失败'));
          }
        },
        fail: (err) => {
          this.setData({ isLoading: false });
          reject(err);
        }
      });
    });
  },

  // 根据部门ID获取部门中文名称（部门名映射备用方案）
  getDeptNameById(deptId) {
    const deptNames = {
      'agriculture': '农业服务部',
      'infrastructure': '基建维修部',
      'environment': '环境整治部',
      'health': '医疗卫生部',
      'civil': '民政服务部',
      'general': '综合服务部'
    };
    return deptNames[deptId] || '待派单';
  },

  // 上拉加载更多
  loadMore() {
    this.loadCompletedFeedbacks();
  },

  // 格式化日期时间（显示年月日时分）
  formatDateTime(dateTimeStr) {
    if (!dateTimeStr) return '未知';
    
    try {
      const date = new Date(dateTimeStr);
      if (isNaN(date.getTime())) return dateTimeStr;
      
      // 北京时间修正（UTC+8）
      const beijingTime = new Date(date.getTime() + 8 * 60 * 60 * 1000);
      const year = beijingTime.getFullYear();
      const month = String(beijingTime.getMonth() + 1).padStart(2, '0');
      const day = String(beijingTime.getDate()).padStart(2, '0');
      const hour = String(beijingTime.getHours()).padStart(2, '0');
      const minute = String(beijingTime.getMinutes()).padStart(2, '0');
      
      return `${year}-${month}-${day} ${hour}:${minute}`;
    } catch (e) {
      return dateTimeStr;
    }
  },

  // 打开评价弹窗：对未评价的反馈显示打分界面，已评价的则显示已有评分
  openEvaluateModal(e) {
    const feedback = e.currentTarget.dataset.feedback;
    
    if (feedback.hasEvaluated) {
      // 已评价：仅展示之前的评价，不可修改
      let stars = '';
      for (let i = 0; i < feedback.rating; i++) { stars += '★'; }
      for (let i = feedback.rating; i < 5; i++) { stars += '☆'; }
      
      wx.showModal({
        title: '已评价',
        content: `您已经评价过了\n评分：${stars}\n评价：${feedback.comment || '无'}`,
        showCancel: false,
        confirmText: '知道了'
      });
      return;
    }
    
    // 未评价：打开评价弹窗，重置星级和评价文字
    this.setData({
      showEvaluateModal: true,
      currentFeedback: feedback,
      rating: 0,
      comment: ''
    });
  },

  // 关闭评价弹窗
  closeEvaluateModal() {
    this.setData({
      showEvaluateModal: false,
      currentFeedback: null,
      rating: 0,
      comment: ''
    });
  },

  // 点击星星选择评分
  selectRating(e) {
    const rating = e.currentTarget.dataset.rating;
    this.setData({ rating: rating });
  },

  // 输入评价内容
  onCommentInput(e) {
    this.setData({ comment: e.detail.value });
  },

  // 提交评价：调用后端接口，成功后更新本地列表统计
  submitEvaluation() {
    const { currentFeedback, rating, comment, isSubmitting } = this.data;
    
    if (!currentFeedback) return;
    
    if (rating === 0) {
      wx.showToast({ title: '请选择评分', icon: 'none' });
      return;
    }
    
    if (isSubmitting) return;
    
    this.setData({ isSubmitting: true });
    wx.showLoading({ title: '提交中...' });
    
    const token = wx.getStorageSync('token') || app.globalData.token;
    
    wx.request({
      url: `${app.globalData.baseUrl || 'http://localhost:5000'}/api/feedback/${currentFeedback.id}/evaluate`,
      method: 'POST',
      header: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      data: {
        rating: rating,
        comment: comment
      },
      success: (res) => {
        wx.hideLoading();
        
        if (res.data && res.data.code === 200) {
          wx.showToast({ title: '评价成功', icon: 'success' });
          
          // 更新本地列表中该反馈的评价状态
          const updatedFeedbacks = this.data.completedFeedbacks.map(item => {
            if (item.id === currentFeedback.id) {
              return { ...item, hasEvaluated: true, rating: rating, comment: comment };
            }
            return item;
          });
          
          // 重新计算统计数据
          let evaluatedCount = 0;
          let pendingEvaluateCount = 0;
          for (let i = 0; i < updatedFeedbacks.length; i++) {
            if (updatedFeedbacks[i].hasEvaluated) evaluatedCount++;
            else pendingEvaluateCount++;
          }
          
          this.setData({
            completedFeedbacks: updatedFeedbacks,
            evaluatedCount: evaluatedCount,
            pendingEvaluateCount: pendingEvaluateCount,
            showEvaluateModal: false,
            currentFeedback: null,
            rating: 0,
            comment: '',
            isSubmitting: false
          });
        } else {
          this.setData({ isSubmitting: false });
          wx.showToast({ title: res.data?.message || '提交失败', icon: 'none' });
        }
      },
      fail: (err) => {
        wx.hideLoading();
        this.setData({ isSubmitting: false });
        console.error('提交评价失败:', err);
        wx.showToast({ title: '网络错误', icon: 'none' });
      }
    });
  },

  // 查看反馈详情
  viewFeedbackDetail(e) {
    const feedbackId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/feedback/detail/detail?id=${feedbackId}`,
      fail: () => {
        wx.showToast({ title: '详情页不存在', icon: 'none' });
      }
    });
  },

  // 手动刷新
  handleRefresh() {
    this.loadCompletedFeedbacks(true);
  },

  // 返回上一页
  goBack() {
    wx.navigateBack();
  }
});