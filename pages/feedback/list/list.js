// pages/feedback/list/list.js
const app = getApp();

Page({
    data: {
        feedbackList: [],          // 反馈列表数据
        currentFilter: 'all',     // 当前筛选条件：all / processing / done / evaluated
        page: 1,                  // 当前加载的页码
        size: 10,                 // 每页数量
        hasMore: true,            // 是否还有更多数据
        isLoading: false,         // 是否正在加载
        isRefreshing: false,      // 是否正在下拉刷新
        totalCount: 0,            // 反馈总数量

        // 筛选选项配置
        filterOptions: [
            { type: 'all', name: '全部', icon: '📋' },
            { type: 'processing', name: '处理中', icon: '🔄' },
            { type: 'done', name: '已完成', icon: '✅' },
            { type: 'evaluated', name: '已评分', icon: '⭐' }
        ]
    },

    onLoad() {
        console.log('反馈列表页面加载');

        // 优先展示缓存数据，避免白屏
        const cachedList = wx.getStorageSync('cached_feedback_list');
        if (cachedList && cachedList.length > 0) {
            this.setData({
                feedbackList: cachedList,
                isLoading: false
            });
            console.log('从缓存加载反馈列表，共', cachedList.length, '条');
        }

        // 再静默获取服务器最新数据
        this.getFeedbackList();
    },

    onShow() {
        console.log('反馈列表页面显示');
        // 页面显示时强制刷新（不清空已有数据）
        this.forceRefresh();
    },

    onPullDownRefresh() {
        console.log('触发下拉刷新');
        this.setData({ isRefreshing: true });

        // 下拉刷新允许清空列表，重新加载第一页
        this.setData({
            page: 1,
            feedbackList: [],
            hasMore: true
        }, () => {
            this.getFeedbackList(() => {
                wx.stopPullDownRefresh();
                this.setData({ isRefreshing: false });
                if (this.data.feedbackList.length > 0) {
                    wx.showToast({ title: '刷新成功', icon: 'success' });
                } else {
                    wx.showToast({ title: '暂无数据', icon: 'none' });
                }
            });
        });
    },

    onReachBottom() {
        console.log('上拉触底，加载更多');
        this.loadMore();
    },

    // 获取反馈列表（从后端接口或本地存储）
    getFeedbackList(callback) {
        const { page, size, currentFilter } = this.data;

        // 防止重复加载
        if (this.data.isLoading) return;

        this.setData({ isLoading: true });
        console.log('加载反馈列表，页码:', page, '筛选:', currentFilter);

        // 将前端筛选值映射为后端 status 参数
        const statusMap = {
            'all': '',
            'processing': 'processing',
            'done': 'completed',
            'evaluated': 'archived'  // 已评分对应后端归档状态
        };

        const token = wx.getStorageSync('token') || app.globalData.token;

        // 调用后端接口
        wx.request({
            url: `${app.globalData.baseUrl || 'http://localhost:5000'}/api/feedback/list`,
            method: 'GET',
            header: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            data: {
                page: page,
                per_page: size,
                status: statusMap[currentFilter]
            },
            success: (res) => {
                console.log('获取反馈列表响应:', res);

                if (res.data && res.data.code === 200) {
                    const responseData = res.data.data || {};
                    let feedbacks = responseData.feedbacks || [];
                    const pagination = responseData.pagination || {};

                    if (feedbacks.length > 0) {
                        console.log('第一条反馈原始数据:', JSON.stringify(feedbacks[0], null, 2));
                        console.log('status:', feedbacks[0].status);
                        console.log('status_display:', feedbacks[0].status_display);
                    }

                    // 部门名称映射表
                    const deptNames = {
                        'agriculture': '农业服务部',
                        'infrastructure': '基建维修部',
                        'environment': '环境整治部',
                        'health': '医疗卫生部',
                        'civil': '民政服务部',
                        'general': '综合服务部'
                    };

                    // 格式化数据，统一字段名称和显示文本
                    const formattedFeedbacks = feedbacks.map(item => {
                        let aiTags = [];
                        if (item.ai_tags) {
                            aiTags = Array.isArray(item.ai_tags) ? item.ai_tags : [];
                        }

                        // 确定部门名称（优先使用 dept_name，其次映射 dept_id/category）
                        let departmentName = '待派单';
                        if (item.dept_name && item.dept_name !== '待派单') {
                            departmentName = item.dept_name;
                        } else if (item.dept_id) {
                            departmentName = deptNames[item.dept_id] || '待派单';
                        } else if (item.category) {
                            departmentName = deptNames[item.category] || '待派单';
                        }

                        let statusText = item.status_display || this.getStatusText(item.status);

                        // 生成星级字符串
                        let ratingStars = '';
                        if (item.rating) {
                            ratingStars = '⭐'.repeat(item.rating);
                        }

                        return {
                            id: item.id,
                            title: item.title || '无标题',
                            content: item.content || '',
                            status: statusText,
                            statusValue: item.status || 'pending_manual',
                            imageCount: item.images ? item.images.length : 0,
                            hasVoice: !!item.voice_url,
                            createTime: this.formatDateTime(item.created_at),
                            departmentName: departmentName,
                            aiTags: aiTags,
                            aiConfidence: item.ai_confidence ? Math.round(item.ai_confidence * 100) : 0,
                            hasEvaluated: item.has_evaluated || false,
                            rating: item.rating || 0,
                            ratingStars: ratingStars,
                            comment: item.comment || ''
                        };
                    });

                    // 合并数据：第一页替换，后续页去重追加
                    let newList;
                    if (page === 1) {
                        newList = formattedFeedbacks;
                    } else {
                        const existingIds = new Set(this.data.feedbackList.map(item => item.id));
                        const uniqueNewFeedbacks = formattedFeedbacks.filter(item => !existingIds.has(item.id));
                        newList = [...this.data.feedbackList, ...uniqueNewFeedbacks];
                    }

                    const hasMore = formattedFeedbacks.length === size;

                    this.setData({
                        feedbackList: newList,
                        hasMore: hasMore,
                        totalCount: pagination.total || newList.length,
                        isLoading: false
                    });

                    // 缓存第一页数据，提升下次打开速度
                    if (page === 1) {
                        wx.setStorageSync('cached_feedback_list', newList);
                    }

                    console.log('反馈列表加载成功，共', newList.length, '条');
                    callback && callback();
                } else {
                    console.error('获取反馈列表失败:', res.data?.message);
                    // 接口返回错误时降级到本地存储
                    this.loadLocalFeedback(callback);
                }
            },
            fail: (err) => {
                console.error('请求失败:', err);
                // 网络错误时降级到本地存储
                this.loadLocalFeedback(callback);
            }
        });
    },

    // 状态码转中文显示文本
    getStatusText(status) {
        const statusMap = {
            'pending_ai': 'AI处理中',
            'pending_manual': '待分类',
            'processing': '处理中',
            'completed': '已完成',
            'rejected': '已驳回',
            'archived': '已评分'
        };
        return statusMap[status] || status || '未知';
    },

    // 格式化日期时间（补时区偏移，显示年月日时分）
    formatDateTime(dateTimeStr) {
        if (!dateTimeStr) return '';

        try {
            const date = new Date(dateTimeStr);
            if (isNaN(date.getTime())) return dateTimeStr;

            // 调整为北京时间
            const beijingDate = new Date(date.getTime() + 8 * 60 * 60 * 1000);

            const year = beijingDate.getFullYear();
            const month = String(beijingDate.getMonth() + 1).padStart(2, '0');
            const day = String(beijingDate.getDate()).padStart(2, '0');
            const hour = String(beijingDate.getHours()).padStart(2, '0');
            const minute = String(beijingDate.getMinutes()).padStart(2, '0');

            return `${year}-${month}-${day} ${hour}:${minute}`;
        } catch (e) {
            return dateTimeStr;
        }
    },

    // 本地存储数据作为后备（接口不可用时使用）
    loadLocalFeedback(callback) {
        const { page, size, currentFilter } = this.data;

        const localFeedback = wx.getStorageSync('localFeedback') || [];
        console.log('本地存储的反馈:', localFeedback.length, '条');

        // 按状态筛选
        let filteredData = localFeedback;
        if (currentFilter === 'processing') {
            filteredData = localFeedback.filter(item =>
                item.status === '处理中' ||
                item.statusValue === 'processing'
            );
        } else if (currentFilter === 'done') {
            filteredData = localFeedback.filter(item =>
                item.status === '已完成' ||
                item.statusValue === 'completed'
            );
        } else if (currentFilter === 'evaluated') {
            filteredData = localFeedback.filter(item =>
                item.hasEvaluated === true ||
                item.statusValue === 'archived' ||
                item.status === '已评分'
            );
        }

        // 模拟分页
        const startIndex = (page - 1) * size;
        const endIndex = startIndex + size;
        const pageData = filteredData.slice(startIndex, endIndex);

        let newList;
        if (page === 1) {
            newList = pageData;
        } else {
            const existingIds = new Set(this.data.feedbackList.map(item => item.id));
            const uniqueNewData = pageData.filter(item => !existingIds.has(item.id));
            newList = [...this.data.feedbackList, ...uniqueNewData];
        }

        const hasMore = pageData.length === size && endIndex < filteredData.length;

        this.setData({
            feedbackList: newList,
            hasMore: hasMore,
            isLoading: false
        });

        console.log('本地数据加载完成，共', newList.length, '条');
        callback && callback();
    },

    // 切换筛选条件
    handleFilter(e) {
        const type = e.currentTarget.dataset.type;
        console.log('切换筛选类型:', type);

        if (this.data.currentFilter === type) return;

        this.setData({
            currentFilter: type,
            page: 1,
            feedbackList: [],
            hasMore: true
        }, () => {
            this.getFeedbackList();
        });
    },

    // 加载更多（触底时调用）
    loadMore() {
        const { hasMore, isLoading } = this.data;
        if (!hasMore || isLoading) {
            console.log('无更多数据或正在加载，不执行加载更多');
            return;
        }

        console.log('执行加载更多');
        this.setData({ page: this.data.page + 1 }, () => {
            this.getFeedbackList();
        });
    },

    // 完全刷新列表（清空后重新加载第一页）
    refreshList() {
        this.setData({
            page: 1,
            feedbackList: [],
            hasMore: true
        }, () => {
            this.getFeedbackList();
        });
    },

    // 静默刷新（保留现有数据，只重新获取第一页，避免白屏）
    forceRefresh() {
        const oldPage = this.data.page;
        this.setData({ page: 1 }, () => {
            this.getFeedbackList(() => {
                if (this.data.feedbackList.length === 0 && oldPage > 1) {
                    // 如果新数据为空，恢复原页码（可能权限变更等）
                    this.setData({ page: oldPage });
                }
            });
        });
    },

    // 删除反馈
    deleteFeedback(e) {
        const id = e.currentTarget.dataset.id;
        const feedback = this.data.feedbackList.find(item => item.id == id);

        wx.showModal({
            title: '确认删除',
            content: '确定要删除这条反馈记录吗？此操作不可恢复。',
            success: (res) => {
                if (res.confirm) {
                    wx.showLoading({ title: '删除中...' });

                    const token = wx.getStorageSync('token') || app.globalData.token;

                    wx.request({
                        url: `${app.globalData.baseUrl || 'http://localhost:5000'}/api/feedback/${id}/delete`,
                        method: 'DELETE',
                        header: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        success: (res) => {
                            wx.hideLoading();
                            if (res.data && res.data.code === 200) {
                                wx.showToast({ title: '删除成功', icon: 'success' });

                                // 同步删除本地存储中的对应记录
                                this.deleteLocalFeedback(id);

                                // 重新加载当前列表
                                this.refreshList();
                            } else {
                                wx.showToast({ title: res.data?.message || '删除失败', icon: 'none' });
                            }
                        },
                        fail: (err) => {
                            wx.hideLoading();
                            console.error('删除失败:', err);

                            // 接口失败时也尝试删除本地数据
                            this.deleteLocalFeedback(id);
                            this.refreshList();
                        }
                    });
                }
            }
        });
    },

    // 从本地存储中删除指定 ID 的反馈
    deleteLocalFeedback(id) {
        let localFeedback = wx.getStorageSync('localFeedback') || [];
        const newList = localFeedback.filter(item => item.id != id);
        wx.setStorageSync('localFeedback', newList);
        console.log('本地反馈已删除，剩余', newList.length, '条');
    },

    // 跳转到反馈详情页
    goToDetail(e) {
        const id = e.currentTarget.dataset.id;
        console.log('查看反馈详情，ID:', id);

        wx.navigateTo({
            url: `/pages/feedback/detail/detail?id=${id}`,
            success: (res) => {
                console.log('跳转成功:', res);
            },
            fail: (err) => {
                console.error('跳转失败:', err);
                // 降级：弹窗展示基本信息
                const feedback = this.data.feedbackList.find(item => item.id == id);
                if (feedback) {
                    wx.showModal({
                        title: feedback.title,
                        content: `内容：${feedback.content}\n\n状态：${feedback.status}\n提交时间：${feedback.createTime}\n处理部门：${feedback.departmentName}`,
                        showCancel: false,
                        confirmText: '知道了'
                    });
                } else {
                    wx.showToast({ title: '详情页跳转失败', icon: 'none' });
                }
            }
        });
    },

    // 跳转到提交反馈页面（Tab 页）
    goToSubmitPage() {
        console.log('前往提交反馈页面');

        wx.switchTab({
            url: '/pages/feedback/submit/submit',
            success: (res) => {
                console.log('跳转提交页面成功');
            },
            fail: (err) => {
                console.error('跳转提交页面失败:', err);
                wx.showModal({
                    title: '跳转失败',
                    content: '无法打开提交反馈页面，请检查页面配置。',
                    showCancel: false
                });
            }
        });
    },

    // 手动刷新（供外部调用）
    manualRefresh() {
        this.onPullDownRefresh();
    }
});