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
        const { stdout, stderr } = await execPromise('pinme --version');
        console.log('PinMe版本信息:', stdout || stderr);
        return true;
    } catch (error) {
        console.error('PinMe检查失败:', error);
        return false;
    }
}

// 调用PinMe CLI部署 - 统一真实部署逻辑
async function deployWithPinMeCLI(filePath) {
    try {
        console.log('开始部署到IPFS:', filePath);
        console.log('文件路径:', filePath);

        // 验证文件存在
        try {
            await fs.access(filePath);
        } catch (error) {
            throw new Error(`文件不存在: ${filePath}`);
        }

        // 执行PinMe上传命令
        console.log('执行PinMe上传命令...');
        const uploadResult = await execPromise(`pinme upload "${filePath}"`, {
            timeout: 60000 // 60秒超时
        });

        console.log('PinMe上传完成:', uploadResult.stdout);

        // 等待上传在IPFS网络中传播
        console.log('等待IPFS网络同步...');
        await new Promise(resolve => setTimeout(resolve, 3000));

        // 获取最新上传记录
        console.log('获取PinMe上传历史...');
        const listResult = await execPromise('pinme list -l 1', {
            timeout: 30000 // 30秒超时
        });

        const fullOutput = listResult.stdout + listResult.stderr;
        console.log('PinMe历史记录:', fullOutput);

        // 解析ENS URL和CID - 基于真实的PinMe输出格式
        let ensUrl = null;
        let cid = null;

        // 从list输出中解析ENS URL和CID (主要方法)
        const ensUrlMatch = fullOutput.match(/ENS URL:\s*(https:\/\/[a-z0-9]+\.pinit\.eth\.limo)/i);
        if (ensUrlMatch) {
            ensUrl = ensUrlMatch[1];
        }

        const cidMatch = fullOutput.match(/IPFS CID:\s*(baf[a-z0-9]+)/i);
        if (cidMatch) {
            cid = cidMatch[1];
        }

        // 备用解析方法：如果主要方法失败，尝试其他格式
        if (!ensUrl) {
            const backupEnsPatterns = [
                /https:\/\/([a-z0-9]+)\.pinit\.eth\.limo/gi,
                /https:\/\/([a-z0-9]+)\.eth\.limo/gi
            ];

            for (const pattern of backupEnsPatterns) {
                const matches = [...fullOutput.matchAll(pattern)];
                if (matches.length > 0) {
                    ensUrl = matches[0][0];
                    break;
                }
            }
        }

        if (!cid) {
            const backupCidPatterns = [
                /CID:\s*(baf[a-z0-9]+)/gi,
                /Hash:\s*(baf[a-z0-9]+)/gi,
                /(baf[a-z0-9]{46,})/gi  // 直接匹配完整的CID
            ];

            for (const pattern of backupCidPatterns) {
                const matches = [...fullOutput.matchAll(pattern)];
                if (matches.length > 0) {
                    cid = matches[0][1] || matches[0][0];
                    break;
                }
            }
        }

        console.log('解析结果 - ENS URL:', ensUrl, 'CID:', cid);

        // 如果没有找到ENS URL，尝试从上传输出中查找
        if (!ensUrl && uploadResult.stdout) {
            const uploadMatches = [...uploadResult.stdout.matchAll(/https:\/\/([a-z0-9]+)\.pinit\.eth\.limo/gi)];
            if (uploadMatches.length > 0) {
                ensUrl = uploadMatches[0][0];
            }
        }

        // 如果仍然没有找到，提供详细错误信息
        if (!ensUrl) {
            console.error('ENS URL解析失败，完整输出:', {
                uploadOutput: uploadResult.stdout + uploadResult.stderr,
                listOutput: fullOutput
            });
            throw new Error('无法从PinMe输出中解析ENS域名。请检查PinMe CLI是否正确配置了ENS。');
        }

        // 构建多种访问链接
        const baseUrl = ensUrl;
        const ipfsUrl = cid ? `https://ipfs.io/ipfs/${cid}` : baseUrl;
        const gatewayUrl = cid ? `https://cloudflare-ipfs.com/ipfs/${cid}` : baseUrl;
        const pinataUrl = cid ? `https://gateway.pinata.cloud/ipfs/${cid}` : baseUrl;

        return {
            success: true,
            cid: cid || 'unknown',
            ensUrl: baseUrl, // 主要ENS域名
            ipfsUrl: ipfsUrl, // IPFS官方网关
            gatewayUrl: gatewayUrl, // Cloudflare网关
            pinataUrl: pinataUrl, // Pinata网关
            uploadOutput: uploadResult.stdout + uploadResult.stderr,
            listOutput: fullOutput,
            deployTime: new Date().toISOString()
        };

    } catch (error) {
        console.error('PinMe部署失败:', error);

        // 提供更详细的错误信息
        let errorMessage = error.message;
        if (error.signal === 'SIGTERM') {
            errorMessage = 'PinMe命令执行超时，请检查网络连接或重试';
        } else if (error.code === 'ENOTFOUND') {
            errorMessage = '网络连接失败，请检查网络连接';
        }

        return {
            success: false,
            error: errorMessage,
            originalError: error.message
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
        const { htmlContent, fileName, title, template } = req.body;

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
            const deploymentInfo = {
                title: title || 'Untitled Resume',
                fileName: finalFileName,
                cid: deployResult.cid,
                ensUrl: deployResult.ensUrl,
                ipfsUrl: deployResult.ipfsUrl,
                gatewayUrl: deployResult.gatewayUrl,
                pinataUrl: deployResult.pinataUrl,
                deployTime: deployResult.deployTime || new Date().toISOString(),
                template: template || 'github-blue',
                debugInfo: {
                    uploadOutput: deployResult.uploadOutput,
                    listOutput: deployResult.listOutput
                }
            };

            // 保存到部署历史
            saveDeploymentHistory(deploymentInfo);

            console.log('✅ 部署成功:', {
                ensUrl: deploymentInfo.ensUrl,
                cid: deploymentInfo.cid
            });

            res.json({
                success: true,
                message: '部署成功！简历已永久存储在IPFS网络',
                result: deploymentInfo
            });
        } else {
            console.error('❌ 部署失败:', {
                error: deployResult.error,
                originalError: deployResult.originalError
            });

            res.status(500).json({
                success: false,
                error: deployResult.error,
                originalError: deployResult.originalError,
                message: '部署失败，请检查网络连接和PinMe CLI配置'
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

// 部署历史存储（内存中，生产环境应使用数据库）
let deploymentHistory = [];

// 保存部署历史
function saveDeploymentHistory(deployment) {
    const historyEntry = {
        id: uuidv4(),
        title: deployment.title || 'Untitled Resume',
        fileName: deployment.fileName,
        cid: deployment.cid,
        ensUrl: deployment.ensUrl,
        ipfsUrl: deployment.ipfsUrl,
        gatewayUrl: deployment.gatewayUrl,
        pinataUrl: deployment.pinataUrl,
        deployTime: deployment.deployTime || new Date().toISOString(),
        template: deployment.template || 'github-blue',
        status: 'success', // 只保存成功的部署
        verified: deployment.ensUrl ? false : null // 标记是否已验证链接可访问
    };

    // 添加到历史记录开头（最新的在前）
    deploymentHistory.unshift(historyEntry);

    // 只保留最近50条记录
    if (deploymentHistory.length > 50) {
        deploymentHistory = deploymentHistory.slice(0, 50);
    }

    console.log('✅ 部署历史已保存:', {
        id: historyEntry.id,
        title: historyEntry.title,
        ensUrl: historyEntry.ensUrl
    });
}

// 获取部署历史
app.get('/api/history', (req, res) => {
    res.json({
        success: true,
        history: deploymentHistory
    });
});

// 清除部署历史
app.delete('/api/history', (req, res) => {
    deploymentHistory = [];
    res.json({
        success: true,
        message: '部署历史已清除'
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