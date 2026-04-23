// ============================================================
// HELPDESK PRO - JavaScript del cliente
// ============================================================

// ─── SIDEBAR MOBILE ──────────────────────────────────────────
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    sidebar.classList.toggle('open');
    if (overlay) overlay.classList.toggle('active');
}

function closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('active');
}

// ─── SIDEBAR OVERLAY CSS ──────────────────────────────────────
(function injectOverlayStyle() {
    const style = document.createElement('style');
    style.textContent = `
    .sidebar-overlay {
      display: none;
      position: fixed; inset: 0;
      background: rgba(0,0,0,.5);
      z-index: 99;
    }
    .sidebar-overlay.active { display: block; }
    @media (min-width: 769px) { .sidebar-overlay { display: none !important; } }
  `;
    document.head.appendChild(style);
})();

// ─── AUTO CERRAR ALERTAS ─────────────────────────────────────
document.querySelectorAll('.alert').forEach(alert => {
    setTimeout(() => {
        alert.style.transition = 'opacity .5s';
        alert.style.opacity = '0';
        setTimeout(() => alert.remove(), 500);
    }, 5000);
});

// ─── TOOLTIP SIMPLE ──────────────────────────────────────────
document.querySelectorAll('[title]').forEach(el => {
    el.addEventListener('mouseenter', function () {
        const tip = document.createElement('div');
        tip.className = 'custom-tooltip';
        tip.textContent = this.title;
        tip.style.cssText = `
      position:fixed;z-index:9999;background:#1e293b;color:#fff;
      font-size:12px;padding:4px 10px;border-radius:6px;pointer-events:none;
      white-space:nowrap;box-shadow:0 4px 8px rgba(0,0,0,.2);
    `;
        document.body.appendChild(tip);
        const rect = this.getBoundingClientRect();
        tip.style.left = (rect.left + rect.width / 2 - tip.offsetWidth / 2) + 'px';
        tip.style.top = (rect.top - tip.offsetHeight - 8) + 'px';
        this._tooltip = tip;
    });
    el.addEventListener('mouseleave', function () {
        if (this._tooltip) { this._tooltip.remove(); this._tooltip = null; }
    });
});

// ─── CONFIRM DELETE ───────────────────────────────────────────
document.querySelectorAll('form[data-confirm]').forEach(form => {
    form.addEventListener('submit', function (e) {
        if (!confirm(this.dataset.confirm || '¿Estás seguro?')) {
            e.preventDefault();
        }
    });
});

// ─── MARCAR OPCIÓN ACTIVA EN SELECTS DE FILTROS ────────────────
(function restoreSelects() {
    const params = new URLSearchParams(location.search);
    params.forEach((value, key) => {
        const el = document.querySelector(`[name="${key}"]`);
        if (el && el.tagName === 'SELECT') {
            el.value = value;
        }
        if (el && el.tagName === 'INPUT') {
            el.value = value;
        }
    });
})();

// ─── FLASH DESAPARECER ────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
    // Animar números en stats
    document.querySelectorAll('.stat-number').forEach(el => {
        const target = parseInt(el.textContent.replace(/\D/g, ''));
        if (!isNaN(target) && target > 0) {
            let start = 0;
            const step = Math.ceil(target / 30);
            const timer = setInterval(() => {
                start = Math.min(start + step, target);
                const suffix = el.textContent.replace(/[\d]/g, '');
                el.textContent = start + (suffix.includes('h') ? 'h' : '');
                if (start >= target) clearInterval(timer);
            }, 25);
        }
    });
});

// ─── BÚSQUEDA CON ENTER ───────────────────────────────────────
document.querySelectorAll('input[name="q"]').forEach(input => {
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') input.closest('form')?.submit();
    });
});

console.log('🎫 HelpDesk Pro iniciado correctamente');
