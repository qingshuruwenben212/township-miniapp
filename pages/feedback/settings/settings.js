// pages/my/settings/settings.js
const app = getApp();

Page({
  data: {
    // 用户信息
    userInfo: {},
    userRoleName: '',
    
    // 编辑状态
    originalUserInfo: {}, // 打开页面时的原始用户信息，用于比较是否有修改
    hasChanges: false,    // 是否检测到有修改
    isSaving: false,      // 是否正在保存（防重复提交）
    
    // 区域选择弹窗
    showRegionPicker: false,    // 是否显示区域选择器
    regionIndex: [0, 0],        // 两列选择器的当前索引
    towns: ['XX乡镇', 'YY乡镇', 'ZZ乡镇'],
    villages: ['XX村', 'YY村', 'ZZ村', 'AA村', 'BB村'],
    
    // 密码修改弹窗
    showPasswordModal: false,   // 是否显示修改密码弹窗
    oldPassword: '',            // 旧密码
    newPassword: '',            // 新密码
    confirmPassword: '',        // 二次输入新密码
    isChangingPassword: false,  // 是否正在请求修改密码
    canChangePassword: false,   // 表单是否满足提交条件
    passwordError: ''           // 密码错误提示
  },

  onLoad() {
    console.log('账号设置页面加载');
    this.loadUserInfo();
  },

  // 加载用户信息
  loadUserInfo() {
    // 优先从全局获取，其次从本地存储
    let userInfo = app.globalData.userInfo;
    if (!userInfo || !userInfo.username) {
      userInfo = wx.getStorageSync('userInfo') || {};
    }
    
    // 解析用户角色中文名称
    const userRoleName = app.getUserRoleName ? app.getUserRoleName() : 
      (userInfo.type === 'villager' ? '普通村民' : 
       userInfo.type === 'representative' ? '村民代表' : 
       userInfo.type === 'cadre' ? '村干部' : 
       userInfo.type === 'admin' ? '管理员' : '用户');
    
    // 保存原始数据副本，用于后续判断是否修改
    const originalUserInfo = JSON.parse(JSON.stringify(userInfo));
    
    this.setData({
      userInfo: userInfo,
      userRoleName: userRoleName,
      originalUserInfo: originalUserInfo,
      hasChanges: false
    });
    
    console.log('加载的用户信息:', userInfo);
  },

  // 检查是否有修改，控制保存按钮状态
  checkChanges() {
    const { userInfo, originalUserInfo } = this.data;
    const hasChanges = 
      userInfo.nickname !== originalUserInfo.nickname ||
      userInfo.name !== originalUserInfo.name ||
      userInfo.village !== originalUserInfo.village ||
      userInfo.avatar !== originalUserInfo.avatar;
    
    this.setData({ hasChanges });
  },

  // 检查是否可以修改密码（原密码非空、新密码非空、两次新密码一致且长度≥6）
  checkPasswordChange() {
    const { oldPassword, newPassword, confirmPassword } = this.data;
    const canChangePassword = 
      oldPassword.trim() !== '' && 
      newPassword.trim() !== '' && 
      confirmPassword.trim() !== '' &&
      newPassword === confirmPassword &&
      newPassword.length >= 6;
    
    this.setData({ 
      canChangePassword,
      passwordError: '' // 每次输入变化时清除错误提示
    });
  },

  // 处理昵称输入
  handleNicknameInput(e) {
    const nickname = e.detail.value.trim();
    this.setData({
      'userInfo.nickname': nickname
    }, () => {
      this.checkChanges();
    });
  },

  // 处理真实姓名输入
  handleNameInput(e) {
    const name = e.detail.value.trim();
    this.setData({
      'userInfo.name': name
    }, () => {
      this.checkChanges();
    });
  },

  // 处理原密码输入
  handleOldPasswordInput(e) {
    this.setData({
      oldPassword: e.detail.value
    }, () => {
      this.checkPasswordChange();
    });
  },

  // 处理新密码输入
  handleNewPasswordInput(e) {
    this.setData({
      newPassword: e.detail.value
    }, () => {
      this.checkPasswordChange();
    });
  },

  // 处理确认密码输入
  handleConfirmPasswordInput(e) {
    this.setData({
      confirmPassword: e.detail.value
    }, () => {
      this.checkPasswordChange();
    });
  },

  // 更换头像
  changeAvatar() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFilePaths[0];
        console.log('选择的头像:', tempFilePath);
        
        this.setData({
          'userInfo.avatar': tempFilePath
        }, () => {
          this.checkChanges();
        });
      },
      fail: (err) => {
        console.error('选择图片失败:', err);
      }
    });
  },

  // 选择区域
  selectRegion() {
    this.setData({
      showRegionPicker: true
    });
  },

  // 关闭区域选择
  closeRegionPicker() {
    this.setData({
      showRegionPicker: false
    });
  },

  // 区域选择变化
  handleRegionChange(e) {
    const value = e.detail.value;
    this.setData({
      regionIndex: value
    });
  },

  // 确认选择区域
  confirmRegion() {
    const { regionIndex, towns, villages } = this.data;
    const selectedTown = towns[regionIndex[0]];
    const selectedVillage = villages[regionIndex[1]];
    const region = `${selectedTown}${selectedVillage}`;
    
    this.setData({
      'userInfo.village': region,
      'userInfo.region': region,
      showRegionPicker: false
    }, () => {
      this.checkChanges();
    });
  },

  // 打开修改密码弹窗
  goToChangePassword() {
    // 清空之前的输入
    this.setData({
      showPasswordModal: true,
      oldPassword: '',
      newPassword: '',
      confirmPassword: '',
      canChangePassword: false,
      passwordError: ''
    });
  },

  // 关闭修改密码弹窗
  closePasswordModal() {
    this.setData({
      showPasswordModal: false,
      passwordError: ''
    });
  },

  // 确认修改密码，调用后端接口 /api/user/changePassword
  confirmPasswordChange() {
    if (!this.data.canChangePassword || this.data.isChangingPassword) return;
    
    const { oldPassword, newPassword, confirmPassword } = this.data;
    
    if (newPassword !== confirmPassword) {
      this.setData({ passwordError: '两次输入的密码不一致' });
      return;
    }
    
    if (newPassword.length < 6) {
      this.setData({ passwordError: '新密码至少6位' });
      return;
    }
    
    this.setData({ isChangingPassword: true, passwordError: '' });
    
    app.request({
      url: '/api/user/changePassword',
      method: 'POST',
      data: {
        oldPassword: oldPassword,
        newPassword: newPassword
      }
    }).then(() => {
      this.handlePasswordChangeSuccess();
    }).catch(err => {
      console.error('密码修改失败:', err);
      
      // 处理错误信息
      let errorMsg = '密码修改失败';
      if (err.message) {
        if (err.message.includes('原密码错误')) {
          errorMsg = '原密码错误';
        } else {
          errorMsg = err.message;
        }
      }
      
      this.setData({ 
        passwordError: errorMsg,
        isChangingPassword: false 
      });
      
      wx.showToast({
        title: errorMsg,
        icon: 'none'
      });
    });
  },

  // 处理密码修改成功
  handlePasswordChangeSuccess() {
    wx.showToast({
      title: '密码修改成功',
      icon: 'success'
    });
    
    // 关闭弹窗并清空数据
    this.setData({
      showPasswordModal: false,
      oldPassword: '',
      newPassword: '',
      confirmPassword: '',
      isChangingPassword: false,
      canChangePassword: false,
      passwordError: ''
    });
    
    console.log('密码已修改');
  },

  // 保存设置，调用后端接口 /api/user/update
  saveSettings() {
    if (this.data.isSaving) return;
    
    const { userInfo } = this.data;
    
    // 验证数据
    if (userInfo.nickname && userInfo.nickname.length < 2) {
      wx.showToast({
        title: '昵称至少2个字符',
        icon: 'none'
      });
      return;
    }
    
    this.setData({ isSaving: true });
    
    app.request({
      url: '/api/user/update',
      method: 'POST',
      data: userInfo
    }).then(() => {
      this.handleSaveSuccess(userInfo);
    }).catch(err => {
      console.error('保存失败:', err);
      wx.showToast({
        title: '保存失败，请重试',
        icon: 'none'
      });
      this.setData({ isSaving: false });
    });
  },

  // 处理保存成功
  handleSaveSuccess(updatedInfo) {
    console.log('保存成功，更新后的用户信息:', updatedInfo);
    
    // 获取当前全局的用户信息
    const currentGlobalUser = app.globalData.userInfo || {};
    
    // 合并更新数据
    const newUserInfo = {
      ...currentGlobalUser,
      ...updatedInfo,
      // 确保关键字段同步
      real_name: updatedInfo.real_name || updatedInfo.name || currentGlobalUser.real_name,
      name: updatedInfo.name || updatedInfo.real_name || currentGlobalUser.name,
      nickname: updatedInfo.nickname || currentGlobalUser.nickname,
      address: updatedInfo.address || updatedInfo.village || updatedInfo.region || currentGlobalUser.address,
      village: updatedInfo.village || updatedInfo.region || currentGlobalUser.village,
      region: updatedInfo.region || updatedInfo.village || currentGlobalUser.region,
      avatar_url: updatedInfo.avatar_url || updatedInfo.avatar || currentGlobalUser.avatar_url,
      avatar: updatedInfo.avatar || updatedInfo.avatar_url || currentGlobalUser.avatar
    };
    
    // 更新全局数据
    app.globalData.userInfo = newUserInfo;
    
    // 更新本地存储
    wx.setStorageSync('userInfo', newUserInfo);
    
    // 更新时间戳，通知其他页面
    const timestamp = Date.now();
    wx.setStorageSync('userInfoUpdated', timestamp);
    
    // 更新当前页面的原始数据
    this.setData({
      originalUserInfo: JSON.parse(JSON.stringify(newUserInfo)),
      userInfo: newUserInfo,
      hasChanges: false,
      isSaving: false
    });
    
    wx.showToast({
      title: '保存成功',
      icon: 'success',
      duration: 1500
    });
    
    console.log('用户信息已更新到全局和本地存储:', newUserInfo);
  },

  // 取消编辑
  cancelEdit() {
    if (this.data.hasChanges) {
      wx.showModal({
        title: '确认取消',
        content: '取消后所有修改将丢失，确定吗？',
        success: (res) => {
          if (res.confirm) {
            // 恢复原始数据
            this.setData({
              userInfo: JSON.parse(JSON.stringify(this.data.originalUserInfo)),
              hasChanges: false
            });
          }
        }
      });
    } else {
      wx.navigateBack();
    }
  },

  // 返回上一页
  onBack() {
    if (this.data.hasChanges) {
      wx.showModal({
        title: '有未保存的修改',
        content: '是否保存修改？',
        cancelText: '不保存',
        confirmText: '保存',
        success: (res) => {
          if (res.confirm) {
            this.saveSettings();
          } else if (res.cancel) {
            wx.navigateBack();
          }
        }
      });
    } else {
      wx.navigateBack();
    }
  }
});