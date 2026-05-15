// app.js
App({
  // 全局数据存储
  globalData: {
    userInfo: null,
    token: wx.getStorageSync('token') || '',
    isLogin: false,
    unreadCount: 0, 
    baseUrl: 'http://localhost:5000', // 后端接口基础地址
    feedbackUpdateCallbacks: [], //  存储需要刷新的页面回调

    // 反馈类型字典（与后端的部门分类对应）
    feedbackTypes: [
      { id: 1, name: "农业服务", desc: "农业补贴、技术支持等" },
      { id: 2, name: "基建维修", desc: "道路、路灯、水利等维修" },
      { id: 3, name: "民政咨询", desc: "社保、低保、户籍等业务" },
      { id: 4, name: "医疗卫生", desc: "基层医疗、医保报销等" },
      { id: 5, name: "环境整治", desc: "垃圾处理、村容美化等" },
      { id: 6, name: "其他问题", desc: "非以上分类的反馈" }
    ],
    
    // 处理状态字典
    handleStatus: {
      todo: "待派单",
      processing: "处理中",
      done: "已完成",
      rejected: "已驳回"
    },
    
    // 用户角色显示名称映射
    roleNames: {
      'villager': '普通村民',
      'admin': '乡镇管理员'
    }
  },

  // 小程序初始化生命周期
  onLaunch() {
    console.log('小程序启动，生产模式');
    this.checkLoginStatus();
    this.listenNetworkStatus();
  },


  // 检查登录状态
  checkLoginStatus() {
    const token = this.globalData.token;
    if (!token) {
      const storedToken = wx.getStorageSync('token');
      if (storedToken) {
        this.globalData.token = storedToken;
        this.verifyToken(storedToken);
      }
      return;
    }
    this.verifyToken(token);
  },


  // 验证token有效性，获取用户信息并同步全局状态
  verifyToken(token) {
    wx.showLoading({ title: "加载用户信息..." });
    this.request({
      url: "/api/auth/me",
      method: "GET"
    }).then(res => {
      this.globalData.userInfo = res;
      this.globalData.isLogin = true;
      wx.setStorageSync('userInfo', res);
      
      // 如果是村民，加载未读消息数
      if (res && res.user_type === 'villager') {
        this.loadUnreadCount();
      }
    }).catch(err => {
      console.error("登录状态验证失败：", err);
      this.clearLoginState();
    }).finally(() => {
      wx.hideLoading();
    });
  },

  // 加载未读消息数（村民专用）
  loadUnreadCount() {
    this.request({
      url: '/api/messages',
      data: {
        page: 1,
        per_page: 1,
        unread_only: true
      }
    }).then(res => {
      this.globalData.unreadCount = res.unread_count || 0;
      console.log('全局未读消息数:', this.globalData.unreadCount);
    }).catch(err => {
      console.error('加载未读消息数失败:', err);
    });
  },

  /**
   * 监听网络状态变化
   */
  listenNetworkStatus() {
    wx.onNetworkStatusChange(res => {
      if (!res.isConnected) {
        wx.showToast({
          title: "当前网络不可用，请检查网络设置",
          icon: "none",
          duration: 3000,
          mask: true
        });
      } else {
        const currentPage = getCurrentPages().pop();
        if (currentPage && currentPage.onPullDownRefresh) {
          currentPage.onPullDownRefresh();
        }
      }
    });
  },

  // ==================== 新增：反馈更新监听机制 ====================

  /**
   * 添加反馈更新监听
   * @param {Function} callback - 需要触发的回调函数
   */
  onFeedbackUpdate(callback) {
    // 确保数组存在
    if (!this.globalData.feedbackUpdateCallbacks) {
      this.globalData.feedbackUpdateCallbacks = [];
    }
    
    if (typeof callback === 'function') {
      this.globalData.feedbackUpdateCallbacks.push(callback);
      console.log('✅ 添加反馈更新监听，当前监听数:', this.globalData.feedbackUpdateCallbacks.length);
    }
  },

  /**
   * 移除反馈更新监听
   * @param {Function} callback - 需要移除的回调函数
   */
  offFeedbackUpdate(callback) {
    // 确保数组存在
    if (!this.globalData.feedbackUpdateCallbacks) {
      this.globalData.feedbackUpdateCallbacks = [];
      return;
    }
    
    const index = this.globalData.feedbackUpdateCallbacks.indexOf(callback);
    if (index > -1) {
      this.globalData.feedbackUpdateCallbacks.splice(index, 1);
      console.log('✅ 移除反馈更新监听，剩余监听数:', this.globalData.feedbackUpdateCallbacks.length);
    }
  },

  /**
   * 触发反馈更新，通知所有监听页面
   */
  triggerFeedbackUpdate() {
    // 确保数组存在
    if (!this.globalData.feedbackUpdateCallbacks) {
      this.globalData.feedbackUpdateCallbacks = [];
      return;
    }
    
    console.log('🔄 触发反馈更新，通知所有监听页面，监听数:', this.globalData.feedbackUpdateCallbacks.length);
    this.globalData.feedbackUpdateCallbacks.forEach(callback => {
      try {
        if (typeof callback === 'function') {
          callback();
        }
      } catch (err) {
        console.error('❌ 执行反馈更新回调失败:', err);
      }
    });
  },

  /**
   * 统一网络请求封装
   */
  request(options) {
    // 统一处理URL格式
    let apiUrl = options.url;
    if (!apiUrl.startsWith('/api/')) {
      if (apiUrl.startsWith('/')) {
        apiUrl = `/api${apiUrl}`;
      } else {
        apiUrl = `/api/${apiUrl}`;
      }
    }
    
    const newOptions = {
      ...options,
      url: apiUrl
    };

    return this.realRequest(newOptions);
  },

  /**
  网络请求
   */
  realRequest(options) {
    const { url, method = "GET", data = {}, header = {} } = options;
    const token = this.globalData.token || wx.getStorageSync('token');

    
    let baseUrl = this.globalData.baseUrl;
    if (baseUrl.endsWith('/api')) {
      baseUrl = baseUrl.replace(/\/api$/, '');
    }

    const requestConfig = {
      url: `${baseUrl}${url}`,
      method,
      data,
      header: {
        "Content-Type": "application/json",
        ...(token && { "Authorization": `Bearer ${token}` }),
        ...header
      },
      timeout: 30000
    };

    console.log('发送请求:', {
      url: requestConfig.url,
      method: requestConfig.method,
      hasToken: !!token
    });

    return new Promise((resolve, reject) => {
      wx.request({
        ...requestConfig,
        success: (res) => {
          console.log('收到响应:', {
            url: requestConfig.url,
            statusCode: res.statusCode,
            data: res.data
          });
          
          // 【修复】如果HTTP状态码不是2xx，直接返回错误
          if (res.statusCode < 200 || res.statusCode >= 300) {
            const errorMsg = res.data?.message || `请求失败 (${res.statusCode})`;
            console.error(`HTTP错误 ${res.statusCode}:`, errorMsg);
            
            // 特殊处理401未授权
            if (res.statusCode === 401) {
              wx.showToast({ title: "登录已过期，请重新登录", icon: "none" });
              this.clearLoginState();
            }
            
            reject(new Error(errorMsg));
            return;
          }
          
          // 处理响应数据
          const response = res.data;
          
          if (response && response.code !== undefined) {
            if (response.code === 200) {
              resolve(response.data);
            } else if (response.code === 401) {
              wx.showToast({ title: "用户名或密码错误", icon: "none" });
              this.clearLoginState();
              reject(new Error(response.message || "未登录或token过期"));
            } else {
              const errorMsg = response.message || response.msg || `业务错误：${response.code}`;
              reject(new Error(errorMsg));
            }
          } else {
            // 如果返回格式不符合预期，但状态码是200，尝试直接返回数据
            resolve(response);
          }
        },
        fail: (err) => {
          console.error('请求失败:', {
            url: requestConfig.url,
            error: err.errMsg
          });
          
          let tip = "网络异常，请稍后重试";
          if (err.errMsg.includes("timeout")) tip = "请求超时，请检查网络";
          if (err.errMsg.includes("network")) tip = "无网络连接，请检查网络设置";
          if (err.errMsg.includes("fail")) tip = "连接服务器失败，请检查网络";
          
          wx.showToast({ title: tip, icon: "none" });
          reject(new Error(tip));
        }
      });
    });
  },

  /**
   * 清除登录状态
   */
  clearLoginState() {
    wx.removeStorageSync('token');
    wx.removeStorageSync('userInfo');
    
    this.globalData.token = '';
    this.globalData.userInfo = null;
    this.globalData.isLogin = false;
    this.globalData.unreadCount = 0;
  },

  /**
   * 登录方法
   */
  login(username, password, callback) {
    // 确保callback是函数
    const safeCallback = typeof callback === 'function' ? callback : () => {};
    
    if (!username || username.trim() === '') {
      wx.showToast({ title: "请输入账号", icon: "none" });
      safeCallback(false, 'EMPTY_USERNAME');
      return;
    }
    if (!password) {
      wx.showToast({ title: "请输入密码", icon: "none" });
      safeCallback(false, 'EMPTY_PASSWORD');
      return;
    }
  
    this.request({
      url: "/api/auth/login",
      method: "POST",
      data: { username, password }
    }).then(res => {
      console.log('登录响应数据:', res);
      
      // 处理响应格式差异
      const access_token = res.access_token || res.token;
      const user = res.user || res;
      
      if (access_token && user) {
        // 保存登录信息
        wx.setStorageSync('token', access_token);
        wx.setStorageSync('userInfo', user);
        wx.setStorageSync('isLogin', true);
        
        this.globalData.token = access_token;
        this.globalData.userInfo = user;
        this.globalData.isLogin = true;
        
        // 如果是村民，加载未读消息数
        if (user && user.user_type === 'villager') {
          this.loadUnreadCount();
        }
        
        wx.showToast({ title: "登录成功", icon: "success" });
        safeCallback(true);
      } else {
        console.error('登录响应格式错误:', res);
        wx.showToast({ title: "登录失败：响应格式错误", icon: "none" });
        safeCallback(false, 'RESPONSE_ERROR');
      }
    }).catch(err => {
      console.error('登录失败:', err);
      
      // 登录失败信息弹窗
      const errMsg = err.message || '';
      let errorType = 'UNKNOWN_ERROR';
      
      if (errMsg.includes('用户名或密码错误') || errMsg.includes('用户名或密码错误')) {
        errorType = 'WRONG_PASSWORD';
      } else if (errMsg.includes('401')) {
        errorType = 'UNAUTHORIZED';
      } else if (errMsg.includes('网络异常') || errMsg.includes('网络错误')) {
        errorType = 'NETWORK_ERROR';
      }
      
      safeCallback(false, errorType);
    });
  },

  /**
   * AI预处理反馈内容 - 调用后端AI接口
   */
  aiPreprocessFeedback(content) {
    return new Promise((resolve, reject) => {
      // 调用后端AI分类接口
      this.request({
        url: '/api/ai/classify',
        method: 'POST',
        data: { content }
      }).then(res => {
        console.log('AI分类结果:', res);
        resolve({
          aiTags: [res.label || '其他'],
          recommendedDeptId: res.category || 'general_dept',
          confidence: res.confidence || 0.7,
          processedAt: new Date().toISOString()
        });
      }).catch(err => {
        console.error('AI分类失败，使用本地模拟:', err);
        
        // 后备方案：使用关键词匹配
        try {
          let aiTags = [];
          let recommendedDeptId = '';
          let confidence = 0.7;
          
          const contentLower = content.toLowerCase();
          
          // 农业相关关键词
          if (contentLower.includes('农业') || contentLower.includes('种植') || 
              contentLower.includes('养殖') || contentLower.includes('补贴') ||
              contentLower.includes('农药') || contentLower.includes('化肥') ||
              contentLower.includes('收割') || contentLower.includes('耕地')) {
            aiTags = ['农业', '农技', '补贴', '种植'];
            recommendedDeptId = 'agriculture_dept';
            confidence = 0.85;
          }
          // 基建相关关键词
          else if (contentLower.includes('道路') || contentLower.includes('路灯') || 
                   contentLower.includes('维修') || contentLower.includes('水利') ||
                   contentLower.includes('桥梁') || contentLower.includes('管道') ||
                   contentLower.includes('电线') || contentLower.includes('设施')) {
            aiTags = ['基建', '维修', '设施', '道路'];
            recommendedDeptId = 'infrastructure_dept';
            confidence = 0.8;
          }
          // 环境相关关键词
          else if (contentLower.includes('垃圾') || contentLower.includes('污水') || 
                   contentLower.includes('环境') || contentLower.includes('卫生') ||
                   contentLower.includes('污染') || contentLower.includes('清理') ||
                   contentLower.includes('绿化') || contentLower.includes('保洁')) {
            aiTags = ['环境', '卫生', '整治', '垃圾'];
            recommendedDeptId = 'environment_dept';
            confidence = 0.75;
          }
          // 医疗相关关键词
          else if (contentLower.includes('医疗') || contentLower.includes('医保') || 
                   contentLower.includes('健康') || contentLower.includes('疫苗') ||
                   contentLower.includes('看病') || contentLower.includes('医院') ||
                   contentLower.includes('诊所') || contentLower.includes('药品')) {
            aiTags = ['医疗', '健康', '医保', '卫生'];
            recommendedDeptId = 'health_dept';
            confidence = 0.8;
          }
          // 民政相关关键词
          else if (contentLower.includes('低保') || contentLower.includes('救助') || 
                   contentLower.includes('婚姻') || contentLower.includes('补贴') ||
                   contentLower.includes('社保') || contentLower.includes('养老') ||
                   contentLower.includes('残疾') || contentLower.includes('补助')) {
            aiTags = ['民政', '救助', '社保', '低保'];
            recommendedDeptId = 'civil_affairs_dept';
            confidence = 0.7;
          }
          // 其他
          else {
            aiTags = ['其他', '综合'];
            recommendedDeptId = 'general_dept';
            confidence = 0.6;
          }
          
          resolve({
            aiTags: aiTags,
            recommendedDeptId: recommendedDeptId,
            confidence: confidence,
            processedAt: new Date().toISOString()
          });
        } catch (error) {
          console.error('AI处理失败:', error);
          reject(new Error('AI处理失败'));
        }
      });
    });
  },

  /**
   * 退出登录
   */
  logout() {
    wx.showModal({
      title: "确认退出",
      content: "退出后将无法查看反馈记录，是否确认？",
      success: (res) => {
        if (res.confirm) {
          this.clearLoginState();
          wx.reLaunch({ url: "/pages/login/login" });
        }
      }
    });
  },

  /**
   * 获取当前用户类型
   */
  getUserType() {
    const userInfo = this.globalData.userInfo || wx.getStorageSync('userInfo');
    return userInfo ? userInfo.user_type : null;
  },

  /**
   * 检查是否为管理员
   */
  isAdmin() {
    const userType = this.getUserType();
    return userType === 'admin';
  },

  /**
   * 检查是否为村民
   */
  isVillager() {
    const userType = this.getUserType();
    return userType === 'villager';
  },

  /**
   * 显示加载提示
   */
  showLoading(title = "加载中...") {
    wx.showLoading({ title, mask: true });
  },

  /**
   * 隐藏加载提示
   */
  hideLoading() {
    wx.hideLoading();
  },

  /**
   * 显示成功提示
   */
  showSuccess(title) {
    wx.showToast({ title, icon: "success" });
  },

  /**
   * 显示错误提示
   */
  showError(title) {
    wx.showToast({ title, icon: "none" });
  },

  /**
   * 图片上传
   */
  uploadImages(tempFilePaths, type = "feedback") {
    if (!tempFilePaths || tempFilePaths.length === 0) {
      return Promise.resolve([]);
    }

    const uploadPromises = tempFilePaths.map((filePath, index) => {
      return new Promise((resolve, reject) => {
        wx.uploadFile({
          url: `${this.globalData.baseUrl}/api/upload/image`,
          filePath,
          name: `image${index}`,
          formData: { type },
          header: {
            "Authorization": `Bearer ${this.globalData.token}`
          },
          success: (res) => {
            try {
              const resData = JSON.parse(res.data);
              if (resData.code === 200) {
                resolve(resData.data.url);
              } else {
                reject(new Error(resData.message || '图片上传失败'));
              }
            } catch (e) {
              reject(new Error('解析响应失败'));
            }
          },
          fail: (err) => {
            reject(new Error(`图片上传失败：${err.errMsg}`));
          }
        });
      });
    });

    return Promise.all(uploadPromises);
  },

  /**
   * 语音上传
   */
  uploadVoice(tempFilePath) {
    if (!tempFilePath) {
      return Promise.resolve("");
    }

    return new Promise((resolve, reject) => {
      wx.uploadFile({
        url: `${this.globalData.baseUrl}/api/upload/voice`,
        filePath: tempFilePath,
        name: "voice",
        header: {
          "Authorization": `Bearer ${this.globalData.token}`
        },
        success: (res) => {
          try {
            const resData = JSON.parse(res.data);
            if (resData.code === 200) {
              resolve(resData.data.url);
            } else {
              reject(new Error(resData.message || '语音上传失败'));
            }
          } catch (e) {
            reject(new Error('解析响应失败'));
          }
        },
        fail: (err) => {
          reject(new Error(`语音上传失败：${err.errMsg}`));
        }
      });
    });
  }
});