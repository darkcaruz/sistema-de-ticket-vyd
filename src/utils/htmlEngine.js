// ============================================================
// HELPDESK PRO - Motor de plantillas HTML simple
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Motor de plantillas HTML minimalista.
 * Soporta: {{variable}}, {{#if}}, {{/if}}, {{#each}}, {{/each}}, {{> partial}}
 */
function render(filePath, options, callback) {
    try {
        let content = fs.readFileSync(filePath, 'utf8');
        const viewDir = path.dirname(filePath);

        // Incluir layout si se especifica
        const layoutMatch = content.match(/\{\{layout\s+"([^"]+)"\}\}/);
        if (layoutMatch) {
            const layoutPath = path.join(viewDir, '..', 'layouts', `${layoutMatch[1]}.html`);
            if (fs.existsSync(layoutPath)) {
                const layoutContent = fs.readFileSync(layoutPath, 'utf8');
                content = content.replace(/\{\{layout\s+"[^"]+"\}\}/, '');
                content = layoutContent.replace('{{body}}', content);
            }
        }

        // Incluir partials {{> nombre}}
        content = content.replace(/\{\{>\s*([^\}]+)\}\}/g, (match, name) => {
            const partialPath = path.join(viewDir, '..', 'partials', `${name.trim()}.html`);
            if (fs.existsSync(partialPath)) {
                return fs.readFileSync(partialPath, 'utf8');
            }
            return '';
        });

        // Procesar el contenido con los datos
        content = processTemplate(content, options);

        callback(null, content);
    } catch (err) {
        callback(err);
    }
}

function processTemplate(template, data) {
    // {{#each array}}...{{/each}}
    template = template.replace(/\{\{#each\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (_, key, inner) => {
        const arr = resolve(data, key);
        if (!Array.isArray(arr)) return '';
        return arr.map((item, index) => {
            const ctx = { ...data, ...item, '@index': index, '@first': index === 0, '@last': index === arr.length - 1 };
            return processTemplate(inner, ctx);
        }).join('');
    });

    // {{#if condition}}...{{else}}...{{/if}}
    template = template.replace(/\{\{#if\s+([^}]+)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g, (_, cond, ifBlock, elseBlock = '') => {
        const val = resolve(data, cond.trim());
        return val ? processTemplate(ifBlock, data) : processTemplate(elseBlock, data);
    });

    // {{#unless condition}}...{{/unless}}
    template = template.replace(/\{\{#unless\s+([^}]+)\}\}([\s\S]*?)\{\{\/unless\}\}/g, (_, cond, block) => {
        const val = resolve(data, cond.trim());
        return !val ? processTemplate(block, data) : '';
    });

    // {{variableName}} - escapado
    template = template.replace(/\{\{(?!#|\/|>)([^}]+)\}\}/g, (_, key) => {
        key = key.trim();
        if (key.startsWith('!')) {
            // Triple-stash {{{! ... }}} = no escape
            const val = resolve(data, key.slice(1).trim());
            return val != null ? String(val) : '';
        }
        const val = resolve(data, key);
        if (val == null) return '';
        return escapeHtml(String(val));
    });

    return template;
}

function resolve(obj, path) {
    if (!path || !obj) return undefined;
    // Manejar llamadas a función helper: formatDate(field, "format")
    if (typeof obj[path] === 'function') return obj[path]();
    const parts = path.split('.');
    let current = obj;
    for (const part of parts) {
        if (current == null) return undefined;
        current = current[part];
    }
    return current;
}

function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

module.exports = render;
