// pages/register/register.js
const app = getApp();

Page({
  data: {
    // 用户信息
    username: '',
    password: '',
    confirmPassword: '',
    realName: '',
    phone: '',
    address: '',
    
    // 表单状态
    isLoading: false,            // 是否正在提交（防重复提交）
    showPassword: false,         // 是否显示密码明文
    showConfirmPassword: false,  // 是否显示确认密码明文
  },

  onLoad() {
    console.log('注册页面加载');
  },

  // 账号输入
  handleUsernameInput(e) {
    this.setData({
      username: e.detail.value.trim()
    });
  },

  // 密码输入
  handlePasswordInput(e) {
    this.setData({
      password: e.detail.value
    });
  },

  // 确认密码输入
  handleConfirmPasswordInput(e) {
    this.setData({
      confirmPassword: e.detail.value
    });
  },

  // 真实姓名输入
  handleRealNameInput(e) {
    this.setData({
      realName: e.detail.value.trim()
    });
  },

  // 手机号输入
  handlePhoneInput(e) {
    this.setData({
      phone: e.detail.value.trim()
    });
  },

  // 家庭地址输入
  handleAddressInput(e) {
    this.setData({
      address: e.detail.value.trim()
    });
  },

  // 显示/隐藏密码
  togglePassword() {
    this.setData({
      showPassword: !this.data.showPassword
    });
  },

  // 显示/隐藏确认密码
  toggleConfirmPassword() {
    this.setData({
      showConfirmPassword: !this.data.showConfirmPassword
    });
  },

  // 表单验证
  validateForm() {
    const { 
      username, 
      password, 
      confirmPassword, 
      realName, 
      phone, 
      address
    } = this.data;

    // 验证账号
    if (!username) {
      wx.showToast({ title: '请输入账号', icon: 'none' });
      return false;
    }
    if (username.length < 3 || username.length > 20) {
      wx.showToast({ title: '账号长度为3-20位', icon: 'none' });
      return false;
    }
    
    // 验证密码
    if (!password) {
      wx.showToast({ title: '请输入密码', icon: 'none' });
      return false;
    }
    if (password.length < 6 || password.length > 20) {
      wx.showToast({ title: '密码长度为6-20位', icon: 'none' });
      return false;
    }
    
    // 验证确认密码
    if (password !== confirmPassword) {
      wx.showToast({ title: '两次输入的密码不一致', icon: 'none' });
      return false;
    }
    
    // 验证真实姓名
    if (!realName) {
      wx.showToast({ title: '请输入真实姓名', icon: 'none' });
      return false;
    }
    
    // 验证手机号格式
    if (!phone) {
      wx.showToast({ title: '请输入手机号', icon: 'none' });
      return false;
    }
    const phoneReg = /^1[3-9]\d{9}$/;
    if (!phoneReg.test(phone)) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' });
      return false;
    }
    
    // 验证家庭地址
    if (!address) {
      wx.showToast({ title: '请输入家庭住址', icon: 'none' });
      return false;
    }

    return true;
  },

  // 提交注册 - 连接后端注册接口
  handleSubmit() {
    if (this.data.isLoading) {
      return;
    }

    // 表单验证
    if (!this.validateForm()) {
      return;
    }

    console.log('提交注册信息:', this.data);
    this.setData({ isLoading: true });

    // 准备提交数据
    const registerData = {
      username: this.data.username,
      password: this.data.password,
      real_name: this.data.realName,  
      phone: this.data.phone,
      address: this.data.address
    };

    // 调用后端注册接口
    app.request({
      url: '/api/auth/register',
      method: 'POST',
      data: registerData
    }).then(res => {
      console.log('注册成功响应:', res);
      this.setData({ isLoading: false });
      
      // 注册成功后提示，引导用户返回登录页
      wx.showModal({
        title: '注册成功',
        content: '您的账号已提交审核，审核通过后会通知您。',
        showCancel: false,
        confirmText: '返回登录',
        success: (res) => {
          if (res.confirm) {
            wx.navigateBack();
          }
        }
      });
    }).catch(err => {
      console.error('注册失败:', err);
      this.setData({ isLoading: false });
      
      // 后端会在响应中返回具体的错误消息，如“用户名已存在”“手机号已注册”等
      // 此处保留接口失败时的基础处理，具体提示由 app.request 统一拦截弹出
    });
  },

  // 返回登录页
  goBackToLogin() {
    wx.navigateBack();
  },

  // 清空输入
  clearInput(e) {
    const field = e.currentTarget.dataset.field;
    if (field && this.data[field] !== undefined) {
      this.setData({ [field]: '' });
    }
  }
});