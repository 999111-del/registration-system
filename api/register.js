const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 数据文件路径（在 Vercel 上使用 /tmp 目录）
const DATA_DIR = '/tmp';
const DATA_FILE = path.join(DATA_DIR, 'registrations.json');

// 确保数据文件存在
if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, '[]', 'utf-8');
}

// 读取数据
function readData() {
    try {
        const data = fs.readFileSync(DATA_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (e) {
        return [];
    }
}

// 写入数据
function writeData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

module.exports = (req, res) => {
    // 设置 CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const { method } = req;
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    // 提交报名
    if (method === 'POST' && pathname === '/api/register') {
        try {
            const formData = req.body;

            if (!formData.name || !formData.team || !formData.project || !formData.bigGroup) {
                return res.status(400).json({
                    success: false,
                    message: '请填写所有必填项'
                });
            }

            const data = readData();
            const exists = data.find(item =>
                item.name === formData.name && item.team === formData.team
            );

            if (exists) {
                return res.status(400).json({
                    success: false,
                    message: '该选手已报名，请勿重复提交'
                });
            }

            formData.registrationId = 'REG' + Date.now();
            formData.submitTime = new Date().toLocaleString('zh-CN', {
                timeZone: 'Asia/Shanghai'
            });

            data.push(formData);
            writeData(data);

            res.json({
                success: true,
                message: '报名成功',
                registrationId: formData.registrationId
            });
        } catch (e) {
            res.status(500).json({ success: false, message: e.message });
        }
    }

    // 获取所有数据
    else if (method === 'GET' && pathname === '/api/registrations') {
        try {
            const data = readData();
            res.json(data);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }

    // 删除单条
    else if (method === 'DELETE' && pathname.startsWith('/api/registration/')) {
        try {
            const id = pathname.split('/').pop();
            let data = readData();
            const index = data.findIndex(item => item.registrationId === id);

            if (index === -1) {
                return res.status(404).json({ success: false, message: '记录不存在' });
            }

            data.splice(index, 1);
            writeData(data);
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, message: e.message });
        }
    }

    // 导出
    else if (method === 'GET' && pathname === '/api/export') {
        try {
            const data = readData();
            if (data.length === 0) {
                return res.status(400).send('暂无数据可导出');
            }

            const headers = ['注册号', '姓名', '性别', '代表队', '参赛项目', '大组别', '小组别', '混团', '团体', 'MQS', '联系电话', '备注', '报名时间'];
            const rows = data.map(item => [
                item.registrationId || '',
                item.name || '',
                item.gender || '',
                item.team || '',
                item.project || '',
                item.bigGroup || '',
                item.smallGroup || '',
                item.mixedTeam ? '是' : '否',
                item.teamEvent ? '是' : '否',
                item.mqs ? '是' : '否',
                item.phone || '',
                item.remarks || '',
                item.submitTime || ''
            ]);

            const BOM = '\uFEFF';
            const csv = BOM + [headers, ...rows]
                .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
                .join('\n');

            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename=registrations_${Date.now()}.csv`);
            res.send(csv);
        } catch (e) {
            res.status(500).send('导出失败: ' + e.message);
        }
    }

    // 清空数据
    else if (method === 'POST' && pathname === '/api/clear') {
        try {
            writeData([]);
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, message: e.message });
        }
    }

    else {
        res.status(404).json({ error: 'Not found' });
    }
};
