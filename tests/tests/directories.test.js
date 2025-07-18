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

const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dirs-'));
process.env.UPLOADS_DIR = uploadsDir;

jest.resetModules();
const app = require('../app');

beforeAll(async () => {
  await app.ready;
});

afterAll(() => {
  fs.rmSync(uploadsDir, { recursive: true, force: true });
});

describe('Directory API', () => {
  const dirName = 'apitest-dir';
  const dirPath = path.join(uploadsDir, dirName);

  it('POST /directories should create directory', async () => {
    const res = await request(app).post('/directories').send({ name: dirName });
    expect(res.statusCode).toBe(200);
    expect(fs.existsSync(dirPath)).toBe(true);
  });

  it('GET /directories should list created directory', async () => {
    const res = await request(app).get('/directories');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toContain(dirName);
  });

  it('DELETE /directories/:name should remove directory', async () => {
    const res = await request(app).delete(`/directories/${dirName}`);
    expect(res.statusCode).toBe(200);
    expect(fs.existsSync(dirPath)).toBe(false);
  });
});
