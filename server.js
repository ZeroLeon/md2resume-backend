const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const { exec } = require('child_process');
const util = require('util');

const execPromise = util.promisify(exec);

const app = express();
const PORT = process.env.PORT || 3001;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// 配置文件上传
const storage = multer.diskStorage({
    destination: async function (req, file, cb) {
        const uploadDir = path.join(__dirname, 'uploads');
        try {
            await fs.mkdir(uploadDir, { recursive: true });
            cb(null, uploadDir);
        } catch (error) {
            cb(error);
        }
    },
    filename: function (req, file, cb) {
        const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'text/markdown' ||
            file.originalname.endsWith('.md') ||
            file.originalname.endsWith('.markdown')) {
            cb(null, true);
        } else {
            cb(new Error('只支持 .md 和 .markdown 文件'), false);
        }
    }
});

// 检查PinMe是否安装
async function checkPinMeInstallation() {
    try {
        await execPromise('pinme --version');
        return true;
    } catch (error) {
        return false;
    }
}

// 调用PinMe CLI部署
async function deployWithPinMeCLI(filePath) {
    try {
        // 执行上传命令
        const uploadResult = await execPromise(`pinme upload "${filePath}"`);

        // 等待一秒确保上传完成，然后获取上传历史
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 获取最新的上传记录
        const listResult = await execPromise(`pinme list -l 1`);

        // 解析上传历史获取真实的ENS URL
        const listOutput = listResult.stdout + listResult.stderr;

        // 从列表输出中提取ENS URL (匹配 xxx.pinit.eth.limo 格式)
        const ensUrlMatch = listOutput.match(/(https:\/\/[a-z0-9]+\.pinit\.eth\.limo)/i);
        const ensUrl = ensUrlMatch ? ensUrlMatch[1] : null;

        // 从列表输出中提取IPFS CID (匹配 bafy... 格式)
        const cidMatch = listOutput.match(/IPFS CID: (baf[a-z0-9]+)/i);
        const cid = cidMatch ? cidMatch[1] : null;

        if (!ensUrl) {
            throw new Error('无法从PinMe历史中解析ENS域名');
        }

        return {
            success: true,
            cid: cid || 'unknown',
            ensUrl: ensUrl,
            ipfsUrl: ensUrl, // 使用ENS URL作为主要访问地址
            gatewayUrl: ensUrl,
            uploadOutput: uploadResult.stdout + uploadResult.stderr,
            listOutput: listOutput
        };

    } catch (error) {
        console.error('PinMe部署失败:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// API路由

// 检查PinMe安装状态
app.get('/api/pinme-status', async (req, res) => {
    try {
        const isInstalled = await checkPinMeInstallation();
        res.json({
            installed: isInstalled,
            message: isInstalled ? 'PinMe CLI已安装' : 'PinMe CLI未安装'
        });
    } catch (error) {
        res.status(500).json({
            installed: false,
            error: error.message
        });
    }
});

// 上传Markdown文件
app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: '未上传文件' });
        }

        // 读取文件内容
        const content = await fs.readFile(req.file.path, 'utf8');

        // 清理临时文件
        await fs.unlink(req.file.path);

        res.json({
            success: true,
            filename: req.file.originalname,
            content: content
        });

    } catch (error) {
        console.error('文件上传失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 部署到IPFS
app.post('/api/deploy', async (req, res) => {
    try {
        const { htmlContent, fileName } = req.body;

        if (!htmlContent) {
            return res.status(400).json({ error: 'HTML内容为空' });
        }

        // 检查PinMe是否安装
        const pinMeInstalled = await checkPinMeInstallation();
        if (!pinMeInstalled) {
            return res.status(400).json({
                error: 'PinMe CLI未安装',
                installGuide: `
请按照以下步骤安装PinMe CLI：
1. 打开终端/命令行工具
2. 运行: npm install -g pinme
3. 验证: pinme --version
4. 重新尝试部署
                `
            });
        }

        // 创建临时HTML文件
        const tempDir = path.join(__dirname, 'temp');
        await fs.mkdir(tempDir, { recursive: true });

        const finalFileName = fileName || `resume-${Date.now()}.html`;
        const tempFilePath = path.join(tempDir, finalFileName);

        await fs.writeFile(tempFilePath, htmlContent, 'utf8');

        // 使用PinMe CLI部署
        const deployResult = await deployWithPinMeCLI(tempFilePath);

        // 清理临时文件
        try {
            await fs.unlink(tempFilePath);
        } catch (error) {
            console.warn('清理临时文件失败:', error.message);
        }

        if (deployResult.success) {
            res.json({
                success: true,
                message: '部署成功！',
                result: {
                    cid: deployResult.cid,
                    ensUrl: deployResult.ensUrl,
                    ipfsUrl: deployResult.ipfsUrl,
                    gatewayUrl: deployResult.gatewayUrl,
                    fileName: finalFileName,
                    deployTime: new Date().toISOString()
                }
            });
        } else {
            res.status(500).json({
                success: false,
                error: deployResult.error,
                message: '部署失败，请检查PinMe CLI配置'
            });
        }

    } catch (error) {
        console.error('部署API错误:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 获取部署历史（模拟数据，实际应存储在数据库）
app.get('/api/history', (req, res) => {
    // 这里应该从数据库或文件中读取历史记录
    // 暂时返回空数组
    res.json({
        success: true,
        history: []
    });
});

// 获取模板列表
app.get('/api/templates', (req, res) => {
    const templates = [
        { id: 'hacker-black', name: '极客黑', description: '暗色主题，绿字高亮' },
        { id: 'terminal-white', name: '终端白', description: '终端界面风格' },
        { id: 'code-gray', name: '代码灰', description: '中性色调，代码风格' },
        { id: 'github-blue', name: 'GitHub蓝', description: '仿GitHub风格' },
        { id: 'minimal-green', name: '简约绿', description: '清新简洁设计' },
        { id: 'business-orange', name: '商务橙', description: '专业商务感' },
        { id: 'gradient-purple', name: '渐变紫', description: '现代渐变效果' },
        { id: 'neon-red', name: '霓虹红', description: '霓虹灯技术感' }
    ];

    res.json({
        success: true,
        templates: templates
    });
});

// 错误处理中间件
app.use((error, req, res, next) => {
    console.error('服务器错误:', error);
    res.status(500).json({
        error: '服务器内部错误',
        message: error.message
    });
});

// 404处理
app.use((req, res) => {
    res.status(404).json({
        error: '接口不存在',
        path: req.path
    });
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`
🚀 MD2Resume API服务器启动成功！
📍 端口: ${PORT}
🌐 前端地址: http://localhost:${PORT}
🔗 API地址: http://localhost:${PORT}/api
📋 支持的接口:
  - GET  /api/pinme-status  - 检查PinMe安装状态
  - POST /api/upload        - 上传Markdown文件
  - POST /api/deploy         - 部署到IPFS
  - GET  /api/history        - 获取部署历史
  - GET  /api/templates      - 获取模板列表
    `);
});

module.exports = app;