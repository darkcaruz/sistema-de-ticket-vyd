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

        // Procesar el contenido con los datos (convertir Sequelize a plain si es necesario)
        const renderData = (options && typeof options.get === 'function') ? options.get({ plain: true }) : options;
        content = processTemplate(content, renderData);

        callback(null, content);
    } catch (err) {
        callback(err);
    }
}

function processTemplate(template, data) {
    let result = template;

    // 1. Procesar Bloques (Bucle para manejar anidamiento de afuera hacia adentro)
    let found;
    do {
        found = false;
        // Buscamos el primer bloque que se abre y su cierre correspondiente balanceado
        // Regex para detectar la apertura de un bloque (#if, #each, #unless)
        const blockRegex = /\{\{#(if|each|unless)\s+([^}]+)\}\}/g;
        let match;

        if ((match = blockRegex.exec(result)) !== null) {
            const type = match[1];
            const cond = match[2];
            const startTag = match[0];
            const startIndex = match.index;

            // Buscar el cierre {{/type}} balanceado
            let depth = 1;
            let currentIndex = startIndex + startTag.length;
            let endIndex = -1;
            let elseIndex = -1;

            while (depth > 0 && currentIndex < result.length) {
                const openTag = `{{#${type}`;
                const closeTag = `{{/${type}}`;
                const elseTag = `{{else}}`;

                if (result.startsWith(closeTag, currentIndex)) {
                    depth--;
                    if (depth === 0) endIndex = currentIndex;
                    currentIndex += closeTag.length;
                } else if (result.startsWith(openTag, currentIndex)) {
                    depth++;
                    currentIndex += openTag.length;
                } else if (type === 'if' && depth === 1 && result.startsWith(elseTag, currentIndex)) {
                    elseIndex = currentIndex;
                    currentIndex += elseTag.length;
                } else {
                    currentIndex++;
                }
            }

            if (endIndex !== -1) {
                const fullBlock = result.substring(startIndex, endIndex + `{{/${type}}}`.length);
                let innerContent = "";

                if (type === 'if') {
                    const condition = resolve(data, cond.trim());
                    if (elseIndex !== -1) {
                        const ifPart = result.substring(startIndex + startTag.length, elseIndex);
                        const elsePart = result.substring(elseIndex + "{{else}}".length, endIndex);
                        innerContent = condition ? processTemplate(ifPart, data) : processTemplate(elsePart, data);
                    } else {
                        const ifPart = result.substring(startIndex + startTag.length, endIndex);
                        innerContent = condition ? processTemplate(ifPart, data) : "";
                    }
                } else if (type === 'unless') {
                    const condition = resolve(data, cond.trim());
                    const inside = result.substring(startIndex + startTag.length, endIndex);
                    innerContent = !condition ? processTemplate(inside, data) : "";
                } else if (type === 'each') {
                    const arr = resolve(data, cond.trim());
                    const inside = result.substring(startIndex + startTag.length, endIndex);
                    if (Array.isArray(arr)) {
                        innerContent = arr.map((item, index) => {
                            // Si es un objeto Sequelize, convertir a objeto plano
                            const itemData = (item && typeof item.get === 'function') ? item.get({ plain: true }) : item;
                            const ctx = { ...data, ...itemData, '@index': index, '@first': index === 0, '@last': index === arr.length - 1 };
                            return processTemplate(inside, ctx);
                        }).join('');
                    }
                }

                result = result.substring(0, startIndex) + innerContent + result.substring(endIndex + `{{/${type}}}`.length);
                found = true;
            }
        }
    } while (found);

    // 2. Procesar Variables {{variable}} - Solo las que quedan después de los bloques
    result = result.replace(/\{\{(?!#|\/|>)([^}]+)\}\}/g, (_, key) => {
        key = key.trim();
        if (key.startsWith('!')) {
            const val = resolve(data, key.slice(1).trim());
            return val != null ? String(val) : '';
        }
        const val = resolve(data, key);
        if (val == null) return '';
        return escapeHtml(String(val));
    });

    return result;
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
