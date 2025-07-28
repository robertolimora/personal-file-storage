require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { Pool } = require('pg');
const ftp = require('basic-ftp'); // adicionado para FTP

// dentro do upload loop, antes de uploadToFtp
const localPath = path.join(uploadsDir, dir || '', file.filename);
const remoteDir = dir ? dir.replace(/\\/g, '/') : '.';
const remoteFile = file.filename;

await client.access({ ... }); // já feito na função uploadToFtp
await client.ensureDir(remoteDir); // cria a pasta se não existir
await client.uploadFrom(localPath, `${remoteDir}/${remoteFile}`);

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

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Criar diretório de uploads se não existir
const uploadsDir = path.resolve(process.env.UPLOADS_DIR || path.join(__dirname, 'uploads'));

// Arquivo para armazenar diretórios protegidos
const protectedFile = path.join(uploadsDir, '.protected-dirs.json');
let protectedDirs = {};

async function initialize() {
  try {
    await fsp.access(uploadsDir);
  } catch {
    await fsp.mkdir(uploadsDir, { recursive: true });
  }

  try {
    const data = await fsp.readFile(protectedFile, 'utf8');
    protectedDirs = JSON.parse(data);
  } catch {
    protectedDirs = {};
  }
}

function saveProtectedDirs() {
  fs.writeFileSync(protectedFile, JSON.stringify(protectedDirs, null, 2));
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
  destination: async (req, file, cb) => {
    try {
      let targetDir = uploadsDir;
      const dir = (req.body.dir || '').replace(/\\/g, '/');
      if (dir) {
        const safePath = path.join(uploadsDir, dir);
        if (!safePath.startsWith(uploadsDir)) {
          return cb(new Error('Diretório inválido'));
        }
        try {
          await fsp.access(safePath);
        } catch {
          await fsp.mkdir(safePath, { recursive: true });
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

// Função utilitária de upload para o FTP
async function uploadToFtp(localPath, remotePath) {
  const client = new ftp.Client();
  try {
    await client.access({
      host: process.env.FTP_HOST,
      user: process.env.FTP_USERNAME,
      password: process.env.FTP_PASSWORD,
      secure: false
    });
    await client.uploadFrom(localPath, remotePath);
    console.log(`Arquivo ${localPath} enviado para ${remotePath} no FTP`);
  } catch (err) {
    console.error('Erro ao enviar arquivo para o FTP:', err);
  } finally {
    client.close();
  }
}

// Função para carregar arquivos existentes e metadados
async function loadExistingFiles(dir = uploadsDir, relativeDir = '') {
  await pool.query('CREATE TABLE IF NOT EXISTS files (id TEXT, filename TEXT, directory TEXT, path TEXT, originalName TEXT, size INTEGER, uploadDate TEXT, type TEXT)');

  const { rows } = await pool.query('SELECT path FROM files');
  const existingPaths = new Set(rows.map(r => r.path));

  async function scan(currentDir, rel) {
    try {
      await fsp.access(currentDir);
    } catch {
      return;
    }
    const entries = await fsp.readdir(currentDir, { withFileTypes: true });
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const fullPath = path.join(currentDir, e.name);
      const relPath = path.join(rel, e.name);
      if (e.isDirectory()) {
        await scan(fullPath, relPath);
      } else if (!existingPaths.has(relPath)) {
        const stats = await fsp.stat(fullPath);
        await pool.query(
          'INSERT INTO files(id, filename, directory, path, originalName, size, uploadDate, type) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
          [
            crypto.randomUUID(),
            e.name,
            rel || null,
            relPath,
            e.name,
            stats.size,
            new Date().toISOString(),
            path.extname(e.name).toLowerCase()
          ]
        );
        existingPaths.add(relPath);
      }
    }
  }
  
  await scan(dir, relativeDir);
}

// Rotas
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// Upload de arquivos
app.post('/upload', uploadLimit, upload.array('files', 5), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }

    const dir = (req.body.dir || '').replace(/\\/g, '/');
    if (dir && !verifyAccess(dir, req)) {
      return res.status(403).json({ error: 'Senha incorreta ou acesso negado' });
    }

    const uploadedFiles = [];
    for (const file of req.files) {
      const original = decodeFilename(file.originalname);
      const id = crypto.randomUUID();
      await pool.query(
        'INSERT INTO files(id, filename, directory, path, originalName, size, uploadDate, type) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [
          id,
          file.filename,
          dir || null,
          path.join(dir, file.filename),
          original,
          file.size,
          new Date().toISOString(),
          path.extname(original).toLowerCase()
        ]
      );
      uploadedFiles.push({
        id,
        filename: file.filename,
        directory: dir,
        path: path.join(dir, file.filename),
        originalName: original,
        size: file.size,
        uploadDate: new Date().toISOString(),
        type: path.extname(original).toLowerCase()
      });

      // Envia o arquivo para o FTP após salvá-lo localmente
      try {
        const localPath = path.join(uploadsDir, dir || '', file.filename);
        const remotePath = path.join(dir || '', file.filename).replace(/\\/g, '/');
        await uploadToFtp(localPath, remotePath);
      } catch (err) {
        console.error('Erro no upload para o FTP:', err);
      }
    }

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
app.get('/files', async (req, res) => {
  try {
    const query = (req.query.search || '').toLowerCase();
    const dir = (req.query.dir || '').replace(/\\/g, '/');
        
    if (dir && !verifyAccess(dir, req)) {
      return res.status(403).json({ error: 'Senha incorreta ou acesso negado' });
    }

    let result;
    if (dir) {
     result = await pool.query('SELECT * FROM files WHERE directory = $1', [dir]);
    } else {
      result = await pool.query("SELECT * FROM files WHERE directory IS NULL OR directory = ''");
    }

    let files = result.rows;
    if (query) {
      files = files.filter(f => f.originalname.toLowerCase().includes(query));
    }
    files.sort((a, b) => new Date(b.uploaddate) - new Date(a.uploaddate));
    files = files.map(f => ({
      id: f.id,
      filename: f.filename,
      directory: f.directory,
      path: f.path,
      originalName: f.originalname,
      size: f.size,
      uploadDate: f.uploaddate,
      type: f.type
    }));
    res.json(files);
  } catch (error) {
    console.error('Erro ao listar arquivos:', error);
    res.status(500).json({ error: 'Erro ao listar arquivos' });
  }
});

// Renomear arquivo
app.patch('/rename/:id', async (req, res) => {
  try {
    const fileId = req.params.id;
    const { newName } = req.body;
    if (!newName) {
      return res.status(400).json({ error: 'Novo nome obrigatório' });
    }
    const result = await pool.query('SELECT * FROM files WHERE id=$1', [fileId]);
    const fileInfo = result.rows[0];
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
    await fsp.rename(oldPath, newPath);

    await pool.query(
      'UPDATE files SET filename=$1, path=$2, originalname=$3, type=$4 WHERE id=$5',
      [
        newFileName,
        path.join(fileInfo.directory || '', newFileName),
        newName,
        ext.toLowerCase() || currentExt.toLowerCase(),
        fileId
      ]
    );

  res.json({ message: 'Arquivo renomeado com sucesso' });
  } catch (error) {
    console.error('Erro ao renomear arquivo:', error);
    res.status(500).json({ error: 'Erro ao renomear arquivo' });
  }
});

// Mover arquivo para outra pasta
app.patch('/move/:id', async (req, res) => {
  try {
    const fileId = req.params.id;
    let { newDir } = req.body;
    if (newDir === undefined) {
      return res.status(400).json({ error: 'Diretório alvo é obrigatório' });
    }
    newDir = path.normalize(newDir).replace(/^([\.\/])+/, '');
    const result = await pool.query('SELECT * FROM files WHERE id=$1', [fileId]);
    const fileInfo = result.rows[0];
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
    try {
      await fsp.access(destDir);
    } catch {
      await fsp.mkdir(destDir, { recursive: true });
    }
    const oldPath = path.join(uploadsDir, fileInfo.directory || '', fileInfo.filename);
    const newPath = path.join(destDir, fileInfo.filename);
    await fsp.rename(oldPath, newPath);
    await pool.query('UPDATE files SET directory=$1, path=$2 WHERE id=$3', [
      newDir || null,
      path.join(newDir, fileInfo.filename),
      fileId
    ]);
    res.json({ message: 'Arquivo movido com sucesso' });
  } catch (error) {
    console.error('Erro ao mover arquivo:', error);
    res.status(500).json({ error: 'Erro ao mover arquivo' });
  }
});

// Download de arquivo
app.get('/download/:id', async (req, res) => {
  try {
    const fileId = req.params.id;
    const result = await pool.query('SELECT * FROM files WHERE id=$1', [fileId]);
    const fileInfo = result.rows[0];
    if (!fileInfo) {
      return res.status(404).json({ error: 'Arquivo não encontrado' });
    }
    if (!verifyAccess(fileInfo.directory || '', req)) {
      return res.status(403).json({ error: 'Senha incorreta ou acesso negado' });
    }
    const filePath = path.join(uploadsDir, fileInfo.directory || '', fileInfo.filename);
    try {
      await fsp.access(filePath);
    } catch {
      return res.status(404).json({ error: 'Arquivo físico não encontrado' });
    }
    res.download(filePath, fileInfo.originalname);
  } catch (error) {
    console.error('Erro no download:', error);
    res.status(500).json({ error: 'Erro no download' });
  }
});

// Deletar arquivo
app.delete('/delete/:id', async (req, res) => {
  try {
    const fileId = req.params.id;
    const result = await pool.query('SELECT * FROM files WHERE id=$1', [fileId]);
    const fileInfo = result.rows[0];
    if (!fileInfo) {
      return res.status(404).json({ error: 'Arquivo não encontrado' });
    }

    if (!verifyAccess(fileInfo.directory || '', req)) {
    return res.status(403).json({ error: 'Senha incorreta ou acesso negado' });
    }
    const filePath = path.join(uploadsDir, fileInfo.directory || '', fileInfo.filename);

    try {
        await fsp.unlink(filePath);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }

    await pool.query('DELETE FROM files WHERE id=$1', [fileId]);
    res.json({ message: 'Arquivo deletado com sucesso' });
  } catch (error) {
    console.error('Erro ao deletar arquivo:', error);
    res.status(500).json({ error: 'Erro ao deletar arquivo' });
  }
});

// Criar diretório
app.post('/directories', async (req, res) => {
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
    try {
      await fsp.access(dirPath);
      return res.status(400).json({ error: 'Diretório já existe' });
      } catch {
      // continua se não existir
    }
    const parent = relative.split('/').slice(0, -1).join('/');
    if (parent && !verifyAccess(parent, req)) {
      return res.status(403).json({ error: 'Senha incorreta ou acesso negado' });
    }
    await fsp.mkdir(dirPath, { recursive: true });
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
app.delete('/directories/:name', async (req, res) => {
  try {
    const relative = path.normalize(req.params.name).replace(/^([\.\/])+/, '');
    const dirPath = path.join(uploadsDir, relative);
    if (!dirPath.startsWith(uploadsDir)) {
      return res.status(400).json({ error: 'Diretório inválido' });
    }
    try {
      await fsp.access(dirPath);
    } catch {
      return res.status(404).json({ error: 'Diretório não encontrado' });
    }
    if (!verifyAccess(relative, req)) {
      return res.status(403).json({ error: 'Senha incorreta ou acesso negado' });
    }
    await pool.query('DELETE FROM files WHERE path LIKE $1', [`${relative}/%`]);
    await fsp.rm(dirPath, { recursive: true, force: true });
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
app.get('/directories', async (req, res) => {
  try {
    const dir = (req.query.dir || '').replace(/\\/g, '/');
    const dirPath = path.join(uploadsDir, dir);
    if (!dirPath.startsWith(uploadsDir)) {
      return res.status(400).json({ error: 'Diretório inválido' });
    }
    try {
      await fsp.access(dirPath);
    } catch {
      return res.status(404).json({ error: 'Diretório não encontrado' });
    }
    if (dir && !verifyAccess(dir, req)) {
      return res.status(403).json({ error: 'Senha incorreta ou acesso negado' });
    }
    const entries = await fsp.readdir(dirPath, { withFileTypes: true });
    const dirs = entries.filter(d => d.isDirectory()).map(d => d.name);
    res.json(dirs);
  } catch (error) {
    console.error('Erro ao listar diretórios:', error);
    res.status(500).json({ error: 'Erro ao listar diretórios' });
  }
});

// Informações do sistema
app.get('/stats', async (req, res) => {
  try {
    const result = await pool.query('SELECT COUNT(*) AS count, COALESCE(SUM(size),0) AS size FROM files');
    const totalFiles = Number(result.rows[0].count);
    const totalSize = Number(result.rows[0].size);
    res.json({
      totalFiles,
      totalSize: formatBytes(totalSize),
      diskSpace: await getDiskSpace()
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
async function getDiskSpace() {
  try {
    const result = await pool.query('SELECT COALESCE(SUM(size),0) AS size FROM files');
    const used = Number(result.rows[0].size);
    return {
      used: formatBytes(used),
      available: 'Unlimited (Render.com)'
    };
  } catch (error) {
    return { used: '0 Bytes', available: 'Unknown' };
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
const ready = (async () => {
  await initialize();
  await loadExistingFiles();
})();

if (require.main === module) {
  ready.then(async () => {
    const result = await pool.query('SELECT COUNT(*) AS count FROM files');
    app.listen(PORT, () => {
      console.log(`🚀 Servidor rodando na porta ${PORT}`);
      console.log(`📁 Diretório de uploads: ${uploadsDir}`);
      console.log(`📊 ${result.rows[0].count} arquivos carregados`);
    });
  });
}

module.exports = app;
module.exports.ready = ready;
