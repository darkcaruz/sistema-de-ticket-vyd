// ============================================================
// HELPDESK PRO - Rutas del Panel de Agentes / Admin
// ============================================================
'use strict';

const express = require('express');
const { Op } = require('sequelize');
const fs = require('fs');
const { body, validationResult } = require('express-validator');

const { isAgent, isAdmin, isAuthenticated } = require('../middleware/auth');
const {
    Ticket, TicketReply, Attachment, User,
    Department, Category, Priority, AuditLog, Setting
} = require('../database/models');
const { audit, formatStatus, paginate, calcHours } = require('../utils/helpers');
const { sendNotification } = require('../services/emailService');
const { saveAttachments } = require('./tickets');

const router = express.Router();

// ─── DASHBOARD ────────────────────────────────────────────────
router.get('/', isAgent, async (req, res) => {
    const [total, nuevo, abierto, en_proceso, pendiente, resuelto, cerrado] = await Promise.all([
        Ticket.count(),
        Ticket.count({ where: { status: 'nuevo' } }),
        Ticket.count({ where: { status: 'abierto' } }),
        Ticket.count({ where: { status: 'en_proceso' } }),
        Ticket.count({ where: { status: 'pendiente' } }),
        Ticket.count({ where: { status: 'resuelto' } }),
        Ticket.count({ where: { status: 'cerrado' } }),
    ]);

    const recent = await Ticket.findAll({
        limit: 10,
        order: [['createdAt', 'DESC']],
        include: [
            { model: Priority, as: 'priority' },
            { model: User, as: 'assignedTo', attributes: ['name'] },
            { model: Department, as: 'department' },
        ]
    });

    const unassigned = await Ticket.count({
        where: { assignedToId: null, status: { [Op.notIn]: ['cerrado', 'resuelto'] } }
    });

    let myTickets = 0;
    if (req.session.userRole === 'agent') {
        myTickets = await Ticket.count({
            where: { assignedToId: req.session.userId, status: { [Op.notIn]: ['cerrado', 'resuelto'] } }
        });
    }

    res.render('admin/dashboard', {
        title: 'Dashboard',
        activeDashboard: true,
        stats: { total, nuevo, abierto, en_proceso, pendiente, resuelto, cerrado, unassigned, myTickets },
        recent,
        formatStatus,
    });
});

// ─── LISTADO DE TICKETS ───────────────────────────────────────
router.get('/tickets', isAgent, async (req, res) => {
    const { status, priority, department, category, agent, q, page = 1 } = req.query;
    const where = {};

    if (status) where.status = status;
    if (priority) where.priorityId = priority;
    if (department) where.departmentId = department;
    if (category) where.categoryId = category;
    if (agent) where.assignedToId = agent === 'none' ? null : agent;
    if (q) {
        where[Op.or] = [
            { subject: { [Op.like]: `%${q}%` } },
            { ticketNumber: { [Op.like]: `%${q}%` } },
            { requesterEmail: { [Op.like]: `%${q}%` } },
            { requesterName: { [Op.like]: `%${q}%` } },
        ];
    }

    const total = await Ticket.count({ where });
    const pagination = paginate(page, 20, total);

    const tickets = await Ticket.findAll({
        where,
        limit: pagination.limit,
        offset: pagination.offset,
        order: [['createdAt', 'DESC']],
        include: [
            { model: Priority, as: 'priority' },
            { model: Department, as: 'department' },
            { model: Category, as: 'category' },
            { model: User, as: 'assignedTo', attributes: ['id', 'name'] },
        ]
    });

    const [departments, categories, priorities, agents] = await Promise.all([
        Department.findAll({ where: { active: true } }),
        Category.findAll({ where: { active: true } }),
        Priority.findAll({ order: [['level', 'ASC']] }),
        User.findAll({ where: { role: { [Op.in]: ['admin', 'agent'] }, active: true }, attributes: ['id', 'name'] }),
    ]);

    res.render('admin/tickets', {
        title: 'Todos los Tickets',
        activeTickets: true,
        tickets, departments, categories, priorities, agents,
        filters: req.query, pagination, formatStatus,
    });
});

// ─── VER TICKET DETALLE ───────────────────────────────────────
router.get('/tickets/:number', isAgent, async (req, res) => {
    const ticket = await Ticket.findOne({
        where: { ticketNumber: req.params.number },
        include: [
            { model: Priority, as: 'priority' },
            { model: Category, as: 'category' },
            { model: Department, as: 'department' },
            { model: User, as: 'requester', attributes: ['id', 'name', 'email'] },
            { model: User, as: 'assignedTo', attributes: ['id', 'name', 'email'] },
            { model: Attachment, as: 'attachments' },
            {
                model: TicketReply, as: 'replies',
                required: false,
                include: [
                    { model: User, as: 'user', attributes: ['id', 'name', 'role'] },
                    { model: Attachment, as: 'attachments' },
                ],
                order: [['createdAt', 'ASC']],
            },
        ]
    });

    if (!ticket) {
        return res.status(404).render('error', { title: '404', message: 'Ticket no encontrado', user: req.session.user });
    }

    const agents = await User.findAll({
        where: { role: { [Op.in]: ['admin', 'agent'] }, active: true },
        attributes: ['id', 'name']
    });

    const [departments, categories, priorities] = await Promise.all([
        Department.findAll({ where: { active: true } }),
        Category.findAll({ where: { active: true } }),
        Priority.findAll({ order: [['level', 'ASC']] }),
    ]);

    res.render('admin/ticket-detail', {
        title: `Ticket #${ticket.ticketNumber}`,
        ticket, agents, departments, categories, priorities, formatStatus,
    });
});

// ─── RESPONDER TICKET ─────────────────────────────────────────
router.post('/tickets/:number/reply', isAgent, [
    body('message').trim().notEmpty(),
], async (req, res) => {
    const ticket = await Ticket.findOne({ where: { ticketNumber: req.params.number } });
    if (!ticket) return res.status(404).redirect('/admin/tickets');

    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.redirect(`/admin/tickets/${ticket.ticketNumber}`);

    const { message, isInternal } = req.body;
    const user = req.session.user;

    const reply = await TicketReply.create({
        ticketId: ticket.id,
        userId: user.id,
        authorName: user.name,
        authorEmail: user.email,
        message,
        type: 'reply',
        isInternal: isInternal === 'on',
        source: 'web',
    });

    if (req.files && req.files.attachments) {
        await saveAttachments(req.files.attachments, ticket.id, reply.id, user.id);
    }

    if (!ticket.firstResponseAt) {
        await ticket.update({ firstResponseAt: new Date() });
    }

    if (ticket.status === 'nuevo') {
        await ticket.update({ status: 'abierto' });
    }

    if (!reply.isInternal && ticket.requesterEmail) {
        const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
        await sendNotification('ticket_replied', {
            ticketNumber: ticket.ticketNumber,
            requesterName: ticket.requesterName,
            agentName: user.name,
            replyMessage: message,
            ticketUrl: `${baseUrl}/mis-tickets/${ticket.ticketNumber}`,
        }, ticket.requesterEmail);
    }

    await audit(user.id, 'ticket_replied', 'Ticket', ticket.id, { internal: !!isInternal }, req);
    res.redirect(`/admin/tickets/${ticket.ticketNumber}`);
});

// ─── ACTUALIZAR TICKET ────────────────────────────────────────
router.post('/tickets/:number/update', isAgent, async (req, res) => {
    const ticket = await Ticket.findOne({ where: { ticketNumber: req.params.number } });
    if (!ticket) return res.status(404).redirect('/admin/tickets');

    const { status, assignedToId, priorityId, departmentId, categoryId } = req.body;
    const user = req.session.user;
    const oldStatus = ticket.status;

    const updates = {};
    if (status && status !== ticket.status) updates.status = status;
    if (assignedToId !== undefined) updates.assignedToId = assignedToId || null;
    if (priorityId && priorityId !== String(ticket.priorityId)) updates.priorityId = priorityId;
    if (departmentId !== undefined) updates.departmentId = departmentId || null;
    if (categoryId !== undefined) updates.categoryId = categoryId || null;

    if (status === 'resuelto' && !ticket.resolvedAt) updates.resolvedAt = new Date();
    if (status === 'cerrado' && !ticket.closedAt) updates.closedAt = new Date();

    await ticket.update(updates);

    if (status && status !== oldStatus) {
        await TicketReply.create({
            ticketId: ticket.id,
            userId: user.id,
            authorName: user.name,
            message: `Estado cambiado de "${oldStatus}" a "${status}"`,
            type: 'status_change',
            isInternal: true,
            source: 'web',
        });

        if (ticket.requesterEmail) {
            const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
            const slug = status === 'cerrado' ? 'ticket_closed' : 'ticket_status_changed';
            await sendNotification(slug, {
                ticketNumber: ticket.ticketNumber,
                subject: ticket.subject,
                newStatus: status,
                ticketUrl: `${baseUrl}/mis-tickets/${ticket.ticketNumber}`,
            }, ticket.requesterEmail);
        }
    }

    if (assignedToId && assignedToId !== String(ticket.assignedToId)) {
        const agent = await User.findByPk(assignedToId);
        if (agent) {
            const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
            await sendNotification('ticket_assigned', {
                ticketNumber: ticket.ticketNumber,
                agentName: agent.name,
                ticketUrl: `${baseUrl}/admin/tickets/${ticket.ticketNumber}`,
            }, agent.email);

            await TicketReply.create({
                ticketId: ticket.id,
                userId: user.id,
                authorName: user.name,
                message: `Ticket asignado a ${agent.name}`,
                type: 'assignment',
                isInternal: true,
                source: 'web',
            });
        }
    }

    await audit(user.id, 'ticket_updated', 'Ticket', ticket.id, updates, req);
    res.redirect(`/admin/tickets/${ticket.ticketNumber}`);
});

// ─── REPORTES ─────────────────────────────────────────────────
router.get('/reportes', isAdmin, async (req, res) => {
    const { from, to } = req.query;
    const dateFilter = {};
    if (from) dateFilter[Op.gte] = new Date(from);
    if (to) dateFilter[Op.lte] = new Date(to + 'T23:59:59');
    const where = Object.keys(dateFilter).length ? { createdAt: dateFilter } : {};

    const { fn, literal } = require('sequelize');

    const [total, open, closed, byStatus, byPriority, byAgent] = await Promise.all([
        Ticket.count({ where }),
        Ticket.count({ where: { ...where, status: { [Op.notIn]: ['cerrado', 'resuelto'] } } }),
        Ticket.count({ where: { ...where, status: { [Op.in]: ['cerrado', 'resuelto'] } } }),
        Ticket.findAll({
            where,
            attributes: ['status', [fn('COUNT', literal('1')), 'count']],
            group: ['status'], raw: true
        }),
        Ticket.findAll({
            where,
            attributes: ['priorityId', [fn('COUNT', literal('1')), 'count']],
            group: ['priorityId'], raw: true,
            include: [{ model: Priority, as: 'priority', attributes: ['name', 'color'] }]
        }),
        Ticket.findAll({
            where,
            attributes: ['assignedToId', [fn('COUNT', literal('1')), 'count']],
            group: ['assignedToId'], raw: true,
            include: [{ model: User, as: 'assignedTo', attributes: ['name'] }]
        }),
    ]);

    const resolved = await Ticket.findAll({
        where: { ...where, resolvedAt: { [Op.not]: null } },
        attributes: ['createdAt', 'resolvedAt'], raw: true
    });

    let avgResolutionHours = 0;
    if (resolved.length) {
        const totalH = resolved.reduce((sum, t) => sum + calcHours(t.createdAt, t.resolvedAt), 0);
        avgResolutionHours = Math.round(totalH / resolved.length * 10) / 10;
    }

    res.render('admin/reports', {
        title: 'Reportes',
        activeReports: true,
        stats: { total, open, closed, avgResolutionHours },
        byStatus, byPriority, byAgent,
        filters: req.query,
    });
});

// ─── USUARIOS ─────────────────────────────────────────────────
router.get('/usuarios', isAdmin, async (req, res) => {
    const users = await User.findAll({ order: [['name', 'ASC']] });
    res.render('admin/users', { title: 'Usuarios', activeUsers: true, users });
});

router.post('/usuarios/crear', isAdmin, async (req, res) => {
    const { name, email, password, role, department, phone } = req.body;
    const bcrypt = require('bcryptjs');
    const hashed = await bcrypt.hash(password || 'Temp1234!', 12);
    try {
        await User.create({ name, email, password: hashed, role, department, phone });
        await audit(req.session.userId, 'user_created', 'User', null, { email }, req);
    } catch (e) {
        console.error('Error creando usuario:', e.message);
    }
    res.redirect('/admin/usuarios');
});

router.post('/usuarios/:id/toggle', isAdmin, async (req, res) => {
    const user = await User.findByPk(req.params.id);
    if (user) {
        await user.update({ active: !user.active });
        await audit(req.session.userId, 'user_toggled', 'User', user.id, {}, req);
    }
    res.redirect('/admin/usuarios');
});

router.post('/usuarios/:id/delete', isAdmin, async (req, res) => {
    const user = await User.findByPk(req.params.id);
    if (user && user.role !== 'admin') {
        await user.destroy();
        await audit(req.session.userId, 'user_deleted', 'User', user.id, {}, req);
    }
    res.redirect('/admin/usuarios');
});

router.post('/configuracion/test-email', isAdmin, async (req, res) => {
    const { type, smtp_host, smtp_port, smtp_user, smtp_pass, imap_host, imap_port, imap_user, imap_pass } = req.body;

    try {
        if (type === 'smtp') {
            const nodemailer = require('nodemailer');
            const transporter = nodemailer.createTransport({
                host: smtp_host,
                port: parseInt(smtp_port),
                secure: parseInt(smtp_port) === 465,
                auth: { user: smtp_user, pass: smtp_pass },
                tls: { rejectUnauthorized: false }
            });
            await transporter.verify();
            return res.json({ success: true, message: 'Conexión SMTP exitosa. El servidor está listo para enviar correos.' });
        } else if (type === 'imap') {
            const imaps = require('imap-simple');
            const config = {
                imap: {
                    user: imap_user,
                    password: imap_pass,
                    host: imap_host,
                    port: parseInt(imap_port),
                    tls: parseInt(imap_port) === 993,
                    authTimeout: 10000,
                    tlsOptions: { rejectUnauthorized: false }
                }
            };
            const connection = await imaps.connect(config);
            connection.end();
            return res.json({ success: true, message: 'Conexión IMAP exitosa. El sistema puede leer correos de esta casilla.' });
        }
    } catch (err) {
        return res.json({ success: false, error: err.message });
    }
});

// ─── CONFIGURACIÓN ────────────────────────────────────────────
router.get('/configuracion', isAdmin, async (req, res) => {
    const [departments, categories, priorities, settingsList] = await Promise.all([
        Department.findAll({ order: [['name', 'ASC']] }),
        Category.findAll({ order: [['name', 'ASC']], include: [{ model: Department, as: 'department' }] }),
        Priority.findAll({ order: [['level', 'ASC']] }),
        Setting.findAll(),
    ]);
    const settings = {};
    settingsList.forEach(s => { settings[s.key] = s.value; });

    res.render('admin/settings', {
        title: 'Configuración',
        activeSettings: true,
        departments, categories, priorities, settings,
        saved: req.query.saved,
        tab: req.query.tab || 'general',
    });
});

router.post('/configuracion/settings', isAdmin, async (req, res) => {
    const { tab_redirect, ...settings } = req.query.tab_redirect ? { tab_redirect: req.query.tab_redirect, ...req.body } : req.body;
    // req.body contiene los campos del formulario. Si viene tab_redirect, lo usamos.
    const redirectTab = req.body.tab_redirect || 'general';

    for (const [key, value] of Object.entries(req.body)) {
        if (key === 'tab_redirect') continue;
        await Setting.upsert({ key, value: String(value) });
    }
    res.redirect(`/admin/configuracion?saved=1&tab=${redirectTab}`);
});

router.post('/configuracion/departamentos', isAdmin, async (req, res) => {
    const { name, description, email } = req.body;
    await Department.create({ name, description, email });
    res.redirect('/admin/configuracion?tab=departments');
});

router.post('/configuracion/departamentos/:id/delete', isAdmin, async (req, res) => {
    await Department.destroy({ where: { id: req.params.id } });
    res.redirect('/admin/configuracion?tab=departments');
});

router.post('/configuracion/categorias', isAdmin, async (req, res) => {
    const { name, description, departmentId } = req.body;
    await Category.create({ name, description, departmentId: departmentId || null });
    res.redirect('/admin/configuracion?tab=categories');
});

// ─── AUDITORÍA ────────────────────────────────────────────────
router.get('/auditoria', isAdmin, async (req, res) => {
    const logs = await AuditLog.findAll({
        limit: 200,
        order: [['createdAt', 'DESC']],
        include: [{ model: User, as: 'user', attributes: ['name', 'email'] }]
    });
    res.render('admin/audit', { title: 'Auditoría', activeAudit: true, logs });
});

// ─── DESCARGAR ADJUNTO ────────────────────────────────────────
router.get('/attachment/:id', isAuthenticated, async (req, res) => {
    const att = await Attachment.findByPk(req.params.id);
    if (!att || !fs.existsSync(att.path)) {
        return res.status(404).send('Archivo no encontrado');
    }
    res.download(att.path, att.originalName || att.filename);
});

module.exports = router;
