// ============================================================
// HELPDESK PRO - Servicio de Correo (SMTP + IMAP)
// ============================================================
'use strict';

require('dotenv').config();
const nodemailer = require('nodemailer');
const imaps = require('imap-simple');
const { simpleParser } = require('mailparser');
const { Ticket, TicketReply, Attachment, User, EmailTemplate, Setting } = require('../database/models');
const { generateTicketNumber } = require('../utils/helpers');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// ─── OBTENER CONFIGURACIONES DINÁMICAS ────────────────────────
async function getMailSettings() {
    const list = await Setting.findAll();
    const s = {};
    list.forEach(item => { s[item.key] = item.value; });

    return {
        // SMTP
        smtp_host: s.smtp_host || process.env.SMTP_HOST,
        smtp_port: parseInt(s.smtp_port || process.env.SMTP_PORT) || 587,
        smtp_user: s.smtp_user || process.env.SMTP_USER,
        smtp_pass: s.smtp_pass || process.env.SMTP_PASS,
        smtp_from_name: s.smtp_from_name || process.env.SMTP_FROM_NAME || 'Ayuda Valenzuela & Delarze',
        smtp_from_email: s.smtp_user || process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER,
        // IMAP
        imap_host: s.imap_host || process.env.IMAP_HOST,
        imap_port: parseInt(s.imap_port || process.env.IMAP_PORT) || 993,
        imap_user: s.imap_user || process.env.IMAP_USER,
        imap_pass: s.imap_pass || process.env.IMAP_PASS,
        imap_mailbox: s.imap_mailbox || process.env.IMAP_MAILBOX || 'INBOX',
        imap_check_interval: parseInt(s.imap_check_interval || process.env.IMAP_CHECK_INTERVAL) || 60
    };
}

// ─── SMTP TRANSPORTER ─────────────────────────────────────────
async function createTransporter() {
    const s = await getMailSettings();
    if (!s.smtp_host || !s.smtp_user) return null;

    return nodemailer.createTransport({
        host: s.smtp_host,
        port: s.smtp_port,
        secure: s.smtp_port === 465,
        auth: {
            user: s.smtp_user,
            pass: s.smtp_pass,
        },
        tls: { rejectUnauthorized: false },
    });
}

// ─── RENDERIZAR PLANTILLA ─────────────────────────────────────
function renderTemplate(template, vars) {
    let subject = template.subject || '';
    let body = template.body || '';
    for (const [key, val] of Object.entries(vars)) {
        const regex = new RegExp(`{{${key}}}`, 'g');
        subject = subject.replace(regex, val ?? '');
        body = body.replace(regex, val ?? '');
    }
    return { subject, body };
}

// ─── ENVIAR NOTIFICACIÓN ──────────────────────────────────────
async function sendNotification(slug, vars, to) {
    try {
        const settings = await getMailSettings();
        const transporter = await createTransporter();
        if (!transporter) return;

        const tmpl = await EmailTemplate.findOne({ where: { slug, active: true } });
        if (!tmpl) return;

        const { subject, body } = renderTemplate(tmpl, vars);

        await transporter.sendMail({
            from: `"${settings.smtp_from_name}" <${settings.smtp_from_email}>`,
            to,
            subject,
            html: body,
            headers: {
                'X-Ticket-Number': vars.ticketNumber || '',
                'X-Ticket-ID': vars.ticketId || '',
                'References': vars.messageId || '',
                'In-Reply-To': vars.messageId || '',
            }
        });
        console.log(`📧 Notificación [${slug}] enviada a ${to}`);
    } catch (err) {
        console.error(`❌ Error enviando notificación [${slug}]:`, err.message);
    }
}

// ─── VERIFICAR TICKET POR ASUNTO ──────────────────────────────
function extractTicketNumber(subject) {
    const patterns = [
        /\[Ticket #([A-Z0-9]+-\d+)\]/i,
        /#([A-Z0-9]+-\d+)\b/i,
        /ticket[:\s#]+([A-Z0-9]+-\d+)/i,
    ];
    for (const pat of patterns) {
        const m = (subject || '').match(pat);
        if (m) return m[1].toUpperCase();
    }
    return null;
}

// ─── PROCESAR CORREO ENTRANTE ─────────────────────────────────
async function processIncomingEmail(rawEmail) {
    try {
        const parsed = await simpleParser(rawEmail);
        const from = parsed.from?.value?.[0];
        const fromEmail = from?.address?.toLowerCase();
        const fromName = from?.name || fromEmail;
        const subject = parsed.subject || '(Sin asunto)';
        const body = parsed.text || parsed.html || '';
        const messageId = parsed.messageId;

        if (!fromEmail) return;

        const cleanSubject = subject.replace(/^(Re|Fwd|RV|FW):\s*/i, '').trim();
        const ticketNum = extractTicketNumber(subject);
        let ticket = null;

        if (ticketNum) {
            ticket = await Ticket.findOne({ where: { ticketNumber: ticketNum } });
        }

        if (ticket) {
            console.log(`📨 Respuesta al ticket ${ticket.ticketNumber} de ${fromEmail}`);
            const reply = await TicketReply.create({
                ticketId: ticket.id,
                authorName: fromName,
                authorEmail: fromEmail,
                message: body,
                type: 'reply',
                isInternal: false,
                source: 'email',
                emailMessageId: messageId,
            });

            if (['resuelto', 'cerrado'].includes(ticket.status)) {
                await ticket.update({ status: 'abierto' });
            }

            if (parsed.attachments?.length) {
                await saveEmailAttachments(parsed.attachments, ticket.id, reply.id);
            }
        } else {
            console.log(`📩 Nuevo ticket por email de ${fromEmail}: ${cleanSubject}`);
            let user = await User.findOne({ where: { email: fromEmail } });
            const ticketNumber = await generateTicketNumber();
            const priority = await require('../database/models').Priority.findOne({ where: { name: 'Media' } });

            const newTicket = await Ticket.create({
                ticketNumber,
                subject: cleanSubject,
                description: body,
                status: 'nuevo',
                priorityId: priority?.id,
                requesterId: user?.id,
                requesterName: fromName,
                requesterEmail: fromEmail,
                source: 'email',
                emailMessageId: messageId,
            });

            if (parsed.attachments?.length) {
                await saveEmailAttachments(parsed.attachments, newTicket.id, null);
            }

            const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
            await sendNotification('ticket_created', {
                ticketNumber,
                subject: cleanSubject,
                requesterName: fromName,
                priority: 'Media',
                ticketUrl: `${baseUrl}/mis-tickets/${ticketNumber}`,
            }, fromEmail);
        }
    } catch (err) {
        console.error('❌ Error procesando email:', err.message);
    }
}

// ─── GUARDAR ADJUNTOS DE EMAIL ────────────────────────────────
async function saveEmailAttachments(attachments, ticketId, replyId) {
    const uploadPath = path.resolve(process.env.UPLOAD_PATH || './uploads', 'tickets', String(ticketId));
    if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });

    for (const att of attachments) {
        if (!att.content) continue;
        const ext = path.extname(att.filename || '.bin');
        const filename = `${crypto.randomUUID()}${ext}`;
        const filePath = path.join(uploadPath, filename);
        fs.writeFileSync(filePath, att.content);

        await Attachment.create({
            ticketId,
            replyId,
            filename,
            originalName: att.filename,
            mimetype: att.contentType,
            size: att.size || att.content.length,
            path: filePath,
        });
    }
}

// ─── LEER CORREOS NUEVOS (IMAP) ───────────────────────────────
let isChecking = false;
async function checkInbox() {
    if (isChecking) {
        console.log('⏳ Ya hay una revisión de correo en curso. Saltando esta vuelta...');
        return;
    }

    const s = await getMailSettings();
    if (!s.imap_host || !s.imap_user) {
        console.log('ℹ️ IMAP no configurado en ajustes web.');
        return;
    }

    isChecking = true;
    console.log(`🔍 [${new Date().toLocaleTimeString()}] Iniciando revisión de IMAP para ${s.imap_user}...`);

    const config = {
        imap: {
            user: s.imap_user,
            password: s.imap_pass,
            host: s.imap_host,
            port: s.imap_port,
            tls: s.imap_port === 993,
            authTimeout: 10000,
            tlsOptions: { rejectUnauthorized: false },
        }
    };

    let connection;
    try {
        connection = await imaps.connect(config);
        console.log('✅ Conexión IMAP establecida.');

        console.log(`📂 Intentando abrir carpeta: "${s.imap_mailbox}"...`);
        await connection.openBox(s.imap_mailbox);
        console.log('📂 Carpeta abierta con éxito.');

        console.log('🔎 Obteniendo lista de IDs (UIDs)...');

        // Búsqueda ultra rápida de solo IDs
        const uids = await new Promise((resolve, reject) => {
            connection.imap.search(['ALL'], (err, results) => {
                if (err) reject(err); else resolve(results);
            });
        });

        console.log(`🔎 Total en bandeja: ${uids.length}. Analizando los últimos 15...`);

        // Tomamos los últimos 15
        const lastUids = uids.slice(-15);
        if (lastUids.length === 0) {
            console.log('📬 Bandeja vacía.');
            return;
        }

        // Descargamos contenido solo de esos 15
        const fetchOptions = { bodies: [''], markSeen: false };
        const messages = await connection.search({ uid: lastUids }, fetchOptions);

        let processedCount = 0;
        for (const msg of messages) {
            const isSeen = msg.attributes.flags.includes('\\Seen');
            if (!isSeen) {
                console.log(`📩 Detectado correo nuevo UID: ${msg.attributes.uid}. Procesando...`);
                const all = msg.parts.find(p => p.which === '');
                if (all) {
                    await processIncomingEmail(all.body);
                    await connection.addFlags(msg.attributes.uid, '\\Seen');
                    processedCount++;
                }
            }
        }

        if (processedCount === 0) {
            console.log('📬 No hay correos nuevos entre los últimos 10.');
        } else {
            console.log(`✅ Procesados ${processedCount} correos nuevos.`);
        }
    } catch (err) {
        console.error('❌ Error durante la revisión IMAP:', err.message);
    } finally {
        isChecking = false;
        if (connection) try { connection.end(); console.log('🔌 Conexión IMAP cerrada.'); } catch (_) { }
    }
}

// ─── INICIAR POLLING DE CORREO ────────────────────────────────
let pollingInterval;
function startEmailPolling() {
    if (pollingInterval) clearInterval(pollingInterval);

    getMailSettings().then(s => {
        let interval = s.imap_check_interval * 1000;
        if (interval < 60000) interval = 60000; // Mínimo 60 segundos
        console.log(`📬 Revisando casilla ${s.imap_user} cada ${interval / 1000}s`);

        checkInbox();
        pollingInterval = setInterval(checkInbox, interval);
    });
}

module.exports = { sendNotification, checkInbox, startEmailPolling, processIncomingEmail };
