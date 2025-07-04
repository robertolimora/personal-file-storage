# 🌐 Serviço de Upload de Arquivos Pessoais

Um serviço completo de armazenamento de arquivos pessoais na nuvem, com interface web moderna e deploy automático no Render.com.

## ✨ Funcionalidades

- **Upload Multiple**: Envie até 5 arquivos simultaneamente (máximo 50MB cada)
- **Drag & Drop**: Interface intuitiva com arrastar e soltar
- **Tipos Suportados**: Imagens, documentos, vídeos, áudios e arquivos compactados
- **Download Direto**: Baixe seus arquivos de qualquer dispositivo
- **Interface Responsiva**: Funciona perfeitamente em desktop e mobile
- **Segurança**: Rate limiting e validação de tipos de arquivo
- **Estatísticas**: Visualize quantos arquivos e espaço você está usando

## 🚀 Deploy no Render.com

### Pré-requisitos
- Conta no [Render.com](https://render.com)
- Conta no GitHub (para hospedar o código)

### Passo a Passo

1. **Preparar o Repositório**
   ```bash
   # Crie um novo repositório no GitHub
   # Clone localmente e adicione os arquivos do projeto
   git clone https://github.com/seu-usuario/seu-repositorio.git
   cd seu-repositorio
   
   # Copie todos os arquivos do projeto para esta pasta
   # Estrutura deve ficar assim:
   # ├── app.js
   # ├── package.json
   # ├── render.yaml
   # ├── public/
   # │   └── index.html
   # └── README.md
   ```

2. **Commit e Push**
   ```bash
   git add .
   git commit -m "Adicionar serviço de upload de arquivos"
   git push origin main
   ```

3. **Deploy no Render**
   - Acesse [dashboard.render.com](https://dashboard.render.com)
   - Clique em "New +" → "Web Service"
   - Conecte seu repositório GitHub
   - Render detectará automaticamente o `render.yaml`
   - Clique em "Deploy"

4. **Configuração Automática**
   O arquivo `render.yaml` configura automaticamente:
   - Ambiente Node.js
   - Comandos de build e start
   - Disco persistente de 1GB para arquivos
   - Variáveis de ambiente

### URL de Acesso
Após o deploy, você receberá uma URL como:
`https://seu-servico.onrender.com`

## 📁 Estrutura do Projeto

```
projeto/
├── app.js              # Servidor Express principal
├── package.json        # Dependências do Node.js
├── render.yaml         # Configuração do Render
├── public/
│   └── index.html      # Interface web
├── uploads/            # Pasta dos arquivos (criada automaticamente)
└── README.md           # Este arquivo
```

## 🔧 Configurações

### Limites Padrão
- **Tamanho por arquivo**: 50MB
- **Arquivos simultâneos**: 5
- **Rate limit**: 10 uploads por 15 minutos por IP
- **Armazenamento**: 1GB (plano gratuito Render)

### Tipos de Arquivo Suportados
- **Imagens**: JPG, JPEG, PNG, GIF
- **Documentos**: PDF, DOC, DOCX, TXT
- **Vídeos**: MP4, AVI
- **Áudios**: MP3
- **Compactados**: ZIP, RAR

### Modificar Configurações
Para alterar limites, edite as seguintes linhas no `app.js`:

```javascript
// Tamanho máximo por arquivo (em bytes)
fileSize: 50 * 1024 * 1024, // 50MB

// Número máximo de arquivos
files: 5

// Rate limiting
max: 10, // uploads por janela de tempo
windowMs: 15 * 60 * 1000, // 15 minutos
```

## 🛡️ Segurança

O serviço inclui várias medidas de segurança:

- **Helmet.js**: Headers de segurança HTTP
- **Rate Limiting**: Previne abuso
- **Validação de Tipos**: Apenas arquivos permitidos
- **Nomes Únicos**: Evita conflitos de arquivos
- **Sanitização**: Nomes de arquivo seguros

## 📱 Uso

### Upload de Arquivos
1. Acesse a URL do seu serviço
2. Arraste arquivos para a área de upload OU clique em "Escolher Arquivos"
3. Aguarde o upload completar
4. Seus arquivos aparecerão na lista abaixo

### Download de Arquivos
- Clique no botão "Baixar" em qualquer arquivo
- O download iniciará automaticamente

### Excluir Arquivos
- Clique no botão "Excluir" (confirmação será solicitada)
- O arquivo será removido permanentemente

## 🔄 Atualizações

Para atualizar o serviço:

1. **Modifique o código localmente**
2. **Commit e push**:
   ```bash
   git add .
   git commit -m "Atualização: descrição das mudanças"
   git push origin main
   ```
3. **Deploy automático**: Render detectará as mudanças e fará o redeploy

## 🆓 Limitações do Plano Gratuito

**Render.com (Plano Free):**
- 750 horas/mês de execução
- 1GB de armazenamento persistente
- Serviço "hiberna" após 15min de inatividade
- Tempo de "acordar" de ~30 segundos

**Upgrade recomendado** para uso intensivo:
- Plano Starter ($7/mês): Sem hibernação + 10GB storage
- Plano Standard ($25/mês): Mais recursos + 100GB storage

## 🌟 Melhorias Futuras

Possíveis expansões do projeto:

- **Autenticação**: Login/senha para proteger arquivos
- **Pastas**: Organização em diretórios
- **Compartilhamento**: Links públicos temporários
- **Preview**: Visualização de imagens/documentos
- **Backup**: Integração com Google Drive/Dropbox
- **API**: Endpoints REST para integração

## 🆘 Resolução de Problemas

### Erro de Upload
- Verifique se o arquivo está dentro do limite de 50MB
- Confirme se o tipo de arquivo é suportado
- Aguarde alguns minutos se atingiu o rate limit

### Serviço Não Responde
- Primeira requisição após inatividade demora ~30s (hibernação)
- Verifique se há erros no log do Render

### Arquivo Não Encontrado
- Arquivos são perdidos se o serviço for redeployado sem disco persistente
- Certifique-se que o `render.yaml` está configurado corretamente

## 📞 Suporte

Para dúvidas ou problemas:
1. Verifique os logs no dashboard do Render
2. Consulte a documentação do [Render.com](https://render.com/docs)
3. Revise este README.md

---

**🎉 Agora você tem seu próprio serviço de arquivos na nuvem!**

Acesse de qualquer lugar do mundo e tenha seus arquivos sempre disponíveis.
