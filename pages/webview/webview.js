// pages/webview/webview.js
Page({
  data: {
    url: ''  // 要加载的外部链接地址
  },

  onLoad(options) {
    const url = decodeURIComponent(options.url || '');
    console.log('webview加载URL:', url);
    this.setData({ url });
  },

  // 分享时携带当前链接，方便他人打开相同页面
  onShareAppMessage() {
    return {
      title: '外部链接',
      path: `/pages/webview/webview?url=${encodeURIComponent(this.data.url)}`
    };
  }
});