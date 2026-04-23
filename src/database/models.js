// ============================================================
// HELPDESK PRO - Modelos de Base de Datos (Sequelize + SQLite)
// ============================================================
'use strict';

const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');
require('dotenv').config();

const dbPath = path.resolve(process.env.DB_STORAGE || './database/helpdesk.db');

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: dbPath,
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  define: {
    timestamps: true,
    underscored: false,
  }
});

// ─── USUARIOS ────────────────────────────────────────────────
const User = sequelize.define('User', {
  id:          { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name:        { type: DataTypes.STRING(100), allowNull: false },
  email:       { type: DataTypes.STRING(150), allowNull: false, unique: true },
  password:    { type: DataTypes.STRING(255), allowNull: false },
  role:        { type: DataTypes.ENUM('admin', 'agent', 'user'), defaultValue: 'user' },
  department:  { type: DataTypes.STRING(100) },
  phone:       { type: DataTypes.STRING(30) },
  avatar:      { type: DataTypes.STRING(255) },
  active:      { type: DataTypes.BOOLEAN, defaultValue: true },
  lastLogin:   { type: DataTypes.DATE },
  resetToken:  { type: DataTypes.STRING(255) },
  resetExpiry: { type: DataTypes.DATE },
}, { tableName: 'users' });

// ─── DEPARTAMENTOS ────────────────────────────────────────────
const Department = sequelize.define('Department', {
  id:          { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name:        { type: DataTypes.STRING(100), allowNull: false, unique: true },
  description: { type: DataTypes.TEXT },
  email:       { type: DataTypes.STRING(150) },
  active:      { type: DataTypes.BOOLEAN, defaultValue: true },
}, { tableName: 'departments' });

// ─── CATEGORÍAS ───────────────────────────────────────────────
const Category = sequelize.define('Category', {
  id:           { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name:         { type: DataTypes.STRING(100), allowNull: false },
  description:  { type: DataTypes.TEXT },
  departmentId: { type: DataTypes.INTEGER },
  active:       { type: DataTypes.BOOLEAN, defaultValue: true },
}, { tableName: 'categories' });

// ─── PRIORIDADES ──────────────────────────────────────────────
const Priority = sequelize.define('Priority', {
  id:    { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name:  { type: DataTypes.STRING(50), allowNull: false, unique: true },
  level: { type: DataTypes.INTEGER, defaultValue: 2 },
  color: { type: DataTypes.STRING(20), defaultValue: '#6b7280' },
  sla:   { type: DataTypes.INTEGER, defaultValue: 24, comment: 'SLA en horas' },
}, { tableName: 'priorities' });

// ─── TICKETS ──────────────────────────────────────────────────
const Ticket = sequelize.define('Ticket', {
  id:              { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  ticketNumber:    { type: DataTypes.STRING(20), unique: true, allowNull: false },
  subject:         { type: DataTypes.STRING(255), allowNull: false },
  description:     { type: DataTypes.TEXT, allowNull: false },
  status:          {
    type: DataTypes.ENUM('nuevo', 'abierto', 'en_proceso', 'pendiente', 'resuelto', 'cerrado'),
    defaultValue: 'nuevo'
  },
  departmentId:    { type: DataTypes.INTEGER },
  categoryId:      { type: DataTypes.INTEGER },
  priorityId:      { type: DataTypes.INTEGER },
  requesterId:     { type: DataTypes.INTEGER, comment: 'Usuario que creó el ticket' },
  assignedToId:    { type: DataTypes.INTEGER, comment: 'Agente asignado' },
  requesterName:   { type: DataTypes.STRING(100) },
  requesterEmail:  { type: DataTypes.STRING(150) },
  source:          { type: DataTypes.ENUM('web', 'email', 'phone', 'manual'), defaultValue: 'web' },
  emailMessageId:  { type: DataTypes.STRING(500), comment: 'Message-ID del email original' },
  firstResponseAt: { type: DataTypes.DATE },
  resolvedAt:      { type: DataTypes.DATE },
  closedAt:        { type: DataTypes.DATE },
  dueDate:         { type: DataTypes.DATE },
  tags:            { type: DataTypes.TEXT, get() { 
    const val = this.getDataValue('tags'); 
    return val ? JSON.parse(val) : []; 
  }, set(val) { 
    this.setDataValue('tags', JSON.stringify(val || [])); 
  }},
}, { tableName: 'tickets' });

// ─── RESPUESTAS / CONVERSACIONES ─────────────────────────────
const TicketReply = sequelize.define('TicketReply', {
  id:         { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  ticketId:   { type: DataTypes.INTEGER, allowNull: false },
  userId:     { type: DataTypes.INTEGER },
  authorName: { type: DataTypes.STRING(100) },
  authorEmail:{ type: DataTypes.STRING(150) },
  message:    { type: DataTypes.TEXT, allowNull: false },
  type:       { type: DataTypes.ENUM('reply', 'note', 'status_change', 'assignment'), defaultValue: 'reply' },
  isInternal: { type: DataTypes.BOOLEAN, defaultValue: false },
  source:     { type: DataTypes.ENUM('web', 'email'), defaultValue: 'web' },
  emailMessageId: { type: DataTypes.STRING(500) },
}, { tableName: 'ticket_replies' });

// ─── ARCHIVOS ADJUNTOS ────────────────────────────────────────
const Attachment = sequelize.define('Attachment', {
  id:         { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  ticketId:   { type: DataTypes.INTEGER },
  replyId:    { type: DataTypes.INTEGER },
  filename:   { type: DataTypes.STRING(255), allowNull: false },
  originalName:{ type: DataTypes.STRING(255) },
  mimetype:   { type: DataTypes.STRING(100) },
  size:       { type: DataTypes.INTEGER },
  path:       { type: DataTypes.STRING(500) },
}, { tableName: 'attachments' });

// ─── AUDITORÍA / LOGS ─────────────────────────────────────────
const AuditLog = sequelize.define('AuditLog', {
  id:         { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  userId:     { type: DataTypes.INTEGER },
  action:     { type: DataTypes.STRING(100), allowNull: false },
  entity:     { type: DataTypes.STRING(50) },
  entityId:   { type: DataTypes.INTEGER },
  details:    { type: DataTypes.TEXT },
  ip:         { type: DataTypes.STRING(50) },
  userAgent:  { type: DataTypes.STRING(500) },
}, { tableName: 'audit_logs' });

// ─── PLANTILLAS DE CORREO ─────────────────────────────────────
const EmailTemplate = sequelize.define('EmailTemplate', {
  id:       { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name:     { type: DataTypes.STRING(100), allowNull: false },
  slug:     { type: DataTypes.STRING(100), unique: true },
  subject:  { type: DataTypes.STRING(255) },
  body:     { type: DataTypes.TEXT },
  active:   { type: DataTypes.BOOLEAN, defaultValue: true },
}, { tableName: 'email_templates' });

// ─── CONFIGURACIÓN ────────────────────────────────────────────
const Setting = sequelize.define('Setting', {
  id:    { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  key:   { type: DataTypes.STRING(100), unique: true, allowNull: false },
  value: { type: DataTypes.TEXT },
  group: { type: DataTypes.STRING(50), defaultValue: 'general' },
}, { tableName: 'settings' });

// ─── RELACIONES ───────────────────────────────────────────────
Department.hasMany(Category, { foreignKey: 'departmentId', as: 'categories' });
Category.belongsTo(Department, { foreignKey: 'departmentId', as: 'department' });

Ticket.belongsTo(User,       { foreignKey: 'requesterId',  as: 'requester' });
Ticket.belongsTo(User,       { foreignKey: 'assignedToId', as: 'assignedTo' });
Ticket.belongsTo(Department, { foreignKey: 'departmentId', as: 'department' });
Ticket.belongsTo(Category,   { foreignKey: 'categoryId',   as: 'category' });
Ticket.belongsTo(Priority,   { foreignKey: 'priorityId',   as: 'priority' });
Ticket.hasMany(TicketReply,  { foreignKey: 'ticketId',     as: 'replies' });
Ticket.hasMany(Attachment,   { foreignKey: 'ticketId',     as: 'attachments' });

TicketReply.belongsTo(Ticket, { foreignKey: 'ticketId', as: 'ticket' });
TicketReply.belongsTo(User,   { foreignKey: 'userId',   as: 'user' });
TicketReply.hasMany(Attachment, { foreignKey: 'replyId', as: 'attachments' });

Attachment.belongsTo(Ticket,      { foreignKey: 'ticketId', as: 'ticket' });
Attachment.belongsTo(TicketReply, { foreignKey: 'replyId',  as: 'reply' });

AuditLog.belongsTo(User, { foreignKey: 'userId', as: 'user' });

module.exports = {
  sequelize,
  User,
  Department,
  Category,
  Priority,
  Ticket,
  TicketReply,
  Attachment,
  AuditLog,
  EmailTemplate,
  Setting,
};
