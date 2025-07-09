const request = require('supertest');
const fs = require('fs');
const path = require('path');

const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}
fs.writeFileSync(path.join(uploadsDir, 'dummy-test.txt'), 'test');

const app = require('../app');

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
});

describe('GET /download/:id', () => {
  it('should download previously uploaded file', async () => {
    const res = await request(app).get(`/download/${uploadedFile.id}`);
    expect(res.statusCode).toBe(200);
    expect(res.header['content-disposition']).toContain('attachment');
    expect(res.headers['content-type']).toBeDefined();
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
