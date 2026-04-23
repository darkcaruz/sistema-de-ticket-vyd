// ============================================================
// HELPDESK PRO - Utilidades varias
// ============================================================
'use strict';

const { Ticket, Setting, AuditLog } = require('../database/models');

/**
 * Generar número único de ticket
 * Formato: TKT-00001, TKT-00002, etc.
 */
async function generateTicketNumber() {
    const prefixSetting = await Setting.findOne({ where: { key: 'tickets_prefix' } });
    const prefix = prefixSetting?.value || 'TKT';

    const last = await Ticket.findOne({ order: [['id', 'DESC']] });
    const nextId = (last?.id || 0) + 1;

    return `${prefix}-${String(nextId).padStart(5, '0')}`;
}

/**
 * Formatear estado para mostrar
 */
function formatStatus(status) {
    const map = {
        nuevo: { label: 'Nuevo', class: 'badge-nuevo' },
        abierto: { label: 'Abierto', class: 'badge-abierto' },
        en_proceso: { label: 'En Proceso', class: 'badge-proceso' },
        pendiente: { label: 'Pendiente', class: 'badge-pendiente' },
        resuelto: { label: 'Resuelto', class: 'badge-resuelto' },
        cerrado: { label: 'Cerrado', class: 'badge-cerrado' },
    };
    return map[status] || { label: status, class: 'badge-default' };
}

/**
 * Registrar acción en auditoría
 */
async function audit(userId, action, entity, entityId, details, req) {
    try {
        await AuditLog.create({
            userId,
            action,
            entity,
            entityId,
            details: typeof details === 'object' ? JSON.stringify(details) : details,
            ip: req?.ip,
            userAgent: req?.headers?.['user-agent'],
        });
    } catch (_) { }
}

/**
 * Calcular tiempo de respuesta / resolución en horas
 */
function calcHours(start, end) {
    if (!start || !end) return null;
    const ms = new Date(end) - new Date(start);
    return Math.round(ms / (1000 * 60 * 60) * 10) / 10;
}

/**
 * Sanitizar extensiones de archivo permitidas
 */
function isAllowedExtension(filename) {
    const allowed = (process.env.ALLOWED_EXTENSIONS || 'jpg,jpeg,png,gif,pdf,doc,docx,xls,xlsx,txt,zip').split(',');
    const ext = filename.split('.').pop()?.toLowerCase();
    return allowed.includes(ext);
}

/**
 * Paginator helper
 */
function paginate(page, limit, total) {
    page = parseInt(page || 1);
    limit = parseInt(limit || 20);
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;
    return { page, limit, total, totalPages, offset, hasNext: page < totalPages, hasPrev: page > 1 };
}

module.exports = { generateTicketNumber, formatStatus, audit, calcHours, isAllowedExtension, paginate };
