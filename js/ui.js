/**
 * UI Module
 * Projeto Nós na Rede - Fiocruz Brasília
 *
 * Handles all DOM manipulation and rendering
 */

import Config from './config.js';
import dataProcessor from './data-processor.js';

class UIManager {
    constructor() {
        this.elements = {};
        this.table = null;
        this.charts = {};
        this.modals = {};
        this._suppressFilterEvents = false;
    }

    /**
     * Initialize all DOM references
     */
    init() {
        // Status badge
        this.elements.dataSourceBadge = document.getElementById('dataSourceBadge');
        this.elements.dataSourceText = document.getElementById('dataSourceText');

        // Filters
        this.elements.filterMunicipio = document.getElementById('filterMunicipio');
        this.elements.filterTurma = document.getElementById('filterTurma');
        this.elements.filterEducador = document.getElementById('filterEducador');
        this.elements.filterStatus = document.getElementById('filterStatus');

        // Stats
        this.elements.totalCursistas = document.getElementById('totalCursistas');
        this.elements.totalPresencas = document.getElementById('totalPresencas');
        this.elements.totalFaltas = document.getElementById('totalFaltas');
        this.elements.taxaPresenca = document.getElementById('taxaPresenca');
        this.elements.totalAptos = document.getElementById('totalAptos');
        this.elements.totalNaoPodeFaltar = document.getElementById('totalNaoPodeFaltar');
        this.elements.totalSemPossibilidade = document.getElementById('totalSemPossibilidade');
        this.elements.totalMunicipios = document.getElementById('totalMunicipios');
        this.elements.totalTurmas = document.getElementById('totalTurmas');
        this.elements.totalEducadores = document.getElementById('totalEducadores');
        this.elements.totalDesistentes = document.getElementById('totalDesistentes');
        this.elements.percentDesistentes = document.getElementById('percentDesistentes');
        this.elements.periodStats = document.getElementById('periodStats');

        // Footer
        this.elements.lastUpdate = document.getElementById('lastUpdate');
        this.elements.serverInstructions = document.getElementById('serverInstructions');
        this.elements.loadingOverlay = document.getElementById('loadingOverlay');

        // Table
        this.elements.cursistasTable = document.getElementById('cursistasTable');

        // Modals
        this.modals.criteria = new bootstrap.Modal(document.getElementById('criteriaModal'));

        // Table legend toggle
        document.getElementById('btnToggleLegend')?.addEventListener('click', () => this.toggleLegend());

        // Register event listeners
        this.registerEventListeners();
    }

    /**
     * Toggle legend collapsed state
     */
    toggleLegend() {
        const legend = document.querySelector('.table-legend');
        if (!legend) return;
        legend.classList.toggle('collapsed');
        const btn = document.getElementById('btnToggleLegend');
        const isCollapsed = legend.classList.contains('collapsed');
        if (btn) {
            btn.innerHTML = isCollapsed
                ? '<i class="fas fa-info-circle"></i> Mostrar legenda'
                : '<i class="fas fa-times-circle"></i> Ocultar legenda';
        }
    }

    /**
     * Debounce utility — reduz frequência de re-renders em inputs rápidos
     */
    debounce(fn, wait = 150) {
        let timer = null;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => fn(...args), wait);
        };
    }

    /**
     * Register all event listeners
     */
    registerEventListeners() {
        this.initSelect2();

        // Debounced apply — re-renderiza charts/tabela com 150ms de delay
        // para inputs rápidos (evita re-render múltiplo durante digitação)
        const debouncedApply = this.debounce(() => {
            this.applyFilters();
            this.updateActiveFiltersIndicator();
        }, 150);

        // Cascade filter: educador change -> update turma options
        $(this.elements.filterEducador).on('change', () => {
            if (this._suppressFilterEvents) return;
            this.onEducadorChange();
        });

        // Cascade filter: turma change -> update educador options
        $(this.elements.filterTurma).on('change', () => {
            if (this._suppressFilterEvents) return;
            this.onTurmaChange();
        });

        // Auto-apply (com debounce) em qualquer mudança de filtro
        $(this.elements.filterMunicipio).on('change', debouncedApply);
        $(this.elements.filterStatus).on('change', debouncedApply);

        // Click no pill de filtros ativos → reset
        document.getElementById('activeFiltersPill')?.addEventListener('click', () => this.resetFilters());
    }

    /**
     * Initialize Select2 for filter dropdowns
     */
    initSelect2() {
        if (typeof $.fn.select2 !== 'undefined') {
            const selects = ['filterMunicipio', 'filterTurma', 'filterEducador', 'filterStatus'];
            selects.forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    $(el).select2({
                        theme: 'bootstrap-5',
                        placeholder: 'Selecione...',
                        allowClear: true,
                        language: 'pt-BR'
                    });
                }
            });
        }
    }

    /**
     * Simple event emitter
     */
    events = {};
    on(event, callback) {
        if (!this.events[event]) this.events[event] = [];
        this.events[event].push(callback);
    }
    emit(event, data) {
        if (this.events[event]) {
            this.events[event].forEach(cb => cb(data));
        }
    }

    /**
     * Show loading overlay
     */
    showLoading() {
        this.elements.loadingOverlay?.classList.add('active');
    }

    /**
     * Hide loading overlay
     */
    hideLoading() {
        this.elements.loadingOverlay?.classList.remove('active');
    }

    /**
     * Set data source status
     */
    setDataSourceStatus(status, text) {
        const badge = this.elements.dataSourceBadge;
        if (badge) {
            badge.className = 'data-source-badge';
            if (status) badge.classList.add(status);
        }
        if (this.elements.dataSourceText) {
            this.elements.dataSourceText.textContent = text;
        }
    }

    /**
     * Show/hide server instructions
     */
    showServerInstructions(show) {
        if (this.elements.serverInstructions) {
            this.elements.serverInstructions.style.display = show ? 'block' : 'none';
        }
    }

    /**
     * Populate filter dropdowns
     */
    populateFilters(options) {
        this.populateSelect('filterMunicipio', options.municipios, 'Todos os Municípios');
        this.populateSelect('filterTurma', options.turmas, 'Todas as Turmas');
        this.populateSelect('filterEducador', options.educadores, 'Todos');
    }

    /**
     * Populate a single select with Select2 support
     */
    populateSelect(id, options, placeholder = 'Todos') {
        const select = document.getElementById(id);
        if (!select) return;

        this._suppressFilterEvents = true;

        select.innerHTML = `<option value="">${placeholder}</option>`;
        options.forEach(opt => {
            const escaped = String(opt).replace(/"/g, '&quot;');
            select.innerHTML += `<option value="${escaped}">${escaped}</option>`;
        });

        if (typeof $.fn.select2 !== 'undefined') {
            $(select).trigger('change.select2');
        }

        this._suppressFilterEvents = false;
    }

    /**
     * Handle educador change — cascade update turma options
     */
    onEducadorChange() {
        const educador = this.elements.filterEducador?.value || '';
        const currentTurma = this.elements.filterTurma?.value || '';

        // Get turmas linked to selected educador
        const turmas = dataProcessor.getTurmasByEducador(educador);

        // If current turma is no longer in the filtered list, clear it
        const validTurma = turmas.includes(currentTurma) ? currentTurma : '';

        this.populateSelect('filterTurma', turmas, 'Todas as Turmas');

        if (validTurma !== currentTurma) {
            this._suppressFilterEvents = true;
            $(this.elements.filterTurma).val(validTurma).trigger('change.select2');
            this._suppressFilterEvents = false;
        }

        // Auto-apply filters
        this.applyFilters();
    }

    /**
     * Handle turma change — cascade update educador options
     */
    onTurmaChange() {
        const turma = this.elements.filterTurma?.value || '';
        const currentEducador = this.elements.filterEducador?.value || '';

        // Get educadores linked to selected turma
        const educadores = dataProcessor.getEducadoresByTurma(turma);

        const validEducador = educadores.includes(currentEducador) ? currentEducador : '';

        this.populateSelect('filterEducador', educadores, 'Todos');

        if (validEducador !== currentEducador) {
            this._suppressFilterEvents = true;
            $(this.elements.filterEducador).val(validEducador).trigger('change.select2');
            this._suppressFilterEvents = false;
        }

        // Auto-apply filters
        this.applyFilters();
    }

    /**
     * Apply filters
     */
    applyFilters() {
        dataProcessor.setFilter('municipio', this.elements.filterMunicipio?.value || '');
        dataProcessor.setFilter('turma', this.elements.filterTurma?.value || '');
        dataProcessor.setFilter('educador', this.elements.filterEducador?.value || '');
        dataProcessor.setFilter('status', this.elements.filterStatus?.value || '');
        this.updateActiveFiltersIndicator();
    }

    /**
     * Show/hide the active-filters pill counter.
     */
    updateActiveFiltersIndicator() {
        const pill = document.getElementById('activeFiltersPill');
        const counter = document.getElementById('activeFiltersCount');
        if (!pill || !counter) return;
        const filters = ['filterMunicipio', 'filterTurma', 'filterEducador', 'filterStatus'];
        const active = filters.filter(id => {
            const el = document.getElementById(id);
            return el && el.value;
        });
        counter.textContent = active.length;
        pill.classList.toggle('visible', active.length > 0);
    }

    /**
     * Reset filters — restores all dropdowns to "Todos" and re-applies.
     *
     * IMPORTANTE: dataProcessor.resetFilters() dispara notify() → onDataChange
     * → updateStats (que atualiza cards). Mas updateActiveFiltersIndicator
     * (pill da filter-row) NÃO é chamada nesse fluxo, então precisamos
     * chamá-la manualmente após o reset.
     */
    resetFilters() {
        this._suppressFilterEvents = true;

        ['filterMunicipio', 'filterTurma', 'filterEducador', 'filterStatus'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.value = '';
                if (typeof $.fn.select2 !== 'undefined') {
                    $(el).val('').trigger('change.select2');
                }
            }
        });

        // Repopulate turma and educador with full option lists
        this.populateSelect('filterTurma', dataProcessor.getTurmasByEducador(''), 'Todas as Turmas');
        this.populateSelect('filterEducador', dataProcessor.getEducadoresByTurma(''), 'Todos');

        this._suppressFilterEvents = false;

        dataProcessor.resetFilters();

        // Atualiza explicitamente a pill da filter-row (não é chamada via notify)
        this.updateActiveFiltersIndicator();
    }

    /**
     * Update statistics display with deltas, badges "Filtrado" e animações.
     */
    updateStats(stats) {
        const baseline = dataProcessor.getBaselineStats();
        const hasFilters = dataProcessor.hasActiveFilters();

        // Mapeamento card → field + tipo de delta
        // Cards com delta/badge (números que mudam com filtro):
        const cardConfig = [
            { id: 'totalCursistas', deltaId: 'deltaCursistas', key: 'totalInscritos', type: 'count' },
            { id: 'totalPresencas', deltaId: 'deltaPresencas', key: 'totalPresencas', type: 'count' },
            { id: 'totalFaltas', deltaId: 'deltaFaltas', key: 'totalFaltas', type: 'count' },
            { id: 'taxaPresenca', deltaId: 'deltaTaxa', key: 'taxaPresenca', type: 'rate' },
            { id: 'totalAptos', deltaId: 'deltaAptos', key: 'totalAptosCard', type: 'count' },
            { id: 'totalNaoPodeFaltar', deltaId: 'deltaNaoPodeFaltar', key: 'totalNaoPodeFaltarCard', type: 'count' },
            { id: 'totalSemPossibilidade', deltaId: 'deltaSemPossibilidade', key: 'totalSemPossibilidadeCard', type: 'count' }
        ];

        // Cards sem delta (cobertura/status — apenas atualizam valor)
        const simpleCards = ['totalMunicipios', 'totalTurmas', 'totalEducadores', 'totalDesistentes'];

        // Aplica valor + animação + delta nos cards principais
        cardConfig.forEach(({ id, deltaId, key, type }) => {
            const el = this.elements[id === 'taxaPresenca' ? 'taxaPresenca' : id];
            if (!el) return;

            const currentValue = stats[key];
            const baselineValue = baseline ? baseline[key] : currentValue;
            const display = type === 'rate' ? `${currentValue}%` : String(currentValue);

            // Anima se o valor mudou
            if (el.textContent !== display) {
                el.textContent = display;
                el.classList.remove('value-pulse');
                void el.offsetWidth; // force reflow
                el.classList.add('value-pulse');
            }

            // Atualiza delta + badge "Filtrado"
            const deltaEl = document.getElementById(deltaId);
            const cardEl = el.closest('.stat-card');
            const badgeEl = cardEl ? cardEl.querySelector('.stat-filtered-badge') : null;

            if (deltaEl && cardEl && baseline) {
                if (hasFilters && baselineValue !== currentValue) {
                    deltaEl.hidden = false;
                    if (type === 'rate') {
                        const diff = (parseFloat(currentValue) - parseFloat(baselineValue)).toFixed(1);
                        const sign = diff > 0 ? '+' : '';
                        deltaEl.textContent = `${sign}${diff}% vs total`;
                        deltaEl.className = `stat-delta ${parseFloat(currentValue) < parseFloat(baselineValue) ? 'below-baseline' : 'equal-baseline'}`;
                    } else {
                        const diff = currentValue - baselineValue;
                        const sign = diff > 0 ? '+' : '';
                        deltaEl.textContent = `${sign}${diff} vs total (${baselineValue})`;
                        deltaEl.className = `stat-delta ${diff < 0 ? 'below-baseline' : 'equal-baseline'}`;
                    }
                    if (badgeEl) badgeEl.hidden = false;
                    cardEl.classList.add('is-filtered');
                } else {
                    deltaEl.hidden = true;
                    if (badgeEl) badgeEl.hidden = true;
                    cardEl.classList.remove('is-filtered');
                }
            }
        });

        // Atualiza cards simples (cobertura/status) — só valor, sem delta
        simpleCards.forEach(id => {
            const el = this.elements[id];
            if (!el) return;
            const key = id.replace('total', '').toLowerCase();
            // Mapping: totalMunicipios → totalMunicipios, etc.
            const valueKey = id.charAt(0).toLowerCase() + id.slice(1);
            const newValue = String(stats[valueKey] ?? 0);
            if (el.textContent !== newValue) {
                el.textContent = newValue;
                el.classList.remove('value-pulse');
                void el.offsetWidth;
                el.classList.add('value-pulse');
            }
        });

        // Sublabel especial para Desistentes (% do total)
        if (this.elements.percentDesistentes) {
            this.elements.percentDesistentes.textContent = `${stats.percentDesistentes}% do total`;
        }

        // Banner de filtros ativos
        this.updateActiveFiltersBar(hasFilters, stats, baseline);

        // Pill no filter-row (sincronizada para garantir consistência em
        // todos os caminhos: apply, reset, debounce, notify)
        this.updateActiveFiltersIndicator();
    }

    /**
     * Update the prominent "active filters" banner above the cards.
     */
    updateActiveFiltersBar(hasFilters, stats, baseline) {
        const bar = document.getElementById('activeFiltersBar');
        const textEl = document.getElementById('activeFiltersText');
        const countEl = document.getElementById('activeFiltersCount2');
        const baselineEl = document.getElementById('baselineTotal');
        if (!bar || !textEl) return;

        if (hasFilters && baseline) {
            bar.hidden = false;
            const activeCount = Object.values(dataProcessor.filters).filter(v => v !== '').length;
            textEl.textContent = `${activeCount} filtro${activeCount !== 1 ? 's' : ''} ativo${activeCount !== 1 ? 's' : ''}`;
            if (countEl) countEl.textContent = stats.totalInscritos;
            if (baselineEl) baselineEl.textContent = baseline.totalInscritos;
        } else {
            bar.hidden = true;
        }
    }

    /**
     * Update period statistics display
     */
    updatePeriodStats(periodStats) {
        if (!this.elements.periodStats) return;

        let html = '';
        periodStats.forEach(stat => {
            html += `
                <div class="period-stat-item">
                    <div class="period-label">${stat.label}</div>
                    <div class="period-value">${stat.taxa}%</div>
                    <div class="period-detail">
                        <span class="text-success">${stat.presencas}P</span> / 
                        <span class="text-danger">${stat.faltas}F</span>
                    </div>
                </div>
            `;
        });

        this.elements.periodStats.innerHTML = html;
    }

    /**
     * Update last update time
     */
    updateLastUpdate() {
        if (this.elements.lastUpdate) {
            const now = new Date();
            const options = { 
                day: '2-digit', 
                month: '2-digit', 
                year: 'numeric', 
                hour: '2-digit', 
                minute: '2-digit' 
            };
            this.elements.lastUpdate.textContent = now.toLocaleDateString('pt-BR', options);
        }
    }

    /**
     * Initialize DataTable
     */
    initDataTable(data) {
        if (this.table) {
            this.table.destroy();
            this.table = null;
        }

        const lengthOptions = Config.UI.PAGE_LENGTH_OPTIONS;
        const lengthLabels = lengthOptions.map(n => n === -1 ? 'Todos' : n);

        // Populate dynamic select options before DataTables is built
        this.populateColumnFilterOptions(data);

        this.table = $('#cursistasTable').DataTable({
            data: data,
            columns: this.getTableColumns(),
            language: {
                url: 'https://cdn.datatables.net/plug-ins/1.13.7/i18n/pt-BR.json',
                lengthMenu: "Mostrar _MENU_",
                zeroRecords: "Nenhum cursista encontrado",
                info: "Mostrando _START_ a _END_ de _TOTAL_",
                infoFiltered: "(filtrado de _MAX_ registros)",
                search: "Pesquisar:",
                paginate: {
                    previous: "‹ Anterior",
                    next: "Próximo ›"
                }
            },
            lengthMenu: [lengthOptions, lengthLabels],
            pageLength: Config.UI.DEFAULT_PAGE_LENGTH,
            dom: '<"row g-2"<"col-sm-12 col-md-6"l><"col-sm-12 col-md-6">>rtip',
            order: [[0, 'asc']],
            responsive: true,
            orderCellsTop: true,
            initComplete: () => this.bindColumnFilters()
        });
    }

    /**
     * Populate dynamic select options for column filters based on data.
     * - Município, Turma, Educador(a): unique values sorted ASC
     * - Presenças, Faltas: 0..10
     * - % Frequência: range buckets
     */
    populateColumnFilterOptions(data) {
        this._fullDataset = data; // cache for cascade updates
        const unique = (key) => [...new Set(data.map(d => d[key]))]
            .filter(v => v !== null && v !== undefined && v !== '')
            .sort((a, b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true }));

        const municipios = unique('municipio');
        const turmas = unique('turma');
        const educadores = unique('educador');

        this.fillSelect('[data-col="2"]', municipios, 'Todos');
        this.fillSelect('[data-col="3"]', turmas, 'Todas');
        this.fillSelect('[data-col="4"]', educadores, 'Todos');

        // Presenças: 0..10
        const presencasOptions = [];
        for (let i = 0; i <= 10; i++) presencasOptions.push(i);
        this.fillSelect('[data-col="7"]', presencasOptions, 'Todos');

        // Faltas: 0..10
        const faltasOptions = [];
        for (let i = 0; i <= 10; i++) faltasOptions.push(i);
        this.fillSelect('[data-col="8"]', faltasOptions, 'Todos');

        // Justificados: 0..10
        const justificadosOptions = [];
        for (let i = 0; i <= 10; i++) justificadosOptions.push(i);
        this.fillSelect('[data-col="9"]', justificadosOptions, 'Todos');

        // % Frequência: predefined buckets
        const taxaOptions = ['0%', '1-25%', '26-50%', '51-75%', '76-99%', '100%'];
        this.fillSelect('[data-col="10"]', taxaOptions, 'Todos');
    }

    /**
     * Re-populate the turma filter to show only turmas linked to the
     * currently selected educador (and vice-versa).
     */
    applyCascadeColumnFilters() {
        if (!this._fullDataset) return;

        const educadorSelect = document.querySelector('.filter-row [data-col="4"]');
        const turmaSelect = document.querySelector('.filter-row [data-col="3"]');
        if (!educadorSelect || !turmaSelect) return;

        const educadorValue = educadorSelect.value;
        const turmaValue = turmaSelect.value;

        // Filter dataset by educador to derive available turmas
        const baseData = educadorValue
            ? this._fullDataset.filter(d => d.educador === educadorValue)
            : this._fullDataset;

        const turmasDisponiveis = [...new Set(baseData.map(d => d.turma))]
            .filter(v => v !== null && v !== undefined && v !== '')
            .sort((a, b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true }));

        // If the previously selected turma is not in the new list, reset it
        const turmaStillValid = !turmaValue || turmasDisponiveis.includes(turmaValue);

        // Re-fill the turma select preserving the placeholder
        this._suppressFilterEvents = true;
        this.fillSelect('[data-col="3"]', turmasDisponiveis, 'Todas');
        if (turmaStillValid) {
            turmaSelect.value = turmaValue;
        } else {
            turmaSelect.value = '';
            // Clear the corresponding search in DataTables too
            if (this.table) this.table.column(3).search('').draw();
        }
        this._suppressFilterEvents = false;
    }

    /**
     * Fill a select with given options, preserving the first (placeholder) option.
     */
    fillSelect(selector, options, placeholder) {
        const selects = document.querySelectorAll(`.filter-row ${selector}`);
        selects.forEach(select => {
            // Keep the first option as placeholder
            const first = select.options[0];
            select.innerHTML = '';
            if (first) select.appendChild(first);
            else {
                const opt = document.createElement('option');
                opt.value = '';
                opt.textContent = placeholder;
                select.appendChild(opt);
            }
            options.forEach(value => {
                const opt = document.createElement('option');
                opt.value = String(value);
                opt.textContent = String(value);
                select.appendChild(opt);
            });
        });
    }

    /**
     * Bind per-column filters to the inputs in the .filter-row
     */
    bindColumnFilters() {
        const api = this.table;
        if (!api) return;

        // Wire each filter to its column via DataTables API
        document.querySelectorAll('.filter-row .column-filter').forEach((input) => {
            const colIdx = parseInt(input.getAttribute('data-col'), 10);
            if (isNaN(colIdx)) return;

            const onChange = () => {
                if (api.column(colIdx).search() !== input.value) {
                    api.column(colIdx).search(input.value, false, false).draw();
                }

                // Cascade: educador (4) <-> turma (3)
                if (colIdx === 4 || colIdx === 3) {
                    this.applyCascadeColumnFilters();
                }

                this.updateColumnFiltersIndicator();
            };

            const evt = input.tagName === 'SELECT' ? 'change' : 'keyup';
            input.addEventListener(evt, onChange);
            // Also bind 'change' for selects to ensure consistency
            if (input.tagName !== 'SELECT') {
                input.addEventListener('change', onChange);
            }
        });

        // Reset button: clear all column filters at once
        document.getElementById('btnClearColumnFilters')?.addEventListener('click', () => this.clearColumnFilters());

        // Initialize indicator state
        this.updateColumnFiltersIndicator();
    }

    /**
     * Clear all column filter inputs and reset their search
     */
    clearColumnFilters() {
        if (!this.table) return;
        // Clear values visually
        document.querySelectorAll('.filter-row .column-filter').forEach((input) => {
            input.value = '';
            const colIdx = parseInt(input.getAttribute('data-col'), 10);
            if (!isNaN(colIdx)) {
                this.table.column(colIdx).search('').draw();
            }
        });

        // Re-populate turma/educador with the full set (in case cascade trimmed them)
        if (this._fullDataset) {
            const unique = (key) => [...new Set(this._fullDataset.map(d => d[key]))]
                .filter(v => v !== null && v !== undefined && v !== '')
                .sort((a, b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true }));
            this.fillSelect('[data-col="3"]', unique('turma'), 'Todas');
            this.fillSelect('[data-col="4"]', unique('educador'), 'Todos');
        }

        this.updateColumnFiltersIndicator();
    }

    /**
     * Update the active column-filters indicator (counter pill + button state).
     */
    updateColumnFiltersIndicator() {
        const counter = document.getElementById('activeColumnFiltersCount');
        const btn = document.getElementById('btnClearColumnFilters');
        const label = document.querySelector('.filter-actions-label');
        const suffix = document.getElementById('filterPluralSuffix');
        const suffix2 = document.getElementById('filterPluralSuffix2');
        if (!counter || !btn) return;

        const active = Array.from(document.querySelectorAll('.filter-row .column-filter'))
            .filter(input => input.value && input.value.trim() !== '').length;

        counter.textContent = active;
        if (label) label.classList.toggle('has-active', active > 0);

        // Singular vs plural
        const isPlural = active !== 1;
        if (suffix) suffix.textContent = isPlural ? 's' : '';
        if (suffix2) suffix2.textContent = isPlural ? 's' : '';

        // Disable button when no filters are active
        if (active === 0) {
            btn.setAttribute('disabled', 'disabled');
        } else {
            btn.removeAttribute('disabled');
        }
    }

    /**
     * Get the rows currently visible in the table (after both top filters
     * and column filters are applied). Falls back to filteredData if table
     * is not yet initialized.
     */
    getDisplayedRows() {
        if (!this.table) return dataProcessor.filteredData;
        return this.table.rows({ search: 'applied' }).data().toArray();
    }

    /**
     * Get an array of active filter descriptions for export metadata.
     * Returns an array of { filter, value } objects.
     */
    getActiveFilters() {
        const filters = [];
        const topFilters = [
            { key: 'filterMunicipio', label: 'Município' },
            { key: 'filterTurma', label: 'Turma' },
            { key: 'filterEducador', label: 'Educador(a)' },
            { key: 'filterStatus', label: 'Status' }
        ];
        topFilters.forEach(f => {
            const el = document.getElementById(f.key);
            if (el && el.value) filters.push({ filter: f.label, value: el.value });
        });

        // Column filters (incluindo filtro Situação da tabela)
        document.querySelectorAll('.filter-row .column-filter').forEach(input => {
            if (input.value) {
                const colIdx = parseInt(input.getAttribute('data-col'), 10);
                const colName = this.getColumnName(colIdx);
                if (colName) filters.push({ filter: `Tabela: ${colName}`, value: input.value });
            }
        });

        return filters;
    }

    /**
     * Map a column index to its friendly name
     */
    getColumnName(colIdx) {
        const names = {
            0: 'Nome',
            1: 'CPF',
            2: 'Município',
            3: 'Turma',
            4: 'Educador(a)',
            5: 'Status',
            6: 'Situação',
            7: 'Presenças',
            8: 'Faltas',
            9: 'Justificados',
            10: '% Frequência'
        };
        return names[colIdx] || null;
    }

    /**
     * Get table column definitions
     */
    getTableColumns() {
        return [
            { data: 'nome' },
            { data: 'cpf' },
            { data: 'municipio' },
            { data: 'turma' },
            { data: 'educador' },
            {
                data: 'status',
                render: (d) => this.renderStatusBadge(d)
            },
            {
                data: 'certificacao',
                render: (d) => this.renderCertificacaoBadge(d)
            },
            { data: 'presencas' },
            { data: 'faltas' },
            { data: 'justificados' },
            {
                data: 'taxaPresenca',
                render: (d) => this.renderPercentage(d)
            }
        ];
    }

    /**
     * Render status badge
     */
    renderStatusBadge(status) {
        if (status === Config.STATUS.INSCRITO) {
            return '<span class="badge-status badge-inscrito">Inscrito</span>';
        }
        if (status === Config.STATUS.DESISTENTE) {
            return '<span class="badge-status badge-desistente">Desistente</span>';
        }
        return `<span class="badge-status">${status}</span>`;
    }

    /**
     * Render certification eligibility badge.
     * Uses a color-coded pill with the text label inside, so the cell
     * content is searchable by DataTables (the previous icon-only design
     * produced empty searchable text and broke the column filter).
     */
    renderCertificacaoBadge(label) {
        const map = {
            'Apto': 'cert-apto',
            'Não pode faltar': 'cert-alerta',
            'Sem possibilidade': 'cert-bloqueado'
        };
        const cssClass = map[label] || 'cert-default';
        const text = label || '-';
        return `<span class="cert-badge ${cssClass}">${text}</span>`;
    }

    /**
     * Render period cell
     */
    renderPeriodCell(status) {
        const formatted = dataProcessor.formatPeriodStatus(status);
        return `<span class="badge-status badge-${formatted.class}">${formatted.abbrev}</span>`;
    }

    /**
     * Render percentage with color
     */
    renderPercentage(percentage) {
        const color = dataProcessor.getPercentageColor(percentage);
        return `<span class="text-${color} fw-bold">${percentage}%</span>`;
    }

    /**
     * Update table data — also handles friendly empty state when filters return 0 rows.
     */
    updateTableData(data) {
        if (this.table) {
            this.table.columns().every(function () {
                this.search('');
            });
            document.querySelectorAll('.filter-row .column-filter').forEach(input => {
                input.value = '';
            });
            this.table.clear().rows.add(data).draw();
            this.updateColumnFiltersIndicator();
            this.updateEmptyState(data);
        } else {
            this.initDataTable(data);
        }
    }

    /**
     * Show / hide the friendly empty state under the table when 0 rows match.
     */
    updateEmptyState(data) {
        const tableWrap = this.elements.cursistasTable?.closest('.table-responsive');
        const tableSection = this.elements.cursistasTable?.closest('.table-card');
        if (!tableSection) return;

        // Remove previous empty state if exists
        const existing = tableSection.querySelector('.empty-state');
        if (existing) existing.remove();

        if (data.length === 0 && dataProcessor.hasActiveFilters()) {
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.innerHTML = `
                <div class="empty-state-icon"><i class="fas fa-search"></i></div>
                <div class="empty-state-title">Nenhum cursista encontrado com esses filtros</div>
                <div class="empty-state-text">Tente ajustar ou remover os filtros aplicados para visualizar os resultados.</div>
                <button class="empty-state-action" id="emptyStateClearBtn">
                    <i class="fas fa-eraser"></i> Limpar todos os filtros
                </button>
            `;
            tableWrap?.after(empty);
            document.getElementById('emptyStateClearBtn')?.addEventListener('click', () => this.resetFilters());
        } else if (data.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.innerHTML = `
                <div class="empty-state-icon"><i class="fas fa-database"></i></div>
                <div class="empty-state-title">Nenhum dado disponível</div>
                <div class="empty-state-text">Não há cursistas cadastrados no momento.</div>
            `;
            tableWrap?.after(empty);
        }
    }

    /**
     * Store chart instance
     */
    setChart(id, chart) {
        this.charts[id] = chart;
    }

    /**
     * Get chart instance
     */
    getChart(id) {
        return this.charts[id];
    }

    /**
     * Show criteria modal
     */
    showCriteria() {
        this.modals.criteria?.show();
    }

    /**
     * Initialize charts
     */
    initCharts(chartData) {
        // Destroy existing charts
        Object.values(this.charts).forEach(chart => chart?.destroy());
        this.charts = {};

        // Attendance Chart
        this.charts.attendance = new Chart(
            document.getElementById('attendanceChart'),
            {
                type: 'bar',
                data: chartData.attendance,
                options: this.getChartOptions('attendance')
            }
        );

        // Certificacao Chart
        this.charts.certificacao = new Chart(
            document.getElementById('certificacaoChart'),
            {
                type: 'doughnut',
                data: chartData.certificacao,
                options: this.getChartOptions('certificacao')
            }
        );

        // Status Chart
        this.charts.status = new Chart(
            document.getElementById('statusChart'),
            {
                type: 'doughnut',
                data: chartData.status,
                options: this.getChartOptions('status')
            }
        );

        // Turmas Chart
        this.charts.turmas = new Chart(
            document.getElementById('turmasChart'),
            {
                type: 'bar',
                data: chartData.turmas,
                options: this.getChartOptions('turmas')
            }
        );

        // Educadores Chart
        this.charts.educadores = new Chart(
            document.getElementById('educadoresChart'),
            {
                type: 'bar',
                data: chartData.educadores,
                options: this.getChartOptions('educadores')
            }
        );
    }

    /**
     * Get chart options — aligned with the project's visual identity.
     * All charts use maintainAspectRatio:false so the .chart-wrapper height controls the size.
     */
    getChartOptions(type) {
        const palette = Config.CHARTS.PALETTE;
        const defaults = Config.CHARTS.DEFAULTS;

        const sharedTooltip = {
            backgroundColor: 'rgba(26, 26, 26, 0.95)',
            titleFont: { family: defaults.fontFamily, size: 13, weight: '700' },
            bodyFont: { family: defaults.fontFamily, size: 12 },
            padding: 12,
            cornerRadius: 8,
            displayColors: true,
            boxPadding: 4,
            caretSize: 6
        };

        const sharedLegend = {
            labels: {
                font: { family: defaults.fontFamily, size: 11, weight: '500' },
                color: '#585858',
                padding: 10,
                usePointStyle: true,
                pointStyle: 'circle',
                boxWidth: 8
            }
        };

        const sharedScales = {
            x: {
                grid: { display: false, drawBorder: false },
                ticks: {
                    font: { family: defaults.fontFamily, size: 10, weight: '500' },
                    color: '#666666',
                    maxRotation: 0,
                    autoSkip: true
                }
            },
            y: {
                beginAtZero: true,
                grid: { color: 'rgba(0, 0, 0, 0.05)', drawBorder: false },
                ticks: {
                    font: { family: defaults.fontFamily, size: 10 },
                    color: '#666666',
                    padding: 6
                }
            }
        };

        const sharedScalesH = {
            x: {
                beginAtZero: true,
                grid: { color: 'rgba(0, 0, 0, 0.05)', drawBorder: false },
                ticks: {
                    font: { family: defaults.fontFamily, size: 10 },
                    color: '#666666'
                }
            },
            y: {
                grid: { display: false, drawBorder: false },
                ticks: {
                    font: { family: defaults.fontFamily, size: 10, weight: '500' },
                    color: '#585858',
                    autoSkip: false
                }
            }
        };

        const baseOptions = {
            responsive: true,
            maintainAspectRatio: false
        };

        const optionsMap = {
            attendance: {
                ...baseOptions,
                animation: { duration: defaults.animationDuration, easing: 'easeOutQuart' },
                plugins: {
                    legend: { ...sharedLegend, position: 'top' },
                    tooltip: sharedTooltip
                },
                scales: sharedScales,
                layout: { padding: { top: 4, bottom: 0 } }
            },
            status: {
                ...baseOptions,
                cutout: '65%',
                animation: { animateRotate: true, animateScale: true, duration: 900 },
                plugins: {
                    legend: { ...sharedLegend, position: 'bottom' },
                    tooltip: sharedTooltip
                }
            },
            certificacao: {
                ...baseOptions,
                cutout: '65%',
                animation: { animateRotate: true, animateScale: true, duration: 900 },
                plugins: {
                    legend: { ...sharedLegend, position: 'bottom' },
                    tooltip: sharedTooltip
                }
            },
            turmas: {
                ...baseOptions,
                indexAxis: 'y',
                animation: { duration: defaults.animationDuration, easing: 'easeOutQuart' },
                plugins: {
                    legend: { display: false },
                    tooltip: sharedTooltip
                },
                scales: sharedScalesH,
                layout: { padding: { right: 8 } }
            },
            educadores: {
                ...baseOptions,
                indexAxis: 'y',
                animation: { duration: defaults.animationDuration, easing: 'easeOutQuart' },
                plugins: {
                    legend: { display: false },
                    tooltip: sharedTooltip
                },
                scales: sharedScalesH,
                layout: { padding: { right: 8 } }
            }
        };

        return optionsMap[type] || baseOptions;
    }

    /**
     * Update all charts
     */
    updateCharts(chartData) {
        Object.keys(this.charts).forEach(key => {
            if (this.charts[key] && chartData[key]) {
                this.charts[key].data = chartData[key];
                this.charts[key].update();
            }
        });
    }
}

// Create singleton instance
const uiManager = new UIManager();

export default uiManager;
