const { getStore } = require('@netlify/blobs');

// ========== 工具函数 ==========

const hashPassword = (pwd) => Buffer.from(pwd).toString('base64');
const verifyPassword = (pwd, hash) => Buffer.from(pwd).toString('base64') === hash;

const generateToken = (userId, username, role) => {
    const payload = { userId, username, role, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 };
    return Buffer.from(JSON.stringify(payload)).toString('base64');
};

const verifyToken = (token) => {
    try {
        const payload = JSON.parse(Buffer.from(token, 'base64').toString());
        if (payload.exp < Date.now()) return null;
        return payload;
    } catch { return null; }
};

const isAdminUser = (username) => username && username.toLowerCase() === 'admin';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Content-Type': 'application/json'
};

// ========== 持久化存储（Netlify Blobs）==========

async function getStoreInstance() {
    return getStore('registration-data');
}

async function readJSON(key, defaultVal = []) {
    try {
        const store = await getStoreInstance();
        const data = await store.get(key, { type: 'json' });
        return data || defaultVal;
    } catch (e) {
        return defaultVal;
    }
}

async function writeJSON(key, data) {
    const store = await getStoreInstance();
    await store.setJSON(key, data);
}

// ========== 主处理函数 ==========

exports.handler = async (event, context) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: corsHeaders, body: '' };
    }

    const urlPath = event.path.replace('/.netlify/functions/api', '');
    const body = event.body ? JSON.parse(event.body) : {};
    const authHeader = event.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    const currentUser = verifyToken(token);

    // ========== 认证接口 ==========

    // 注册教练账号
    if (event.httpMethod === 'POST' && urlPath === '/auth/register') {
        const { username, password, name, phone } = body;
        if (!username || !password || !name) {
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ success: false, message: '请填写用户名、密码和姓名' }) };
        }
        if (username.length < 3 || password.length < 6) {
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ success: false, message: '用户名至少3位，密码至少6位' }) };
        }
        if (username.toLowerCase() === 'admin') {
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ success: false, message: '该用户名不可注册' }) };
        }

        const users = await readJSON('users', []);
        if (users.find(u => u.username === username)) {
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ success: false, message: '用户名已存在' }) };
        }

        const user = {
            id: 'USER' + Date.now(),
            username,
            password: hashPassword(password),
            name,
            phone: phone || '',
            role: 'coach',
            createdAt: new Date().toISOString()
        };
        users.push(user);
        await writeJSON('users', users);

        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({
            success: true,
            token: generateToken(user.id, user.username, user.role),
            user: { id: user.id, username: user.username, name: user.name, role: user.role }
        }) };
    }

    // 教练登录
    if (event.httpMethod === 'POST' && urlPath === '/auth/login') {
        const { username, password } = body;

        // 硬编码 admin 账号
        if (username.toLowerCase() === 'admin') {
            if (password !== 'admin123') {
                return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ success: false, message: '用户名或密码错误' }) };
            }
            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({
                success: true,
                token: generateToken('ADMIN_PERM', 'admin', 'admin'),
                user: { id: 'ADMIN_PERM', username: 'admin', name: '管理员', role: 'admin' }
            }) };
        }

        const users = await readJSON('users', []);
        const user = users.find(u => u.username === username);

        if (!user || !verifyPassword(password, user.password)) {
            return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ success: false, message: '用户名或密码错误' }) };
        }

        const role = user.role || 'coach';
        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({
            success: true,
            token: generateToken(user.id, user.username, role),
            user: { id: user.id, username: user.username, name: user.name, role }
        }) };
    }

    // 获取当前用户信息
    if (event.httpMethod === 'GET' && urlPath === '/auth/me') {
        if (!currentUser) {
            return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ success: false, message: '请先登录' }) };
        }
        if (isAdminUser(currentUser.username)) {
            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({
                success: true,
                user: { id: 'ADMIN_PERM', username: 'admin', name: '管理员', role: 'admin' }
            }) };
        }
        const users = await readJSON('users', []);
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

    // 获取比赛列表（公开接口，不需要登录）
    if (event.httpMethod === 'GET' && urlPath === '/competitions') {
        const competitions = await readJSON('competitions', []);
        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(competitions) };
    }

    // 创建比赛（需要管理员权限）
    if (event.httpMethod === 'POST' && urlPath === '/competitions') {
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

        const competitions = await readJSON('competitions', []);
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
        await writeJSON('competitions', competitions);

        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, competition }) };
    }

    // 更新比赛（需要管理员权限）
    if (event.httpMethod === 'PUT' && urlPath.startsWith('/competition/')) {
        if (!currentUser) {
            return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ success: false, message: '请先登录' }) };
        }
        if (!isAdminUser(currentUser.username)) {
            return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ success: false, message: '需要管理员权限' }) };
        }

        const id = urlPath.split('/').pop();
        const competitions = await readJSON('competitions', []);
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
        await writeJSON('competitions', competitions);

        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, competition: competitions[index] }) };
    }

    // ========== 报名接口 ==========

    // 提交报名（需要登录）
    if (event.httpMethod === 'POST' && urlPath === '/register') {
        if (!currentUser) {
            return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ success: false, message: '请先登录' }) };
        }

        const { competitionId, name, gender, team, project, bigGroup, smallGroup, mixedTeam, teamEvent, mqs, phone, remarks } = body;

        if (!competitionId || !name || !team || !project || !bigGroup) {
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ success: false, message: '请填写所有必填项' }) };
        }

        const competitions = await readJSON('competitions', []);
        const competition = competitions.find(c => c.id === competitionId);
        if (!competition) {
            return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ success: false, message: '比赛不存在' }) };
        }

        // 检查报名时间（管理员不受限制）
        if (!isAdminUser(currentUser.username)) {
            const now = new Date();
            const start = new Date(competition.startTime);
            const end = new Date(competition.endTime);
            if (now < start) {
                return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ success: false, message: '报名尚未开始，开始时间：' + new Date(competition.startTime).toLocaleString('zh-CN') }) };
            }
            if (now > end) {
                return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ success: false, message: '报名已截止' }) };
            }
        }

        const registrations = await readJSON('registrations', []);

        // 检查重复报名
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
        await writeJSON('registrations', registrations);

        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, registration }) };
    }

    // 获取我的报名列表
    if (event.httpMethod === 'GET' && urlPath === '/my-registrations') {
        if (!currentUser) {
            return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ success: false, message: '请先登录' }) };
        }

        const competitionId = event.queryStringParameters?.competitionId;
        let registrations = await readJSON('registrations', []);
        const competitions = await readJSON('competitions', []);

        // 只能看自己的报名（admin 例外：admin 不查看自己报名，看全部用 all-registrations）
        const userIdFilter = isAdminUser(currentUser.username) ? 'ADMIN_PERM' : currentUser.userId;
        registrations = registrations.filter(r => r.userId === userIdFilter);

        if (competitionId) {
            registrations = registrations.filter(r => r.competitionId === competitionId);
        }

        // 添加比赛名称
        registrations = registrations.map(r => {
            const comp = competitions.find(c => c.id === r.competitionId);
            return { ...r, competitionName: comp ? comp.name : (r.competitionName || '') };
        });

        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(registrations) };
    }

    // 修改报名
    if (event.httpMethod === 'PUT' && urlPath.startsWith('/registration/')) {
        if (!currentUser) {
            return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ success: false, message: '请先登录' }) };
        }

        const id = urlPath.split('/').pop();
        const registrations = await readJSON('registrations', []);
        const index = registrations.findIndex(r => r.id === id);

        if (index === -1) {
            return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ success: false, message: '报名记录不存在' }) };
        }

        if (!isAdminUser(currentUser.username) && registrations[index].userId !== currentUser.userId) {
            return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ success: false, message: '无权修改此报名' }) };
        }

        // 检查报名时间（管理员不受限制）
        if (!isAdminUser(currentUser.username)) {
            const competitions = await readJSON('competitions', []);
            const competition = competitions.find(c => c.id === registrations[index].competitionId);
            if (competition) {
                const now = new Date();
                const end = new Date(competition.endTime);
                if (now > end) {
                    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ success: false, message: '报名已截止，无法修改' }) };
                }
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
        await writeJSON('registrations', registrations);

        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, registration: registrations[index] }) };
    }

    // 删除报名
    if (event.httpMethod === 'DELETE' && urlPath.startsWith('/registration/')) {
        if (!currentUser) {
            return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ success: false, message: '请先登录' }) };
        }

        const id = urlPath.split('/').pop();
        let registrations = await readJSON('registrations', []);
        const registration = registrations.find(r => r.id === id);

        if (!registration) {
            return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ success: false, message: '报名记录不存在' }) };
        }

        if (!isAdminUser(currentUser.username) && registration.userId !== currentUser.userId) {
            return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ success: false, message: '无权删除此报名' }) };
        }

        // 检查报名时间（管理员不受限制）
        if (!isAdminUser(currentUser.username)) {
            const competitions = await readJSON('competitions', []);
            const competition = competitions.find(c => c.id === registration.competitionId);
            if (competition) {
                const now = new Date();
                const end = new Date(competition.endTime);
                if (now > end) {
                    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ success: false, message: '报名已截止，无法删除' }) };
                }
            }
        }

        registrations = registrations.filter(r => r.id !== id);
        await writeJSON('registrations', registrations);

        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true }) };
    }

    // 获取所有报名（管理员）
    if (event.httpMethod === 'GET' && urlPath === '/all-registrations') {
        if (!currentUser) {
            return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ success: false, message: '请先登录' }) };
        }
        if (!isAdminUser(currentUser.username)) {
            return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ success: false, message: '需要管理员权限' }) };
        }
        const registrations = await readJSON('registrations', []);
        const competitions = await readJSON('competitions', []);
        const users = await readJSON('users', []);

        const enriched = registrations.map(r => {
            const comp = competitions.find(c => c.id === r.competitionId);
            const regUser = users.find(u => u.id === r.userId);
            let userName = r.userName || '';
            if (r.userId === 'ADMIN_PERM') userName = '管理员';
            else if (regUser) userName = regUser.name || regUser.username;
            return { ...r, userName, competitionName: comp ? comp.name : (r.competitionName || '') };
        });
        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(enriched) };
    }

    return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: 'Not found' }) };
};
