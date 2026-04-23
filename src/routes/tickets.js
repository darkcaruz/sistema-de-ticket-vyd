// ============================================================
// HELPDESK PRO - Rutas de Tickets (Portal de Usuario)
// ============================================================
'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { Op } = require('sequelize');
const { body, validationResult } = require('express-validator');

const { isAuthenticated } = require('../middleware/auth');
const {
    Ticket, TicketReply, Attachment,
    Department, Category, Priority, User
} = require('../database/models');
const { generateTicketNumber, audit, formatStatus } = require('../utils/helpers');
const { sendNotification } = require('../services/emailService');

const router = express.Router();

// ─── HELPER: cargar selects ───────────────────────────────────
async function loadFormData() {
    const [departments, categories, priorities] = await Promise.all([
        Department.findAll({ where: { active: true }, order: [['name', 'ASC']] }),
        Category.findAll({ where: { active: true }, order: [['name', 'ASC']] }),
        Priority.findAll({ order: [['level', 'ASC']] }),
    ]);
    return { departments, categories, priorities };
}

// ─── HELPER: retornar tickets del usuario ─────────────────────
async function getUserTickets(userId, email) {
    return Ticket.findAll({
        where: {
            [Op.or]: [
                { requesterId: userId },
                { requesterEmail: email }
            ]
        },
        include: [
            { model: Priority, as: 'priority' },
            { model: Category, as: 'category' },
            { model: Department, as: 'department' },
        ],
        order: [['createdAt', 'DESC']],
    });
}

// GET /mis-tickets
router.get('/', isAuthenticated, async (req, res) => {
    const tickets = await getUserTickets(req.session.userId, req.session.user.email);
    res.render('user/my-tickets', {
        title: 'Mis Tickets',
        tickets,
        formatStatus
    });
});

// GET /mis-tickets/nuevo
router.get('/nuevo', isAuthenticated, async (req, res) => {
    const formData = await loadFormData();
    res.render('user/new-ticket', {
        title: 'Nuevo Ticket',
        ...formData,
        errors: [],
        form: {},
    });
});

// POST /mis-tickets/nuevo
router.post('/nuevo', isAuthenticated, [
    body('subject').trim().notEmpty().isLength({ max: 255 }),
    body('description').trim().notEmpty(),
    body('priorityId').isInt(),
], async (req, res) => {
    const errors = validationResult(req);
    const formData = await loadFormData();

    if (!errors.isEmpty()) {
        return res.render('user/new-ticket', {
            title: 'Nuevo Ticket',
            ...formData,
            errors: errors.array(),
            form: req.body,
        });
    }

    const { subject, description, departmentId, categoryId, priorityId } = req.body;
    const user = req.session.user;

    const ticketNumber = await generateTicketNumber();
    const priority = await Priority.findByPk(priorityId);

    const ticket = await Ticket.create({
        ticketNumber,
        subject,
        description,
        departmentId: departmentId || null,
        categoryId: categoryId || null,
        priorityId,
        requesterId: user.id,
        requesterName: user.name,
        requesterEmail: user.email,
        status: 'nuevo',
        source: 'web',
    });

    // Guardar adjuntos
    if (req.files?.attachments) {
        await saveAttachments(req.files.attachments, ticket.id, null, user.id);
    }

    await audit(user.id, 'ticket_created', 'Ticket', ticket.id, { ticketNumber }, req);

    // Enviar notificación
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    await sendNotification('ticket_created', {
        ticketNumber,
        subject,
        requesterName: user.name,
        priority: priority?.name,
        ticketUrl: `${baseUrl}/mis-tickets/${ticketNumber}`,
    }, user.email);

    res.redirect(`/mis-tickets/${ticketNumber}?created=1`);
});

// GET /mis-tickets/:number
router.get('/:number', isAuthenticated, async (req, res) => {
    const ticket = await Ticket.findOne({
        where: { ticketNumber: req.params.number },
        include: [
            { model: Priority, as: 'priority' },
            { model: Category, as: 'category' },
            { model: Department, as: 'department' },
            { model: User, as: 'assignedTo', attributes: ['id', 'name', 'email'] },
            { model: Attachment, as: 'attachments' },
            {
                model: TicketReply, as: 'replies',
                where: { isInternal: false },
                required: false,
                include: [
                    { model: User, as: 'user', attributes: ['id', 'name', 'role'] },
                    { model: Attachment, as: 'attachments' },
                ],
                order: [['createdAt', 'ASC']],
            },
        ]
    });

    if (!ticket) return res.status(404).render('error', { title: '404', message: 'Ticket no encontrado', user: req.session.user });

    // Verificar acceso
    if (ticket.requesterId !== req.session.userId && ticket.requesterEmail !== req.session.user.email) {
        return res.status(403).render('error', { title: 'Acceso Denegado', message: 'No tienes permiso.', user: req.session.user });
    }

    res.render('user/ticket-detail', {
        title: `Ticket #${ticket.ticketNumber}`,
        ticket,
        formatStatus,
        created: req.query.created,
    });
});

// POST /mis-tickets/:number/responder
router.post('/:number/responder', isAuthenticated, [
    body('message').trim().notEmpty(),
], async (req, res) => {
    const ticket = await Ticket.findOne({ where: { ticketNumber: req.params.number } });
    if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' });

    if (ticket.requesterId !== req.session.userId) {
        return res.status(403).json({ error: 'Acceso denegado' });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Mensaje requerido' });

    const user = req.session.user;
    const reply = await TicketReply.create({
        ticketId: ticket.id,
        userId: user.id,
        authorName: user.name,
        authorEmail: user.email,
        message: req.body.message,
        type: 'reply',
        isInternal: false,
        source: 'web',
    });

    if (req.files?.attachments) {
        await saveAttachments(req.files.attachments, ticket.id, reply.id, user.id);
    }

    if (['resuelto', 'cerrado'].includes(ticket.status)) {
        await ticket.update({ status: 'abierto' });
    }

    await audit(user.id, 'ticket_replied', 'Ticket', ticket.id, {}, req);
    res.redirect(`/mis-tickets/${ticket.ticketNumber}`);
});

// ─── HELPER: guardar archivos adjuntos ────────────────────────
async function saveAttachments(files, ticketId, replyId, userId) {
    if (!Array.isArray(files)) files = [files];
    const uploadDir = path.resolve(process.env.UPLOAD_PATH || './uploads', 'tickets', String(ticketId));
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

    for (const file of files) {
        const ext = path.extname(file.name);
        const filename = `${crypto.randomUUID()}${ext}`;
        const filePath = path.join(uploadDir, filename);
        await file.mv(filePath);
        await Attachment.create({
            ticketId, replyId,
            filename,
            originalName: file.name,
            mimetype: file.mimetype,
            size: file.size,
            path: filePath,
        });
    }
}

module.exports = router;
module.exports.saveAttachments = saveAttachments;
