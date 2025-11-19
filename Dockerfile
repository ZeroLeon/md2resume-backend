# 使用官方Node.js运行时作为基础镜像
FROM node:18-alpine

# 安装PinMe CLI和其他系统依赖
RUN npm install -g pinme && \
    apk add --no-cache \
    python3 \
    make \
    g++ \
    pixman-dev \
    pangomm-dev \
    libjpeg-turbo-dev \
    freetype-dev

# 设置工作目录
WORKDIR /app

# 复制package文件
COPY package*.json ./

# 安装依赖
RUN npm ci --only=production

# 复制所有文件
COPY . .

# 创建必要的目录并设置权限
RUN mkdir -p uploads temp generated-resumes && \
    chown -R node:node /app

# 创建非root用户
RUN addgroup -g 1001 -S node && \
    adduser -S node -u 1001 -G node

# 切换到非root用户
USER node

# 暴露端口
EXPOSE 3001

# 设置环境变量
ENV NODE_ENV=production

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3001/api/pinme-status', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# 启动应用
CMD ["npm", "start"]