const request = require('supertest');
const app = require('../app');

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
