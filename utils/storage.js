/**
 * 本地存储工具类
 */
const Storage = {
  /**
   * 存储数据
   * @param {string} key - 键名
   * @param {any} value - 存储值（支持对象）
   */
  set(key, value) {
    if (typeof value === 'object') {
      value = JSON.stringify(value);
    }
    wx.setStorageSync(key, value);
  },

  /**
   * 获取数据
   * @param {string} key - 键名
   * @param {any} defaultValue - 默认值
   * @returns {any} 存储值（对象会自动解析）
   */
  get(key, defaultValue = '') {
    const value = wx.getStorageSync(key);
    if (value === '') return defaultValue;

    try {
      return JSON.parse(value);
    } catch (e) {
      return value;
    }
  },

  /**
   * 删除指定键数据
   * @param {string} key - 键名
   */
  remove(key) {
    wx.removeStorageSync(key);
  },

  /**
   * 清空所有本地存储
   */
  clear() {
    wx.clearStorageSync();
  },

  /**
   * 检查是否存在指定键
   * @param {string} key - 键名
   * @returns {boolean} 是否存在
   */
  has(key) {
    return wx.getStorageSync(key) !== '';
  }
};

module.exports = Storage;