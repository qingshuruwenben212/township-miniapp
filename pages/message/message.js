// pages/message/message.js
const app = getApp();

Page({
  data: {
    messages: [],          // 当前消息列表
    page: 1,               // 当前加载的页码
    perPage: 20,           // 每页消息数量
    hasMore: true,         // 是否还有更多数据可加载
    isLoading: false,      // 是否正在加载
    unreadCount: 0,        // 未读消息总数
    // 添加缓存标记，避免重复加载
    loadedPages: {}  // 记录已加载的页码
  },

  onLoad() {
    console.log('消息页面加载');
    // 每次从入口进入时重置所有状态，避免显示旧数据
    this.setData({
      page: 1,
      messages: [],
      hasMore: true,
      loadedPages: {}
    }, () => {
      this.loadMessages();      // 加载消息列表
      this.loadUnreadCount();   // 独立获取未读总数
    });
  },

  onShow() {
    console.log('消息页面显示');
    // 每次显示时只重新加载未读数量，不重新加载整个列表
    this.loadUnreadCount();
    
    // 可以选择只刷新第一页来获取最新消息
    // 但为了避免重复，只更新未读状态
    this.refreshReadStatus();
  },

  onPullDownRefresh() {
    // 下拉刷新：重置到第一页并清空缓存页码
    this.setData({ 
      page: 1, 
      messages: [],
      hasMore: true,
      loadedPages: {}
    }, () => {
      Promise.all([
        this.loadMessages(),
        this.loadUnreadCount()
      ]).then(() => {
        wx.stopPullDownRefresh();
      }).catch(() => {
        wx.stopPullDownRefresh();
      });
    });
  },

  // 刷新已读状态：通过获取所有未读消息ID，反向更新当前列表的 is_read 字段
  refreshReadStatus() {
    // 只请求未读消息的ID列表
    app.request({
      url: '/api/messages',
      data: {
        page: 1,
        per_page: 100,  // 获取足够多的消息
        unread_only: true
      }
    }).then(res => {
      const unreadMessages = res.messages || [];
      const unreadIds = new Set(unreadMessages.map(msg => msg.id));
      
      // 更新现有消息的已读状态
      const messages = this.data.messages.map(msg => ({
        ...msg,
        is_read: !unreadIds.has(msg.id)
      }));
      
      this.setData({ messages });
    }).catch(err => {
      console.error('刷新消息状态失败:', err);
    });
  },

  // 加载消息列表
  loadMessages() {
    // 没有更多数据且非首页时直接返回
    if (!this.data.hasMore && this.data.page > 1) {
      console.log('没有更多数据');
      return Promise.resolve();
    }

    // 检查这一页是否已经加载过，避免重复加载已经加载过的页码
    if (this.data.loadedPages[this.data.page]) {
      console.log(`第 ${this.data.page} 页已加载，跳过`);
      return Promise.resolve();
    }

    this.setData({ isLoading: true });

    console.log(`加载第 ${this.data.page} 页数据`);

    return app.request({
      url: '/api/messages',
      data: {
        page: this.data.page,
        per_page: this.data.perPage
      }
    }).then(res => {
      console.log('消息列表响应:', res);
      
      const newMessages = res.messages || [];
      const pagination = res.pagination || {};
      
      // 处理消息，确保字段完整
      const processedMessages = newMessages.map(msg => ({
        ...msg,
        is_read: msg.is_read === true,
        // 添加本地缓存时间戳，用于去重
        _loadedAt: Date.now()
      }));
      
      // 去重处理（防止重复消息）
      const existingIds = new Set(this.data.messages.map(m => m.id));
      const uniqueNewMessages = processedMessages.filter(msg => !existingIds.has(msg.id));
      
      console.log(`新增 ${uniqueNewMessages.length} 条不重复消息`);
      
      const mergedMessages = this.data.page === 1 
        ? uniqueNewMessages 
        : [...this.data.messages, ...uniqueNewMessages];
      
      const hasMore = newMessages.length === this.data.perPage;
      
      // 记录这一页已加载
      const loadedPages = this.data.loadedPages;
      loadedPages[this.data.page] = true;
      
      this.setData({
        messages: mergedMessages,
        hasMore: hasMore,
        page: this.data.page + 1,    // 页码+1，供下次加载使用
        loadedPages: loadedPages,
        isLoading: false
      });
      
      return res;
    }).catch(err => {
      console.error('加载消息失败:', err);
      this.setData({ isLoading: false });
      throw err;
    });
  },

  // 加载未读消息数量
  loadUnreadCount() {
    app.request({
      url: '/api/messages',
      data: {
        page: 1,
        per_page: 1,  // 只需要 unread_count 字段，不关心具体列表
        unread_only: true
      }
    }).then(res => {
      const unreadCount = res.unread_count || 0;
      this.setData({ unreadCount: unreadCount });
      
      // 同步到全局，供首页等页面显示红点
      if (app.globalData) {
        app.globalData.unreadCount = unreadCount;
      }
    }).catch(err => {
      console.error('加载未读计数失败:', err);
    });
  },

  // 点击单条消息标记为已读
  markAsRead(e) {
    const { id, index } = e.currentTarget.dataset;
    const message = this.data.messages[index];
    
    // 如果已经已读，不重复标记
    if (message.is_read) return;
    
    // 乐观更新：先更新UI
    const key = `messages[${index}].is_read`;
    this.setData({ [key]: true });
    
    // 同步更新未读计数
    const newUnreadCount = Math.max(0, this.data.unreadCount - 1);
    this.setData({ unreadCount: newUnreadCount });
    
    if (app.globalData) {
      app.globalData.unreadCount = newUnreadCount;
    }
    
    // 调用后端接口标记已读
    app.request({
      url: `/api/messages/${id}/read`,
      method: 'PUT'
    }).then(res => {
      console.log('标记已读成功:', res);
    }).catch(err => {
      console.error('标记已读失败:', err);
      // 失败时回滚UI状态
      this.setData({ [key]: false });
      this.loadUnreadCount(); // 重新加载正确的未读计数
    });
  },

  // 全部标记为已读
  markAllRead() {
    wx.showModal({
      title: '提示',
      content: '确定要将所有消息标记为已读吗？',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '处理中...' });
          
          app.request({
            url: '/api/messages/read-all',
            method: 'PUT'
          }).then(() => {
            wx.hideLoading();
            
            // 同步更新所有消息状态
            const messages = this.data.messages.map(msg => ({
              ...msg,
              is_read: true
            }));
            
            this.setData({
              messages: messages,
              unreadCount: 0
            });
            
            // 同步更新全局未读计数
            if (app.globalData) {
              app.globalData.unreadCount = 0;
            }
            
            wx.showToast({ title: '已全部标记为已读', icon: 'success' });
          }).catch((err) => {
            wx.hideLoading();
            console.error('全部标记已读失败:', err);
            wx.showToast({ title: '操作失败', icon: 'none' });
          });
        }
      }
    });
  },

  // 删除单条消息
  deleteMessage(e) {
    const { id, index } = e.currentTarget.dataset;
    const message = this.data.messages[index];
    
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这条消息吗？',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...' });
          
          app.request({
            url: `/api/messages/${id}/delete`,
            method: 'DELETE'
          }).then(() => {
            wx.hideLoading();
            
            // 从列表中移除
            const messages = [...this.data.messages];
            messages.splice(index, 1);
            
            // 如果删除的是未读消息，更新未读计数
            let unreadCount = this.data.unreadCount;
            if (!message.is_read) {
              unreadCount = Math.max(0, unreadCount - 1);
            }
            
            this.setData({
              messages: messages,
              unreadCount: unreadCount
            });
            
            // 更新全局未读计数
            if (app.globalData) {
              app.globalData.unreadCount = unreadCount;
            }
            
            wx.showToast({ title: '删除成功', icon: 'success' });
          }).catch((err) => {
            wx.hideLoading();
            console.error('删除失败:', err);
            wx.showToast({ title: '删除失败', icon: 'none' });
          });
        }
      }
    });
  },

  // 上拉触底加载更多
  loadMore() {
    if (this.data.hasMore && !this.data.isLoading) {
      this.loadMessages();
    }
  },

  // 格式化时间（今天/昨天/今年内/往年）
  formatTime(timeStr) {
    if (!timeStr) return '';
    
    try {
      const date = new Date(timeStr);
      if (isNaN(date.getTime())) return timeStr;
      
      const now = new Date();
      const diff = now - date;
      
      // 今天的消息显示
      if (date.toDateString() === now.toDateString()) {
        return `今天 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
      }
      
      // 昨天的消息显示
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      if (date.toDateString() === yesterday.toDateString()) {
        return `昨天 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
      }
      
      // 今年的消息显示
      if (date.getFullYear() === now.getFullYear()) {
        return `${date.getMonth()+1}-${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
      }
      
      // 往年的消息显示（只显示日期）
      return `${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}`;
    } catch (e) {
      console.error('时间格式化错误:', e);
      return timeStr;
    }
  }
});