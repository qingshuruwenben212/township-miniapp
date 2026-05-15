// pages/admin/department-pending/department-pending.js
// 部门待处理事务页面（管理员）：按部门展示待处理反馈，支持低置信度筛选、人工分类和完成处理
const app = getApp();

Page({
    data: {
        departments: [
            { id: 'agriculture', name: '农业服务部', icon: '🌾', count: 0, pendingList: [], lowConfidenceCount: 0 },
            { id: 'infrastructure', name: '基建维修部', icon: '🏗️', count: 0, pendingList: [], lowConfidenceCount: 0 },
            { id: 'environment', name: '环境整治部', icon: '🌳', count: 0, pendingList: [], lowConfidenceCount: 0 },
            { id: 'health', name: '医疗卫生部', icon: '🏥', count: 0, pendingList: [], lowConfidenceCount: 0 },
            { id: 'civil', name: '民政服务部', icon: '👥', count: 0, pendingList: [], lowConfidenceCount: 0 },
            { id: 'general', name: '综合服务部', icon: '📋', count: 0, pendingList: [], lowConfidenceCount: 0 }
        ],
        currentDepartment: null,
        showDetail: false,
        currentFeedbacks: [],
        isLoading: false,
        aiThreshold: 70,
        filterType: 'all',
        totalPendingCount: 0,
        totalLowConfidenceCount: 0,
        innerAudioContext: null,
        isPlaying: false,
        currentPlayingId: null
    },

    onLoad() {
        this.feedbackUpdateCallback = () => this.loadDepartmentData();
        if (app.onFeedbackUpdate) app.onFeedbackUpdate(this.feedbackUpdateCallback);
        this.loadDepartmentData();
    },
    onShow() { this.loadDepartmentData(); },
    onUnload() {
        if (app.offFeedbackUpdate && this.feedbackUpdateCallback) app.offFeedbackUpdate(this.feedbackUpdateCallback);
        if (this.innerAudioContext) { this.innerAudioContext.stop(); this.innerAudioContext.destroy(); }
    },
    onPullDownRefresh() {
        this.loadDepartmentData().then(() => wx.stopPullDownRefresh()).catch(() => wx.stopPullDownRefresh());
    },

    // 【核心清洗】
    cleanItem(item) {
        // 1. 置信度 0~100
        let confidence = 0;
        if (item.confidence != null && !isNaN(item.confidence)) {
            const num = Number(item.confidence);
            confidence = num > 1 ? Math.round(num) : Math.round(num * 100);
        }
        // 2. 语音文本：过滤 null 和 'undefined'
        let voice = item.voice_text || '';
        if (voice === 'undefined') voice = '';
        // 3. 截断字段（WXML 不能用 substring）
        let voiceDisp = voice ? (voice.length > 20 ? voice.substring(0,20)+'...' : voice) : '';
        // 4. 时间（UTC → 北京）
        let time = '未知时间';
        if (item.created_at && typeof item.created_at === 'string' && item.created_at !== '') {
            try {
                const d = new Date(item.created_at);
                if (!isNaN(d.getTime())) {
                    const bj = new Date(d.getTime() + 8*3600*1000);
                    time = `${bj.getFullYear()}-${String(bj.getMonth()+1).padStart(2,'0')}-${String(bj.getDate()).padStart(2,'0')} ${String(bj.getHours()).padStart(2,'0')}:${String(bj.getMinutes()).padStart(2,'0')}`;
                }
            } catch(e) {}
        }
        return {
            ...item,
            confidence,
            voice_text: voice,        // 完整文本，弹窗用
            voice_text_display: voiceDisp, // 截断文本，卡片展示
            created_at: time
        };
    },

    loadDepartmentData() {
        this.setData({ isLoading: true });
        return app.request({ url: '/api/admin/department/pending', method: 'GET' }).then(res => {
            const departments = this.data.departments.map(dept => {
                const deptData = res[dept.id] || { count: 0, list: [] };
                const cleaned = (deptData.list || []).map(item => this.cleanItem(item));
                const low = cleaned.filter(f => f.confidence < this.data.aiThreshold).length;
                return { ...dept, count: deptData.count || cleaned.length, pendingList: cleaned, lowConfidenceCount: low };
            });
            this.setData({
                departments,
                totalPendingCount: departments.reduce((s,d) => s+d.count, 0),
                totalLowConfidenceCount: departments.reduce((s,d) => s+d.lowConfidenceCount, 0),
                isLoading: false
            }, () => {
                if (this.data.showDetail && this.data.currentDepartment) this.refreshCurrentDepartmentView();
            });
        }).catch(err => {
            console.error(err);
            this.setData({ isLoading: false });
            wx.showToast({ title: '加载失败', icon: 'none' });
        });
    },

    refreshCurrentDepartmentView() {
        const d = this.data.departments.find(d => d.id === this.data.currentDepartment.id);
        if (d) {
            const list = this.data.filterType === 'all' ? d.pendingList : d.pendingList.filter(f => f.confidence < this.data.aiThreshold);
            this.setData({ currentDepartment: d, currentFeedbacks: list });
        }
    },
    viewDepartment(e) {
        const d = this.data.departments.find(d => d.id === e.currentTarget.dataset.id);
        if (!d) return;
        this.setData({ currentDepartment: d, showDetail: true, currentFeedbacks: d.pendingList, filterType: 'all' });
    },
    backToList() {
        if (this.innerAudioContext) { this.innerAudioContext.stop(); this.innerAudioContext.destroy(); this.innerAudioContext = null; }
        this.setData({ showDetail: false, currentDepartment: null, currentFeedbacks: [], isPlaying: false, currentPlayingId: null });
    },
    filterFeedbacks(e) {
        const type = e.currentTarget.dataset.type;
        const list = type === 'lowConfidence' ? this.data.currentDepartment.pendingList.filter(f => f.confidence < this.data.aiThreshold) : this.data.currentDepartment.pendingList;
        this.setData({ filterType: type, currentFeedbacks: list });
    },
    playVoice(e) {
        if (e.stopPropagation) e.stopPropagation();
        const url = e.currentTarget.dataset.url, id = e.currentTarget.dataset.id;
        if (!url) return wx.showToast({ title: '语音文件不存在', icon: 'none' });
        if (this.data.isPlaying && this.data.currentPlayingId === id) {
            if (this.innerAudioContext) { this.innerAudioContext.stop(); this.innerAudioContext.destroy(); this.innerAudioContext = null; }
            this.setData({ isPlaying: false, currentPlayingId: null });
            return;
        }
        if (this.innerAudioContext) { this.innerAudioContext.stop(); this.innerAudioContext.destroy(); }
        const ctx = wx.createInnerAudioContext();
        this.innerAudioContext = ctx;
        ctx.src = url;
        ctx.play();
        this.setData({ isPlaying: true, currentPlayingId: id });
        ctx.onPlay(() => wx.showToast({ title: '播放中...', icon: 'none' }));
        ctx.onEnded(() => { this.setData({ isPlaying: false, currentPlayingId: null }); ctx.destroy(); this.innerAudioContext = null; });
        ctx.onError(() => { wx.showToast({ title: '播放失败', icon: 'none' }); this.setData({ isPlaying: false }); ctx.destroy(); this.innerAudioContext = null; });
    },
    viewVoiceText(e) {
        const text = (e.currentTarget.dataset.text || '').replace(/^undefined$/,'');
        if (!text) return;
        wx.showModal({ title: '语音转写内容', content: text, showCancel: false });
    },
    manualClassify(e) {
        if (e.stopPropagation) e.stopPropagation();
        const fid = e.currentTarget.dataset.id;
        wx.showActionSheet({
            itemList: ['农业服务部','基建维修部','环境整治部','医疗卫生部','民政服务部','综合服务部'],
            success: r => {
                const depts = ['agriculture','infrastructure','environment','health','civil','general'];
                app.request({ url: `/api/admin/feedbacks/${fid}/classify`, method: 'POST', data: { category: depts[r.tapIndex], confidence:100 } })
                .then(() => { wx.showToast({ title: '分类成功' }); return this.loadDepartmentData(); })
                .then(() => { if(app.triggerFeedbackUpdate) app.triggerFeedbackUpdate(); })
                .catch(err => { wx.showToast({ title: err.message || '分类失败', icon: 'none' }); });
            }
        });
    },
    markAsCompleted(e) {
        if (e.stopPropagation) e.stopPropagation();
        const fid = e.currentTarget.dataset.id;
        wx.showModal({
            title: '确认处理',
            content: '确定要将该反馈标记为已处理吗？',
            success: r => {
                if (r.confirm) {
                    app.request({ url: `/api/admin/feedbacks/${fid}/complete`, method: 'POST' })
                    .then(() => { wx.showToast({ title: '已设为已处理' }); return this.loadDepartmentData(); })
                    .then(() => { if(app.triggerFeedbackUpdate) app.triggerFeedbackUpdate(); })
                    .catch(err => { wx.showToast({ title: err.message || '操作失败', icon: 'none' }); });
                }
            }
        });
    },
    viewFeedbackDetail(e) {
        const fb = this.data.currentFeedbacks.find(f => f.id == e.currentTarget.dataset.id);
        if (!fb) return;
        const v = (fb.voice_text || '').replace(/^undefined$/,'');
        let c = `内容：${fb.content}\n\nAI置信度：${fb.confidence}%\n`;
        if (fb.confidence < this.data.aiThreshold) c += '⚠️ 需要人工复核\n';
        if (v) c += `\n📝 语音转写：${v}`;
        wx.showModal({ title: fb.title, content: c, showCancel: false });
    },
    getConfidenceClass(conf) {
        if (conf >= 80) return 'high';
        if (conf >= 60) return 'medium';
        return 'low';
    }
});