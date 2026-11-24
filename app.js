/* ===== JSON Beautifier — App Logic ===== */
(function () {
    'use strict';

    // DOM references
    const jsonInput = document.getElementById('json-input');
    const inputPanel = document.getElementById('input-panel');
    const btnFormat = document.getElementById('btn-format');
    const btnClear = document.getElementById('btn-clear');

    // Theme Toggle
    const btnThemeToggle = document.getElementById('btn-theme-toggle');
    const iconSun = btnThemeToggle.querySelector('.icon-sun');
    const iconMoon = btnThemeToggle.querySelector('.icon-moon');

    const resizer = document.getElementById('resizer');
    const searchInput = document.getElementById('search-input');
    const searchCount = document.getElementById('search-count');
    const btnClearSearch = document.getElementById('btn-clear-search');
    const btnExpandAll = document.getElementById('btn-expand-all');
    const btnCollapseAll = document.getElementById('btn-collapse-all');
    const treePlaceholder = document.getElementById('tree-placeholder');
    const treeContent = document.getElementById('tree-content');
    const pathBar = document.getElementById('path-bar');
    const pathDisplay = document.getElementById('path-display');
    const btnCopyPath = document.getElementById('btn-copy-path');
    const copyToast = document.getElementById('copy-toast');

    const jsonError = document.getElementById('json-error');
    const treeContainer = document.getElementById('tree-container');
    const statusEl = document.getElementById('input-status');
    const statusText = document.getElementById('status-text');
    const statusMeta = document.getElementById('status-meta');

    let currentSelectedRow = null;
    let parsedData = null;
    // Text of the JSON that the tree was last rendered from. Used so the debounced
    // auto-parse doesn't needlessly rebuild the tree (which used to wipe the search).
    let lastRenderedRaw = null;
    const PATH_PLACEHOLDER = 'Click a row to see its path';


    // ──────────────────── THEME LOGIC ────────────────────
    function applyTheme(isLight) {
        if (isLight) {
            document.documentElement.setAttribute('data-theme', 'light');
            iconSun.style.display = 'block';
            iconMoon.style.display = 'none';
        } else {
            document.documentElement.removeAttribute('data-theme');
            iconSun.style.display = 'none';
            iconMoon.style.display = 'block';
        }
        localStorage.setItem('jsonBeautifierTheme', isLight ? 'light' : 'dark');
    }

    // Load saved theme (dark mode is default)
    const savedTheme = localStorage.getItem('jsonBeautifierTheme');
    applyTheme(savedTheme === 'light');

    btnThemeToggle.addEventListener('click', () => {
        document.documentElement.classList.add('theme-fade');
        setTimeout(() => document.documentElement.classList.remove('theme-fade'), 350);
        const isLight = document.documentElement.getAttribute('data-theme') === 'light';
        applyTheme(!isLight);
    });

    // ──────────────────── EVENT LISTENERS ────────────────────
    btnClear.addEventListener('click', () => {
        jsonInput.value = '';
        clearTree();
        jsonInput.focus();
    });
    btnCopyPath.addEventListener('click', copyPath);
    btnExpandAll.addEventListener('click', expandAll);
    btnCollapseAll.addEventListener('click', collapseAll);

    btnFormat.addEventListener('click', handleBeautify);

    // ──────────────────── RESIZER LOGIC ────────────────────
    let isDragging = false;
    let initialX = 0;
    let initialWidthStr = '';

    resizer.addEventListener('mousedown', (e) => {
        isDragging = true;
        resizer.classList.add('is-dragging');
        initialX = e.clientX;
        initialWidthStr = window.getComputedStyle(inputPanel).width;
        // Prevent text selection while dragging
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'col-resize';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - initialX;
        const initialWidth = parseInt(initialWidthStr, 10);
        const newWidth = initialWidth + dx;

        // Convert to percentage for better responsiveness
        const containerWidth = document.body.clientWidth;
        const newWidthPercent = (newWidth / containerWidth) * 100;

        // Clamp between 20% and 70%
        if (newWidthPercent > 20 && newWidthPercent < 70) {
            inputPanel.style.setProperty('--input-width', `${newWidthPercent}%`);
        }
    });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            resizer.classList.remove('is-dragging');
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
        }
    });

    // ──────────────────── SEARCH ────────────────────
    searchInput.addEventListener('input', debounce(handleSearch, 200));
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && searchMatches.length) {
            e.preventDefault();
            const step = e.shiftKey ? -1 : 1;
            searchCursor = (searchCursor + step + searchMatches.length) % searchMatches.length;
            const row = searchMatches[searchCursor];
            selectRow(row, { scroll: true });
            row.classList.remove('match-pulse');
            void row.offsetWidth; // restart the pulse animation
            row.classList.add('match-pulse');
            searchCount.textContent = `${searchCursor + 1} of ${searchMatches.length}`;
        } else if (e.key === 'Escape' && searchInput.value) {
            searchInput.value = '';
            handleSearch();
        }
    });
    btnClearSearch.addEventListener('click', () => {
        searchInput.value = '';
        handleSearch();
        searchInput.focus();
    });

    // Allow Ctrl+Enter to beautify
    jsonInput.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            handleBeautify();
        }
    });

    // Auto-parse on typing (debounced)
    jsonInput.addEventListener('input', debounce(autoParseTree, 400));

    // Auto-parse immediately on paste
    jsonInput.addEventListener('paste', () => {
        setTimeout(autoParseTree, 0);
    });

    // Ripple effect on all buttons
    document.querySelectorAll('.btn').forEach(btn => {
        btn.addEventListener('click', function (e) {
            const circle = document.createElement('span');
            circle.className = 'ripple';
            const rect = this.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            circle.style.width = circle.style.height = size + 'px';
            circle.style.left = (e.clientX - rect.left - size / 2) + 'px';
            circle.style.top = (e.clientY - rect.top - size / 2) + 'px';
            this.appendChild(circle);
            setTimeout(() => circle.remove(), 500);
        });
    });

    // ──────────────────── LARGE NUMBER SUPPORT ────────────────────
    // JSON.parse turns 12345678901234567890 into 12345678901234567000. For IDs that is
    // silent data corruption, so numbers JavaScript can't hold exactly are kept as
    // their original text (RawNumber) and written back unchanged.
    class RawNumber {
        constructor(raw) { this.raw = raw; }
        toString() { return this.raw; }
        toJSON() { return RAW_MARK + this.raw; }
    }
    const RAW_MARK = '@@RAWNUM@@';
    const RAW_MARK_RE = /"@@RAWNUM@@([^"]+)"/g;
    const NUM_TOKEN = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;

    function isUnsafeNumber(text) {
        if (!/[.eE]/.test(text)) return !Number.isSafeInteger(Number(text)); // plain integer
        // Decimal / exponent: unsafe when more than 15 significant digits
        const mantissa = text.replace(/[eE].*$/, '').replace('-', '').replace('.', '');
        return mantissa.replace(/^0+/, '').replace(/0+$/, '').length > 15;
    }

    function makeNumber(text) {
        return isUnsafeNumber(text) ? new RawNumber(text) : Number(text);
    }

    // Replace unsafe number tokens with marker strings (skipping anything inside strings)
    function protectBigNumbers(text) {
        let out = '';
        let i = 0;
        while (i < text.length) {
            const ch = text[i];
            if (ch === '"') {
                let j = i + 1;
                while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
                out += text.slice(i, j + 1);
                i = j + 1;
            } else if (ch === '-' || (ch >= '0' && ch <= '9')) {
                NUM_TOKEN.lastIndex = i;
                const m = NUM_TOKEN.exec(text);
                if (m) {
                    out += isUnsafeNumber(m[0]) ? `"${RAW_MARK}${m[0]}"` : m[0];
                    i += m[0].length;
                } else {
                    out += ch;
                    i++;
                }
            } else {
                out += ch;
                i++;
            }
        }
        return out;
    }

    function parseJSON(text) {
        return JSON.parse(protectBigNumbers(text), (k, v) =>
            (typeof v === 'string' && v.startsWith(RAW_MARK)) ? new RawNumber(v.slice(RAW_MARK.length)) : v);
    }

    function stringifyJSON(data) {
        return JSON.stringify(data, null, 2).replace(RAW_MARK_RE, '$1');
    }

    // ──────────────────── BEAUTIFY ────────────────────
    function handleBeautify() {
        const raw = jsonInput.value.trim();
        if (!raw) return;
        try {
            parsedData = parseJSON(raw);
            jsonInput.value = stringifyJSON(parsedData);
            lastRenderedRaw = jsonInput.value.trim();
            hideError();
            renderTree(parsedData);
        } catch (err) {
            // Keep the last good tree, but tell the user what is wrong
            showError(err);
        }
    }

    // Auto-parse: render tree if valid JSON, without reformatting the input
    function autoParseTree() {
        const raw = jsonInput.value.trim();
        if (!raw) {
            hideError();
            clearTree();
            return;
        }
        if (raw === lastRenderedRaw) return; // nothing changed since the tree was built
        try {
            const data = parseJSON(raw);
            parsedData = data;
            lastRenderedRaw = raw;
            hideError();
            renderTree(data);
        } catch (err) {
            // Keep existing tree if temporarily invalid while typing
            showError(err);
        }
    }

    function showError(err) {
        if (!jsonError) return;
        jsonError.textContent = err.message;
        jsonError.style.display = 'block';
        setStatus('err', 'Invalid JSON', []);
    }

    function hideError() {
        if (!jsonError) return;
        jsonError.textContent = '';
        jsonError.style.display = 'none';
    }

    // ──────────────────── TREE RENDERING ────────────────────
    let nodeIndex = 0;
    let rowMap = new Map();      // JSON path -> row element (for breadcrumbs)
    let statNodes = 0;
    let statDepth = 0;
    let searchMatches = [];
    let searchCursor = -1;
    let bulkTimer = null;

    function clearTree() {
        treeContent.innerHTML = '';
        treeContent.style.display = 'none';
        treePlaceholder.style.display = 'flex';
        pathBar.style.display = 'none';
        searchInput.value = '';
        searchCount.textContent = '';
        btnClearSearch.style.display = 'none';
        currentSelectedRow = null;
        parsedData = null;
        lastRenderedRaw = null;
        activeInlineEdit = null;
        rowMap = new Map();
        searchMatches = [];
        searchCursor = -1;
        setStatus('empty', 'Waiting for JSON', []);
    }

    function renderTree(data) {
        treeContent.innerHTML = '';
        treePlaceholder.style.display = 'none';
        treeContent.style.display = 'block';
        // Show the path bar up front: if it only appeared on the first click it would
        // push the tree down mid double-click and break inline editing.
        pathBar.style.display = 'flex';
        pathDisplay.textContent = PATH_PLACEHOLDER;
        currentSelectedRow = null;
        activeInlineEdit = null;
        rowMap = new Map();
        nodeIndex = 0;
        statNodes = 0;
        statDepth = 0;

        const rootNode = createTreeNode(data, null, [], true);
        treeContent.appendChild(rootNode);

        const bytes = new Blob([jsonInput.value]).size;
        setStatus('ok', 'Valid JSON', [
            `${statNodes.toLocaleString()} node${statNodes === 1 ? '' : 's'}`,
            `${statDepth} level${statDepth === 1 ? '' : 's'}`,
            formatBytes(bytes)
        ]);

        // Keep an active search applied to the rebuilt tree
        if (searchInput.value.trim()) handleSearch();
    }

    function formatBytes(n) {
        if (n < 1024) return `${n} B`;
        if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
        return `${(n / 1024 / 1024).toFixed(1)} MB`;
    }

    function setStatus(state, text, meta) {
        if (!statusEl) return;
        statusEl.dataset.state = state;
        statusText.textContent = text;
        statusMeta.innerHTML = '';
        meta.forEach(m => {
            const s = document.createElement('span');
            s.textContent = m;
            statusMeta.appendChild(s);
        });
    }

    // Paths are kept as arrays of segments (string = object key, number = array index)
    // so keys containing '.', '[' or ']' can't break lookups. The dotted string shown
    // to the user is derived from the segments.
    function formatSegment(seg) {
        if (typeof seg === 'number') return `[${seg}]`;
        if (seg === '' || /[.\[\]\s"']/.test(seg)) return `[${JSON.stringify(seg)}]`;
        return `.${seg}`;
    }

    function formatPath(segments) {
        return '$document' + segments.map(formatSegment).join('');
    }

    function previewText(value, type) {
        let text;
        if (type === 'array') {
            text = value.slice(0, 4).map(v => {
                const t = getType(v);
                if (t === 'object') return '{…}';
                if (t === 'array') return '[…]';
                return t === 'string' ? JSON.stringify(v) : String(v);
            }).join(', ');
            if (value.length > 4) text += ', …';
        } else {
            const keys = Object.keys(value);
            text = keys.slice(0, 6).join(', ');
            if (keys.length > 6) text += ', …';
        }
        return text ? ` ${text} ` : ' ';
    }

    function createTreeNode(value, key, segments, isRoot, depth = 0) {
        const node = document.createElement('div');
        node.className = 'tree-node';
        // One orchestrated entrance for the first rows only; the rest appear instantly
        if (nodeIndex < 45) {
            node.classList.add('enter');
            node.style.animationDelay = (nodeIndex * 16) + 'ms';
        }
        nodeIndex++;
        statNodes++;
        statDepth = Math.max(statDepth, depth + 1);

        const type = getType(value);
        const isExpandable = type === 'object' || type === 'array';

        // Row
        const row = document.createElement('div');
        row.className = 'tree-row' + (isExpandable ? '' : ' is-leaf');
        row.style.setProperty('--depth', depth);
        row._segments = segments;
        row.dataset.displayPath = formatPath(segments);
        rowMap.set(JSON.stringify(segments), row);

        // Toggle
        const toggle = document.createElement('span');
        toggle.className = 'tree-toggle' + (isExpandable ? '' : ' leaf');
        toggle.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>';
        row.appendChild(toggle);

        // Key label
        if (key !== null && key !== undefined) {
            const keySpan = document.createElement('span');
            keySpan.className = 'tree-key';
            keySpan.textContent = key;
            row.appendChild(keySpan);

            const colon = document.createElement('span');
            colon.className = 'tree-colon';
            colon.textContent = ':';
            row.appendChild(colon);
        }

        if (isExpandable) {
            const count = type === 'array' ? value.length : Object.keys(value).length;

            const bracket = document.createElement('span');
            bracket.className = 'tree-bracket';
            bracket.textContent = type === 'array' ? '[' : '{';
            row.appendChild(bracket);

            const preview = document.createElement('span');
            preview.className = 'tree-preview';
            preview.textContent = previewText(value, type);
            row.appendChild(preview);

            const bracketClose = document.createElement('span');
            bracketClose.className = 'tree-bracket close';
            bracketClose.textContent = type === 'array' ? ']' : '}';
            row.appendChild(bracketClose);

            const info = document.createElement('span');
            info.className = 'tree-info';
            info.textContent = type === 'array'
                ? `${count} item${count === 1 ? '' : 's'}`
                : `${count} key${count === 1 ? '' : 's'}`;
            row.appendChild(info);

            node.appendChild(row);

            // Children
            const childrenContainer = document.createElement('div');
            childrenContainer.className = 'tree-children';
            childrenContainer.style.setProperty('--depth', depth);
            const inner = document.createElement('div');
            inner.className = 'tree-children-inner';
            childrenContainer.appendChild(inner);

            if (type === 'array') {
                value.forEach((item, idx) => {
                    inner.appendChild(createTreeNode(item, idx, segments.concat(idx), false, depth + 1));
                });
            } else {
                Object.entries(value).forEach(([k, v]) => {
                    inner.appendChild(createTreeNode(v, k, segments.concat(String(k)), false, depth + 1));
                });
            }
            node.appendChild(childrenContainer);

            toggle.addEventListener('click', (e) => {
                e.stopPropagation();
                setNodeCollapsed(node, !childrenContainer.classList.contains('collapsed'));
            });
        } else {
            // Primitive value
            const valueSpan = document.createElement('span');
            valueSpan.className = 'tree-value ' + type;
            valueSpan.textContent = formatValue(value, type);
            valueSpan.dataset.rawValue = (value === null) ? '' : String(value);
            valueSpan.dataset.valueType = type;
            valueSpan.title = 'Double-click to edit';
            row.appendChild(valueSpan);
            node.appendChild(row);
        }

        // Click selects the row and shows its path
        row.addEventListener('click', (e) => {
            if (e.target.closest('.tree-toggle')) return;
            if (e.target.closest('.inline-edit-wrapper')) return;
            selectRow(row);
            treeContainer.focus({ preventScroll: true });
        });

        // Double-click edits a value, or opens/closes a branch
        row.addEventListener('dblclick', (e) => {
            if (e.target.closest('.tree-toggle')) return;
            if (e.target.closest('.inline-edit-wrapper')) return;
            const valueSpan = row.querySelector('.tree-value');
            if (valueSpan) {
                startInlineEdit(row, valueSpan);
            } else {
                const c = node.querySelector(':scope > .tree-children');
                if (c) setNodeCollapsed(node, !c.classList.contains('collapsed'));
            }
        });

        return node;
    }

    // Open or close a branch. Opening makes its first children spring out in turn.
    function setNodeCollapsed(node, collapsed, animate = true) {
        const children = node.querySelector(':scope > .tree-children');
        if (!children) return;
        const row = node.querySelector(':scope > .tree-row');
        children.classList.toggle('collapsed', collapsed);
        row.classList.toggle('is-collapsed', collapsed);
        row.querySelector('.tree-toggle').classList.toggle('collapsed', collapsed);

        if (!collapsed && animate) {
            const kids = children.firstElementChild.children;
            for (let i = 0; i < Math.min(kids.length, 14); i++) {
                kids[i].style.setProperty('--i', i);
            }
            children.classList.add('just-opened');
            clearTimeout(children._openTimer);
            children._openTimer = setTimeout(() => children.classList.remove('just-opened'), 800);
        }
    }

    function selectRow(row, opts = {}) {
        if (currentSelectedRow) currentSelectedRow.classList.remove('selected');
        treeContent.querySelectorAll('.tree-node.in-path').forEach(n => n.classList.remove('in-path'));

        row.classList.add('selected');
        currentSelectedRow = row;

        // Light the whole route from the root to this row
        let n = row.closest('.tree-node');
        while (n) {
            n.classList.add('in-path');
            n = n.parentElement?.closest('.tree-node');
        }

        renderPath(row._segments || []);
        pathBar.style.display = 'flex';
        if (opts.scroll) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    // Breadcrumbs: each part of the path jumps to that ancestor. The parts are
    // concatenated, so the element's text is still the plain path string.
    function renderPath(segments) {
        pathDisplay.textContent = '';
        const parts = ['$document'].concat(segments.map(formatSegment));
        parts.forEach((text, i) => {
            const crumb = document.createElement('span');
            const isLast = i === parts.length - 1;
            crumb.className = 'crumb crumb-new' + (isLast ? ' current' : '');
            crumb.textContent = text;
            crumb.style.animationDelay = (i * 25) + 'ms';
            if (!isLast) {
                crumb.addEventListener('click', () => {
                    const target = rowMap.get(JSON.stringify(segments.slice(0, i)));
                    if (target) selectRow(target, { scroll: true });
                });
            }
            pathDisplay.appendChild(crumb);
        });
        pathDisplay.scrollLeft = pathDisplay.scrollWidth;
    }

    // ──────────────────── KEYBOARD NAVIGATION ────────────────────
    function navigableRows() {
        return Array.from(treeContent.querySelectorAll('.tree-row')).filter(r =>
            !r.closest('.tree-node.search-hidden') && !r.closest('.tree-children.collapsed'));
    }

    treeContainer.addEventListener('keydown', (e) => {
        if (e.target.closest('input, textarea, button')) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const rows = navigableRows();
        if (!rows.length) return;

        const cur = currentSelectedRow && rows.includes(currentSelectedRow) ? currentSelectedRow : null;
        const idx = cur ? rows.indexOf(cur) : -1;
        const go = (r) => { if (r) selectRow(r, { scroll: true }); };
        const node = cur ? cur.closest('.tree-node') : null;
        const kids = node ? node.querySelector(':scope > .tree-children') : null;

        switch (e.key) {
            case 'ArrowDown': go(rows[Math.min(idx + 1, rows.length - 1)]); break;
            case 'ArrowUp': go(rows[Math.max(idx - 1, 0)]); break;
            case 'Home': go(rows[0]); break;
            case 'End': go(rows[rows.length - 1]); break;
            case 'ArrowRight':
                if (!cur) { go(rows[0]); break; }
                if (kids && kids.classList.contains('collapsed')) setNodeCollapsed(node, false);
                else if (kids) go(rows[idx + 1]);
                break;
            case 'ArrowLeft': {
                if (!cur) break;
                if (kids && !kids.classList.contains('collapsed')) { setNodeCollapsed(node, true); break; }
                const parent = node.parentElement?.closest('.tree-node');
                if (parent) go(parent.querySelector(':scope > .tree-row'));
                break;
            }
            case 'Enter':
            case 'F2': {
                if (!cur) break;
                const val = cur.querySelector('.tree-value');
                if (val) startInlineEdit(cur, val);
                else if (kids) setNodeCollapsed(node, !kids.classList.contains('collapsed'));
                break;
            }
            default: return;
        }
        e.preventDefault();
    });

    // ──────────────────── INLINE EDIT ────────────────────
    let activeInlineEdit = null;

    function startInlineEdit(row, valueSpan) {
        // If there's already an active edit, cancel it first
        if (activeInlineEdit) {
            cancelInlineEdit(activeInlineEdit);
        }

        const rawValue = valueSpan.dataset.rawValue;
        const valueType = valueSpan.dataset.valueType;

        // Hide the value span
        valueSpan.style.display = 'none';

        // Create the edit wrapper
        const wrapper = document.createElement('div');
        wrapper.className = 'inline-edit-wrapper';

        // Create input
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'inline-edit-input';
        input.value = rawValue;
        if (valueType === 'string') {
            input.value = rawValue; // raw string without quotes
        }
        wrapper.appendChild(input);

        // Copy button
        const copyBtn = document.createElement('button');
        copyBtn.className = 'inline-edit-btn copy';
        copyBtn.title = 'Copy value';
        copyBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
        copyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(input.value).then(() => {
                copyBtn.classList.add('copied');
                copyBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
                setTimeout(() => {
                    copyBtn.classList.remove('copied');
                    copyBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
                }, 1200);
            });
        });
        wrapper.appendChild(copyBtn);

        // Save button
        const saveBtn = document.createElement('button');
        saveBtn.className = 'inline-edit-btn save';
        saveBtn.title = 'Save (Enter)';
        saveBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
        saveBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            saveInlineEdit(editState);
        });
        wrapper.appendChild(saveBtn);

        // Cancel button
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'inline-edit-btn cancel';
        cancelBtn.title = 'Cancel (Esc)';
        cancelBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
        cancelBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            cancelInlineEdit(editState);
        });
        wrapper.appendChild(cancelBtn);

        // Insert wrapper next to valueSpan
        valueSpan.parentNode.insertBefore(wrapper, valueSpan.nextSibling);

        const editState = {
            row,
            valueSpan,
            wrapper,
            input,
            originalValue: rawValue,
            originalType: valueType
        };

        activeInlineEdit = editState;

        // Focus and select the input
        requestAnimationFrame(() => {
            input.focus();
            input.select();
        });

        // Key handlers
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                saveInlineEdit(editState);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                cancelInlineEdit(editState);
            }
        });

        // Stop propagation on wrapper clicks
        wrapper.addEventListener('click', (e) => e.stopPropagation());
        wrapper.addEventListener('dblclick', (e) => e.stopPropagation());
        wrapper.addEventListener('mousedown', (e) => e.stopPropagation());

        // Auto-save when input loses focus (clicking elsewhere)
        input.addEventListener('blur', () => {
            // Small delay to allow button clicks to fire first
            setTimeout(() => {
                if (activeInlineEdit === editState && document.body.contains(wrapper)) {
                    saveInlineEdit(editState);
                }
            }, 150);
        });
    }

    // Auto-save when clicking anywhere outside the inline editor
    // Using CAPTURE phase (true) so it fires before any stopPropagation can block it
    document.addEventListener('mousedown', (e) => {
        if (!activeInlineEdit) return;
        // Check if click is inside the wrapper
        const wrapper = activeInlineEdit.wrapper;
        if (wrapper && wrapper.contains(e.target)) return;
        saveInlineEdit(activeInlineEdit);
    }, true);

    function cancelInlineEdit(editState) {
        if (!editState) return;
        editState.wrapper.remove();
        editState.valueSpan.style.display = '';
        if (activeInlineEdit === editState) {
            activeInlineEdit = null;
        }
    }

    function saveInlineEdit(editState) {
        if (!editState) return;
        // Guard against double-save
        if (!document.body.contains(editState.wrapper)) return;
        const newRawValue = editState.input.value;
        const segments = editState.row._segments;

        // Parse the new value
        const newValue = parseInputValue(newRawValue, editState.originalType);

        // Update the parsedData
        setValueAtPath(parsedData, segments, newValue);

        // Update the textarea (and remember it, so auto-parse doesn't rebuild the tree)
        jsonInput.value = stringifyJSON(parsedData);
        lastRenderedRaw = jsonInput.value.trim();
        hideError();

        // Update the value span
        const newType = getType(newValue);
        editState.valueSpan.className = 'tree-value ' + newType;
        editState.valueSpan.textContent = formatValue(newValue, newType);
        editState.valueSpan.dataset.rawValue = (newValue === null) ? '' : String(newValue);
        editState.valueSpan.dataset.valueType = newType;

        // Flash animation to confirm save
        editState.valueSpan.classList.add('value-saved');
        setTimeout(() => editState.valueSpan.classList.remove('value-saved'), 600);

        // Clean up
        editState.wrapper.remove();
        editState.valueSpan.style.display = '';
        if (activeInlineEdit === editState) {
            activeInlineEdit = null;
        }

        // Show toast
        copyToast.textContent = 'Saved!';
        copyToast.classList.add('show');
        setTimeout(() => {
            copyToast.classList.remove('show');
            copyToast.textContent = 'Copied!';
        }, 1200);
    }

    function setValueAtPath(data, segments, value) {
        if (!segments || segments.length === 0) return;
        let current = data;
        for (let i = 0; i < segments.length - 1; i++) {
            current = current[segments[i]];
        }
        current[segments[segments.length - 1]] = value;
    }

    const JSON_NUMBER = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/;

    function parseInputValue(str, originalType) {
        // A string stays a string: "00123" must not silently become 123, and an
        // emptied string must not become null.
        if (originalType === 'string') return str;

        const trimmed = str.trim();
        if (originalType === 'boolean') {
            if (trimmed === 'true') return true;
            if (trimmed === 'false') return false;
        }
        if (originalType === 'number' && JSON_NUMBER.test(trimmed)) {
            return makeNumber(trimmed);
        }

        // Originally null (or the typed value doesn't fit the original type): infer
        if (trimmed === '' || trimmed === 'null') return null;
        if (trimmed === 'true') return true;
        if (trimmed === 'false') return false;
        if (JSON_NUMBER.test(trimmed)) {
            const num = makeNumber(trimmed);
            if (num instanceof RawNumber || isFinite(num)) return num;
        }
        return str; // Default to string
    }

    function getType(val) {
        if (val === null) return 'null';
        if (Array.isArray(val)) return 'array';
        if (val instanceof RawNumber) return 'number';
        return typeof val;
    }

    function formatValue(val, type) {
        if (type === 'string') return `"${val}"`;
        if (type === 'null') return 'null';
        return String(val);
    }

    // ──────────────────── SEARCH ────────────────────
    function clearSearchState() {
        treeContent.querySelectorAll('.search-hidden').forEach(n => n.classList.remove('search-hidden'));
        treeContent.querySelectorAll('.search-match').forEach(r => r.classList.remove('search-match'));
        removeHighlights(treeContent);
        searchCount.textContent = '';
        searchMatches = [];
        searchCursor = -1;
    }

    function removeHighlights(root) {
        root.querySelectorAll('.search-highlight').forEach(el => {
            const parent = el.parentNode;
            parent.replaceChild(document.createTextNode(el.textContent), el);
            parent.normalize();
        });
    }

    // Text of a row that search should look at: its key and its value only.
    // (Not the "N keys" / "N items" badge, which used to match every container.)
    function rowSearchText(row) {
        const key = row.querySelector(':scope > .tree-key');
        const val = row.querySelector(':scope > .tree-value');
        let text = key ? key.textContent : '';
        if (val) text += ' ' + (val.dataset.valueType === 'null' ? 'null' : val.dataset.rawValue);
        return text.toLowerCase();
    }

    function handleSearch() {
        const query = searchInput.value.trim().toLowerCase();
        btnClearSearch.style.display = query ? 'inline-flex' : 'none';

        if (!query) {
            // Clear search: show everything (expand/collapse state is left as-is)
            clearSearchState();
            return;
        }

        const allRows = treeContent.querySelectorAll('.tree-row');
        const visibleNodes = new Set();   // nodes that stay on screen
        const expandNodes = new Set();    // ancestors that must be open to reveal a match
        let matchCount = 0;

        allRows.forEach(row => {
            row.classList.remove('search-match');
            if (!rowSearchText(row).includes(query)) return;

            matchCount++;
            row.classList.add('search-match');

            const ownNode = row.closest('.tree-node');
            visibleNodes.add(ownNode);

            // Everything inside a matching map/list stays visible, so it can be
            // expanded to inspect its contents.
            ownNode.querySelectorAll('.tree-node').forEach(d => visibleNodes.add(d));

            // Ancestors stay visible and are opened so the match can be seen.
            let anc = ownNode.parentElement?.closest('.tree-node');
            while (anc) {
                visibleNodes.add(anc);
                expandNodes.add(anc);
                anc = anc.parentElement?.closest('.tree-node');
            }
        });

        treeContent.querySelectorAll('.tree-node').forEach(node => {
            node.classList.toggle('search-hidden', !visibleNodes.has(node));
            if (expandNodes.has(node)) {
                setNodeCollapsed(node, false, false);
            }
        });

        // Highlight matching text in keys and values
        removeHighlights(treeContent);
        treeContent.querySelectorAll('.tree-row.search-match').forEach(row => highlightText(row, query));

        searchMatches = Array.from(treeContent.querySelectorAll('.tree-row.search-match'));
        searchCursor = -1;
        searchCount.textContent = matchCount > 0 ? `${matchCount} match${matchCount > 1 ? 'es' : ''}` : 'No matches';
    }

    function highlightText(row, query) {
        const targets = row.querySelectorAll(':scope > .tree-key, :scope > .tree-value');
        targets.forEach(el => {
            const text = el.textContent;
            const lowerText = text.toLowerCase();
            const idx = lowerText.indexOf(query);
            if (idx === -1) return;

            const frag = document.createDocumentFragment();
            let lastIdx = 0;
            let searchIdx = 0;
            let currentText = text;

            while (searchIdx < currentText.length) {
                const pos = currentText.toLowerCase().indexOf(query, searchIdx);
                if (pos === -1) break;

                if (pos > lastIdx) {
                    frag.appendChild(document.createTextNode(currentText.slice(lastIdx, pos)));
                }
                const span = document.createElement('span');
                span.className = 'search-highlight';
                span.textContent = currentText.slice(pos, pos + query.length);
                frag.appendChild(span);

                lastIdx = pos + query.length;
                searchIdx = lastIdx;
            }

            if (lastIdx < currentText.length) {
                frag.appendChild(document.createTextNode(currentText.slice(lastIdx)));
            }

            if (lastIdx > 0) {
                el.textContent = '';
                el.appendChild(frag);
            }
        });
    }

    // ──────────────────── COPY PATH ────────────────────
    function copyPath() {
        if (!currentSelectedRow) return;
        const text = pathDisplay.textContent;
        if (!text) return;
        navigator.clipboard.writeText(text).then(() => {
            copyToast.classList.add('show');
            setTimeout(() => copyToast.classList.remove('show'), 1500);
        }).catch(() => {
            // Fallback
            const ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            copyToast.classList.add('show');
            setTimeout(() => copyToast.classList.remove('show'), 1500);
        });
    }

    // ──────────────────── EXPAND / COLLAPSE ALL ────────────────────
    // Bulk changes skip the animations so large documents stay snappy
    function bulk(fn) {
        treeContent.classList.add('bulk');
        fn();
        clearTimeout(bulkTimer);
        bulkTimer = setTimeout(() => treeContent.classList.remove('bulk'), 150);
    }

    function expandAll() {
        bulk(() => treeContent.querySelectorAll('.tree-node').forEach(n => setNodeCollapsed(n, false, false)));
    }

    function collapseAll() {
        bulk(() => {
            const nodes = treeContent.querySelectorAll('.tree-node');
            nodes.forEach((n, i) => { if (i > 0) setNodeCollapsed(n, true, false); }); // keep root open
        });
    }

    // ──────────────────── UTILS ────────────────────
    function debounce(fn, delay) {
        let timer;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => fn(...args), delay);
        };
    }

})();
