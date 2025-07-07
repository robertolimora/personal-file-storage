const request = require('supertest');
const fs = require('fs');
const path = require('path');

const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}
fs.writeFileSync(path.join(uploadsDir, 'dummy-test.txt'), 'test');

const app = require('../app');

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
