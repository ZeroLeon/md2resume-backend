# MD2Resume Backend API

## 📋 概述

MD2Resume后端API服务，提供简历部署到IPFS的功能。

## 🚀 部署到Railway

### 前置要求
- GitHub账号
- Railway账号

### 部署步骤

1. **推送到GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/md2resume-backend.git
   git push -u origin main
   ```

2. **连接Railway**
   - 访问 [railway.app](https://railway.app)
   - 点击 "New Project"
   - 选择 "Deploy from GitHub repo"
   - 选择此仓库

3. **配置环境变量**
   在Railway项目设置中添加：
   ```
   NODE_ENV=production
   PORT=3001
   ```

4. **获取部署URL**
   部署完成后，Railway会提供一个URL，类似：
   ```
   https://md2resume-backend-production.up.railway.app
   ```

## 📡 API端点

### 检查PinMe状态
```
GET /api/pinme-status
```

### 上传文件
```
POST /api/upload
Content-Type: multipart/form-data
```

### 部署到IPFS
```
POST /api/deploy
Content-Type: application/json

{
  "htmlContent": "<html>...</html>",
  "fileName": "resume.html"
}
```

### 获取部署历史
```
GET /api/history
```

### 获取模板列表
```
GET /api/templates
```

## 🔧 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm start

# 或使用nodemon
npm run server:dev
```

## 📄 许可证

MIT