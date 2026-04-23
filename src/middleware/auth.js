// ============================================================
// HELPDESK PRO - Middleware de Autenticación y Autorización
// ============================================================
'use strict';

/**
 * Verifica que el usuario esté autenticado
 */
function isAuthenticated(req, res, next) {
    if (req.session && req.session.userId) {
        return next();
    }
    if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
        return res.status(401).json({ error: 'No autenticado' });
    }
    req.session.returnTo = req.originalUrl;
    res.redirect('/auth/login');
}

/**
 * Solo para administradores
 */
function isAdmin(req, res, next) {
    if (!req.session || !req.session.userId) {
        return res.redirect('/auth/login');
    }
    if (req.session.userRole !== 'admin') {
        return res.status(403).render('error', {
            title: 'Acceso Denegado',
            message: 'No tienes permisos para acceder a esta sección.',
            user: req.session.user
        });
    }
    next();
}

/**
 * Para agentes y administradores
 */
function isAgent(req, res, next) {
    if (!req.session || !req.session.userId) {
        return res.redirect('/auth/login');
    }
    if (!['admin', 'agent'].includes(req.session.userRole)) {
        return res.status(403).render('error', {
            title: 'Acceso Denegado',
            message: 'Solo los agentes pueden acceder a esta sección.',
            user: req.session.user
        });
    }
    next();
}

/**
 * Cargar datos del usuario en res.locals para las vistas
 */
function loadUser(req, res, next) {
    res.locals.user = req.session.user || null;
    res.locals.isAdmin = req.session.userRole === 'admin';
    res.locals.isAgent = ['admin', 'agent'].includes(req.session.userRole);
    res.locals.currentPath = req.path;
    next();
}

/**
 * Verificar que la sesión no esté caducada
 */
function sessionCheck(req, res, next) {
    if (req.session && req.session.userId && req.session.lastActivity) {
        const inactiveTime = Date.now() - req.session.lastActivity;
        const maxInactive = 8 * 60 * 60 * 1000; // 8 horas
        if (inactiveTime > maxInactive) {
            req.session.destroy();
            return res.redirect('/auth/login?expired=1');
        }
    }
    if (req.session && req.session.userId) {
        req.session.lastActivity = Date.now();
    }
    next();
}

module.exports = { isAuthenticated, isAdmin, isAgent, loadUser, sessionCheck };
