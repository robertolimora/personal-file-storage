require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const app = express();

// Confiar apenas no primeiro proxy (p.ex. Render)
app.set('trust proxy', 1);
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
const uploadsDir = path.resolve(process.env.UPLOADS_DIR || path.join(__dirname, 'uploads'));
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Arquivo de metadados para persistência entre reinícios
const metadataFile = path.join(uploadsDir, 'metadata.json');

// Arquivo para armazenar diretórios protegidos
const protectedFile = path.join(uploadsDir, '.protected-dirs.json');
let protectedDirs = {};
if (fs.existsSync(protectedFile)) {
  try {
    protectedDirs = JSON.parse(fs.readFileSync(protectedFile));
  } catch (err) {
    protectedDirs = {};
  }
}

function saveProtectedDirs() {
  fs.writeFileSync(protectedFile, JSON.stringify(protectedDirs, null, 2));
}

function saveMetadata() {
  fs.writeFileSync(metadataFile, JSON.stringify(fileDatabase, null, 2));
}

function getProtectedEntry(dir) {
  const parts = dir.split('/');
  while (parts.length > 0) {
    const p = parts.join('/');
    if (protectedDirs[p]) {
      return protectedDirs[p];
    }
    parts.pop();
  }
  return null;
}

function verifyAccess(dir, req) {
  const hash = getProtectedEntry(dir);
  if (!hash) return true;
  const provided = req.headers['x-dir-password'] || req.query.password || req.body.password;
  if (!provided) return false;
  const providedHash = crypto.createHash('sha256').update(provided).digest('hex');
  return providedHash === hash;
}

// Configuração do multer para upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      let targetDir = uploadsDir;
      const dir = (req.body.dir || '').replace(/\\/g, '/');
      if (dir) {
        const safePath = path.join(uploadsDir, dir);
        if (!safePath.startsWith(uploadsDir)) {
          return cb(new Error('Diretório inválido'));
        }
        if (!fs.existsSync(safePath)) {
          fs.mkdirSync(safePath, { recursive: true });
        }
        targetDir = safePath;
      }
      cb(null, targetDir);
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = crypto.randomBytes(8).toString('hex');
    const original = decodeFilename(file.originalname);
    const ext = path.extname(original);
    const name = path.basename(original, ext);
    cb(null, `${name}-${uniqueSuffix}${ext}`);
  }
});

function decodeFilename(name) {
  const converted = Buffer.from(name, 'latin1').toString('utf8');
  return converted.includes('�') ? name : converted;
}

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limite
    files: 5 // máximo 5 arquivos por vez
  },
  fileFilter: (req, file, cb) => {
    const allowedExt = [
      '.jpeg', '.jpg', '.png', '.gif',
      '.pdf', '.doc', '.docx', '.txt',
      '.zip', '.rar', '.mp3', '.mp4', '.avi'
    ];
    const extname = path.extname(decodeFilename(file.originalname)).toLowerCase();
    if (allowedExt.includes(extname)) {
      return cb(null, true);
    }
    cb(new Error('Tipo de arquivo não permitido'));
  }
});

// Armazenar metadados dos arquivos
let fileDatabase = [];

// Função para carregar arquivos existentes e metadados
function loadExistingFiles(dir = uploadsDir, relativeDir = '') {
  try {
    // Carregar metadados persistidos
    if (fs.existsSync(metadataFile)) {
      fileDatabase = JSON.parse(fs.readFileSync(metadataFile));
    }
  } catch (err) {
    console.error('Erro ao ler metadata:', err);
    fileDatabase = [];
  }

  const verified = [];
  const existingPaths = new Set();
  fileDatabase.forEach(entry => {
    const filePath = path.join(uploadsDir, entry.path);
    if (fs.existsSync(filePath)) {
      verified.push(entry);
      existingPaths.add(entry.path);
    }
  });
  fileDatabase = verified;

  function scan(currentDir, rel) {
    if (!fs.existsSync(currentDir)) return;
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    entries.forEach(e => {
      if (e.name.startsWith('.')) return;
      const fullPath = path.join(currentDir, e.name);
      const relPath = path.join(rel, e.name);
      if (e.isDirectory()) {
        scan(fullPath, relPath);
      } else if (!existingPaths.has(relPath)) {
        const stats = fs.statSync(fullPath);
        fileDatabase.push({
          id: crypto.randomUUID(),
          filename: e.name,
          path: relPath,
          directory: rel,
          originalName: e.name,
          size: stats.size,
          uploadDate: stats.birthtime || stats.ctime,
          type: path.extname(e.name).toLowerCase()
        });
        existingPaths.add(relPath);
      }
    });
  }
  
  scan(dir, relativeDir);
  saveMetadata();
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

     const dir = (req.body.dir || '').replace(/\\/g, '/');
    if (dir && !verifyAccess(dir, req)) {
      return res.status(403).json({ error: 'Senha incorreta ou acesso negado' });
    }

    const uploadedFiles = req.files.map(file => {
      const original = decodeFilename(file.originalname);
      const fileInfo = {
        id: crypto.randomUUID(),
        filename: file.filename,
        directory: dir,
        path: path.join(dir, file.filename),
        originalName: original,
        size: file.size,
        uploadDate: new Date(),
        type: path.extname(original).toLowerCase()
      };
      fileDatabase.push(fileInfo);
      return fileInfo;
    });

    saveMetadata();

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
    const dir = (req.query.dir || '').replace(/\\/g, '/');
    let files = fileDatabase;
    
    if (dir && !verifyAccess(dir, req)) {
      return res.status(403).json({ error: 'Senha incorreta ou acesso negado' });
    }
    
    if (dir) {
      files = files.filter(f => f.directory === dir);
      } else {
      files = files.filter(f => !f.directory);
    }
    
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
if (!verifyAccess(fileInfo.directory || '', req)) {
      return res.status(403).json({ error: 'Senha incorreta ou acesso negado' });
    }    
    const ext = path.extname(newName);
    const base = path.basename(newName, ext);
    const currentExt = path.extname(fileInfo.filename);
    const unique = path.basename(fileInfo.filename, currentExt).split('-').pop();
    const newFileName = `${base}-${unique}${ext || currentExt}`;
    const oldPath = path.join(uploadsDir, fileInfo.directory || '', fileInfo.filename);
    const newPath = path.join(uploadsDir, fileInfo.directory || '', newFileName);
  fs.renameSync(oldPath, newPath);

  fileInfo.filename = newFileName;
  fileInfo.path = path.join(fileInfo.directory || '', newFileName);
  fileInfo.originalName = newName;
  fileInfo.type = ext.toLowerCase() || currentExt.toLowerCase();
  saveMetadata();

  res.json({ message: 'Arquivo renomeado com sucesso' });
  } catch (error) {
    console.error('Erro ao renomear arquivo:', error);
    res.status(500).json({ error: 'Erro ao renomear arquivo' });
  }
});

// Mover arquivo para outra pasta
app.patch('/move/:id', (req, res) => {
  try {
    const fileId = req.params.id;
    let { newDir } = req.body;
    if (newDir === undefined) {
      return res.status(400).json({ error: 'Diretório alvo é obrigatório' });
    }
    newDir = path.normalize(newDir).replace(/^([\.\/])+/, '');
    const fileInfo = fileDatabase.find(f => f.id === fileId);
    if (!fileInfo) {
      return res.status(404).json({ error: 'Arquivo não encontrado' });
    }
     if (!verifyAccess(fileInfo.directory || '', req) || (newDir && !verifyAccess(newDir, req))) {
      return res.status(403).json({ error: 'Senha incorreta ou acesso negado' });
    }
  const destDir = path.join(uploadsDir, newDir);
    if (!destDir.startsWith(uploadsDir)) {
      return res.status(400).json({ error: 'Diretório inválido' });
    }
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    const oldPath = path.join(uploadsDir, fileInfo.directory || '', fileInfo.filename);
    const newPath = path.join(destDir, fileInfo.filename);
  fs.renameSync(oldPath, newPath);
  fileInfo.directory = newDir;
  fileInfo.path = path.join(newDir, fileInfo.filename);
  res.json({ message: 'Arquivo movido com sucesso' });
  } catch (error) {
    console.error('Erro ao mover arquivo:', error);
    res.status(500).json({ error: 'Erro ao mover arquivo' });
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
    if (!verifyAccess(fileInfo.directory || '', req)) {
      return res.status(403).json({ error: 'Senha incorreta ou acesso negado' });
    }
    const filePath = path.join(uploadsDir, fileInfo.directory || '', fileInfo.filename);
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
    if (!verifyAccess(fileInfo.directory || '', req)) {
      return res.status(403).json({ error: 'Senha incorreta ou acesso negado' });
    }
    const filePath = path.join(uploadsDir, fileInfo.directory || '', fileInfo.filename);

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  fileDatabase.splice(fileIndex, 1);
  saveMetadata();
  res.json({ message: 'Arquivo deletado com sucesso' });
  } catch (error) {
    console.error('Erro ao deletar arquivo:', error);
    res.status(500).json({ error: 'Erro ao deletar arquivo' });
  }
});

// Criar diretório
app.post('/directories', (req, res) => {
  try {
    const { name, password } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Nome do diretório é obrigatório' });
    }
    const relative = path.normalize(name).replace(/^([\.\/])+/, '');
    const dirPath = path.join(uploadsDir, relative);
    if (!dirPath.startsWith(uploadsDir)) {
      return res.status(400).json({ error: 'Diretório inválido' });
    }
    if (fs.existsSync(dirPath)) {
      return res.status(400).json({ error: 'Diretório já existe' });
    }
    const parent = relative.split('/').slice(0, -1).join('/');
    if (parent && !verifyAccess(parent, req)) {
      return res.status(403).json({ error: 'Senha incorreta ou acesso negado' });
    }
    fs.mkdirSync(dirPath, { recursive: true });
    if (password) {
      const hash = crypto.createHash('sha256').update(password).digest('hex');
      protectedDirs[relative] = hash;
      saveProtectedDirs();
    }
    res.json({ message: 'Diretório criado com sucesso' });
  } catch (error) {
    console.error('Erro ao criar diretório:', error);
    res.status(500).json({ error: 'Erro ao criar diretório' });
  }
});

// Deletar diretório
app.delete('/directories/:name', (req, res) => {
  try {
    const relative = path.normalize(req.params.name).replace(/^([\.\/])+/, '');
    const dirPath = path.join(uploadsDir, relative);
    if (!dirPath.startsWith(uploadsDir)) {
      return res.status(400).json({ error: 'Diretório inválido' });
    }
    if (!fs.existsSync(dirPath)) {
      return res.status(404).json({ error: 'Diretório não encontrado' });
    }
    if (!verifyAccess(relative, req)) {
      return res.status(403).json({ error: 'Senha incorreta ou acesso negado' });
    }
    fs.rmSync(dirPath, { recursive: true, force: true });
    fileDatabase = fileDatabase.filter(f => !f.path.startsWith(`${relative}/`));
    if (protectedDirs[relative]) {
      delete protectedDirs[relative];
      saveProtectedDirs();
    }
    res.json({ message: 'Diretório excluído com sucesso' });
  } catch (error) {
    console.error('Erro ao excluir diretório:', error);
    res.status(500).json({ error: 'Erro ao excluir diretório' });
  }
});

// Listar diretórios
app.get('/directories', (req, res) => {
  try {
    const dir = (req.query.dir || '').replace(/\\/g, '/');
    const dirPath = path.join(uploadsDir, dir);
    if (!dirPath.startsWith(uploadsDir)) {
      return res.status(400).json({ error: 'Diretório inválido' });
    }
    if (!fs.existsSync(dirPath)) {
      return res.status(404).json({ error: 'Diretório não encontrado' });
    }
    if (dir && !verifyAccess(dir, req)) {
      return res.status(403).json({ error: 'Senha incorreta ou acesso negado' });
    }
    const dirs = fs.readdirSync(dirPath, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
    res.json(dirs);
  } catch (error) {
    console.error('Erro ao listar diretórios:', error);
    res.status(500).json({ error: 'Erro ao listar diretórios' });
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
