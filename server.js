const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const store = require('./lib/store');

const app = express();
/** Render / proxies enviam X-Forwarded-For; express-rate-limit v8 exige isto para não lançar ValidationError. */
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS) || 1);

const authRouteLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 40,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiados pedidos de autenticação. Tente novamente dentro de alguns minutos.' },
    skip: (req) => process.env.NODE_ENV === 'test',
    /** Evita ValidationError + 500 HTML atrás de proxies (Render) se X-Forwarded-For / Forwarded variarem. */
    validate: {
        xForwardedForHeader: false,
        forwardedHeader: false,
        default: true
    }
});

app.use(
    helmet({
        contentSecurityPolicy: false,
        crossOriginEmbedderPolicy: false,
        crossOriginResourcePolicy: { policy: 'cross-origin' }
    })
);
const PORT = Number(process.env.PORT) || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';
/** Em produção defina CORS_ORIGIN no ambiente (ver DEPLOY.md e .env.example). */
const CORS_ORIGIN = process.env.CORS_ORIGIN || '';
/** Na Render o URL público do serviço vem injectado — útil monólito sem CORS_ORIGIN. */
const renderPublicOrigin = String(process.env.RENDER_EXTERNAL_URL || '')
    .trim()
    .replace(/\/$/, '');
const allowedOrigins = new Set(
    String(CORS_ORIGIN || '')
        .split(',')
        .map(s => s.trim().replace(/\/$/, ''))
        .filter(Boolean)
        .concat(['http://localhost:3000', 'http://127.0.0.1:3000'])
        .concat(renderPublicOrigin ? [renderPublicOrigin] : [])
);

app.use(express.json({ limit: '10mb' }));

app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.has(origin)) return callback(null, true);
        return callback(new Error('CORS não permitido para esta origem'));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/admin.html', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/create', (req, res) => res.sendFile(path.join(__dirname, 'create.html')));
app.get('/login', (req, res) => res.redirect('/auth.html?view=login'));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'auth.html')));
app.get('/', (req, res) => res.redirect('/auth.html?view=login'));

let ATTACHMENTS_DIR = path.join(__dirname, 'data', 'attachments');

const UPLOAD_MAX_FILE_SIZE = 20 * 1024 * 1024;
const UPLOAD_MAX_FILE_SIZE_MB = 20;

function makeAttachmentId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, ATTACHMENTS_DIR);
    },
    filename: function (req, file, cb) {
        const ext =
            path.extname(file.originalname) ||
            (file.mimetype && file.mimetype.indexOf('png') !== -1
                ? '.png'
                : file.mimetype && file.mimetype.indexOf('jpeg') !== -1
                  ? '.jpg'
                  : '.bin');
        cb(null, makeAttachmentId() + ext);
    }
});
const uploadMiddleware = multer({
    storage,
    limits: { fileSize: UPLOAD_MAX_FILE_SIZE }
});

function getLocalDateStrServer(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function calculateProgress(routine) {
    const today = getLocalDateStrServer(new Date());
    if (!routine.tasks || routine.tasks.length === 0) {
        if (routine.checkIns && routine.checkIns.includes(today)) {
            return 100;
        }
        return 0;
    }
    const completedTasks = routine.tasks.filter(t => t.completed).length;
    return Math.round((completedTasks / routine.tasks.length) * 100);
}

function normalizeDateStrProfile(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return null;
    const m = dateStr.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : null;
}

function getRoutineCompletedDatesProfile(routine) {
    const dates = new Set();
    const add = d => {
        const n = normalizeDateStrProfile(d);
        if (n) dates.add(n);
    };
    if (routine.tasks) {
        routine.tasks.forEach(task => {
            if (task.completedDates) task.completedDates.forEach(add);
        });
    }
    if (routine.checkIns) routine.checkIns.forEach(add);
    return dates;
}

function getCurrentStreakProfile(routine) {
    const dates = getRoutineCompletedDatesProfile(routine);
    if (dates.size === 0) return 0;
    const now = new Date();
    const today = getLocalDateStrServer(now);
    const yesterday = getLocalDateStrServer(new Date(now.getTime() - 86400000));
    if (!dates.has(today) && !dates.has(yesterday)) return 0;
    let streak = 0;
    let checkDate = dates.has(today) ? today : yesterday;
    while (dates.has(checkDate)) {
        streak++;
        const d = new Date(`${checkDate}T12:00:00`);
        d.setDate(d.getDate() - 1);
        checkDate = getLocalDateStrServer(d);
    }
    return streak;
}

function computeProfileStats(routines) {
    let tasksTotal = 0;
    let maxStreak = 0;
    let activeSequences = 0;
    for (const r of routines) {
        const tasks = r.tasks || [];
        tasksTotal += tasks.length;
        const streak = getCurrentStreakProfile(r);
        if (streak > 0) activeSequences++;
        if (streak > maxStreak) maxStreak = streak;
    }
    return {
        routinesCount: routines.length,
        tasksTotal,
        activeSequences,
        maxStreak
    };
}

function publicUserFields(user) {
    if (!user) return null;
    return {
        id: user.id,
        name: user.name,
        email: user.email,
        picture: user.picture || '',
        sexuality: user.sexuality || '',
        birthDate: user.birthDate || ''
    };
}

/** ID do ficheiro em /api/attachments/:id — devolve null se não for anexo interno. */
function attachmentIdFromPictureUrl(pic) {
    if (!pic || typeof pic !== 'string') return null;
    const t = pic.trim();
    if (!t) return null;
    const marker = '/api/attachments/';
    let pathPart = '';
    if (t.indexOf(marker) !== -1) {
        pathPart = t.slice(t.indexOf(marker) + marker.length);
    } else if (/^https?:\/\//i.test(t)) {
        try {
            pathPart = (new URL(t).pathname || '').replace(/^\/+|\/+$/g, '');
            const idx = pathPart.indexOf('api/attachments/');
            if (idx === -1) return null;
            pathPart = pathPart.slice(idx + 'api/attachments/'.length);
        } catch {
            return null;
        }
    } else {
        return null;
    }
    pathPart = pathPart.split(/[?#]/)[0];
    if (!pathPart || pathPart.indexOf('..') !== -1 || /[\\/]/.test(pathPart)) return null;
    try {
        return decodeURIComponent(pathPart);
    } catch {
        return pathPart;
    }
}

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Token não fornecido' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Token inválido' });
        }
        req.user = user;
        next();
    });
}

/** E-mails com acesso a GET /api/admin/* (variável ADMIN_EMAILS, separados por vírgula, minúsculas). */
function parseAdminEmailSet() {
    const s = new Set();
    for (const part of String(process.env.ADMIN_EMAILS || '').split(',')) {
        const em = String(part || '').trim().toLowerCase();
        if (em) s.add(em);
    }
    return s;
}

function isAdminEmail(email) {
    const set = parseAdminEmailSet();
    if (set.size === 0) return false;
    return set.has(String(email || '').trim().toLowerCase());
}

function requireAdmin(req, res, next) {
    if (!isAdminEmail(req.user && req.user.email)) {
        return res.status(403).json({ error: 'Acesso reservado a administradores.' });
    }
    next();
}

function uploadSingle(req, res, next) {
    uploadMiddleware.single('file')(req, res, function (err) {
        if (err && err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({
                error: 'Ficheiro demasiado grande. Máximo ' + UPLOAD_MAX_FILE_SIZE_MB + ' MB.'
            });
        }
        if (err) return next(err);
        next();
    });
}

// ==================== AUTENTICAÇÃO ====================

app.post('/api/register', authRouteLimiter, async (req, res) => {
    try {
        const { name, email, password } = req.body;

        const emailNorm = String(email || '')
            .trim()
            .toLowerCase();

        if (!name || !emailNorm || !password) {
            return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
        }

        const existing = await store.findUserByEmail(emailNorm);
        if (existing) {
            return res.status(400).json({ error: 'Email já cadastrado' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = {
            id: Date.now().toString(),
            name,
            email: emailNorm,
            password: hashedPassword,
            sexuality: '',
            birthDate: '',
            createdAt: new Date().toISOString()
        };

        try {
            await store.createUser(newUser);
        } catch (e) {
            if (e.code === '23505' || e.code === 'DUPLICATE_EMAIL') {
                return res.status(400).json({ error: 'Email já cadastrado' });
            }
            throw e;
        }

        const token = jwt.sign({ id: newUser.id, email: newUser.email }, JWT_SECRET, {
            expiresIn: '7d'
        });

        res.status(201).json({
            message: 'Usuário criado com sucesso',
            token,
            user: publicUserFields(newUser)
        });
    } catch (error) {
        console.error('Erro ao registrar usuário:', error);
        res.status(500).json({ error: 'Erro ao registrar usuário' });
    }
});

app.post('/api/login', authRouteLimiter, async (req, res) => {
    try {
        const email = String((req.body && req.body.email) || '')
            .trim()
            .toLowerCase();
        const password = (req.body && req.body.password) || '';

        if (!email || !password) {
            return res.status(400).json({ error: 'Email e senha são obrigatórios' });
        }

        const user = await store.findUserByEmail(email);

        if (!user) {
            return res.status(401).json({ error: 'Email ou senha incorretos' });
        }

        if (!user.password) {
            return res.status(401).json({
                error:
                    'Esta conta não tem palavra-passe definida neste site. Peça apoio para definir uma palavra-passe ou use outro e-mail.'
            });
        }

        let validPassword = false;
        try {
            validPassword = await bcrypt.compare(password, user.password);
        } catch (bcryptErr) {
            console.error('Erro ao comparar palavra-passe (hash inválido na BD?):', bcryptErr && bcryptErr.message);
            return res.status(401).json({ error: 'Email ou senha incorretos' });
        }

        if (!validPassword) {
            return res.status(401).json({ error: 'Email ou senha incorretos' });
        }

        const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

        res.json({
            message: 'Login realizado com sucesso',
            token,
            user: publicUserFields(user)
        });
    } catch (error) {
        console.error('Erro ao fazer login:', error && error.message, error && error.stack);
        res.status(500).json({ error: 'Erro ao fazer login' });
    }
});

app.get('/api/verify', authenticateToken, async (req, res) => {
    try {
        const user = await store.findUserById(req.user.id);

        if (!user) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }

        res.json({
            user: publicUserFields(user)
        });
    } catch (error) {
        console.error('Erro ao verificar token:', error);
        res.status(500).json({ error: 'Erro ao verificar token' });
    }
});

app.get('/api/profile', authenticateToken, async (req, res) => {
    try {
        const user = await store.findUserById(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        const routines = await store.listRoutinesForUser(req.user.id);
        res.json({
            user: publicUserFields(user),
            stats: computeProfileStats(routines)
        });
    } catch (error) {
        console.error('Erro ao obter perfil:', error);
        res.status(500).json({ error: 'Erro ao obter perfil' });
    }
});

app.put('/api/profile', authenticateToken, async (req, res) => {
    try {
        const { name, sexuality, birthDate, picture } = req.body;
        const user = await store.findUserById(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        if (name !== undefined) {
            const n = String(name || '').trim();
            if (!n) {
                return res.status(400).json({ error: 'Nome não pode ficar vazio' });
            }
            user.name = n.slice(0, 200);
        }
        if (sexuality !== undefined) {
            user.sexuality = String(sexuality || '').trim().slice(0, 120);
        }
        if (birthDate !== undefined) {
            if (birthDate === '' || birthDate === null) {
                user.birthDate = '';
            } else if (typeof birthDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
                user.birthDate = birthDate;
            } else {
                return res.status(400).json({ error: 'Data de nascimento inválida (use AAAA-MM-DD)' });
            }
        }
        if (picture !== undefined) {
            const pic = String(picture || '').trim().slice(0, 2000);
            if (!pic) {
                user.picture = '';
            } else {
                const attId = attachmentIdFromPictureUrl(pic);
                if (attId) {
                    const meta = await store.getAttachmentMeta(attId);
                    if (!meta || String(meta.userId) !== String(req.user.id)) {
                        return res.status(400).json({
                            error:
                                'Foto inválida: o ficheiro não foi encontrado ou não pertence à sua conta. Volte a enviar a imagem.'
                        });
                    }
                } else if (!/^https?:\/\//i.test(pic) && pic.indexOf('data:') !== 0) {
                    return res.status(400).json({ error: 'URL da foto inválida.' });
                }
                user.picture = pic;
            }
        }
        await store.updateUser(user);
        const fresh = await store.findUserById(req.user.id);
        res.json({ user: publicUserFields(fresh) });
    } catch (error) {
        console.error('Erro ao atualizar perfil:', error);
        res.status(500).json({ error: 'Erro ao atualizar perfil' });
    }
});

// ==================== ADMIN (métricas; apenas e-mails em ADMIN_EMAILS) ====================

app.get('/api/admin/ping', authenticateToken, requireAdmin, (req, res) => {
    res.json({ ok: true });
});

app.get('/api/admin/summary', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const summary = await store.getAdminSummary();
        res.json({
            generatedAt: new Date().toISOString(),
            ...summary
        });
    } catch (err) {
        console.error('Erro ao obter resumo admin:', err);
        res.status(500).json({ error: 'Erro ao obter estatísticas.' });
    }
});

// ==================== UPLOADS / ANEXOS ====================

app.post('/api/uploads', authenticateToken, uploadSingle, async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Nenhum ficheiro enviado' });
        }
        const attachmentId = req.file.filename;
        await store.registerAttachment({
            id: attachmentId,
            userId: req.user.id,
            filename: req.file.filename,
            mimeType: req.file.mimetype || '',
            sizeBytes: req.file.size
        });
        const url = '/api/attachments/' + encodeURIComponent(attachmentId);
        res.status(201).json({
            attachmentId,
            url,
            size: req.file.size,
            mimeType: req.file.mimetype || ''
        });
    } catch (err) {
        console.error('Erro no upload:', err);
        res.status(500).json({ error: 'Erro ao guardar ficheiro' });
    }
});

app.get('/api/attachments/:id', authenticateToken, async (req, res) => {
    try {
        const id = req.params.id;
        if (!id || id.indexOf('..') !== -1 || /[\\/]/.test(id)) {
            return res.status(400).json({ error: 'ID inválido' });
        }
        const entry = await store.getAttachmentMeta(id);
        if (!entry || entry.userId !== req.user.id) {
            return res.status(404).json({ error: 'Anexo não encontrado' });
        }
        const filePath = path.join(ATTACHMENTS_DIR, entry.filename);
        await fs.access(filePath);
        res.sendFile(path.resolve(filePath));
    } catch (e) {
        if (e.code === 'ENOENT') return res.status(404).json({ error: 'Anexo não encontrado' });
        res.status(500).json({ error: 'Erro ao obter anexo' });
    }
});

// ==================== ROTINAS ====================

app.get('/api/routines', authenticateToken, async (req, res) => {
    try {
        const userRoutines = await store.listRoutinesForUser(req.user.id);
        const routinesWithProgress = userRoutines.map(routine => ({
            ...routine,
            progress: calculateProgress(routine)
        }));
        res.json(routinesWithProgress);
    } catch (error) {
        console.error('Erro ao buscar rotinas:', error);
        res.status(500).json({ error: 'Erro ao buscar rotinas' });
    }
});

app.post('/api/routines', authenticateToken, async (req, res) => {
    try {
        const {
            title,
            description,
            tasks,
            schedule,
            planType,
            objectives,
            reasons,
            bulletType,
            context,
            tags
        } = req.body;

        if (!title) {
            return res.status(400).json({ error: 'Título é obrigatório' });
        }

        const newRoutine = {
            id: Date.now().toString(),
            userId: req.user.id,
            title,
            description: description || '',
            tasks: tasks || [],
            schedule: schedule || {},
            planType: planType || 'daily',
            objectives: objectives || '',
            reasons: reasons || '',
            bulletType: bulletType || 'task',
            ...(context !== undefined && { context: context || '' }),
            ...(tags !== undefined && { tags: Array.isArray(tags) ? tags : [] }),
            checkIns: [],
            completed: false,
            progress: calculateProgress({ tasks: tasks || [] }),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        await store.createRoutine(newRoutine);

        res.status(201).json(newRoutine);
    } catch (error) {
        console.error('Erro ao criar rotina:', error);
        res.status(500).json({ error: 'Erro ao criar rotina' });
    }
});

app.put('/api/routines/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const {
            title,
            description,
            tasks,
            schedule,
            completed,
            planType,
            objectives,
            reasons,
            bulletType,
            context,
            tags,
            checkIns
        } = req.body;

        const prev = await store.getRoutine(req.user.id, id);
        if (!prev) {
            return res.status(404).json({ error: 'Rotina não encontrada' });
        }

        const updatedRoutine = {
            ...prev,
            ...(title && { title }),
            ...(description !== undefined && { description }),
            ...(tasks && { tasks }),
            ...(schedule && { schedule }),
            ...(completed !== undefined && { completed }),
            ...(planType !== undefined && { planType: planType || 'daily' }),
            ...(objectives !== undefined && { objectives: objectives || '' }),
            ...(reasons !== undefined && { reasons: reasons || '' }),
            ...(bulletType !== undefined && { bulletType: bulletType || 'task' }),
            ...(context !== undefined && { context: context || '' }),
            ...(tags !== undefined && { tags: Array.isArray(tags) ? tags : [] }),
            ...(checkIns !== undefined && {
                checkIns: Array.isArray(checkIns) ? checkIns : prev.checkIns || []
            }),
            updatedAt: new Date().toISOString()
        };

        updatedRoutine.progress = calculateProgress(updatedRoutine);

        await store.updateRoutine(updatedRoutine);

        res.json(updatedRoutine);
    } catch (error) {
        console.error('Erro ao atualizar rotina:', error);
        res.status(500).json({ error: 'Erro ao atualizar rotina' });
    }
});

app.delete('/api/routines/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const ok = await store.deleteRoutine(req.user.id, id);
        if (!ok) {
            return res.status(404).json({ error: 'Rotina não encontrada' });
        }
        res.json({ message: 'Rotina deletada com sucesso' });
    } catch (error) {
        console.error('Erro ao deletar rotina:', error);
        res.status(500).json({ error: 'Erro ao deletar rotina' });
    }
});

app.post('/api/routines/:id/checkin', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { date } = req.body;

        const checkInDate = date || new Date().toISOString().split('T')[0];

        const result = await store.withRoutineExclusive(req.user.id, id, async routine => {
            if (!routine.checkIns) {
                routine.checkIns = [];
            }
            if (!routine.checkIns.includes(checkInDate)) {
                routine.checkIns.push(checkInDate);
                routine.checkIns.sort();
                routine.updatedAt = new Date().toISOString();
            }
            return routine;
        });

        if (!result) {
            return res.status(404).json({ error: 'Rotina não encontrada' });
        }

        res.json({
            message: 'Check-in registrado com sucesso',
            checkIns: result.checkIns
        });
    } catch (error) {
        console.error('Erro ao registrar check-in:', error);
        res.status(500).json({ error: 'Erro ao registrar check-in' });
    }
});

// ==================== TAREFAS ====================

app.post('/api/routines/:id/tasks', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { text } = req.body;

        if (!text || !text.trim()) {
            return res.status(400).json({ error: 'Texto da tarefa é obrigatório' });
        }

        const newTask = {
            id: Date.now().toString(),
            text: text.trim(),
            completed: false,
            createdAt: new Date().toISOString()
        };

        const updated = await store.withRoutineExclusive(req.user.id, id, async routine => {
            if (!routine.tasks) {
                routine.tasks = [];
            }
            routine.tasks.push(newTask);
            routine.progress = calculateProgress(routine);
            routine.updatedAt = new Date().toISOString();
            return routine;
        });

        if (!updated) {
            return res.status(404).json({ error: 'Rotina não encontrada' });
        }

        res.status(201).json(newTask);
    } catch (error) {
        console.error('Erro ao adicionar tarefa:', error);
        res.status(500).json({ error: 'Erro ao adicionar tarefa' });
    }
});

app.put('/api/routines/:id/tasks/:taskId', authenticateToken, async (req, res) => {
    try {
        const { id, taskId } = req.params;
        const { text, completed, annotation, annotationDate, annotationsByDate } = req.body;

        let responseTask = null;

        const updated = await store.withRoutineExclusive(req.user.id, id, async routine => {
            if (!routine.tasks) {
                return null;
            }
            const taskIndex = routine.tasks.findIndex(t => t.id === taskId);
            if (taskIndex === -1) {
                return null;
            }

            if (text !== undefined) {
                routine.tasks[taskIndex].text = text.trim();
            }
            if (completed !== undefined) {
                routine.tasks[taskIndex].completed = completed;
            }
            if (annotation !== undefined) {
                const ann =
                    annotation && typeof annotation === 'object'
                        ? {
                              type: annotation.type || '',
                              data: annotation.data != null ? annotation.data : ''
                          }
                        : null;
                routine.tasks[taskIndex].annotation = ann;
                if (
                    annotationDate &&
                    typeof annotationDate === 'string' &&
                    /^\d{4}-\d{2}-\d{2}$/.test(annotationDate)
                ) {
                    const task = routine.tasks[taskIndex];
                    if (!task.annotationsByDate || typeof task.annotationsByDate !== 'object') {
                        task.annotationsByDate = {};
                    }
                    task.annotationsByDate[annotationDate] = ann;
                }
            }
            if (
                annotationsByDate !== undefined &&
                annotationsByDate !== null &&
                typeof annotationsByDate === 'object'
            ) {
                const task = routine.tasks[taskIndex];
                const existing =
                    task.annotationsByDate && typeof task.annotationsByDate === 'object'
                        ? task.annotationsByDate
                        : {};
                const incoming = annotationsByDate;
                const merged = { ...existing };
                Object.keys(incoming).forEach(function (dateKey) {
                    if (Array.isArray(incoming[dateKey])) merged[dateKey] = incoming[dateKey];
                    else if (incoming[dateKey] != null) merged[dateKey] = incoming[dateKey];
                });
                task.annotationsByDate = merged;
            }

            routine.progress = calculateProgress(routine);
            routine.updatedAt = new Date().toISOString();
            responseTask = routine.tasks[taskIndex];
            return routine;
        });

        if (!updated || !responseTask) {
            return res.status(404).json({ error: 'Rotina ou tarefa não encontrada' });
        }

        res.json(responseTask);
    } catch (error) {
        console.error('Erro ao atualizar tarefa:', error);
        res.status(500).json({ error: 'Erro ao atualizar tarefa' });
    }
});

app.delete('/api/routines/:id/tasks/:taskId', authenticateToken, async (req, res) => {
    try {
        const { id, taskId } = req.params;

        const updated = await store.withRoutineExclusive(req.user.id, id, async routine => {
            if (!routine.tasks) {
                return null;
            }
            const taskIndex = routine.tasks.findIndex(t => t.id === taskId);
            if (taskIndex === -1) {
                return null;
            }
            routine.tasks.splice(taskIndex, 1);
            routine.progress = calculateProgress(routine);
            routine.updatedAt = new Date().toISOString();
            return routine;
        });

        if (!updated) {
            return res.status(404).json({ error: 'Rotina ou tarefa não encontrada' });
        }

        res.json({ message: 'Tarefa deletada com sucesso' });
    } catch (error) {
        console.error('Erro ao deletar tarefa:', error);
        res.status(500).json({ error: 'Erro ao deletar tarefa' });
    }
});

// Estático por último: garante que nenhum ficheiro/pasta sob `api/` ou outro nome possa “roubar” pedidos a /api/*.
app.use(express.static('.'));

function validateProductionEnvOrExit() {
    const isProduction = process.env.NODE_ENV === 'production';
    const hasDatabase = Boolean(String(process.env.DATABASE_URL || '').trim());
    const badJwt =
        !process.env.JWT_SECRET || process.env.JWT_SECRET === 'dev-only-secret-change-me';

    if (isProduction && !hasDatabase) {
        console.error('EC ROUTINE: em produção defina DATABASE_URL (PostgreSQL).');
        process.exit(1);
    }
    if (badJwt && (isProduction || hasDatabase)) {
        console.error(
            'EC ROUTINE: defina JWT_SECRET com um valor forte e único (obrigatório em produção ou quando usar DATABASE_URL).'
        );
        process.exit(1);
    }
}

async function initializeBackend() {
    validateProductionEnvOrExit();
    await store.init();
    const paths = store.getPaths();
    ATTACHMENTS_DIR = paths.ATTACHMENTS_DIR;
    await fs.mkdir(ATTACHMENTS_DIR, { recursive: true });
}

async function startServer() {
    await initializeBackend();

    app.listen(PORT, () => {
        const backend = store.usingPostgres() ? 'PostgreSQL' : 'ficheiros JSON (data/)';
        console.log(`Servidor na porta ${PORT} · armazenamento: ${backend}`);
        console.log(`Anexos em: ${ATTACHMENTS_DIR}`);
        console.log(`Raiz do servidor (confirme que é a pasta EC ROUTINE): ${__dirname}`);
        const adminPath = path.join(__dirname, 'admin.html');
        if (fsSync.existsSync(adminPath)) {
            console.log('Painel admin: ficheiro admin.html presente — rotas /admin e /admin.html activas.');
        } else {
            console.warn(
                'Painel admin: admin.html NÃO encontrado nesta pasta — /admin responde 404 até fazer deploy com esse ficheiro.'
            );
        }
        const adm = parseAdminEmailSet();
        if (adm.size === 0) {
            console.log(
                'Painel admin: nenhum e-mail em ADMIN_EMAILS — GET /api/admin/* responde 403 para todos.'
            );
        } else {
            console.log(`Painel admin: ${adm.size} e-mail(is) em ADMIN_EMAILS.`);
        }
    });
}

module.exports = { app, initializeBackend, startServer };

if (require.main === module) {
    startServer().catch(err => {
        console.error(err);
        process.exit(1);
    });
}
