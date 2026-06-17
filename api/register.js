module.exports = async (req, res) => {
    // 解析请求体
    if (req.method === 'POST' && req.body === undefined) {
        await new Promise((resolve, reject) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                try {
                    req.body = JSON.parse(body);
                } catch (e) {
                    req.body = {};
                }
                resolve();
            });
            req.on('error', reject);
        });
    }

    // 设置 CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const fs = require('fs');
    const path = require('path');
    const DATA_FILE = '/tmp/registrations.json';

    // 读取数据
    const readData = () => {
        try {
            if (!fs.existsSync(DATA_FILE)) return [];
            return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
        } catch (e) {
            return [];
        }
    };

    // 写入数据
    const writeData = (data) => {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
    };

    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    // 提交报名
    if (req.method === 'POST' && pathname === '/api/register') {
        try {
            const formData = req.body || {};

            if (!formData.name || !formData.team || !formData.project || !formData.bigGroup) {
                return res.status(400).json({ success: false, message: '请填写所有必填项' });
            }

            const data = readData();
            const exists = data.find(item => item.name === formData.name && item.team === formData.team);

            if (exists) {
                return res.status(400).json({ success: false, message: '该选手已报名，请勿重复提交' });
            }

            formData.registrationId = 'REG' + Date.now();
            formData.submitTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

            data.push(formData);
            writeData(data);

            res.json({ success: true, message: '报名成功', registrationId: formData.registrationId });
        } catch (e) {
            res.status(500).json({ success: false, message: e.message });
        }
    }

    // 获取所有数据
    else if (req.method === 'GET' && pathname === '/api/registrations') {
        res.json(readData());
    }

    // 删除单条
    else if (req.method === 'DELETE' && pathname.startsWith('/api/registration/')) {
        const id = pathname.split('/').pop();
        let data = readData();
        const index = data.findIndex(item => item.registrationId === id);
        if (index === -1) return res.status(404).json({ success: false, message: '记录不存在' });
        data.splice(index, 1);
        writeData(data);
        res.json({ success: true });
    }

    // 导出
    else if (req.method === 'GET' && pathname === '/api/export') {
        const data = readData();
        if (data.length === 0) return res.status(400).send('暂无数据可导出');

        const headers = ['注册号', '姓名', '性别', '代表队', '参赛项目', '大组别', '小组别', '混团', '团体', 'MQS', '联系电话', '备注', '报名时间'];
        const rows = data.map(item => [item.registrationId, item.name, item.gender, item.team, item.project, item.bigGroup, item.smallGroup, item.mixedTeam ? '是' : '否', item.teamEvent ? '是' : '否', item.mqs ? '是' : '否', item.phone, item.remarks, item.submitTime]);

        const csv = '\uFEFF' + [headers, ...rows].map(row => row.map(c => `"${String(c || '').replace(/"/g, '""')}"`).join(',')).join('\n');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename=registrations.csv');
        res.send(csv);
    }

    // 清空
    else if (req.method === 'POST' && pathname === '/api/clear') {
        writeData([]);
        res.json({ success: true });
    }

    else {
        res.status(404).json({ error: 'Not found' });
    }
};
