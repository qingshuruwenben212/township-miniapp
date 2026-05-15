/**
 * 通用工具类
 */
const app = getApp();

/**
 * 权限校验
 * @param {string} requiredRole - 所需角色（admin/department/user）
 * @returns {boolean} 是否有权限
 */
function checkPermission(requiredRole) {
  const userInfo = app.globalData.userInfo;
  if (!userInfo) return false;
  // 超级管理员拥有所有权限
  if (userInfo.role === 'admin') return true;
  return userInfo.role === requiredRole;
}

/**
 * 数据格式化 - 反馈状态
 * @param {string} status - 原始状态
 * @returns {object} 格式化后的状态信息
 */
function formatFeedbackStatus(status) {
  const statusMap = {
    '待派单': { text: '待派单', color: '#999999', bgColor: '#F5F5F5' },
    '处理中': { text: '处理中', color: '#FF9800', bgColor: '#FFF8E1' },
    '已完成': { text: '已完成', color: '#048dfd', bgColor: '#e6f0ff' },
    '已驳回': { text: '已驳回', color: '#FF3B30', bgColor: '#FFEBEE' }
  };
  return statusMap[status] || { text: status, color: '#333333', bgColor: '#F5F5F5' };
}

/**
 * 校验手机号格式
 * @param {string} phone - 手机号
 * @returns {boolean} 是否合法
 */
function validatePhone(phone) {
  return /^1[3-9]\d{9}$/.test(phone);
}

/**
 * 图片压缩（适配弱网络上传）
 * @param {string} filePath - 图片路径
 * @param {object} options - 压缩选项
 * @returns {Promise<string>} 压缩后的图片路径
 */
function compressImage(filePath, options = {}) {
  const quality = options.quality || 80; // 压缩质量（0-100）
  const width = options.width || 1080; // 最大宽度

  return new Promise((resolve, reject) => {
    wx.compressImage({
      src: filePath,
      quality,
      width,
      success: (res) => {
        resolve(res.tempFilePath);
      },
      fail: (err) => {
        reject(err);
      }
    });
  });
}

/**
 * 显示加载提示
 * @param {string} title - 提示文字
 */
function showLoading(title = '加载中...') {
  wx.showLoading({
    title,
    mask: true
  });
}

/**
 * 隐藏加载提示
 */
function hideLoading() {
  wx.hideLoading();
}

module.exports = {
  checkPermission,
  formatFeedbackStatus,
  validatePhone,
  compressImage,
  showLoading,
  hideLoading
};