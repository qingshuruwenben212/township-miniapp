// pages/admin/pending-users.js
// 待审核用户页面（管理员专用）：管理新注册用户的审核，支持通过和拒绝操作
// 涉及接口：
//   - /api/admin/users/pending (GET)    获取待审核用户列表
//   - /api/admin/users/{id}/approve (POST) 通过审核
//   - /api/admin/users/{id}/reject (POST)  拒绝审核（可填写拒绝原因）

const app = getApp();

Page({
  data: {
    pendingUsers: [],    // 待审核用户列表
    page: 1,             // 当前页码
    perPage: 20,         // 每页数量
    hasMore: true,       // 是否还有更多数据
    isLoading: false,    // 是否正在加载
    totalCount: 0        // 待审核用户总数
  },

  onLoad() {
    console.log('待审核用户页面加载');
    this.setData({ page: 1, pendingUsers: [] }, () => {
      this.loadPendingUsers();
    });
  },

  onShow() {
    console.log('待审核用户页面显示');
    // 每次显示时重新加载第一页，确保数据最新
    this.setData({ page: 1, pendingUsers: [] }, () => {
      this.loadPendingUsers();
    });
  },

  onPullDownRefresh() {
    // 下拉刷新：重置并重新加载
    this.setData({ page: 1, pendingUsers: [], hasMore: true }, () => {
      this.loadPendingUsers().then(() => {
        wx.stopPullDownRefresh();
      }).catch(() => {
        wx.stopPullDownRefresh();
      });
    });
  },

  // 加载待审核用户列表（分页）
  loadPendingUsers() {
    if (!this.data.hasMore && this.data.page > 1) {
      console.log('没有更多数据');
      return Promise.resolve();
    }

    this.setData({ isLoading: true });
    console.log(`加载第 ${this.data.page} 页数据`);

    return app.request({
      url: '/api/admin/users/pending',
      data: {
        page: this.data.page,
        per_page: this.data.perPage
      }
    }).then(res => {
      console.log('待审核用户原始响应:', res);
      
      // 兼容 res.data 和直接返回的数据格式
      const responseData = res.data || res;
      const newUsers = responseData.users || [];
      const pagination = responseData.pagination || {};
      
      // 预处理时间格式，保证展示统一
      const processedUsers = newUsers.map(user => ({
        ...user,
        displayTime: this.formatTime(user.created_at)
      }));
      
      // 合并数据：第一页替换，后续页追加
      const currentUsers = this.data.pendingUsers;
      const mergedUsers = this.data.page === 1 ? processedUsers : [...currentUsers, ...processedUsers];
      
      const hasMore = newUsers.length === this.data.perPage;
      
      this.setData({
        pendingUsers: mergedUsers,
        hasMore: hasMore,
        totalCount: pagination.total || mergedUsers.length,
        isLoading: false
      });

      console.log(`当前共有 ${mergedUsers.length} 条待审核用户`);

      if (mergedUsers.length === 0) {
        wx.showToast({ title: '暂无待审核用户', icon: 'none' });
      }
    }).catch(err => {
      console.error('加载待审核用户失败:', err);
      this.setData({ isLoading: false });
      
      // 加载失败提供重试入口
      wx.showModal({
        title: '加载失败',
        content: '网络异常，请稍后重试',
        confirmText: '重试',
        success: (res) => {
          if (res.confirm) {
            this.loadPendingUsers();
          }
        }
      });
    });
  },

  // 上拉加载更多
  loadMore() {
    if (this.data.hasMore && !this.data.isLoading) {
      this.setData({ page: this.data.page + 1 }, () => {
        this.loadPendingUsers();
      });
    }
  },

  // 手动刷新按钮
  handleRefresh() {
    this.setData({ page: 1, pendingUsers: [], hasMore: true }, () => {
      this.loadPendingUsers();
    });
  },

  // 弹窗展示用户详细信息
  showUserDetail(e) {
    const user = e.currentTarget.dataset.user;
    wx.showModal({
      title: '用户详情',
      content: `姓名：${user.real_name}\n账号：${user.username}\n电话：${user.phone}\n地址：${user.address}\n注册时间：${this.formatTime(user.created_at)}`,
      showCancel: false
    });
  },

  // 通过审核
  approveUser(e) {
    const userId = e.currentTarget.dataset.id;
    const userName = e.currentTarget.dataset.name;

    wx.showModal({
      title: '确认通过',
      content: `确定要通过用户 "${userName}" 的注册申请吗？`,
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '处理中...' });
          
          app.request({
            url: `/api/admin/users/${userId}/approve`,
            method: 'POST'
          }).then(() => {
            wx.hideLoading();
            wx.showToast({ title: '已通过审核', icon: 'success' });
            
            // 审核后重新加载列表
            this.setData({ page: 1, pendingUsers: [] }, () => {
              this.loadPendingUsers();
            });
          }).catch((err) => {
            wx.hideLoading();
            console.error('审核失败:', err);
            wx.showToast({ title: '审核失败', icon: 'none' });
          });
        }
      }
    });
  },

  // 拒绝审核（可输入拒绝原因）
  rejectUser(e) {
    const userId = e.currentTarget.dataset.id;
    const userName = e.currentTarget.dataset.name;

    wx.showModal({
      title: '确认拒绝',
      content: `确定要拒绝用户 "${userName}" 的注册申请吗？`,
      editable: true,
      placeholderText: '请输入拒绝原因（选填）',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '处理中...' });
          
          app.request({
            url: `/api/admin/users/${userId}/reject`,
            method: 'POST',
            data: { reason: res.content || '未通过审核' }
          }).then(() => {
            wx.hideLoading();
            wx.showToast({ title: '已拒绝申请', icon: 'success' });
            
            // 拒绝后重新加载列表
            this.setData({ page: 1, pendingUsers: [] }, () => {
              this.loadPendingUsers();
            });
          }).catch((err) => {
            wx.hideLoading();
            console.error('拒绝失败:', err);
            wx.showToast({ title: '操作失败', icon: 'none' });
          });
        }
      }
    });
  },

  // 格式化时间为 YYYY-MM-DD HH:mm
  formatTime(timeStr) {
    if (!timeStr) return '未知';
    
    try {
      let date;
      if (typeof timeStr === 'string') {
        date = new Date(timeStr);
      } else if (timeStr instanceof Date) {
        date = timeStr;
      } else {
        return '时间格式错误';
      }
      
      if (isNaN(date.getTime())) {
        console.warn('无效的时间格式:', timeStr);
        return timeStr;
      }
      
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      
      return `${year}-${month}-${day} ${hours}:${minutes}`;
    } catch (e) {
      console.error('时间格式化错误:', e, timeStr);
      return timeStr || '未知';
    }
  }
});