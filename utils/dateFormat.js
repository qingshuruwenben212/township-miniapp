// /utils/dateFormat.js

/**
 * 日期格式化工具
 * @param {Date} date - 日期对象
 * @param {string} format - 格式字符串，如 'YYYY-MM-DD HH:mm:ss'
 * @returns {string} 格式化后的日期字符串
 */
const formatDate = (date = new Date(), format = 'YYYY-MM-DD HH:mm:ss') => {
  if (!(date instanceof Date)) {
    date = new Date(date);
  }
  
  const pad = (num) => num.toString().padStart(2, '0');
  
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  
  return format
    .replace('YYYY', year)
    .replace('MM', month)
    .replace('DD', day)
    .replace('HH', hours)
    .replace('mm', minutes)
    .replace('ss', seconds);
};

// 导出
module.exports = {
  formatDate
};