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

    let currentSelectedRow = null;
    let parsedData = null;


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

    // ──────────────────── BEAUTIFY ────────────────────
    function handleBeautify() {
        const raw = jsonInput.value.trim();
        if (!raw) return;
        try {
            parsedData = JSON.parse(raw);
            jsonInput.value = JSON.stringify(parsedData, null, 2);
            renderTree(parsedData);
        } catch (err) {
            clearTree();
        }
    }

    // Auto-parse: render tree if valid JSON, without reformatting the input
    function autoParseTree() {
        const raw = jsonInput.value.trim();
        if (!raw) {
            clearTree();
            return;
        }
        try {
            const data = JSON.parse(raw);
            parsedData = data;
            renderTree(data);
        } catch (err) {
            // Keep existing tree if temporarily invalid while typing
        }
    }

    // ──────────────────── TREE RENDERING ────────────────────
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
    }

    function renderTree(data) {
        treeContent.innerHTML = '';
        treePlaceholder.style.display = 'none';
        treeContent.style.display = 'block';
        pathBar.style.display = 'none';
        currentSelectedRow = null;
        searchInput.value = '';
        searchCount.textContent = '';
        btnClearSearch.style.display = 'none';

        nodeIndex = 0;
        const rootNode = createTreeNode(data, null, '$document', '$document', true);
        treeContent.appendChild(rootNode);
    }

    let nodeIndex = 0;

    function createTreeNode(value, key, path, displayPath, isRoot, depth = 0) {
        const node = document.createElement('div');
        node.className = 'tree-node';
        node.dataset.path = path;
        // Staggered entrance animation
        const delay = Math.min(nodeIndex * 15, 600);
        node.style.animationDelay = delay + 'ms';
        nodeIndex++;

        const type = getType(value);
        const isExpandable = type === 'object' || type === 'array';

        // Row
        const row = document.createElement('div');
        row.className = 'tree-row' + (isExpandable ? '' : ' is-leaf');
        row.style.setProperty('--depth', depth);
        row.dataset.path = path;
        row.dataset.displayPath = displayPath;

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
            const entries = type === 'array' ? value : Object.entries(value);
            const count = type === 'array' ? value.length : Object.keys(value).length;

            const bracket = document.createElement('span');
            bracket.className = 'tree-bracket';
            bracket.textContent = type === 'array' ? '[' : '{';
            row.appendChild(bracket);

            const info = document.createElement('span');
            info.className = 'tree-info';
            info.textContent = type === 'array' ? `${count} items` : `${count} keys`;
            row.appendChild(info);

            const bracketClose = document.createElement('span');
            bracketClose.className = 'tree-bracket';
            bracketClose.textContent = type === 'array' ? ']' : '}';
            row.appendChild(bracketClose);

            node.appendChild(row);

            // Children
            const childrenContainer = document.createElement('div');
            childrenContainer.className = 'tree-children';

            if (type === 'array') {
                value.forEach((item, idx) => {
                    const childPath = `${path}[${idx}]`;
                    const childDisplay = `${displayPath}[${idx}]`;
                    const childNode = createTreeNode(item, idx, childPath, childDisplay, false, depth + 1);
                    childrenContainer.appendChild(childNode);
                });
            } else {
                Object.entries(value).forEach(([k, v]) => {
                    const childPath = `${path}.${k}`;
                    const childDisplay = `${displayPath}.${k}`;
                    const childNode = createTreeNode(v, k, childPath, childDisplay, false, depth + 1);
                    childrenContainer.appendChild(childNode);
                });
            }

            node.appendChild(childrenContainer);

            // Toggle expand/collapse
            toggle.addEventListener('click', (e) => {
                e.stopPropagation();
                const isCollapsed = childrenContainer.classList.toggle('collapsed');
                toggle.classList.toggle('collapsed', isCollapsed);
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

        // Click handler for path display
        row.addEventListener('click', (e) => {
            if (e.target.closest('.tree-toggle')) return;
            if (e.target.closest('.inline-edit-wrapper')) return;
            selectRow(row);
        });

        // Double-click handler for inline editing
        row.addEventListener('dblclick', (e) => {
            if (e.target.closest('.tree-toggle')) return;
            if (e.target.closest('.inline-edit-wrapper')) return;
            const valueSpan = row.querySelector('.tree-value');
            if (!valueSpan) return; // Not a leaf node
            startInlineEdit(row, valueSpan);
        });

        return node;
    }

    function selectRow(row) {
        if (currentSelectedRow) {
            currentSelectedRow.classList.remove('selected');
        }
        row.classList.add('selected');
        currentSelectedRow = row;

        const dp = row.dataset.displayPath;
        pathDisplay.textContent = dp;
        pathBar.style.display = 'flex';
    }

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
        const path = editState.row.dataset.path;

        // Parse the new value
        const newValue = parseInputValue(newRawValue, editState.originalType);

        // Update the parsedData
        setValueAtPath(parsedData, path, newValue);

        // Update the textarea
        jsonInput.value = JSON.stringify(parsedData, null, 2);

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

    function setValueAtPath(data, path, value) {
        // Parse path like "$document.key1.key2[0].key3"
        const parts = path.replace(/^\$document\.?/, '').match(/[^.\[\]]+/g);
        if (!parts || parts.length === 0) return;

        let current = data;
        for (let i = 0; i < parts.length - 1; i++) {
            const part = isNaN(parts[i]) ? parts[i] : parseInt(parts[i], 10);
            current = current[part];
        }
        const lastPart = isNaN(parts[parts.length - 1]) ? parts[parts.length - 1] : parseInt(parts[parts.length - 1], 10);
        current[lastPart] = value;
    }

    function parseInputValue(str, originalType) {
        // Try to maintain type intelligence
        if (str === '' || str === 'null') return null;
        if (str === 'true') return true;
        if (str === 'false') return false;
        if (!isNaN(str) && str.trim() !== '') {
            const num = Number(str);
            if (isFinite(num)) return num;
        }
        return str; // Default to string
    }

    function getType(val) {
        if (val === null) return 'null';
        if (Array.isArray(val)) return 'array';
        return typeof val;
    }

    function formatValue(val, type) {
        if (type === 'string') return `"${val}"`;
        if (type === 'null') return 'null';
        return String(val);
    }

    // ──────────────────── SEARCH ────────────────────
    function handleSearch() {
        const query = searchInput.value.trim().toLowerCase();
        btnClearSearch.style.display = query ? 'inline-flex' : 'none';

        if (!query) {
            // Clear search: show everything
            treeContent.querySelectorAll('.tree-node').forEach(n => n.classList.remove('search-hidden'));
            treeContent.querySelectorAll('.tree-row').forEach(r => r.classList.remove('search-match'));
            // Remove highlights
            treeContent.querySelectorAll('.search-highlight').forEach(el => {
                const parent = el.parentNode;
                parent.replaceChild(document.createTextNode(el.textContent), el);
                parent.normalize();
            });
            // Re-collapse nothing — leave state as-is
            searchCount.textContent = '';
            return;
        }

        let matchCount = 0;

        // First pass: find matching rows
        const allRows = treeContent.querySelectorAll('.tree-row');
        const matchingNodes = new Set();

        allRows.forEach(row => {
            row.classList.remove('search-match');
            const textContent = row.textContent.toLowerCase();
            const isMatch = textContent.includes(query);

            if (isMatch) {
                matchCount++;
                row.classList.add('search-match');
                // Mark this node and all ancestors as visible
                let el = row.closest('.tree-node');
                while (el) {
                    matchingNodes.add(el);
                    el = el.parentElement?.closest('.tree-node');
                }
            }
        });

        // Second pass: hide non-matching nodes, expand matching branches
        treeContent.querySelectorAll('.tree-node').forEach(node => {
            if (matchingNodes.has(node)) {
                node.classList.remove('search-hidden');
                // Auto-expand to reveal matches
                const children = node.querySelector(':scope > .tree-children');
                if (children) {
                    children.classList.remove('collapsed');
                    const toggle = node.querySelector(':scope > .tree-row .tree-toggle');
                    if (toggle) toggle.classList.remove('collapsed');
                }
            } else {
                node.classList.add('search-hidden');
            }
        });

        // Highlight matching text in keys and values
        allRows.forEach(row => {
            // Remove old highlights first
            row.querySelectorAll('.search-highlight').forEach(el => {
                const parent = el.parentNode;
                parent.replaceChild(document.createTextNode(el.textContent), el);
                parent.normalize();
            });

            if (row.classList.contains('search-match')) {
                highlightText(row, query);
            }
        });

        searchCount.textContent = matchCount > 0 ? `${matchCount} match${matchCount > 1 ? 'es' : ''}` : 'No matches';
    }

    function highlightText(row, query) {
        const targets = row.querySelectorAll('.tree-key, .tree-value');
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
    function expandAll() {
        treeContent.querySelectorAll('.tree-children').forEach(c => c.classList.remove('collapsed'));
        treeContent.querySelectorAll('.tree-toggle:not(.leaf)').forEach(t => t.classList.remove('collapsed'));
    }

    function collapseAll() {
        treeContent.querySelectorAll('.tree-children').forEach(c => c.classList.add('collapsed'));
        treeContent.querySelectorAll('.tree-toggle:not(.leaf)').forEach(t => t.classList.add('collapsed'));
        // Keep root open
        const rootChildren = treeContent.querySelector('.tree-node > .tree-children');
        const rootToggle = treeContent.querySelector('.tree-node > .tree-row .tree-toggle');
        if (rootChildren) rootChildren.classList.remove('collapsed');
        if (rootToggle) rootToggle.classList.remove('collapsed');
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
