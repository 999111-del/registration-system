/**
 * 比赛报名系统 - 后端服务
 * 使用 Node.js + Express
 * 数据存储在本地 JSON 文件
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3000;

// 数据文件路径
const DATA_FILE = path.join(__dirname, 'data', 'registrations.json');
const DATA_DIR = path.join(__dirname, 'data');

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // 静态文件服务

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

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

// ============ API 路由 ============

// 提交报名
app.post('/api/register', (req, res) => {
    try {
        const formData = req.body;
        
        // 验证必填字段
        if (!formData.name || !formData.team || !formData.project || !formData.bigGroup) {
            return res.status(400).json({ 
                success: false, 
                message: '请填写所有必填项' 
            });
        }
        
        // 读取现有数据
        const data = readData();
        
        // 检查是否重复（同名+同队）
        const exists = data.find(item => 
            item.name === formData.name && item.team === formData.team
        );
        
        if (exists) {
            return res.status(400).json({ 
                success: false, 
                message: '该选手已报名，请勿重复提交' 
            });
        }
        
        // 添加注册号和时间
        formData.registrationId = 'REG' + Date.now();
        formData.submitTime = new Date().toLocaleString('zh-CN', { 
            timeZone: 'Asia/Shanghai' 
        });
        
        // 保存
        data.push(formData);
        writeData(data);
        
        res.json({ 
            success: true, 
            message: '报名成功',
            registrationId: formData.registrationId 
        });
        
    } catch (e) {
        console.error('报名失败:', e);
        res.status(500).json({ 
            success: false, 
            message: '服务器错误: ' + e.message 
        });
    }
});

// 获取所有报名数据
app.get('/api/registrations', (req, res) => {
    try {
        const data = readData();
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 删除单条报名
app.delete('/api/registration/:id', (req, res) => {
    try {
        const { id } = req.params;
        let data = readData();
        const index = data.findIndex(item => item.registrationId === id);
        
        if (index === -1) {
            return res.status(404).json({ 
                success: false, 
                message: '记录不存在' 
            });
        }
        
        data.splice(index, 1);
        writeData(data);
        
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// 清空所有数据
app.post('/api/clear', (req, res) => {
    try {
        writeData([]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// 导出 Excel (CSV格式，可被Excel打开)
app.get('/api/export', (req, res) => {
    try {
        const data = readData();
        
        if (data.length === 0) {
            return res.status(400).send('暂无数据可导出');
        }
        
        // CSV 表头
        const headers = ['注册号', '姓名', '性别', '代表队', '参赛项目', '大组别', '小组别', '混团', '团体', 'MQS', '联系电话', '备注', '报名时间'];
        
        // CSV 内容
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
        
        // 添加 BOM 以支持 Excel 中文显示
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
});

// 获取项目列表（可扩展）
app.get('/api/projects', (req, res) => {
    res.json(['项目A', '项目B', '项目C']);
});

// ============ 页面路由 ============

// 报名页面
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 管理后台
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// 启动服务
app.listen(PORT, () => {
    console.log(`\n========================================`);
    console.log(`🎯 比赛报名系统已启动`);
    console.log(`========================================`);
    console.log(`📱 报名页面: http://localhost:${PORT}`);
    console.log(`🔧 管理后台: http://localhost:${PORT}/admin`);
    console.log(`========================================\n`);
});
