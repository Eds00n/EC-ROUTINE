'use strict';

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-at-least-32-characters-long';
delete process.env.DATABASE_URL;
process.env.ADMIN_EMAILS = `admin_${Date.now()}_${Math.random().toString(36).slice(2, 10)}@test.local`;

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
        assert.equal(res.body.user.isAdmin, false);
    });

    test('POST /api/login devolve token', async () => {
        const email = `login_${Date.now()}@test.local`;
        await request(app)
            .post('/api/register')
            .send({ name: 'L', email, password: 'outrasenha8' });
        const res = await request(app).post('/api/login').send({ email, password: 'outrasenha8' });
        assert.equal(res.status, 200);
        assert.ok(res.body.token);
        assert.equal(res.body.user.isAdmin, false);
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
        assert.equal(res.body.user.isAdmin, false);
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

    test('GET /api/admin/summary negado para não-admin', async () => {
        const email = `na_${Date.now()}@test.local`;
        const reg = await request(app)
            .post('/api/register')
            .send({ name: 'N', email, password: 'senha88888' });
        assert.equal(reg.status, 201);
        const res = await request(app)
            .get('/api/admin/summary')
            .set('Authorization', 'Bearer ' + reg.body.token);
        assert.equal(res.status, 403);
    });

    test('GET /api/admin/summary permitido para e-mail em ADMIN_EMAILS', async () => {
        const adminEmail = String(process.env.ADMIN_EMAILS || '')
            .split(',')[0]
            .trim()
            .toLowerCase();
        assert.ok(adminEmail.length > 3);
        let reg = await request(app)
            .post('/api/register')
            .send({ name: 'Admin', email: adminEmail, password: 'senha88888' });
        let token = reg.body && reg.body.token;
        if (reg.status !== 201) {
            const login = await request(app)
                .post('/api/login')
                .send({ email: adminEmail, password: 'senha88888' });
            assert.equal(login.status, 200, 'login admin após registo duplicado');
            token = login.body.token;
        }
        const res = await request(app).get('/api/admin/summary').set('Authorization', 'Bearer ' + token);
        assert.equal(res.status, 200);
        assert.equal(typeof res.body.usersCount, 'number');
        assert.equal(typeof res.body.routinesCount, 'number');
        const ping = await request(app).get('/api/admin/ping').set('Authorization', 'Bearer ' + token);
        assert.equal(ping.status, 200);
        assert.equal(ping.body.ok, true);
        const verifyAdmin = await request(app).get('/api/verify').set('Authorization', 'Bearer ' + token);
        assert.equal(verifyAdmin.status, 200);
        assert.equal(verifyAdmin.body.user.isAdmin, true);
    });
});
