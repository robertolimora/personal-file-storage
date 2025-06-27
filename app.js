const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Segurança
app.use(helmet());

// Limite de requisições por IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10, // 10 uploads por janela
});
app.use('/upload', limiter);

// Arquivos estáticos (HTML, CSS, JS)
app.use(express.static(path.join(__dirname, 'public')));

// Pasta de uploads
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Configuração do Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + file.originalname.replace(/\s+/g, '_');
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024, files: 5 }, // 50MB e até 5 arquivos
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.pdf', '.doc', '.docx', '.txt', '.zip', '.rar', '.mp3', '.mp4', '.avi'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  }
});

// Upload de múltiplos arquivos
app.post('/upload', upload.array('files', 5), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'Nenhum arquivo enviado' });
  }
  res.status(200).json({ message: 'Upload realizado com sucesso' });
});

// Listar arquivos
app.get('/files', (req, res) => {
  fs.readdir(uploadDir, (err, files) => {
    if (err) return res.status(500).json({ error: 'Erro ao listar arquivos' });

    const lista = files.map(nome => {
      const stats = fs.statSync(path.join(uploadDir, nome));
      return {
        id: nome,
        originalName: nome,
        uploadDate: stats.birthtime,
        size: stats.size,
        type: path.extname(nome)
      };
    });

    res.json(lista);
  });
});

// Baixar arquivo
app.get('/download/:id', (req, res) => {
  const filePath = path.join(uploadDir, req.params.id);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Arquivo não encontrado' });
  res.download(filePath);
});

// Excluir arquivo
app.delete('/delete/:id', (req, res) => {
  const filePath = path.join(uploadDir, req.params.id);
  fs.unlink(filePath, err => {
    if (err) return res.status(500).json({ error: 'Erro ao excluir arquivo' });
    res.json({ message: 'Arquivo excluído com sucesso' });
  });
});

// Estatísticas
app.get('/stats', (req, res) => {
  fs.readdir(uploadDir, (err, files) => {
    if (err) return res.status(500).json({ error: 'Erro ao ler pasta' });

    let totalSize = 0;
    for (const file of files) {
      const stats = fs.statSync(path.join(uploadDir, file));
      totalSize += stats.size;
    }

    res.json({
      totalFiles: files.length,
      totalSize: formatBytes(totalSize)
    });
  });
});

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
}

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
