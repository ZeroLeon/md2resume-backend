# MD2Resume Backend API

这是MD2Resume项目的后端API服务器，提供简历处理和IPFS部署功能。

## 🚀 功能特性

- 📄 Markdown文件上传和解析
- 🎨 多种简历模板支持
- 🌐 IPFS集成，通过PinMe CLI部署
- 📡 RESTful API接口
- 🛡️ 安全性和性能优化

## 📦 技术栈

- **运行时**: Node.js
- **框架**: Express.js
- **文件处理**: Multer
- **IPFS**: PinMe CLI
- **部署**: Docker + Railways

## 🔧 安装和运行

### 开发环境
```bash
npm install
npm run dev
```

### 生产环境
```bash
npm install
npm start
```

## 📡 API接口

- `GET /api/pinme-status` - 检查PinMe安装状态
- `POST /api/upload` - 上传Markdown文件
- `POST /api/deploy` - 部署到IPFS
- `GET /api/templates` - 获取模板列表
- `GET /api/history` - 获取部署历史

## 🚀 部署

### 使用Railways部署
1. 连接GitHub仓库到Railways
2. 配置构建和启动命令
3. 自动部署到生产环境

### 环境变量
- `NODE_ENV`: 环境模式
- `PORT`: 服务端口 (默认3001)

## 📄 许可证

MIT License
