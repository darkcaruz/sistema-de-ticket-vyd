# HelpDesk Pro - Guía de Instalación y Despliegue

## Credenciales por defecto
| Rol | Email | Contraseña |
|-----|-------|------------|
| Administrador | admin@helpdesk.local | Admin1234! |
| Agente | agente@helpdesk.local | Agent1234! |

---

## Requisitos del sistema
- **Node.js** 18+ ([nodejs.org](https://nodejs.org))
- **npm** 9+
- **Windows / Linux / macOS**
- Puerto **3000** disponible (o configurable en `.env`)

---

## Instalación paso a paso

### 1. Instalar dependencias
```bash
cd "sistema de tcket"
npm install
```

### 2. Configurar variables de entorno
```bash
# Copia el archivo de ejemplo
copy .env.example .env   # Windows
cp .env.example .env     # Linux/Mac

# Edita el archivo .env con tus datos reales
```

Variables importantes en `.env`:
```env
PORT=3000
SESSION_SECRET=una_clave_secreta_larga_y_aleatoria

# Correo saliente (para notificaciones)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=soporte@tuempresa.com
SMTP_PASS=tu_contraseña_de_aplicacion

# Correo entrante (para convertir emails en tickets)
IMAP_HOST=imap.gmail.com
IMAP_PORT=993
IMAP_USER=soporte@tuempresa.com
IMAP_PASS=tu_contraseña_de_aplicacion
IMAP_CHECK_INTERVAL=60   # revisar cada 60 segundos
```

> **Gmail:** Para usar Gmail necesitas activar "Contraseñas de aplicación" en tu cuenta Google (2FA requerido).

### 3. Inicializar la base de datos
```bash
npm run setup
```

### 4. Cargar datos iniciales
```bash
npm run seed
```

### 5. Iniciar el servidor

**Desarrollo (con reinicio automático):**
```bash
npm run dev
```

**Producción:**
```bash
npm start
```

El sistema estará disponible en: **http://localhost:3000**

---

## Estructura del proyecto
```
sistema de tcket/
├── .env                        # Variables de entorno
├── package.json
├── database/
│   └── helpdesk.db             # Base de datos SQLite (auto-creada)
├── uploads/                    # Archivos adjuntos
├── logs/                       # Logs de acceso
├── public/
│   ├── css/style.css           # Estilos globales
│   └── js/app.js               # JavaScript del cliente
└── src/
    ├── server.js               # Servidor Express principal
    ├── database/
    │   ├── models.js           # Modelos Sequelize
    │   ├── setup.js            # Script de configuración BD
    │   └── seed.js             # Datos iniciales
    ├── middleware/
    │   └── auth.js             # Autenticación y autorización
    ├── routes/
    │   ├── auth.js             # Login, registro, logout
    │   ├── tickets.js          # Portal de usuario
    │   └── admin.js            # Panel de agentes/admin
    ├── services/
    │   └── emailService.js     # SMTP + IMAP
    ├── utils/
    │   ├── helpers.js          # Utilidades
    │   └── htmlEngine.js       # Motor de plantillas
    └── views/
        ├── layouts/main.html   # Layout con sidebar
        ├── home.html
        ├── error.html
        ├── auth/               # Login, registro
        ├── user/               # Portal de usuario
        └── admin/              # Panel de agentes
```

---

## Despliegue en servidor Linux (Producción)

### Con PM2 (recomendado)
```bash
# Instalar PM2 globalmente
npm install -g pm2

# Iniciar la aplicación
pm2 start src/server.js --name "helpdesk-pro"
pm2 save
pm2 startup   # para que inicie con el sistema
```

### Con Nginx como proxy inverso
```nginx
server {
    listen 80;
    server_name soporte.tuempresa.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
        client_max_body_size 20M;
    }
}
```

### SSL con Certbot
```bash
sudo certbot --nginx -d soporte.tuempresa.com
```

### Variables de producción en .env
```env
NODE_ENV=production
BASE_URL=https://soporte.tuempresa.com
SESSION_SECRET=clave_muy_larga_y_segura_para_produccion
```

---

## Configuración del correo (Gmail)

1. Activa la verificación en 2 pasos en tu cuenta Google
2. Ve a **Seguridad → Contraseñas de aplicación**
3. Genera una contraseña para "Otra aplicación" → "HelpDesk"
4. Usa esa contraseña en `SMTP_PASS` e `IMAP_PASS`

Para usar **Outlook / Office 365**:
```env
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
IMAP_HOST=outlook.office365.com
IMAP_PORT=993
```

---

## Migrar a MySQL o PostgreSQL

1. Instala el driver:
```bash
npm install mysql2       # para MySQL
npm install pg pg-hstore  # para PostgreSQL
```

2. Actualiza `models.js`:
```js
const sequelize = new Sequelize('database', 'user', 'pass', {
  dialect: 'mysql',    // o 'postgres'
  host: 'localhost',
});
```

---

## Flujo de ticket por correo electrónico

```
Usuario envía email a soporte@tuempresa.com
         ↓
Sistema IMAP lee el correo cada 60 segundos
         ↓
¿El asunto contiene [Ticket #TKT-XXXXX]?
   SÍ → Agrega respuesta al ticket existente
   NO → Crea nuevo ticket con datos del email
         ↓
Se envía confirmación al remitente
```

---

## Roles y permisos

| Acción | Usuario | Agente | Admin |
|--------|---------|--------|-------|
| Crear ticket | ✅ | ✅ | ✅ |
| Ver mis tickets | ✅ | ✅ | ✅ |
| Ver todos los tickets | ❌ | ✅ | ✅ |
| Asignar tickets | ❌ | ✅ | ✅ |
| Cambiar estado | ❌ | ✅ | ✅ |
| Notas internas | ❌ | ✅ | ✅ |
| Gestionar usuarios | ❌ | ❌ | ✅ |
| Ver reportes | ❌ | ❌ | ✅ |
| Configuración | ❌ | ❌ | ✅ |
| Auditoría | ❌ | ❌ | ✅ |
