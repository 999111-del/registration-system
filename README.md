# 比赛报名系统

一个简单的比赛报名系统，包含前端表单和后台管理。

## 快速开始

### 本地运行

```bash
npm install
npm start
```

- 报名页面: http://localhost:3000
- 管理后台: http://localhost:3000/admin

### 部署到 Vercel（推荐）

1. **上传到 GitHub**
   - 创建新仓库
   - 上传此文件夹所有文件

2. **在 Vercel 部署**
   - 访问 https://vercel.com
   - 用 GitHub 登录
   - 点击 "Import Project"
   - 选择你的仓库
   - 点击 Deploy

3. **获得公网链接**
   - 部署完成后获得 `https://你的项目.vercel.app`

## 部署到 Railway

1. 访问 https://railway.app
2. 用 GitHub 登录
3. New Project → Deploy from GitHub repo
4. 选择仓库
5. 添加环境变量: `NODE_ENV=production`

## 功能

- 用户填写报名表单
- 后台查看所有报名数据
- 搜索、筛选功能
- 导出 CSV/Excel
- 数据本地存储

## 注意

Vercel 免费版使用 `/tmp` 目录存储数据，每次部署会清空。如需持久化数据，建议：
1. 使用 Railway（支持持久化存储）
2. 接入云数据库（MongoDB、Supabase 等）
