const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware de segurança
app.use(helmet());

// Rate limiting
const uploadLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10, // máximo 10 uploads por IP
  message: 'Muitos uploads. Tente novamente em 15 minutos.'
});

// Middleware
app.use(express.json());

// Criar diretório de uploads se não existir
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configuração do multer para upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // Gerar nome único para evitar conflitos
    const uniqueSuffix = crypto.randomBytes(8).toString('hex');
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    cb(null, `${name}-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limite
    files: 5 // máximo 5 arquivos por vez
  },
  fileFilter: (req, file, cb) => {
    // Lista de tipos de arquivo permitidos
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|txt|zip|rar|mp3|mp4|avi/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Tipo de arquivo não permitido'));
    }
  }
});

// Armazenar metadados dos arquivos
let fileDatabase = [];

// Função para carregar arquivos existentes
function loadExistingFiles() {
  try {
    if (fs.existsSync(uploadsDir)) {
      const files = fs.readdirSync(uploadsDir);
      files.forEach(filename => {
        const filePath = path.join(uploadsDir, filename);
        const stats = fs.statSync(filePath);
        
        // Verificar se já existe no banco
        const exists = fileDatabase.find(f => f.filename === filename);
        if (!exists) {
          fileDatabase.push({
            id: crypto.randomUUID(),
            filename: filename,
            originalName: filename,
            size: stats.size,
            uploadDate: stats.birthtime || stats.ctime,
            type: path.extname(filename).toLowerCase()
          });
        }
      });
    }
  } catch (error) {
    console.error('Erro ao carregar arquivos existentes:', error);
  }
}

// Carregar arquivos existentes na inicialização
loadExistingFiles();

// Rotas
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Meus Arquivos Pessoais</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            color: #333;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }

        .header {
            text-align: center;
            margin-bottom: 40px;
            color: white;
        }

        .header h1 {
            font-size: 2.5rem;
            margin-bottom: 10px;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
        }

        .header p {
            font-size: 1.1rem;
            opacity: 0.9;
        }

        .upload-section {
            background: white;
            border-radius: 20px;
            padding: 30px;
            margin-bottom: 30px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
            transition: transform 0.3s ease;
        }

        .upload-section:hover {
            transform: translateY(-5px);
        }

        .upload-area {
            border: 3px dashed #667eea;
            border-radius: 15px;
            padding: 40px;
            text-align: center;
            background: #f8f9ff;
            transition: all 0.3s ease;
            cursor: pointer;
        }

        .upload-area:hover {
            border-color: #764ba2;
            background: #f0f2ff;
        }

        .upload-area.dragover {
            border-color: #764ba2;
            background: #e8ebff;
            transform: scale(1.02);
        }

        .upload-icon {
            font-size: 3rem;
            color: #667eea;
            margin-bottom: 15px;
        }

        .upload-text {
            font-size: 1.2rem;
            color: #666;
            margin-bottom: 20px;
        }

        .file-input {
            display: none;
        }

        .upload-btn {
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            border: none;
            padding: 12px 30px;
            border-radius: 25px;
            font-size: 1rem;
            cursor: pointer;
            transition: all 0.3s ease;
            box-shadow: 0 4px 15px rgba(102,126,234,0.4);
        }

        .upload-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(102,126,234,0.6);
        }

        .files-section {
            background: white;
            border-radius: 20px;
            padding: 30px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
        }

        .files-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 2px solid #f0f0f0;
        }

        .files-title {
            font-size: 1.5rem;
            color: #333;
        }

        .stats {
            display: flex;
            gap: 20px;
            font-size: 0.9rem;
            color: #666;
        }

        .files-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: 20px;
        }

        .file-card {
            background: #f8f9ff;
            border-radius: 15px;
            padding: 20px;
            border: 1px solid #e0e0e0;
            transition: all 0.3s ease;
            position: relative;
        }

        .file-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 10px 25px rgba(0,0,0,0.1);
        }

        .file-icon {
            font-size: 2.5rem;
            margin-bottom: 10px;
            text-align: center;
        }

        .file-name {
            font-weight: bold;
            margin-bottom: 5px;
            word-break: break-word;
            color: #333;
        }

        .file-info {
            font-size: 0.85rem;
            color: #666;
            margin-bottom: 15px;
        }

        .file-actions {
            display: flex;
            gap: 10px;
            justify-content: center;
        }

        .btn {
            padding: 8px 16px;
            border: none;
            border-radius: 20px;
            cursor: pointer;
            font-size: 0.85rem;
            transition: all 0.3s ease;
            text-decoration: none;
            display: inline-block;
            text-align: center;
        }

        .btn-download {
            background: #28a745;
            color: white;
        }

        .btn-download:hover {
            background: #218838;
            transform: translateY(-1px);
        }

        .btn-delete {
            background: #dc3545;
            color: white;
        }

        .btn-delete:hover {
            background: #c82333;
            transform: translateY(-1px);
        }

        .loading {
            text-align: center;
            padding: 40px;
            color: #666;
        }

        .spinner {
            border: 4px solid #f3f3f3;
            border-top: 4px solid #667eea;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 0 auto 20px;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        .progress-bar {
            width: 100%;
            height: 8px;
            background: #e0e0e0;
            border-radius: 4px;
            margin: 20px 0;
            overflow: hidden;
            display: none;
        }

        .progress-fill {
            height: 100%;
            background: linear-gradient(135deg, #667eea, #764ba2);
            border-radius: 4px;
            transition: width 0.3s ease;
            width: 0;
        }

        .message {
            padding: 15px;
            border-radius: 10px;
            margin: 20px 0;
            font-weight: 500;
        }

        .message.success {
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }

        .message.error {
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }

        @media (max-width: 768px) {
            .container {
                padding: 10px;
            }
            
            .header h1 {
                font-size: 2rem;
            }
            
            .upload-section, .files-section {
                padding: 20px;
            }
            
            .files-grid {
                grid-template-columns: 1fr;
            }
            
            .stats {
                flex-direction: column;
                gap: 10px;
                text-align: center;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>☁️ Meus Arquivos Pessoais</h1>
            <p>Acesse seus arquivos de qualquer lugar do mundo</p>
        </div>

        <div class="upload-section">
            <div class="upload-area" id="uploadArea">
                <div class="upload-icon">📁</div>
                <div class="upload-text">
                    Arraste seus arquivos aqui ou clique para selecionar
                </div>
                <input type="file" id="fileInput" class="file-input" multiple accept=".jpg,.jpeg,.png,.gif,.pdf,.doc,.docx,.txt,.zip,.rar,.mp3,.mp4,.avi">
                <button class="upload-btn" onclick="document.getElementById('fileInput').click()">
                    Escolher Arquivos
                </button>
            </div>
            <div class="progress-bar" id="progressBar">
                <div class="progress-fill" id="progressFill"></div>
            </div>
            <div id="message"></div>
        </div>

        <div class="files-section">
            <div class="files-header">
                <h2 class="files-title">📂 Meus Arquivos</h2>
                <div class="stats" id="stats">
                    <div>Total: <span id="totalFiles">0</span> arquivos</div>
                    <div>Espaço: <span id="totalSize">0 B</span></div>
                </div>
            </div>
            <div id="filesContainer">
                <div class="loading">
                    <div class="spinner"></div>
                    Carregando arquivos...
                </div>
            </div>
        </div>
    </div>

    <script>
        const uploadArea = document.getElementById('uploadArea');
        const fileInput = document.getElementById('fileInput');
        const progressBar = document.getElementById('progressBar');
        const progressFill = document.getElementById('progressFill');
        const messageDiv = document.getElementById('message');
        const filesContainer = document.getElementById('filesContainer');
        const statsDiv = document.getElementById('stats');

        // Drag and drop functionality
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });

        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
        });

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            const files = e.dataTransfer.files;
            handleFiles(files);
        });

        uploadArea.addEventListener('click', () => {
            fileInput.click();
        });

        fileInput.addEventListener('change', (e) => {
            handleFiles(e.target.files);
        });

        function handleFiles(files) {
            if (files.length === 0) return;

            const formData = new FormData();
            for (let file of files) {
                formData.append('files', file);
            }

            uploadFiles(formData);
        }

        function uploadFiles(formData) {
            progressBar.style.display = 'block';
            messageDiv.innerHTML = '';

            const xhr = new XMLHttpRequest();

            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    const percentComplete = (e.loaded / e.total) * 100;
                    progressFill.style.width = percentComplete + '%';
                }
            });

            xhr.addEventListener('load', () => {
                progressBar.style.display = 'none';
                progressFill.style.width = '0%';

                if (xhr.status === 200) {
                    const response = JSON.parse(xhr.responseText);
                    showMessage(response.message, 'success');
                    loadFiles();
                } else {
                    const error = JSON.parse(xhr.responseText);
                    showMessage(error.error || 'Erro no upload', 'error');
                }
            });

            xhr.addEventListener('error', () => {
                progressBar.style.display = 'none';
                showMessage('Erro de conexão', 'error');
            });

            xhr.open('POST', '/upload');
            xhr.send(formData);
        }

        function showMessage(text, type) {
            messageDiv.innerHTML = \`<div class="message \${type}">\${text}</div>\`;
            setTimeout(() => {
                messageDiv.innerHTML = '';
            }, 5000);
        }

        function loadFiles() {
            fetch('/files')
                .then(response => response.json())
                .then(files => {
                    displayFiles(files);
                    updateStats();
                })
                .catch(error => {
                    filesContainer.innerHTML = '<div class="loading">Erro ao carregar arquivos</div>';
                });
        }

        function displayFiles(files) {
            if (files.length === 0) {
                filesContainer.innerHTML = '<div class="loading">Nenhum arquivo encontrado</div>';
                return;
            }

            const filesGrid = document.createElement('div');
            filesGrid.className = 'files-grid';

            files.forEach(file => {
                const fileCard = createFileCard(file);
                filesGrid.appendChild(fileCard);
            });

            filesContainer.innerHTML = '';
            filesContainer.appendChild(filesGrid);
        }

        function createFileCard(file) {
            const card = document.createElement('div');
            card.className = 'file-card';

            const icon = getFileIcon(file.type);
            const date = new Date(file.uploadDate).toLocaleDateString('pt-BR');
            const size = formatBytes(file.size);

            card.innerHTML = \`
                <div class="file-icon">\${icon}</div>
                <div class="file-name" title="\${file.originalName}">\${truncateText(file.originalName, 30)}</div>
                <div class="file-info">
                    <div>📅 \${date}</div>
                    <div>📦 \${size}</div>
                </div>
                <div class="file-actions">
                    <a href="/download/\${file.id}" class="btn btn-download" download>
                        ⬇️ Baixar
                    </a>
                    <button class="btn btn-delete" onclick="deleteFile('\${file.id}')">
                        🗑️ Excluir
                    </button>
                </div>
            \`;

            return card;
        }

        function getFileIcon(type) {
            const iconMap = {
                '.jpg': '🖼️', '.jpeg': '🖼️', '.png': '🖼️', '.gif': '🖼️',
                '.pdf': '📄', '.doc': '📝', '.docx': '📝', '.txt': '📝',
                '.zip': '🗜️', '.rar': '🗜️',
                '.mp3': '🎵', '.mp4': '🎬', '.avi': '🎬'
            };
            return iconMap[type.toLowerCase()] || '📄';
        }

        function formatBytes(bytes) {
            if (bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }

        function truncateText(text, maxLength) {
            return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
        }

        function deleteFile(fileId) {
            if (!confirm('Tem certeza que deseja excluir este arquivo?')) return;

            fetch(\`/delete/\${fileId}\`, { method: 'DELETE' })
                .then(response => response.json())
                .then(data => {
                    if (data.message) {
                        showMessage(data.message, 'success');
                        loadFiles();
                    } else {
                        showMessage(data.error, 'error');
                    }
                })
                .catch(error => {
                    showMessage('Erro ao excluir arquivo', 'error');
                });
        }

        function updateStats() {
            fetch('/stats')
                .then(response => response.json())
                .then(stats => {
                    document.getElementById('totalFiles').textContent = stats.totalFiles;
                    document.getElementById('totalSize').textContent = stats.totalSize;
                })
                .catch(error => {
                    console.error('Erro ao carregar estatísticas:', error);
                });
        }

        // Carregar arquivos quando a página carregar
        window.addEventListener('load', () => {
            loadFiles();
        });
    </script>
</body>
</html>`);
});

// Upload de arquivos
app.post('/upload', uploadLimit, upload.array('files', 5), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }

    const uploadedFiles = req.files.map(file => {
      const fileInfo = {
        id: crypto.randomUUID(),
        filename: file.filename,
        originalName: file.originalname,
        size: file.size,
        uploadDate: new Date(),
        type: path.extname(file.originalname).toLowerCase()
      };
      
      fileDatabase.push(fileInfo);
      return fileInfo;
    });

    res.json({
      message: 'Arquivos enviados com sucesso!',
      files: uploadedFiles
    });
  } catch (error) {
    console.error('Erro no upload:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Listar arquivos
app.get('/files', (req, res) => {
  try {
    // Ordenar por data de upload (mais recente primeiro)
    const sortedFiles = fileDatabase.sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate));
    res.json(sortedFiles);
  } catch (error) {
    console.error('Erro ao listar arquivos:', error);
    res.status(500).json({ error: 'Erro ao listar arquivos' });
  }
});

// Download de arquivo
app.get('/download/:id', (req, res) => {
  try {
    const fileId = req.params.id;
    const fileInfo = fileDatabase.find(f => f.id === fileId);
    
    if (!fileInfo) {
      return res.status(404).json({ error: 'Arquivo não encontrado' });
    }
    
    const filePath = path.join(uploadsDir, fileInfo.filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Arquivo físico não encontrado' });
    }
    
    res.download(filePath, fileInfo.originalName);
  } catch (error) {
    console.error('Erro no download:', error);
    res.status(500).json({ error: 'Erro no download' });
  }
});

// Deletar arquivo
app.delete('/delete/:id', (req, res) => {
  try {
    const fileId = req.params.id;
    const fileIndex = fileDatabase.findIndex(f => f.id === fileId);
    
    if (fileIndex === -1) {
      return res.status(404).json({ error: 'Arquivo não encontrado' });
    }
    
    const fileInfo = fileDatabase[fileIndex];
    const filePath = path.join(uploadsDir, fileInfo.filename);
    
    // Remover arquivo físico
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    
    // Remover do banco
    fileDatabase.splice(fileIndex, 1);
    
    res.json({ message: 'Arquivo deletado com sucesso' });
  } catch (error) {
    console.error('Erro ao deletar arquivo:', error);
    res.status(500).json({ error: 'Erro ao deletar arquivo' });
  }
});

// Informações do sistema
app.get('/stats', (req, res) => {
  try {
    const totalFiles = fileDatabase.length;
    const totalSize = fileDatabase.reduce((sum, file) => sum + file.size, 0);
    
    res.json({
      totalFiles,
      totalSize: formatBytes(totalSize),
      diskSpace: getDiskSpace()
    });
  } catch (error) {
    console.error('Erro ao obter estatísticas:', error);
    res.status(500).json({ error: 'Erro ao obter estatísticas' });
  }
});

// Função para formatar bytes
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Função para obter espaço em disco (simplificada)
function getDiskSpace() {
  try {
    const stats = fs.statSync(uploadsDir);
    return {
      used: formatBytes(fileDatabase.reduce((sum, file) => sum + file.size, 0)),
      available: "Unlimited (Render.com)"
    };
  } catch (error) {
    return { used: "0 Bytes", available: "Unknown" };
  }
}

// Middleware de tratamento de erros
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Arquivo muito grande (máximo 50MB)' });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ error: 'Muitos arquivos (máximo 5)' });
    }
  }
  
  if (error.message === 'Tipo de arquivo não permitido') {
    return res.status(400).json({ error: 'Tipo de arquivo não permitido' });
  }
  
  console.error('Erro não tratado:', error);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📁 Diretório de uploads: ${uploadsDir}`);
  console.log(`📊 ${fileDatabase.length} arquivos carregados`);
});
