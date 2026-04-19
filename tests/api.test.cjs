'use strict';

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-at-least-32-characters-long';
delete process.env.DATABASE_URL;

const { app, initializeBackend } = require('../server.js');

describe('API REST', () => {
    before(async () => {
        await initializeBackend();
    });

    test('POST /api/register cria utilizador', async () => {
        const email = `u_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@test.local`;
        const res = await request(app)
            .post('/api/register')
            .send({ name: 'Utilizador Teste', email, password: 'senha12345' });
        assert.equal(res.status, 201);
        assert.ok(res.body.token);
        assert.ok(res.body.user);
        assert.equal(res.body.user.email, email);
    });

    test('POST /api/login devolve token', async () => {
        const email = `login_${Date.now()}@test.local`;
        await request(app)
            .post('/api/register')
            .send({ name: 'L', email, password: 'outrasenha8' });
        const res = await request(app).post('/api/login').send({ email, password: 'outrasenha8' });
        assert.equal(res.status, 200);
        assert.ok(res.body.token);
    });

    test('GET /api/verify com Bearer devolve utilizador', async () => {
        const email = `v_${Date.now()}@test.local`;
        const reg = await request(app)
            .post('/api/register')
            .send({ name: 'V', email, password: 'senha88888' });
        const token = reg.body.token;
        const res = await request(app).get('/api/verify').set('Authorization', 'Bearer ' + token);
        assert.equal(res.status, 200);
        assert.ok(res.body.user);
        assert.equal(res.body.user.email, email);
    });

    test('GET /api/routines com Bearer lista rotinas', async () => {
        const email = `r_${Date.now()}@test.local`;
        const reg = await request(app)
            .post('/api/register')
            .send({ name: 'R', email, password: 'senha88888' });
        const token = reg.body.token;
        const res = await request(app).get('/api/routines').set('Authorization', 'Bearer ' + token);
        assert.equal(res.status, 200);
        assert.ok(Array.isArray(res.body));
    });
});
