// ============================================================
// HELPDESK PRO - Configuración inicial de la base de datos
// ============================================================
'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { sequelize } = require('./models');

async function setup() {
    console.log('🔧 Configurando base de datos...');

    // Crear directorios necesarios
    const dirs = [
        path.resolve('./database'),
        path.resolve('./uploads'),
        path.resolve('./uploads/tickets'),
        path.resolve('./logs'),
    ];

    for (const dir of dirs) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            console.log(`📁 Directorio creado: ${dir}`);
        }
    }

    // Sincronizar modelos con la base de datos
    await sequelize.sync({ force: false, alter: true });
    console.log('✅ Base de datos sincronizada!');

    console.log('\n🌱 Ejecuta "npm run seed" para cargar datos iniciales');
    process.exit(0);
}

setup().catch(err => {
    console.error('❌ Error en setup:', err);
    process.exit(1);
});
