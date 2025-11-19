FROM node:18-alpine

# 安装必要的系统依赖（用于编译native模块）
RUN apk add --no-cache python3 make g++

# 设置工作目录
WORKDIR /app

# 复制package文件
COPY package*.json ./

# 安装PinMe CLI全局工具
RUN npm install -g pinme

# 安装项目依赖（使用package-lock.json确保一致性）
RUN npm ci --only=production

# 复制所有源代码文件
COPY . .

# 创建必要的目录
RUN mkdir -p uploads temp

# 暴露端口
EXPOSE 3001

# 启动应用
CMD ["npm", "start"]