// pages/my/my.js
const app = getApp();

Page({
  data: {
    userInfo: {},           // 当前展示的用户信息对象
    isLogin: false,         // 登录状态
    menuItems: [            // 功能菜单列表
      { 
        icon: '📋', 
        name: '我的反馈', 
        url: '/pages/feedback/list/list' 
      },
      { 
        icon: '⚙️', 
        name: '账号设置', 
        url: '/pages/feedback/settings/settings' 
      },
    ]
  },

  onLoad() {
    console.log('我的页面加载');
    // 首次进入时根据全局/本地存储同步用户信息
    this.updateUserInfo();
  },

  onShow() {
    console.log('我的页面显示');
    // 每次显示都重新同步，确保信息最新
    this.updateUserInfo();
  },

  // 更新用户信息：按 全局 > 本地存储 > 默认未登录 的优先级获取并在必要时将本地存储数据恢复到全局
  updateUserInfo() {
    console.log('=== 更新用户信息 ===');
    
    // 1. 检查全局状态
    console.log('全局登录状态:', app.globalData.isLogin);
    console.log('全局用户信息:', app.globalData.userInfo);
    
    // 2. 检查本地存储
    console.log('本地存储 isLogin:', wx.getStorageSync('isLogin'));
    console.log('本地存储 userInfo:', wx.getStorageSync('userInfo'));
    
    // 3. 确定最终的登录状态和用户信息
    let finalIsLogin = false;
    let finalUserInfo = {};
    
    // 优先使用全局数据
    if (app.globalData.isLogin && app.globalData.userInfo) {
      finalIsLogin = true;
      finalUserInfo = app.globalData.userInfo;
      console.log('使用全局数据');
    } 
    // 如果全局数据为空，尝试从本地存储恢复
    else if (wx.getStorageSync('isLogin')) {
      const storedUserInfo = wx.getStorageSync('userInfo');
      if (storedUserInfo) {
        finalIsLogin = true;
        finalUserInfo = storedUserInfo;
        // 将本地数据写回全局，避免其他页面获取不到
        app.globalData.isLogin = true;
        app.globalData.userInfo = storedUserInfo;
        console.log('从本地存储恢复数据');
      }
    } 
    // 都不存在则使用默认未登录状态
    else {
      finalIsLogin = false;
      finalUserInfo = {
        nickname: '未登录用户',
        avatar: '/images/default-avatar.png',
        region: '未定位',
        role: 'user'
      };
      console.log('使用默认未登录状态');
    }
    
    console.log('最终状态 - isLogin:', finalIsLogin);
    console.log('最终状态 - userInfo:', finalUserInfo);
    
    // 更新页面数据
    this.setData({
      isLogin: finalIsLogin,
      userInfo: finalUserInfo
    });
  },

  // 手动刷新用户信息
  refreshUserInfo() {
    console.log('刷新用户信息');
    this.updateUserInfo();
    wx.showToast({
      title: '已刷新',
      icon: 'success'
    });
  },

  // 跳转到登录页面
  goToLogin() {
    console.log('跳转到登录页面');
    wx.navigateTo({
      url: '/pages/login/login'
    });
  },
  
  // 退出登录：清理本地存储、重置全局状态、更新页面数据
  handleLogout() {
    wx.showModal({
      title: '确认退出',
      content: '确定要退出登录吗？退出后需要重新登录。',
      success: (res) => {
        if (res.confirm) {
          // 清除本地存储
          wx.removeStorageSync('token');
          wx.removeStorageSync('userInfo');
          wx.removeStorageSync('isLogin');
          
          // 重置全局状态
          app.globalData.token = '';
          app.globalData.isLogin = false;
          app.globalData.userInfo = {
            nickname: '未登录用户',
            avatar: '/images/default-avatar.png',
            region: '未定位',
            role: 'user'
          };
          
          // 更新页面状态
          this.setData({
            isLogin: false,
            userInfo: {
              nickname: '未登录用户',
              avatar: '/images/default-avatar.png',
              region: '未定位',
              role: 'user'
            }
          });
          
          wx.showToast({
            title: '已退出登录',
            icon: 'success'
          });
          
          console.log('退出登录成功');
        }
      }
    });
  },
  
  // 导航到其他页面
  navigateTo(e) {
    const url = e.currentTarget.dataset.url;
    if (!this.data.isLogin) {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      });
      return;
    }
    
    console.log('导航到:', url);
    wx.navigateTo({
      url: url
    });
  },
  
  // 开发调试：在控制台打印所有登录相关状态和数据
  showDebugInfo() {
    console.log('=== 调试信息 ===');
    console.log('页面数据:', this.data);
    console.log('全局数据:', app.globalData);
    console.log('本地存储:');
    console.log('- token:', wx.getStorageSync('token'));
    console.log('- isLogin:', wx.getStorageSync('isLogin'));
    console.log('- userInfo:', wx.getStorageSync('userInfo'));
  }
});