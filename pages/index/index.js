// pages/index/index.js
const app = getApp();

Page({
  data: {
    // 用户信息
    userInfo: null,
    isLogin: false,
    isAdmin: false,
    isVillager: false,
    unreadCount: 0,
    departmentPendingCount: 0, // 管理员：部门待处理事务总数
    lastUpdate: 0, // 添加最后更新时间戳
    noticeList: [], // 乡镇公告列表
    
    // 反馈统计数据（仅登录后显示）
    totalFeedback: 0,
    processingFeedback: 0,
    doneFeedback: 0,
    satisfactionRate: 0,
    pendingTotal: 0,           // 管理员视图：待处理总数
    pendingManual: 0,          // 管理员视图：待人工分类
    pendingEvaluate: 0,        // 管理员视图：待评价
    evaluated: 0,              // 管理员视图：已评价
    completedTotal: 0,         // 管理员视图：已完成总数（用于进度条计算）
    progressWidth: 0,          // 进度条宽度百分比
    
    // 待处理数量（管理员用）
    pendingUserCount: 0, // 待审核用户数
    pendingFeedbackCount: 0, // 待分类反馈数
    
    // 加载状态
    isLoading: false,
    
    // 进度条宽度
    progressWidth: 0
  },

  onLoad() {
    console.log('首页加载');
    this.checkLoginStatus();
    
    // 注册存储变化监听，实现跨页面数据同步
    this.onStorageChange();
  },

  onShow() {
    console.log('首页显示');
    
    // 检查是否有其他页面更新了用户信息
    this.checkForUserInfoUpdate();
    
    this.checkLoginStatus(true); // 强制重新检查登录状态
    this.refreshAllData();

    // 如果是管理员，加载部门待处理数量
    if (this.data.isAdmin) {
      this.loadDepartmentPendingCount();
    }

    // 每次显示页面时重新加载未读消息数（仅村民）
    if (this.data.isVillager) {
      this.loadUnreadCount();
    }
  },

  // 通过比较本地存储中的时间戳，判断用户信息是否在其他页面被更新
  checkForUserInfoUpdate() {
    const lastUpdate = wx.getStorageSync('userInfoUpdated');
    const currentUpdate = this.data.lastUpdate || 0;
    
    if (lastUpdate > currentUpdate) {
      console.log('检测到用户信息更新，重新加载');
      this.setData({ lastUpdate: lastUpdate });
      this.checkLoginStatus(true);
    }
  },

  // 监听本地存储变化，当用户信息被其他页面修改时自动同步
  onStorageChange() {
    try {
      wx.onStorage({
        success: (res) => {
          if (res.key === 'userInfo' || res.key === 'userInfoUpdated') {
            console.log('用户信息存储变化:', res.key);
            this.checkLoginStatus(true);
            
            // 按角色重新加载相关数据
            if (this.data.isAdmin) {
              this.loadDepartmentPendingCount();
              this.loadPendingCounts();
            }
            if (this.data.isVillager) {
              this.loadUnreadCount();
            }
          }
        }
      });
    } catch (e) {
      console.log('监听存储变化失败:', e);
    }
  },

  // 获取部门待处理总数（管理员首页红点数据）
  loadDepartmentPendingCount() {
    if (!this.data.isAdmin) return;
    
    app.request({
      url: '/api/admin/department/pending-count',
      method: 'GET'
    }).then(res => {
      console.log('部门待处理数量响应:', res);
      this.setData({
        departmentPendingCount: res.total || 0
      });
    }).catch(err => {
      console.error('获取部门待处理数量失败:', err);
      // 降级方案：从待分类反馈接口获取总数
      this.getPendingCountFromOtherAPI();
    });
  },
  
  // 降级获取总数方法
  getPendingCountFromOtherAPI() {
    app.request({
      url: '/api/admin/feedbacks/pending-manual',
      data: { page: 1, per_page: 1 }
    }).then(res => {
      const total = res.pagination?.total || 0;
      this.setData({ departmentPendingCount: total });
    }).catch(() => {
      this.setData({ departmentPendingCount: 0 });
    });
  },
  
  // 跳转到部门待处理事务页面
  goToDepartmentPending() {
    if (!this.checkLoginAndShowModal()) return;
    if (!this.data.isAdmin) {
      wx.showToast({ title: '权限不足', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: '/pages/admin/department-pending/department-pending',  
      fail: (err) => {
        console.error('跳转失败:', err);
        wx.showToast({
          title: '页面不存在',
          icon: 'none'
        });
      }
    });
  },

  // 下拉刷新处理
  onPullDownRefresh() {
    this.refreshAllData().then(() => {
      wx.stopPullDownRefresh();
      wx.showToast({ title: '刷新成功', icon: 'success' });
    }).catch(() => {
      wx.stopPullDownRefresh();
    });
  },

  // 检查登录状态，整合全局数据和本地存储，统一处理字段兼容性
  checkLoginStatus(forceReload = false) {
    // 从全局数据获取
    const globalUserInfo = app.globalData.userInfo;
    
    // 从本地存储获取
    const storedUserInfo = wx.getStorageSync('userInfo');
    const storedToken = wx.getStorageSync('token');
    
    console.log('首页检查登录状态:', {
      globalUserInfo,
      storedUserInfo,
      storedToken,
      forceReload
    });
    
    // 强制刷新时优先使用本地存储，否则优先全局数据
    let userInfo = forceReload ? storedUserInfo : (storedUserInfo || globalUserInfo);
    const isLogin = !!(storedToken || app.globalData.isLogin);
    
    if (!userInfo) {
      userInfo = {};
    }
    
    // 统一字段名（兼容不同版本的用户信息结构），确保 name 和 real_name 都能正确显示
    if (userInfo) {
      // 如果只有 real_name 没有 name，设置 name
      if (userInfo.real_name && !userInfo.name) {
        userInfo.name = userInfo.real_name;
      }
      // 如果只有 name 没有 real_name，设置 real_name
      if (userInfo.name && !userInfo.real_name) {
        userInfo.real_name = userInfo.name;
      }
      
      // 同步昵称
      if (userInfo.nickname && !userInfo.nickname) {
        userInfo.nickname = userInfo.nickname;
      }
      
      // 同步地址相关字段
      if (userInfo.address && !userInfo.village) {
        userInfo.village = userInfo.address;
      }
      if (userInfo.village && !userInfo.address) {
        userInfo.address = userInfo.village;
      }
    }
    
    console.log('处理后的用户信息:', {
      name: userInfo.name,
      real_name: userInfo.real_name,
      nickname: userInfo.nickname,
      username: userInfo.username,
      user_type: userInfo.user_type
    });
    
    let isAdmin = false;
    let isVillager = false;
    
    if (userInfo) {
      if (userInfo.user_type === 'admin') {
        isAdmin = true;
      } else if (userInfo.user_type === 'villager') {
        isVillager = true;
      }
    }
    
    this.setData({
      userInfo: userInfo,
      isLogin: isLogin,
      isAdmin: isAdmin,
      isVillager: isVillager,
      unreadCount: app.globalData.unreadCount || 0
    }, () => {
      console.log('设置后的页面数据:', {
        userName: this.data.userInfo?.name || this.data.userInfo?.real_name || this.data.userInfo?.username,
        userType: this.data.userInfo?.user_type
      });
    });
  },

  //  刷新所有数据：公告（公共）、反馈统计（登录后）、管理员待处理数量（管理员登录后）
  refreshAllData() {
    if (this.data.isLoading) return Promise.reject();
    
    this.setData({ isLoading: true });
    
    // 公告数据无需登录
    const promises = [
      this.getNoticeList()
    ];
    
    // 只有登录后才获取需要认证的数据
    if (this.data.isLogin) {
      promises.push(this.getFeedbackStat());
      if (this.data.isAdmin) {
        promises.push(this.loadPendingCounts());
        promises.push(this.loadDepartmentPendingCount());
      }
    }
    
    return Promise.all(promises).then(() => {
      this.setData({ isLoading: false });
    }).catch((err) => {
      console.error('刷新数据失败:', err);
      this.setData({ isLoading: false });
      throw err;
    });
  },

  // 加载未读消息数（村民专用）
  loadUnreadCount() {
    if (!this.data.isVillager || !this.data.isLogin) return Promise.resolve();
    
    return app.request({
      url: '/api/messages',
      data: { 
        page: 1, 
        per_page: 1, 
        unread_only: true 
      }
    }).then(res => {
      console.log('未读消息响应:', res);
      const unreadCount = res.unread_count || 0;
      this.setData({ unreadCount: unreadCount });
      // 同步到全局，供其他页面（如 AI 助手）使用
      app.globalData.unreadCount = unreadCount;
      return res;
    }).catch(err => {
      console.error('加载未读消息失败:', err);
    });
  },

  // 加载待处理数量（管理员用）
  loadPendingCounts() {
    if (!this.data.isAdmin || !this.data.isLogin) return Promise.resolve();
    
    return app.request({
      url: '/api/admin/statistics',
      method: 'GET'
    }).then(res => {
      console.log('管理员统计数据:', res);
      this.setData({
        pendingUserCount: res.pending_users || 0,
        pendingFeedbackCount: res.pending_feedbacks || 0
      });
      return res;
    }).catch(err => {
      console.error('获取管理员统计失败:', err);
    });
  },

  // 获取乡镇公告（公共数据，不需要登录）
  getNoticeList() {
    return app.request({
      url: '/api/common/noticeList',
      data: { size: 3 }
    }).then((res) => {
      this.setData({ 
        noticeList: Array.isArray(res) ? res : (res.list || [])
      });
      return res;
    }).catch((err) => {
      console.error('获取公告列表失败:', err);
      throw err;
    });
  },

// 获取反馈统计数据（需要登录），管理员和村民得到的字段不同
getFeedbackStat() {
  return app.request({
    url: '/api/feedback/stat',
    method: 'GET'
  }).then((res) => {
    const isAdmin = this.data.isAdmin;
    
    if (isAdmin) {
      // 管理员视图：展示全部反馈的流转状态
      const progressWidth = res.total > 0 ? (res.completed_total / res.total) * 100 : 0;
      this.setData({
        totalFeedback: res.total || 0,
        pendingTotal: res.pending_total || 0,      // 待处理总数
        pendingManual: res.pending_manual || 0,    // 待分类
        processingFeedback: res.processing || 0,    // 处理中
        pendingEvaluate: res.pending_evaluate || 0, // 待评价
        evaluated: res.evaluated || 0,              // 已评价
        completedTotal: res.completed_total || 0,   // 已完成总数
        satisfactionRate: res.satisfactionRate || 0,
        progressWidth: progressWidth
      });
      console.log('管理员统计数据:', {
        总反馈: res.total,
        待处理: res.pending_total,
        待分类: res.pending_manual,
        处理中: res.processing,
        待评价: res.pending_evaluate,
        已评价: res.evaluated,
        满意度: res.satisfactionRate
      });
    } else {
      // 村民视图：只展示本人提交的反馈概况
      const progressWidth = res.total > 0 ? (res.completed / res.total) * 100 : 0;
      this.setData({
        totalFeedback: res.total || 0,               // 本人提交的反馈总数
        processingFeedback: res.processing || 0,     // 处理中的数量
        doneFeedback: res.completed || 0,            // 已完成（包含已评价）的数量
        satisfactionRate: res.satisfactionRate || 0, // 本人的满意度评分
        progressWidth: progressWidth                 // 处理完成进度百分比
      });
    }
    return res;
  }).catch((err) => {
    console.error('获取反馈统计失败:', err);
    throw err;
  });
},

  // 前往登录页
  goToLogin() {
    wx.navigateTo({ url: '/pages/login/login' });
  },

  // 前往我的页面（用于未登录引导）
  goToMyPage() {
    wx.switchTab({
      url: '/pages/my/my'
    });
  },

  // 检查登录状态，未登录时弹出强制登录提示
  checkLoginAndShowModal() {
    if (!this.data.isLogin) {
      wx.showModal({
        title: '提示',
        content: '请先登录后再使用此功能',
        confirmText: '去登录',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            this.goToMyPage();
          }
        }
      });
      return false;
    }
    return true;
  },

  // 前往消息中心（村民专用）
  goToMessage() {
    if (!this.data.isLogin) {
      this.checkLoginAndShowModal();
      return;
    }
    
    // 只有村民才能进入消息中心
    if (!this.data.isVillager) {
      wx.showToast({ title: '权限不足', icon: 'none' });
      return;
    }
    
    wx.navigateTo({
      url: '/pages/message/message',
      success: () => {
        console.log('跳转到消息中心成功');
      },
      fail: (err) => {
        console.error('跳转失败:', err);
        wx.showToast({
          title: '页面不存在',
          icon: 'none'
        });
      }
    });
  },

  // 前往待审核用户（管理员专用）
  goToPendingUsers() {
    if (!this.checkLoginAndShowModal()) return;
    if (!this.data.isAdmin) {
      wx.showToast({ title: '权限不足', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/admin/pending-users/pending-users' });
  },

  // 前往待分类反馈（管理员专用）
  goToPendingFeedbacks() {
    if (!this.checkLoginAndShowModal()) return;
    if (!this.data.isAdmin) {
      wx.showToast({ title: '权限不足', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/admin/pending-feedbacks/pending-feedbacks' });
  },

  // 点击公告卡片查看详情（弹窗展示）
  goToNoticeDetail(e) {
    if (this.data.noticeList.length === 0) return;
    const index = e.currentTarget.dataset.index || 0;
    const notice = this.data.noticeList[index];
    
    wx.showModal({
      title: notice.title,
      content: notice.content || '暂无详细内容',
      showCancel: false
    });
  },

  // 前往提交反馈页面（需要登录）
  goToSubmitFeedback() {
    if (!this.checkLoginAndShowModal()) return;
    
    wx.switchTab({ 
      url: '/pages/feedback/submit/submit',
      success: () => {
        console.log('跳转到反馈提交页面成功');
      },
      fail: (err) => {
        console.error('跳转失败:', err);
        wx.showToast({
          title: '跳转失败',
          icon: 'none'
        });
      }
    });
  },

  // 前往反馈列表（需要登录）
  goToFeedbackList() {
    if (!this.checkLoginAndShowModal()) return;
    wx.navigateTo({ url: '/pages/feedback/list/list' });
  },

  // 前往满意度评价界面（需要登录）
  goToEvaluate() {
    if (!this.checkLoginAndShowModal()) return;
    
    wx.navigateTo({
      url: '/pages/evaluate/evaluate',
      success: () => {
        console.log('跳转到满意度评价页面成功');
      },
      fail: (err) => {
        console.error('跳转失败:', err);
        wx.showToast({
          title: '满意度评价页面不存在',
          icon: 'none'
        });
      }
    });
  },

  // 前往AI对话界面（需要登录）
  goToAiConsult() {
    if (!this.checkLoginAndShowModal()) return;
    
    wx.navigateTo({
      url: '/pages/ai/ai',
      success: () => {
        console.log('跳转到AI咨询页面成功');
      },
      fail: (err) => {
        console.error('跳转失败:', err);
        wx.showToast({
          title: 'AI咨询页面不存在',
          icon: 'none'
        });
      }
    });
  },

  // 查看所有公告（弹窗列表）
  viewAllNotices() {
    const noticeText = this.data.noticeList.map((item, index) => 
      `${index + 1}. ${item.title} (${item.date})`
    ).join('\n\n');
    
    wx.showModal({
      title: '所有公告',
      content: noticeText || '暂无公告',
      showCancel: false
    });
  },

  // 手动刷新按钮
  handleRefresh() {
    this.refreshAllData();
    if (this.data.isVillager) {
      this.loadUnreadCount();
    }
    // 强制重新检查用户信息
    this.checkLoginStatus(true);
  },

  // 退出登录
  logout() {
    wx.showModal({
      title: '提示',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          app.logout();
        }
      }
    });
  },
});