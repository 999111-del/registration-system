const fs = require('fs');
const DATA_FILE = '/tmp/registrations.json';

const readData = () => {
    try {
        if (!fs.existsSync(DATA_FILE)) return [];
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    } catch (e) {
        return [];
    }
};

const writeData = (data) => {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
};

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    const path = event.path.replace('/.netlify/functions/api', '');
    const body = event.body ? JSON.parse(event.body) : {};

    // 提交报名
    if (event.httpMethod === 'POST' && path === '/register') {
        try {
            if (!body.name || !body.team || !body.project || !body.bigGroup) {
                return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: '请填写所有必填项' }) };
            }

            const data = readData();
            const exists = data.find(item => item.name === body.name && item.team === body.team);
            if (exists) {
                return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: '该选手已报名' }) };
            }

            body.registrationId = 'REG' + Date.now();
            body.submitTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
            data.push(body);
            writeData(data);

            return { statusCode: 200, headers, body: JSON.stringify({ success: true, registrationId: body.registrationId }) };
        } catch (e) {
            return { statusCode: 500, headers, body: JSON.stringify({ success: false, message: e.message }) };
        }
    }

    // 获取列表
    if (event.httpMethod === 'GET' && path === '/registrations') {
        return { statusCode: 200, headers, body: JSON.stringify(readData()) };
    }

    // 删除
    if (event.httpMethod === 'DELETE' && path.startsWith('/registration/')) {
        const id = path.split('/').pop();
        let data = readData();
        const index = data.findIndex(item => item.registrationId === id);
        if (index === -1) return { statusCode: 404, headers, body: JSON.stringify({ success: false, message: '不存在' }) };
        data.splice(index, 1);
        writeData(data);
        return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    // 导出
    if (event.httpMethod === 'GET' && path === '/export') {
        const data = readData();
        if (data.length === 0) return { statusCode: 400, headers, body: '暂无数据' };

        const headers_csv = ['注册号', '姓名', '性别', '代表队', '参赛项目', '大组别', '小组别', '混团', '团体', 'MQS', '联系电话', '备注', '报名时间'];
        const rows = data.map(item => [item.registrationId, item.name, item.gender, item.team, item.project, item.bigGroup, item.smallGroup, item.mixedTeam ? '是' : '否', item.teamEvent ? '是' : '否', item.mqs ? '是' : '否', item.phone, item.remarks, item.submitTime]);
        const csv = '\uFEFF' + [headers_csv, ...rows].map(row => row.map(c => `"${String(c || '').replace(/"/g, '""')}"`).join(',')).join('\n');

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename=registrations.csv' },
            body: csv
        };
    }

    // 清空
    if (event.httpMethod === 'POST' && path === '/clear') {
        writeData([]);
        return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
};
