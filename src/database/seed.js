// ============================================================
// HELPDESK PRO - Datos Iniciales (Seed)
// ============================================================
'use strict';

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { sequelize, User, Department, Category, Priority, EmailTemplate, Setting } = require('./models');

async function seed() {
    console.log('🌱 Cargando datos iniciales...\n');

    await sequelize.sync({ force: false });

    // ─── USUARIO ADMIN ─────────────────────────────────────────
    const adminPass = await bcrypt.hash('Admin1234!', 12);
    await User.findOrCreate({
        where: { email: 'admin@helpdesk.local' },
        defaults: {
            name: 'Administrador',
            email: 'admin@helpdesk.local',
            password: adminPass,
            role: 'admin',
            department: 'TI',
            active: true,
        }
    });
    console.log('👤 Admin creado: admin@helpdesk.local / Admin1234!');

    // ─── AGENTE DE EJEMPLO ─────────────────────────────────────
    const agentPass = await bcrypt.hash('Agent1234!', 12);
    await User.findOrCreate({
        where: { email: 'agente@helpdesk.local' },
        defaults: {
            name: 'Técnico Demo',
            email: 'agente@helpdesk.local',
            password: agentPass,
            role: 'agent',
            department: 'Soporte TI',
            active: true,
        }
    });
    console.log('👤 Agente creado: agente@helpdesk.local / Agent1234!');

    // ─── DEPARTAMENTOS ─────────────────────────────────────────
    const depts = [
        { name: 'Soporte TI', description: 'Soporte técnico e infraestructura' },
        { name: 'Recursos Humanos', description: 'Gestión de personas y RRHH' },
        { name: 'Administración', description: 'Área administrativa' },
        { name: 'Logística', description: 'Logística y despacho' },
        { name: 'Ventas', description: 'Área comercial y ventas' },
    ];

    for (const d of depts) {
        await Department.findOrCreate({ where: { name: d.name }, defaults: d });
    }
    console.log('🏢 Departamentos creados');

    // ─── PRIORIDADES ───────────────────────────────────────────
    const priorities = [
        { name: 'Crítica', level: 1, color: '#ef4444', sla: 4 },
        { name: 'Alta', level: 2, color: '#f97316', sla: 8 },
        { name: 'Media', level: 3, color: '#eab308', sla: 24 },
        { name: 'Baja', level: 4, color: '#22c55e', sla: 72 },
    ];

    for (const p of priorities) {
        await Priority.findOrCreate({ where: { name: p.name }, defaults: p });
    }
    console.log('🚨 Prioridades creadas');

    // ─── CATEGORÍAS ────────────────────────────────────────────
    const soporte = await Department.findOne({ where: { name: 'Soporte TI' } });
    const cats = [
        { name: 'Hardware', description: 'Equipos, impresoras, periféricos', departmentId: soporte?.id },
        { name: 'Software', description: 'Aplicaciones, licencias, instalaciones', departmentId: soporte?.id },
        { name: 'Red / Conectividad', description: 'Internet, VPN, red local', departmentId: soporte?.id },
        { name: 'Correo Electrónico', description: 'Problemas con cuentas de correo', departmentId: soporte?.id },
        { name: 'Accesos y Permisos', description: 'Usuarios, contraseñas y accesos', departmentId: soporte?.id },
        { name: 'Servidores', description: 'Servidores y virtualización', departmentId: soporte?.id },
        { name: 'Seguridad', description: 'Antivirus, incidencias de seguridad', departmentId: soporte?.id },
        { name: 'Otros', description: 'Otras solicitudes', departmentId: soporte?.id },
    ];

    for (const c of cats) {
        await Category.findOrCreate({ where: { name: c.name }, defaults: c });
    }
    console.log('📂 Categorías creadas');

    // ─── PLANTILLAS DE CORREO ──────────────────────────────────
    const templates = [
        {
            name: 'Ticket Creado',
            slug: 'ticket_created',
            subject: '[Ticket #{{ticketNumber}}] {{subject}} - Recibido',
            body: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
<div style="background:#1e40af;padding:20px;border-radius:8px 8px 0 0">
  <h1 style="color:white;margin:0;font-size:20px">✅ Ticket Recibido</h1>
</div>
<div style="background:#f8fafc;padding:24px;border:1px solid #e2e8f0;border-radius:0 0 8px 8px">
  <p>Hola <strong>{{requesterName}}</strong>,</p>
  <p>Hemos recibido tu solicitud y creado el siguiente ticket:</p>
  <div style="background:#fff;border:1px solid #e2e8f0;border-radius:6px;padding:16px;margin:16px 0">
    <p><strong>Número:</strong> #{{ticketNumber}}</p>
    <p><strong>Asunto:</strong> {{subject}}</p>
    <p><strong>Prioridad:</strong> {{priority}}</p>
    <p><strong>Estado:</strong> Nuevo</p>
  </div>
  <p>Puedes hacer seguimiento de tu ticket en: <a href="{{ticketUrl}}">{{ticketUrl}}</a></p>
  <p style="color:#6b7280;font-size:13px">Este es un correo automático, no responder directamente.</p>
</div></div>`,
        },
        {
            name: 'Ticket Asignado',
            slug: 'ticket_assigned',
            subject: '[Ticket #{{ticketNumber}}] Asignado a {{agentName}}',
            body: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
<div style="background:#1e40af;padding:20px;border-radius:8px 8px 0 0">
  <h1 style="color:white;margin:0;font-size:20px">👤 Ticket Asignado</h1>
</div>
<div style="background:#f8fafc;padding:24px;border:1px solid #e2e8f0;border-radius:0 0 8px 8px">
  <p>El ticket <strong>#{{ticketNumber}}</strong> ha sido asignado a <strong>{{agentName}}</strong>.</p>
  <p>Tu solicitud está siendo atendida. Te notificaremos cuando haya novedades.</p>
  <p><a href="{{ticketUrl}}">Ver ticket →</a></p>
</div></div>`,
        },
        {
            name: 'Nueva Respuesta',
            slug: 'ticket_replied',
            subject: '[Ticket #{{ticketNumber}}] Nueva respuesta de {{agentName}}',
            body: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
<div style="background:#1e40af;padding:20px;border-radius:8px 8px 0 0">
  <h1 style="color:white;margin:0;font-size:20px">💬 Nueva Respuesta</h1>
</div>
<div style="background:#f8fafc;padding:24px;border:1px solid #e2e8f0;border-radius:0 0 8px 8px">
  <p>Hola <strong>{{requesterName}}</strong>,</p>
  <p><strong>{{agentName}}</strong> respondió tu ticket <strong>#{{ticketNumber}}</strong>:</p>
  <div style="background:#fff;border-left:4px solid #1e40af;padding:16px;margin:16px 0;border-radius:4px">
    {{replyMessage}}
  </div>
  <p><a href="{{ticketUrl}}">Ver ticket completo →</a></p>
  <p style="color:#6b7280;font-size:12px">Puedes responder este correo para agregar comentarios al ticket.</p>
</div></div>`,
        },
        {
            name: 'Cambio de Estado',
            slug: 'ticket_status_changed',
            subject: '[Ticket #{{ticketNumber}}] Estado actualizado: {{newStatus}}',
            body: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
<div style="background:#1e40af;padding:20px;border-radius:8px 8px 0 0">
  <h1 style="color:white;margin:0;font-size:20px">🔄 Estado Actualizado</h1>
</div>
<div style="background:#f8fafc;padding:24px;border:1px solid #e2e8f0;border-radius:0 0 8px 8px">
  <p>El ticket <strong>#{{ticketNumber}}</strong> ha cambiado su estado a <strong>{{newStatus}}</strong>.</p>
  <p><a href="{{ticketUrl}}">Ver ticket →</a></p>
</div></div>`,
        },
        {
            name: 'Ticket Cerrado',
            slug: 'ticket_closed',
            subject: '[Ticket #{{ticketNumber}}] Cerrado - {{subject}}',
            body: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
<div style="background:#059669;padding:20px;border-radius:8px 8px 0 0">
  <h1 style="color:white;margin:0;font-size:20px">✅ Ticket Cerrado</h1>
</div>
<div style="background:#f8fafc;padding:24px;border:1px solid #e2e8f0;border-radius:0 0 8px 8px">
  <p>Tu ticket <strong>#{{ticketNumber}} - {{subject}}</strong> ha sido cerrado.</p>
  <p>¡Gracias por contactarnos! Si el problema persiste, puedes reabrir el ticket o crear uno nuevo.</p>
  <p><a href="{{ticketUrl}}">Ver ticket →</a></p>
</div></div>`,
        },
    ];

    for (const t of templates) {
        await EmailTemplate.findOrCreate({ where: { slug: t.slug }, defaults: t });
    }
    console.log('📧 Plantillas de correo creadas');

    // ─── CONFIGURACIONES ───────────────────────────────────────
    const settings = [
        { key: 'company_name', value: 'Mi Empresa', group: 'general' },
        { key: 'company_logo', value: '', group: 'general' },
        { key: 'tickets_prefix', value: 'TKT', group: 'tickets' },
        { key: 'auto_assign', value: 'false', group: 'tickets' },
        { key: 'allow_register', value: 'true', group: 'users' },
        { key: 'notify_new', value: 'true', group: 'notifications' },
        { key: 'notify_assign', value: 'true', group: 'notifications' },
        { key: 'notify_reply', value: 'true', group: 'notifications' },
        { key: 'notify_close', value: 'true', group: 'notifications' },
    ];

    for (const s of settings) {
        await Setting.findOrCreate({ where: { key: s.key }, defaults: s });
    }
    console.log('⚙️  Configuraciones creadas');

    console.log('\n✅ Datos iniciales cargados exitosamente!');
    console.log('═══════════════════════════════════════');
    console.log('🔑 Admin: admin@helpdesk.local / Admin1234!');
    console.log('🔑 Agente: agente@helpdesk.local / Agent1234!');
    console.log('🌐 Iniciar: npm run dev → http://localhost:3000');
    console.log('═══════════════════════════════════════');
    process.exit(0);
}

seed().catch(err => {
    console.error('❌ Error en seed:', err);
    process.exit(1);
});
