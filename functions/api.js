const fs = require('fs');
const path = require('path');

const DATA_DIR = '/tmp';
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const COMPETITIONS_FILE = path.join(DATA_DIR, 'competitions.json');
const REGISTRATIONS_FILE = path.join(DATA_DIR, 'registrations.json');

// 简单密码哈希（生产环境请用 bcrypt）
const hashPassword = (pwd) => {
    return Buffer.from(pwd).toString('base64');
};

const verifyPassword = (pwd, hash) => {
    return Buffer.from(pwd).toString('base64') === hash;
};

// 生成 JWT token（简化版）
const generateToken = (userId, username, role) => {
    const payload = { userId, username, role, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 };
    return Buffer.from(JSON.stringify(payload)).toString('base64');
};

const verifyToken = (token) => {
    try {
        const payload = JSON.parse(Buffer.from(token, 'base64').toString());
        if (payload.exp < Date.now()) return null;
        return payload;
    } catch {
        return null;
    }
};

// admin 用户硬编码检查（不受冷启动影响）
const isAdminUser = (username) => username && username.toLowerCase() === 'admin';

// 读取数据
const readJSON = (file, defaultVal = []) => {
    try {
        const filepath = path.join(DATA_DIR, file);
        if (!fs.existsSync(filepath)) return defaultVal;
        return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
    } catch (e) {
        return defaultVal;
    }
};

// 写入数据
const writeJSON = (file, data) => {
    const filepath = path.join(DATA_DIR, file);
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
};

// 通用响应头
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Content-Type': 'application/json'
};

exports.handler = async (event, context) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: corsHeaders, body: '' };
    }

    const path = event.path.replace('/.netlify/functions/api', '');
    const body = event.body ? JSON.parse(event.body) : {};
    const authHeader = event.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    const currentUser = verifyToken(token);

    // ========== 认证接口 ==========

    // 注册教练账号
    if (event.httpMethod === 'POST' && path === '/auth/register') {
        const { username, password, name, phone } = body;
        if (!username || !password || !name) {
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ success: false, message: '请填写用户名、密码和姓名' }) };
        }
        if (username.length < 3 || password.length < 6) {
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ success: false, message: '用户名至少3位，密码至少6位' }) };
        }

        const users = readJSON('users.json', []);
        if (users.find(u => u.username === username)) {
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ success: false, message: '用户名已存在' }) };
        }

        // 用户名 admin 拥有管理员权限
        const role = username.toLowerCase() === 'admin' ? 'admin' : 'coach';
        
        const user = {
            id: 'USER' + Date.now(),
            username,
            password: hashPassword(password),
            name,
            phone: phone || '',
            role,
            createdAt: new Date().toISOString()
        };
        users.push(user);
        writeJSON('users.json', users);

        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ 
            success: true, 
            token: generateToken(user.id, user.username, user.role),
            user: { id: user.id, username: user.username, name: user.name, role: user.role }
        }) };
    }

    // 教练登录
    if (event.httpMethod === 'POST' && path === '/auth/login') {
        const { username, password } = body;
        const users = readJSON('users.json', []);
        const user = users.find(u => u.username === username);
        
        if (!user || !verifyPassword(password, user.password)) {
            return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ success: false, message: '用户名或密码错误' }) };
        }

        // admin 用户始终拥有管理员权限
        const role = username.toLowerCase() === 'admin' ? 'admin' : (user.role || 'coach');

        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ 
            success: true, 
            token: generateToken(user.id, user.username, role),
            user: { id: user.id, username: user.username, name: user.name, role }
        }) };
    }

    // 获取当前用户信息
    if (event.httpMethod === 'GET' && path === '/auth/me') {
        if (!currentUser) {
            return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ success: false, message: '请先登录' }) };
        }
        const users = readJSON('users.json', []);
        const user = users.find(u => u.id === currentUser.userId);
        if (!user) {
            return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ success: false, message: '用户不存在' }) };
        }
        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ 
            success: true, 
            user: { id: user.id, username: user.username, name: user.name, role: user.role }
        }) };
    }

    // ========== 比赛管理接口 ==========

    // 获取比赛列表
    if (event.httpMethod === 'GET' && path === '/competitions') {
        const competitions = readJSON('competitions.json', []);
        // 返回时隐藏密码字段
        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(competitions) };
    }

    // 创建比赛（需要登录）
    if (event.httpMethod === 'POST' && path === '/competitions') {
        if (!currentUser) {
            return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ success: false, message: '请先登录' }) };
        }
        if (!isAdminUser(currentUser.username)) {
            return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ success: false, message: '需要管理员权限' }) };
        }
        
        const { name, description, startTime, endTime } = body;
        if (!name || !startTime || !endTime) {
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ success: false, message: '请填写完整信息' }) };
        }

        const competitions = readJSON('competitions.json', []);
        const competition = {
            id: 'COMP' + Date.now(),
            name,
            description: description || '',
            startTime,
            endTime,
            status: 'active',
            createdBy: currentUser.userId,
            createdAt: new Date().toISOString()
        };
        competitions.push(competition);
        writeJSON('competitions.json', competitions);

        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, competition }) };
    }

    // 更新比赛
    if (event.httpMethod === 'PUT' && path.startsWith('/competition/')) {
        if (!currentUser) {
            return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ success: false, message: '请先登录' }) };
        }
        if (!isAdminUser(currentUser.username)) {
            return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ success: false, message: '需要管理员权限' }) };
        }
        
        const id = path.split('/').pop();
        const competitions = readJSON('competitions.json', []);
        const index = competitions.findIndex(c => c.id === id);
        
        if (index === -1) {
            return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ success: false, message: '比赛不存在' }) };
        }

        const { name, description, startTime, endTime, status } = body;
        competitions[index] = {
            ...competitions[index],
            name: name || competitions[index].name,
            description: description !== undefined ? description : competitions[index].description,
            startTime: startTime || competitions[index].startTime,
            endTime: endTime || competitions[index].endTime,
            status: status || competitions[index].status
        };
        writeJSON('competitions.json', competitions);

        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, competition: competitions[index] }) };
    }

    // ========== 报名接口 ==========

    // 提交报名（需要登录）
    if (event.httpMethod === 'POST' && path === '/register') {
        if (!currentUser) {
            return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ success: false, message: '请先登录' }) };
        }

        const { competitionId, name, gender, team, project, bigGroup, smallGroup, mixedTeam, teamEvent, mqs, phone, remarks } = body;
        
        if (!competitionId || !name || !team || !project || !bigGroup) {
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ success: false, message: '请填写所有必填项' }) };
        }

        // 检查比赛是否存在
        const competitions = readJSON('competitions.json', []);
        const competition = competitions.find(c => c.id === competitionId);
        if (!competition) {
            return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ success: false, message: '比赛不存在' }) };
        }

        // 检查报名时间
        const now = new Date();
        const start = new Date(competition.startTime);
        const end = new Date(competition.endTime);
        if (now < start) {
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ success: false, message: '报名尚未开始' }) };
        }
        if (now > end) {
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ success: false, message: '报名已截止' }) };
        }

        const registrations = readJSON('registrations.json', []);
        
        // 检查是否重复报名（同一比赛同一选手）
        const exists = registrations.find(r => r.competitionId === competitionId && r.name === name && r.team === team);
        if (exists) {
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ success: false, message: '该选手已在此比赛中报名' }) };
        }

        const registration = {
            id: 'REG' + Date.now(),
            competitionId,
            competitionName: competition.name,
            userId: currentUser.userId,
            userName: currentUser.username,
            name,
            gender: gender || '',
            team,
            project,
            bigGroup,
            smallGroup: smallGroup || '',
            mixedTeam: mixedTeam || false,
            teamEvent: teamEvent || false,
            mqs: mqs || false,
            phone: phone || '',
            remarks: remarks || '',
            status: 'registered',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        registrations.push(registration);
        writeJSON('registrations.json', registrations);

        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, registration }) };
    }

    // 获取我的报名列表（需要登录，只能看自己的）
    if (event.httpMethod === 'GET' && path === '/my-registrations') {
        if (!currentUser) {
            return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ success: false, message: '请先登录' }) };
        }

        const competitionId = event.queryStringParameters?.competitionId;
        let registrations = readJSON('registrations.json', []);
        const competitions = readJSON('competitions.json', []);
        
        // 只能看自己的报名
        registrations = registrations.filter(r => r.userId === currentUser.userId);
        
        // 如果指定了比赛，筛选该比赛的报名
        if (competitionId) {
            registrations = registrations.filter(r => r.competitionId === competitionId);
        }

        // 添加比赛名称
        registrations = registrations.map(r => {
            const comp = competitions.find(c => c.id === r.competitionId);
            return { ...r, competitionName: comp ? comp.name : '' };
        });

        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(registrations) };
    }

    // 修改报名（需要登录，只能改自己的，在报名时间内）
    if (event.httpMethod === 'PUT' && path.startsWith('/registration/')) {
        if (!currentUser) {
            return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ success: false, message: '请先登录' }) };
        }

        const id = path.split('/').pop();
        const registrations = readJSON('registrations.json', []);
        const index = registrations.findIndex(r => r.id === id);
        
        if (index === -1) {
            return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ success: false, message: '报名记录不存在' }) };
        }

        // 检查是否是本人的报名
        if (registrations[index].userId !== currentUser.userId) {
            return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ success: false, message: '无权修改此报名' }) };
        }

        // 检查报名时间
        const competitions = readJSON('competitions.json', []);
        const competition = competitions.find(c => c.id === registrations[index].competitionId);
        if (competition) {
            const now = new Date();
            const end = new Date(competition.endTime);
            if (now > end) {
                return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ success: false, message: '报名已截止，无法修改' }) };
            }
        }

        const { name, gender, team, project, bigGroup, smallGroup, mixedTeam, teamEvent, mqs, phone, remarks } = body;
        registrations[index] = {
            ...registrations[index],
            name: name !== undefined ? name : registrations[index].name,
            gender: gender !== undefined ? gender : registrations[index].gender,
            team: team !== undefined ? team : registrations[index].team,
            project: project !== undefined ? project : registrations[index].project,
            bigGroup: bigGroup !== undefined ? bigGroup : registrations[index].bigGroup,
            smallGroup: smallGroup !== undefined ? smallGroup : registrations[index].smallGroup,
            mixedTeam: mixedTeam !== undefined ? mixedTeam : registrations[index].mixedTeam,
            teamEvent: teamEvent !== undefined ? teamEvent : registrations[index].teamEvent,
            mqs: mqs !== undefined ? mqs : registrations[index].mqs,
            phone: phone !== undefined ? phone : registrations[index].phone,
            remarks: remarks !== undefined ? remarks : registrations[index].remarks,
            updatedAt: new Date().toISOString()
        };
        writeJSON('registrations.json', registrations);

        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, registration: registrations[index] }) };
    }

    // 删除报名（需要登录，只能删自己的）
    if (event.httpMethod === 'DELETE' && path.startsWith('/registration/')) {
        if (!currentUser) {
            return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ success: false, message: '请先登录' }) };
        }

        const id = path.split('/').pop();
        let registrations = readJSON('registrations.json', []);
        const registration = registrations.find(r => r.id === id);
        
        if (!registration) {
            return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ success: false, message: '报名记录不存在' }) };
        }

        // 检查是否是本人的报名
        if (registration.userId !== currentUser.userId) {
            return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ success: false, message: '无权删除此报名' }) };
        }

        // 检查报名时间
        const competitions = readJSON('competitions.json', []);
        const competition = competitions.find(c => c.id === registration.competitionId);
        if (competition) {
            const now = new Date();
            const end = new Date(competition.endTime);
            if (now > end) {
                return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ success: false, message: '报名已截止，无法删除' }) };
            }
        }

        registrations = registrations.filter(r => r.id !== id);
        writeJSON('registrations.json', registrations);

        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true }) };
    }

    // 获取所有报名（管理员）
    if (event.httpMethod === 'GET' && path === '/all-registrations') {
        if (!currentUser) {
            return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ success: false, message: '请先登录' }) };
        }
        if (!isAdminUser(currentUser.username)) {
            return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ success: false, message: '需要管理员权限' }) };
        }
        const registrations = readJSON('registrations.json', []);
        const competitions = readJSON('competitions.json', []);
        const users = readJSON('users.json', []);
        
        // 添加教练姓名和比赛名称
        const enriched = registrations.map(r => {
            const comp = competitions.find(c => c.id === r.competitionId);
            const user = users.find(u => u.id === r.userId);
            return { ...r, userName: user ? (user.name || user.username) : '', competitionName: comp ? comp.name : '' };
        });
        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(enriched) };
    }

    return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: 'Not found' }) };
};
