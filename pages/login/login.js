// pages/login/login.js
const app = getApp();

Page({
  data: {
    username: '',
    password: '',
    userType: 'villager',         // 当前选中的用户类型，默认村民
    userTypeIndex: 0,             // 用户类型选择器的索引
    selectedTypeName: '请选择身份',// 选择器显示的文字
    userTypes: [
      { name: '普通村民', value: 'villager' },
      { name: '管理员', value: 'admin' }
    ],
    isLoading: false              // 是否正在登录（防重复提交）
  },

  onLoad() {
    console.log('login页面加载');
    // 初始化默认选择第一个身份
    this.setData({
      selectedTypeName: this.data.userTypes[0].name
    });
    
    // 如果已登录，直接跳转到首页
    if (app.globalData.isLogin) {
      console.log('已登录，直接跳转首页');
      wx.reLaunch({
        url: '/pages/index/index'
      });
    }
  },

  // 监听账号输入框内容变化
  handleUsernameInput(e) {
    console.log('账号输入:', e.detail.value);
    this.setData({
      username: e.detail.value.trim()
    });
  },

  // 监听密码输入框内容变化
  handlePasswordInput(e) {
    console.log('密码输入:', e.detail.value);
    this.setData({
      password: e.detail.value
    });
  },

  // 用户类型选择
  handleUserTypeChange(e) {
    console.log('选择身份:', e.detail.value);
    const index = e.detail.value;
    this.setData({
      userTypeIndex: index,
      userType: this.data.userTypes[index].value,
      selectedTypeName: this.data.userTypes[index].name
    });
  },

  // 登录按钮点击
  handleLogin() {
    console.log('点击登录按钮');
    console.log('当前数据:', this.data);
    
    const { username, password, userType, isLoading } = this.data;

    // 防止重复提交
    if (isLoading) {
      console.log('正在登录中，禁止重复点击');
      return;
    }

    // 基础表单验证
    if (!username) {
      wx.showToast({ 
        title: '请输入账号', 
        icon: 'none',
        duration: 2000
      });
      return;
    }
    
    if (!password) {
      wx.showToast({ 
        title: '请输入密码', 
        icon: 'none',
        duration: 2000
      });
      return;
    }

    console.log('开始登录验证...');
    this.setData({ isLoading: true });
    
    // 调用 app.js 的登录方法，传入回调处理登录结果
    app.login(username, password, (success, errorType) => {
      console.log('登录回调结果:', success, '错误类型:', errorType);
      this.setData({ isLoading: false });
      
      if (success) {
        console.log('登录成功，跳转到首页');
        wx.showToast({
          title: '登录成功',
          icon: 'success',
          duration: 1500,
          success: () => {
            setTimeout(() => {
              wx.reLaunch({
                url: '/pages/index/index'
              });
            }, 1500);
          }
        });
      } else {
        // 根据不同的错误类型显示不同的弹窗
        this.handleLoginError(errorType);
      }
    });
  },

  // 处理登录错误，显示对应弹窗
  handleLoginError(errorType) {
    let title = '';
    let content = '';
    
    switch(errorType) {
      case 'USER_NOT_EXIST':
        title = '登陆失败';
        content = '用户名或密码错误，请重新输入';
        break;
      case 'WRONG_PASSWORD':
        title = '登录失败';
        content = '用户名或密码错误，请重新输入';
        break;
      case 'UNAUTHORIZED':
        title = '账号未授权';
        content = '您的账号状态异常，请联系管理员';
        break;
      case 'NETWORK_ERROR':
        title = '网络错误';
        content = '网络连接失败，请检查网络设置后重试';
        break;
      case 'RESPONSE_ERROR':
        title = '登录失败';
        content = '服务器响应异常，请稍后重试';
        break;
      default:
        title = '登录失败';
        content = '用户名或密码错误，请重新输入';
    }
    
    // 显示错误弹窗
    wx.showModal({
      title: title,
      content: content,
      showCancel: false,
      confirmText: '知道了',
      success: (res) => {
        if (res.confirm) {
          // 如果是密码错误，自动清空密码框方便重新输入
          if (errorType === 'WRONG_PASSWORD') {
            this.setData({ password: '' });
          }
        }
      }
    });
  },

  // 注册账号
  handleRegister() {
    console.log('跳转到注册页面');
    wx.navigateTo({
      url: '/pages/register/register'
    });
  },
  
  // 清除输入
  clearInput(e) {
    const field = e.currentTarget.dataset.field;
    console.log('清除输入:', field);
    
    if (field === 'username') {
      this.setData({ username: '' });
    } else if (field === 'password') {
      this.setData({ password: '' });
    }
  },
  
  // 显示/隐藏密码
  togglePasswordVisibility() {
    console.log('切换密码可见性');
  },
  
  // 忘记密码
  forgetPassword() {
    wx.showModal({
      title: '忘记密码',
      content: '请联系管理员重置密码',
      showCancel: false,
      confirmText: '知道了'
    });
  }
});