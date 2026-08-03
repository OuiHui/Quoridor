/**
 * Custom Dropdown UI Component
 * Replaces native <select> elements with animated glassmorphic dropdown menus while maintaining full DOM event parity.
 */

export function initCustomDropdowns(rootElement = document) {
    const selects = rootElement.querySelectorAll('select:not([data-custom-initialized])');
    selects.forEach(selectEl => enhanceSelectElement(selectEl));
}

export function enhanceSelectElement(selectEl) {
    if (!selectEl || selectEl.dataset.customInitialized) return;
    selectEl.dataset.customInitialized = 'true';

    const wrapper = document.createElement('div');
    wrapper.className = 'custom-dropdown';
    if (selectEl.id) wrapper.dataset.for = selectEl.id;

    selectEl.parentNode.insertBefore(wrapper, selectEl);
    wrapper.appendChild(selectEl);
    selectEl.classList.add('custom-dropdown-native-select');

    const trigger = createTriggerButton(selectEl);
    const menu = createMenuContainer(selectEl, wrapper, trigger);

    wrapper.appendChild(trigger);
    wrapper.appendChild(menu);

    bindEvents(selectEl, wrapper, trigger, menu);
}

function createTriggerButton(selectEl) {
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'custom-dropdown-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');

    const selectedOption = selectEl.options[selectEl.selectedIndex] || selectEl.options[0];
    const labelText = selectedOption ? selectedOption.textContent : '';

    trigger.innerHTML = `
        <span class="custom-dropdown-label">${escapeHtml(labelText)}</span>
        <svg class="custom-dropdown-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
    `;
    return trigger;
}

function createMenuContainer(selectEl, wrapper, trigger) {
    const menu = document.createElement('div');
    menu.className = 'custom-dropdown-menu';
    menu.setAttribute('role', 'listbox');

    rebuildOptions(selectEl, menu, trigger);
    return menu;
}

function rebuildOptions(selectEl, menu, trigger) {
    menu.innerHTML = '';
    const options = Array.from(selectEl.options);

    options.forEach(opt => {
        const item = document.createElement('div');
        item.className = 'custom-dropdown-option';
        if (opt.selected) item.classList.add('selected');
        item.dataset.value = opt.value;

        item.innerHTML = `
            <span class="option-text">${escapeHtml(opt.textContent)}</span>
            <span class="option-indicator"></span>
        `;

        item.addEventListener('click', (e) => {
            e.stopPropagation();
            selectOption(selectEl, menu, trigger, opt.value);
        });

        menu.appendChild(item);
    });
}

function selectOption(selectEl, menu, trigger, value) {
    if (selectEl.value !== value) {
        selectEl.value = value;
        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
    }
    syncTriggerAndActiveState(selectEl, menu, trigger);
    closeDropdown(menu, trigger);
}

function syncTriggerAndActiveState(selectEl, menu, trigger) {
    const selectedOption = selectEl.options[selectEl.selectedIndex];
    if (!selectedOption) return;

    const label = trigger.querySelector('.custom-dropdown-label');
    if (label) label.textContent = selectedOption.textContent;

    const items = menu.querySelectorAll('.custom-dropdown-option');
    items.forEach(item => {
        if (item.dataset.value === selectEl.value) {
            item.classList.add('selected');
        } else {
            item.classList.remove('selected');
        }
    });
}

function bindEvents(selectEl, wrapper, trigger, menu) {
    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = menu.classList.contains('open');
        closeAllCustomDropdowns();
        if (!isOpen) {
            openDropdown(menu, trigger);
        }
    });

    selectEl.addEventListener('change', () => {
        syncTriggerAndActiveState(selectEl, menu, trigger);
    });

    const observer = new MutationObserver(() => {
        rebuildOptions(selectEl, menu, trigger);
        syncTriggerAndActiveState(selectEl, menu, trigger);
    });
    observer.observe(selectEl, { childList: true, subtree: true });

    wrapper.addEventListener('keydown', (e) => handleKeyboard(e, selectEl, menu, trigger));
}

function openDropdown(menu, trigger) {
    menu.classList.add('open');
    trigger.classList.add('active');
    trigger.setAttribute('aria-expanded', 'true');
}

function closeDropdown(menu, trigger) {
    menu.classList.remove('open');
    trigger.classList.remove('active');
    trigger.setAttribute('aria-expanded', 'false');
}

export function closeAllCustomDropdowns() {
    document.querySelectorAll('.custom-dropdown-menu.open').forEach(menu => {
        menu.classList.remove('open');
    });
    document.querySelectorAll('.custom-dropdown-trigger.active').forEach(trigger => {
        trigger.classList.remove('active');
        trigger.setAttribute('aria-expanded', 'false');
    });
}

function handleKeyboard(e, selectEl, menu, trigger) {
    const isOpen = menu.classList.contains('open');

    if (e.key === 'Escape') {
        if (isOpen) {
            closeDropdown(menu, trigger);
            trigger.focus();
        }
        return;
    }

    if (!isOpen && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown')) {
        e.preventDefault();
        openDropdown(menu, trigger);
        return;
    }

    if (isOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault();
        const items = Array.from(menu.querySelectorAll('.custom-dropdown-option'));
        if (items.length === 0) return;

        let currentIndex = items.findIndex(item => item.classList.contains('selected'));
        if (e.key === 'ArrowDown') {
            currentIndex = (currentIndex + 1) % items.length;
        } else {
            currentIndex = (currentIndex - 1 + items.length) % items.length;
        }

        const targetValue = items[currentIndex].dataset.value;
        selectOption(selectEl, menu, trigger, targetValue);
    }
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.custom-dropdown')) {
        closeAllCustomDropdowns();
    }
});

function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
