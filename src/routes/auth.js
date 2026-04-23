// ============================================================
// HELPDESK PRO - Rutas de Autenticación
// ============================================================
'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { User } = require('../database/models');
const { audit } = require('../utils/helpers');

const router = express.Router();

// GET /auth/login
router.get('/login', (req, res) => {
    if (req.session.userId) return res.redirect('/dashboard');
    res.render('auth/login', {
        title: 'Iniciar Sesión',
        error: req.query.error,
        expired: req.query.expired,
        user: null
    });
});

// POST /auth/login
router.post('/login', [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.render('auth/login', { title: 'Iniciar Sesión', error: 'Datos inválidos', user: null });
    }

    const { email, password } = req.body;

    try {
        const user = await User.findOne({ where: { email } });

        if (!user || !user.active) {
            return res.render('auth/login', {
                title: 'Iniciar Sesión',
                error: 'Credenciales incorrectas o cuenta inactiva',
                user: null
            });
        }

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) {
            await audit(null, 'login_failed', 'User', user.id, { email }, req);
            return res.render('auth/login', {
                title: 'Iniciar Sesión',
                error: 'Contraseña incorrecta',
                user: null
            });
        }

        // Establecer sesión
        req.session.userId = user.id;
        req.session.userRole = user.role;
        req.session.user = {
            id: user.id, name: user.name, email: user.email,
            role: user.role, department: user.department, avatar: user.avatar
        };
        req.session.lastActivity = Date.now();

        await user.update({ lastLogin: new Date() });
        await audit(user.id, 'login', 'User', user.id, {}, req);

        const returnTo = req.session.returnTo || (user.role === 'user' ? '/mis-tickets' : '/dashboard');
        delete req.session.returnTo;
        res.redirect(returnTo);

    } catch (err) {
        console.error(err);
        res.render('auth/login', { title: 'Iniciar Sesión', error: 'Error del servidor', user: null });
    }
});

// GET /auth/register
router.get('/register', async (req, res) => {
    const { Setting } = require('../database/models');
    const allow = await Setting.findOne({ where: { key: 'allow_register' } });
    if (allow?.value !== 'true') {
        return res.redirect('/auth/login');
    }
    res.render('auth/register', { title: 'Registrarse', user: null, error: null });
});

// POST /auth/register
router.post('/register', [
    body('name').trim().notEmpty().isLength({ max: 100 }),
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
    body('password2').custom((val, { req }) => val === req.body.password),
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.render('auth/register', {
            title: 'Registrarse', user: null,
            error: errors.array()[0].msg
        });
    }

    const { name, email, password } = req.body;

    try {
        const exists = await User.findOne({ where: { email } });
        if (exists) {
            return res.render('auth/register', {
                title: 'Registrarse', user: null,
                error: 'El correo ya está registrado'
            });
        }

        const hashed = await bcrypt.hash(password, 12);
        const user = await User.create({ name, email, password: hashed, role: 'user' });

        await audit(user.id, 'register', 'User', user.id, {}, req);

        req.session.userId = user.id;
        req.session.userRole = user.role;
        req.session.user = { id: user.id, name, email, role: 'user' };
        req.session.lastActivity = Date.now();

        res.redirect('/mis-tickets');
    } catch (err) {
        console.error(err);
        res.render('auth/register', { title: 'Registrarse', user: null, error: 'Error al crear cuenta' });
    }
});

// GET /auth/logout
router.get('/logout', (req, res) => {
    if (req.session.userId) {
        audit(req.session.userId, 'logout', 'User', req.session.userId, {}, req);
    }
    req.session.destroy(() => res.redirect('/auth/login'));
});

module.exports = router;
