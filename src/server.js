// ============================================================
// HELPDESK PRO - Servidor Principal
// ============================================================
'use strict';

require('dotenv').config();
const express = require('express');
const session = require('express-session');
const fileUpload = require('express-fileupload');
const morgan = require('morgan');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');

const { sequelize } = require('./database/models');
const { loadUser, sessionCheck } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const ticketRoutes = require('./routes/tickets');
const adminRoutes = require('./routes/admin');
const { startEmailPolling } = require('./services/emailService');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── ARCHIVOS ESTÁTICOS ───────────────────────────────────────
const publicPaths = [
    path.resolve(__dirname, '..', 'public'),
    path.join(process.cwd(), 'public'),
    './public'
];

publicPaths.forEach(p => {
    if (fs.existsSync(p)) {
        console.log('📂 Carpeta estática encontrada en:', p);
        app.use(express.static(p, {
            setHeaders: (res, path) => {
                if (path.endsWith('.css')) res.setHeader('Content-Type', 'text/css');
            }
        }));
    }
});
app.use('/uploads', express.static(path.resolve('./uploads')));

// ─── SEGURIDAD ────────────────────────────────────────────────
app.use(helmet({
    contentSecurityPolicy: false, // Desactivado temporalmente para diagnosticar carga de CSS
    crossOriginEmbedderPolicy: false
}));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 500 });
app.use(limiter);

// ─── LOGGING ──────────────────────────────────────────────────
if (!fs.existsSync('./logs')) fs.mkdirSync('./logs', { recursive: true });
const accessLog = fs.createWriteStream('./logs/access.log', { flags: 'a' });
app.use(morgan('combined', { stream: accessLog }));
if (process.env.NODE_ENV === 'development') app.use(morgan('dev'));

// ─── PARSERS Y MIDDLEWARES ────────────────────────────────────
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));
app.use(fileUpload({
    limits: { fileSize: parseInt(process.env.UPLOAD_MAX_SIZE || 10485760) },
    abortOnLimit: true,
    createParentPath: true,
}));

// ─── SESIÓN ───────────────────────────────────────────────────
app.use(session({
    secret: process.env.SESSION_SECRET || 'helpdesk_secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 8 * 60 * 60 * 1000, // 8 horas
    }
}));

// ─── MOTOR DE VISTAS ──────────────────────────────────────────
app.set('view engine', 'html');
app.engine('html', require('./utils/htmlEngine'));
app.set('views', path.join(__dirname, 'views'));

// ─── MIDDLEWARES GLOBALES ─────────────────────────────────────
app.use(sessionCheck);
app.use(loadUser);

// Helpers globales para vistas
app.use((req, res, next) => {
    res.locals.moment = require('moment');
    res.locals.query = req.query;
    res.locals.formatDate = (d, fmt = 'DD/MM/YYYY HH:mm') => d ? require('moment')(d).format(fmt) : '—';
    next();
});

// ─── RUTAS ────────────────────────────────────────────────────
app.get('/', (req, res) => {
    if (req.session.userId) {
        return res.redirect(req.session.userRole === 'user' ? '/mis-tickets' : '/dashboard');
    }
    res.render('home', { title: 'Mesa de Ayuda - Inicio', user: null });
});

app.use('/auth', authRoutes);
app.use('/mis-tickets', ticketRoutes);
app.use('/dashboard', adminRoutes);
app.use('/admin', adminRoutes);

// Redirección conveniente
app.get('/dashboard', (req, res, next) => next());

// ─── 404 ──────────────────────────────────────────────────────
app.use((req, res) => {
    res.status(404).render('error', {
        title: '404 - No encontrado',
        message: 'La página que buscas no existe.',
        user: req.session?.user || null,
    });
});

// ─── ERROR HANDLER ────────────────────────────────────────────
app.use((err, req, res, next) => {
    console.error('❌ Error:', err.message);
    res.status(500).render('error', {
        title: 'Error del servidor',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Error interno.',
        user: req.session?.user || null,
    });
});

// ─── INICIO ───────────────────────────────────────────────────
async function start() {
    try {
        await sequelize.authenticate();
        console.log('✅ Base de datos conectada');

        await sequelize.sync({ alter: false });

        app.listen(PORT, () => {
            console.log('\n═══════════════════════════════════════════════');
            console.log('  🎫 HELPDESK PRO - Sistema de Mesa de Ayuda   ');
            console.log('═══════════════════════════════════════════════');
            console.log(`  🌐 URL: http://localhost:${PORT}`);
            console.log(`  🔑 Admin: admin@helpdesk.local / Admin1234!`);
            console.log('═══════════════════════════════════════════════\n');
        });

        // Iniciar polling de correo
        if (process.env.IMAP_HOST && process.env.IMAP_USER && process.env.IMAP_USER !== 'soporte@tuempresa.com') {
            startEmailPolling();
        } else {
            console.log('ℹ️  IMAP no configurado - Tickets por email desactivado');
        }

    } catch (err) {
        console.error('❌ Error iniciando server:', err.message);
        process.exit(1);
    }
}

start();
