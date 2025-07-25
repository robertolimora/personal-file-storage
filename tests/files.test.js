const request = require('supertest');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { newDb } = require('pg-mem');
global.__TEST_DB__ = global.__TEST_DB__ || newDb();
jest.mock('pg', () => {
  return global.__TEST_DB__.adapters.createPg();
});
process.env.DATABASE_URL = 'postgres://localhost/test';

const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uploads-'));
process.env.UPLOADS_DIR = uploadsDir;
fs.writeFileSync(path.join(uploadsDir, 'dummy-test.txt'), 'test');

const app = require('../app');

beforeAll(async () => {
  await app.ready;
});

let uploadedFile; // store uploaded file info for download and delete tests

afterAll(() => {
  fs.rmSync(uploadsDir, { recursive: true, force: true });
});

describe('GET /files', () => {
  it('should return 200 and an array', async () => {
    const res = await request(app).get('/files');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

   it('should allow searching files', async () => {
    const res = await request(app).get('/files?search=test');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('PATCH /move/:id', () => {
  it('should move file to another directory', async () => {
    const list = await request(app).get('/files');
    const file = list.body.find(f => f.originalName === 'dummy-test.txt');
    expect(file).toBeDefined();

    const res = await request(app)
      .patch(`/move/${file.id}`)
      .send({ newDir: 'moved' });

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBeDefined();
    const movedPath = path.join(uploadsDir, 'moved', file.filename);
    expect(fs.existsSync(movedPath)).toBe(true);
  });
});

describe('POST /upload', () => {
  it('should upload a file via multipart/form-data', async () => {
    const res = await request(app)
      .post('/upload')
      .attach('files', Buffer.from('hello world'), 'upload.txt');

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.files)).toBe(true);
    uploadedFile = res.body.files[0];
    const filePath = path.join(uploadsDir, uploadedFile.filename);
    expect(fs.existsSync(filePath)).toBe(true);
  });
  it('should preserve UTF-8 characters in filename', async () => {
    const res = await request(app)
      .post('/upload')
      .attach('files', Buffer.from('hello'), 'vídeo.txt');

    expect(res.statusCode).toBe(200);
    const uploaded = res.body.files[0];
    expect(uploaded.originalName).toBe('vídeo.txt');
    const filePath = path.join(uploadsDir, uploaded.filename);
    expect(fs.existsSync(filePath)).toBe(true);
    await request(app).delete(`/delete/${uploaded.id}`);
  });
});

describe('GET /download/:id', () => {
  it('should download previously uploaded file', async () => {
    const res = await request(app).get(`/download/${uploadedFile.id}`);
    expect(res.statusCode).toBe(200);
    expect(res.header['content-disposition']).toContain('attachment');
    expect(res.headers['content-type']).toBeDefined();
  });
});

describe('Persistence across restart', () => {
  it('should download file after server reload', async () => {
    const uploadRes = await request(app)
      .post('/upload')
      .attach('files', Buffer.from('reboot'), 'reboot.txt');

    const persisted = uploadRes.body.files[0];

  jest.resetModules();
  const newApp = require('../app');
  await newApp.ready;

  const res = await request(newApp).get(`/download/${persisted.id}`);
    expect(res.statusCode).toBe(200);
    await request(newApp).delete(`/delete/${persisted.id}`);
  });
});

describe('DELETE /delete/:id', () => {
  it('should remove uploaded file', async () => {
    const res = await request(app).delete(`/delete/${uploadedFile.id}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBeDefined();
    const filePath = path.join(uploadsDir, uploadedFile.filename);
    expect(fs.existsSync(filePath)).toBe(false);
  });
});

describe('DELETE /directories/:name', () => {
  it('should remove directory and its contents', async () => {
    const dir = 'tempdir';
    await request(app).post('/directories').send({ name: dir });
    const uploadRes = await request(app)
      .post('/upload')
      .field('dir', dir)
      .attach('files', Buffer.from('content'), 'inside.txt');
    const uploaded = uploadRes.body.files[0];
    const dirPath = path.join(uploadsDir, dir);
    const filePath = path.join(dirPath, uploaded.filename);
    expect(fs.existsSync(filePath)).toBe(true);

    const res = await request(app).delete(`/directories/${dir}`);
    expect(res.statusCode).toBe(200);
    expect(fs.existsSync(dirPath)).toBe(false);
  });
});
