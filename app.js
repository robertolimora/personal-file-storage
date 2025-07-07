require('dotenv').config();
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
app.use(express.static(path.join(__dirname, 'views')));

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
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
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

// Listar arquivos com opcao de busca
app.get('/files', (req, res) => {
  try {
    const query = (req.query.search || '').toLowerCase();
    let files = fileDatabase;
    if (query) {
      files = files.filter(f => f.originalName.toLowerCase().includes(query));
    }
    const sortedFiles = files.sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate));
    res.json(sortedFiles);
  } catch (error) {
    console.error('Erro ao listar arquivos:', error);
    res.status(500).json({ error: 'Erro ao listar arquivos' });
  }
});

// Renomear arquivo
app.patch('/rename/:id', (req, res) => {
  try {
    const fileId = req.params.id;
    const { newName } = req.body;
    if (!newName) {
      return res.status(400).json({ error: 'Novo nome obrigatório' });
    }
    const fileInfo = fileDatabase.find(f => f.id === fileId);
    if (!fileInfo) {
      return res.status(404).json({ error: 'Arquivo não encontrado' });
    }
    const ext = path.extname(newName);
    const base = path.basename(newName, ext);
    const currentExt = path.extname(fileInfo.filename);
    const unique = path.basename(fileInfo.filename, currentExt).split('-').pop();
    const newFileName = `${base}-${unique}${ext || currentExt}`;
    const oldPath = path.join(uploadsDir, fileInfo.filename);
    const newPath = path.join(uploadsDir, newFileName);
    fs.renameSync(oldPath, newPath);

    fileInfo.filename = newFileName;
    fileInfo.originalName = newName;
    fileInfo.type = ext.toLowerCase() || currentExt.toLowerCase();

    res.json({ message: 'Arquivo renomeado com sucesso' });
  } catch (error) {
    console.error('Erro ao renomear arquivo:', error);
    res.status(500).json({ error: 'Erro ao renomear arquivo' });
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

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    fileDatabase.splice(fileIndex, 1);
    res.json({ message: 'Arquivo deletado com sucesso' });
  } catch (error) {
    console.error('Erro ao deletar arquivo:', error);
    res.status(500).json({ error: 'Erro ao deletar arquivo' });
  }
});

// Criar diretório
app.post('/directories', (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Nome do diretório é obrigatório' });
    }
    const safeName = path.basename(name);
    const dirPath = path.join(uploadsDir, safeName);
    if (fs.existsSync(dirPath)) {
      return res.status(400).json({ error: 'Diretório já existe' });
    }
    fs.mkdirSync(dirPath, { recursive: true });
    res.json({ message: 'Diretório criado com sucesso' });
  } catch (error) {
    console.error('Erro ao criar diretório:', error);
    res.status(500).json({ error: 'Erro ao criar diretório' });
  }
});

// Deletar diretório
app.delete('/directories/:name', (req, res) => {
  try {
    const safeName = path.basename(req.params.name);
    const dirPath = path.join(uploadsDir, safeName);
    if (!fs.existsSync(dirPath)) {
      return res.status(404).json({ error: 'Diretório não encontrado' });
    }
    fs.rmSync(dirPath, { recursive: true, force: true });
    fileDatabase = fileDatabase.filter(f => !f.filename.startsWith(`${safeName}/`));
    res.json({ message: 'Diretório excluído com sucesso' });
  } catch (error) {
    console.error('Erro ao excluir diretório:', error);
    res.status(500).json({ error: 'Erro ao excluir diretório' });
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

// Função para obter espaço em disco
function getDiskSpace() {
  try {
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

// Iniciar servidor apenas se este arquivo for executado diretamente
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`📁 Diretório de uploads: ${uploadsDir}`);
    console.log(`📊 ${fileDatabase.length} arquivos carregados`);
  });
}

module.exports = app;
