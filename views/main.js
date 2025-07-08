const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    const uploadButton = document.getElementById('uploadButton');
    const uploadText = document.getElementById('uploadText');
    const progressBar = document.getElementById('progressBar');
    const progressFill = document.getElementById('progressFill');
    const messageDiv = document.getElementById('message');
    const filesContainer = document.getElementById('filesContainer');
const directoriesContainer = document.getElementById('directoriesContainer');
    const breadcrumb = document.getElementById('breadcrumb');
    const statsDiv = document.getElementById('stats');
let currentDir = '';

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

    // Click anywhere in upload area triggers file input
    uploadArea.addEventListener('click', () => {
      fileInput.click();
    });
    
    // Evento do botão de upload
    uploadButton.addEventListener('click', (e) => {
      e.stopPropagation();
      fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
      e.stopPropagation();
      if (e.target.files.length > 0) {
        uploadText.textContent = `${e.target.files.length} arquivo(s) selecionado(s)`;
      }
      handleFiles(e.target.files);
    });

    function handleFiles(files) {
      if (files.length === 0) return;

      const formData = new FormData();
      for (let file of files) {
        formData.append('files', file);
      }
      formData.append('dir', currentDir);

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
        uploadText.textContent = 'Arraste seus arquivos aqui ou clique para selecionar';
        fileInput.value = '';

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
        fileInput.value = '';
        showMessage('Erro de conexão', 'error');
      });

      xhr.open('POST', '/upload');
      xhr.send(formData);
    }

    function showMessage(text, type) {
      messageDiv.innerHTML = `<div class="message ${type}">${text}</div>`;
      setTimeout(() => {
        messageDiv.innerHTML = '';
      }, 5000);
    }

    function loadFiles() {
      fetch(`/files?dir=${encodeURIComponent(currentDir)}`)
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

      card.innerHTML = `
        <div class="file-icon">${icon}</div>
        <div class="file-name" title="${file.originalName}">${truncateText(file.originalName, 30)}</div>
        <div class="file-info">
          <div>📅 ${date}</div>
          <div>📦 ${size}</div>
        </div>
        <div class="file-actions">
          <a href="/download/${file.id}" class="btn btn-download" download>
            ⬇️ Baixar
          </a>
         <button class="btn btn-download rename-btn" data-id="${file.id}">
            ✏️ Renomear
          </button>
          <button class="btn btn-move move-btn" data-id="${file.id}">
            📂 Mover
          </button>
          <button class="btn btn-delete delete-btn" data-id="${file.id}">
            🗑️ Excluir
          </button>
        </div>
      `;
      card.querySelector('.rename-btn').addEventListener('click', () => renameFile(file.id));
      card.querySelector('.move-btn').addEventListener('click', () => moveFile(file.id));
      card.querySelector('.delete-btn').addEventListener('click', () => deleteFile(file.id));
        
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

      fetch(`/delete/${fileId}`, { method: 'DELETE' })
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

 function renameFile(fileId) {
      const newName = prompt('Novo nome do arquivo:');
      if (!newName) return;
      fetch(`/rename/${fileId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newName })
      })
        .then(response => response.json())
        .then(data => {
          if (data.message) {
            showMessage(data.message, 'success');
            loadFiles();
          } else {
            showMessage(data.error, 'error');
          }
        })
        .catch(() => showMessage('Erro ao renomear arquivo', 'error'));
    }

function moveFile(fileId) {
      const newDir = prompt('Mover para pasta (deixe vazio para a raiz):');
      if (newDir === null) return;
      fetch(`/move/${fileId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newDir })
      })
        .then(response => response.json())
        .then(data => {
          if (data.message) {
            showMessage(data.message, 'success');
            loadDirectories();
            loadFiles();
          } else {
            showMessage(data.error, 'error');
          }
        })
        .catch(() => showMessage('Erro ao mover arquivo', 'error'));
    }


    document.getElementById('createDirBtn').addEventListener('click', () => {
      const name = prompt('Nome da nova pasta:');
      if (!name) return;
         const fullPath = currentDir ? `${currentDir}/${name}` : name;
      const password = prompt('Senha para a pasta (deixe vazio para pública):') || '';
      fetch('/directories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ name: fullPath, password })
      })
        .then(response => response.json())
        .then(data => {
          showMessage(data.message || data.error, data.message ? 'success' : 'error');
          if (data.message) loadDirectories();
        })
        .catch(() => showMessage('Erro ao criar diretório', 'error'));
    });

    document.getElementById('deleteDirBtn').addEventListener('click', () => {
      const name = prompt('Nome da pasta a excluir:');
      if (!name) return;
     const fullPath = currentDir ? `${currentDir}/${name}` : name;
      const password = prompt('Senha da pasta (se houver):') || '';
      fetch(`/directories/${encodeURIComponent(fullPath)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      })
        .then(response => response.json())
        .then(data => {
          showMessage(data.message || data.error, data.message ? 'success' : 'error');
          if (data.message) loadDirectories();
        })
        .catch(() => showMessage('Erro ao excluir diretório', 'error'));
    });
function loadDirectories() {
      fetch(`/directories?dir=${encodeURIComponent(currentDir)}`)
        .then(response => response.json())
        .then(dirs => displayDirectories(dirs))
        .catch(() => { directoriesContainer.innerHTML = ''; });
    }

    function displayDirectories(dirs) {
      if (!Array.isArray(dirs) || dirs.length === 0) {
        directoriesContainer.innerHTML = '';
        return;
      }
      const grid = document.createElement('div');
      grid.className = 'files-grid';
      dirs.forEach(name => {
        const card = document.createElement('div');
        card.className = 'directory-card';
        card.textContent = `📁 ${name}`;
        card.addEventListener('click', () => changeDirectory(name));
        grid.appendChild(card);
      });
      directoriesContainer.innerHTML = '';
      directoriesContainer.appendChild(grid);
    }

    function changeDirectory(name) {
      currentDir = currentDir ? `${currentDir}/${name}` : name;
      updateBreadcrumb();
      loadDirectories();
      loadFiles();
    }

    function updateBreadcrumb() {
      const parts = currentDir ? currentDir.split('/') : [];
      let html = '<span class="crumb" data-path="">Home</span>';
      let path = '';
      parts.forEach((p, i) => {
        path += (i > 0 ? '/' : '') + p;
        html += ` / <span class="crumb" data-path="${path}">${p}</span>`;
      });
      breadcrumb.innerHTML = html;
      document.querySelectorAll('.crumb').forEach(el => {
        el.addEventListener('click', () => {
          currentDir = el.getAttribute('data-path');
          updateBreadcrumb();
          loadDirectories();
          loadFiles();
        });
      });
    }


    document.getElementById('searchInput').addEventListener('input', (e) => {
      loadFilesWithQuery(e.target.value);
    });

    function loadFilesWithQuery(query) {
      fetch(`/files?dir=${encodeURIComponent(currentDir)}&search=${encodeURIComponent(query)}`)
        .then(response => response.json())
        .then(files => {
          displayFiles(files);
          updateStats();
        })
        .catch(() => {
          filesContainer.innerHTML = '<div class="loading">Erro ao carregar arquivos</div>';
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
        updateBreadcrumb();
      loadDirectories();
      loadFiles();
 });
