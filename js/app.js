/**
 * Main Application Module
 * Projeto Nós na Rede - Fiocruz Brasília
 *
 * Orchestrates all modules and handles main application flow
 */

import Config from './config.js';
import apiClient from './api.js';
import dataProcessor from './data-processor.js';
import uiManager from './ui.js';

// Cache the logo as base64 for PDF embedding
let LOGO_BASE64 = null;
async function loadLogo() {
    if (LOGO_BASE64) return LOGO_BASE64;
    try {
        const response = await fetch('images/logo.png');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        LOGO_BASE64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('FileReader failed'));
            reader.readAsDataURL(blob);
        });
        return LOGO_BASE64;
    } catch (e) {
        console.warn('Could not load logo for export:', e);
        return null;
    }
}

/**
 * HTML escape utility — previne XSS ao inserir texto em innerHTML
 */
function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * CSV injection escape — previne que valores iniciados com =, +, -, @, \t, \r
 * sejam interpretados como fórmulas pelo Excel/Sheets
 */
function escapeCsvInjection(value) {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.length > 0 && /^[=+\-@\t\r]/.test(str)) {
        return "'" + str;
    }
    return str;
}

/**
 * Sanitiza CSV field (escape de vírgulas, aspas, quebras de linha + CSV injection)
 */
function csvField(value) {
    const escaped = escapeCsvInjection(value);
    if (escaped.includes(',') || escaped.includes('"') || escaped.includes('\n') || escaped.includes('\r')) {
        return '"' + escaped.replace(/"/g, '""') + '"';
    }
    return escaped;
}

class DashboardApp {
    constructor() {
        this.initialized = false;
    }

    /**
     * Initialize the application
     */
    async init() {
        console.log(Config.LOG.PREFIX, 'Initializing dashboard...');

        // Initialize UI (after DOM is ready)
        uiManager.init();

        // Register data change listener
        dataProcessor.onChange((data) => this.onDataChange(data));

        // Register UI events
        uiManager.on('refresh', () => this.refresh());
        uiManager.on('showCriteria', () => uiManager.showCriteria());
        uiManager.on('exportCSV', () => this.exportToCSV());
        uiManager.on('exportPDF', () => this.exportToPDF());
        uiManager.on('exportXLSX', () => this.exportToXLSX());

        // Register button handlers
        this.registerButtonHandlers();

        // Initial data load
        await this.loadData();

        this.initialized = true;
        console.log(Config.LOG.PREFIX, 'Dashboard initialized successfully');
    }

    /**
     * Register button event handlers
     */
    registerButtonHandlers() {
        // Refresh button
        document.getElementById('btnRefresh')?.addEventListener('click', () => {
            uiManager.emit('refresh');
        });

        // Criteria button
        document.getElementById('btnCriteria')?.addEventListener('click', () => {
            uiManager.emit('showCriteria');
        });

        // Clear / reset filters button
        document.getElementById('btnResetFilters')?.addEventListener('click', () => {
            uiManager.resetFilters();
        });

        // Export buttons
        document.getElementById('btnExportCSV')?.addEventListener('click', () => {
            uiManager.emit('exportCSV');
        });
        document.getElementById('btnExportPDF')?.addEventListener('click', () => {
            uiManager.emit('exportPDF');
        });
        document.getElementById('btnExportXLSX')?.addEventListener('click', () => {
            uiManager.emit('exportXLSX');
        });

        // Copy to clipboard
        document.getElementById('btnCopy')?.addEventListener('click', () => {
            this.copyToClipboard();
        });
    }

    /**
     * Load data from API
     */
    async loadData() {
        uiManager.showLoading();
        const isStatic = apiClient.isStatic();
        uiManager.setDataSourceStatus(
            'loading',
            isStatic ? 'Carregando dados públicos...' : 'Conectando...'
        );

        try {
            // Fetch raw data from server
            const rawData = await apiClient.fetchDashboardData();

            // Process data
            dataProcessor.processRawData(rawData);

            // Populate filter dropdowns
            uiManager.populateFilters(dataProcessor.getFilterOptions());

            // Update UI
            uiManager.setDataSourceStatus(
                'connected',
                isStatic ? `Dados públicos · ${apiClient.getMode()}` : 'Dados Carregados'
            );
            uiManager.showServerInstructions(false);
            uiManager.updateLastUpdate();

            console.log(Config.LOG.PREFIX, `Loaded ${rawData.length} raw records, ${dataProcessor.processedData.length} students`);

        } catch (error) {
            console.error(Config.LOG.PREFIX, 'Failed to load data:', error);
            uiManager.setDataSourceStatus('error', 'Erro ao carregar');
            // Em modo estático, não há servidor para iniciar — mostra mensagem genérica
            uiManager.showServerInstructions(!isStatic);
        } finally {
            uiManager.hideLoading();
        }
    }

    /**
     * Refresh data from API
     */
    async refresh() {
        uiManager.showLoading();
        uiManager.setDataSourceStatus('loading', 'Atualizando...');

        try {
            // Force refresh (bypass cache)
            const rawData = await apiClient.forceRefresh();

            // Process data
            dataProcessor.processRawData(rawData);

            // Update UI
            uiManager.setDataSourceStatus('connected', 'Dados Carregados');
            uiManager.updateLastUpdate();

            console.log(Config.LOG.PREFIX, 'Data refreshed successfully');

        } catch (error) {
            console.error(Config.LOG.PREFIX, 'Failed to refresh data:', error);
            uiManager.setDataSourceStatus('error', 'Erro ao atualizar');
        } finally {
            uiManager.hideLoading();
        }
    }

    /**
     * Handle data change
     */
    onDataChange(data) {
        // Update statistics
        const stats = dataProcessor.getStats();
        uiManager.updateStats(stats);

        // Update period stats
        uiManager.updatePeriodStats(dataProcessor.getPeriodStats());

        // Update summary tiles
        this.renderSummary(stats);

        // Update table
        uiManager.updateTableData(data);

        // Check if charts are initialized
        if (uiManager.getChart('attendance')) {
            // Update existing charts
            uiManager.updateCharts({
                attendance: dataProcessor.getAttendanceChartData(),
                certificacao: dataProcessor.getCertificacaoChartData(),
                status: dataProcessor.getStatusChartData(),
                turmas: dataProcessor.getTurmasChartData(),
                educadores: dataProcessor.getEducadoresChartData()
            });
        } else {
            // Initialize charts
            uiManager.initCharts({
                attendance: dataProcessor.getAttendanceChartData(),
                certificacao: dataProcessor.getCertificacaoChartData(),
                status: dataProcessor.getStatusChartData(),
                turmas: dataProcessor.getTurmasChartData(),
                educadores: dataProcessor.getEducadoresChartData()
            });
        }
    }

    /**
     * Render the summary tiles in the right-side card
     */
    renderSummary(stats) {
        const grid = document.getElementById('summaryGrid');
        if (!grid) return;

        const tiles = [
            { value: stats.totalInscritos, label: 'Inscritos', icon: 'fa-users', color: '#FF6B9B', bg: 'rgba(255, 107, 155, 0.14)' },
            { value: stats.totalPresencas, label: 'Presenças', icon: 'fa-user-check', color: '#00D084', bg: 'rgba(0, 208, 132, 0.14)' },
            { value: stats.totalFaltas, label: 'Faltas', icon: 'fa-user-times', color: '#FE2D2D', bg: 'rgba(254, 45, 45, 0.14)' },
            { value: stats.taxaPresenca + '%', label: 'Taxa de Presença', icon: 'fa-percentage', color: '#FFB800', bg: 'rgba(255, 184, 0, 0.16)' },
            { value: stats.totalAptosCard, label: 'Aptos a Certificar', icon: 'fa-check-circle', color: '#00D084', bg: 'rgba(0, 208, 132, 0.14)' },
            { value: stats.totalSemPossibilidadeCard, label: 'Sem Possibilidade', icon: 'fa-ban', color: '#FE2D2D', bg: 'rgba(254, 45, 45, 0.14)' },
            { value: stats.totalMunicipios, label: 'Municípios', icon: 'fa-map-marker-alt', color: '#4158D0', bg: 'rgba(65, 88, 208, 0.14)' },
            { value: stats.totalEducadores, label: 'Educadores(as)', icon: 'fa-user-tie', color: '#00BAD6', bg: 'rgba(0, 186, 214, 0.14)' }
        ];

        // Limpa conteúdo anterior com segurança (DOMPurify-like, sem innerHTML dinâmico)
        while (grid.firstChild) grid.removeChild(grid.firstChild);

        const frag = document.createDocumentFragment();
        tiles.forEach(t => {
            const tile = document.createElement('div');
            tile.className = 'summary-tile';

            const icon = document.createElement('span');
            icon.className = 'summary-icon';
            icon.style.background = t.bg;
            icon.style.color = t.color;
            const i = document.createElement('i');
            i.className = 'fas ' + t.icon;
            icon.appendChild(i);

            const content = document.createElement('div');
            content.className = 'summary-content';

            const val = document.createElement('div');
            val.className = 'summary-value';
            val.textContent = String(t.value);

            const label = document.createElement('div');
            label.className = 'summary-label';
            label.textContent = t.label;

            content.appendChild(val);
            content.appendChild(label);

            tile.appendChild(icon);
            tile.appendChild(content);
            frag.appendChild(tile);
        });

        grid.appendChild(frag);
    }

    /**
     * Export data to CSV
     */
    exportToCSV() {
        uiManager.showLoading();

        try {
            const data = uiManager.getDisplayedRows();
            const activeFilters = uiManager.getActiveFilters();
            const now = new Date();

            const titleLines = [
                `# Projeto Nós na Rede - Fiocruz Brasília`,
                `# Relatório de Presenças e Faltas`,
                `# Gerado em: ${now.toLocaleDateString('pt-BR')} às ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
                `# Total de registros: ${data.length}`
            ];

            if (activeFilters.length > 0) {
                titleLines.push('# Filtros aplicados:');
                activeFilters.forEach(f => titleLines.push(`#   • ${csvField(f.filter)}: ${csvField(f.value)}`));
            } else {
                titleLines.push('# Nenhum filtro aplicado — relatório completo');
            }

            const headers = [
                'Nome', 'CPF', 'Município', 'Turma', 'Educador(a)',
                'Status', 'Situação Certificação',
                'Presenças', 'Faltas', 'Justificados', '% Frequência'
            ];

            const rows = data.map(item => [
                csvField(item.nome),
                csvField(item.cpfRaw),
                csvField(item.municipio),
                csvField(item.turma),
                csvField(item.educador),
                csvField(item.status),
                csvField(item.certificacao || ''),
                item.presencas,
                item.faltas,
                item.justificados || 0,
                item.taxaPresenca
            ]);

            const csv = [
                ...titleLines,
                '',
                headers.map(csvField).join(','),
                ...rows.map(e => e.join(','))
            ].join('\n');

            this.downloadFile('\ufeff' + csv, `relatorio_cursistas_${now.toISOString().split('T')[0]}.csv`, 'text/csv');
        } catch (e) {
            console.error('CSV export failed:', e);
            this.showActionStatus('<i class="fas fa-times-circle"></i> Erro ao gerar CSV', 'error');
        } finally {
            uiManager.hideLoading();
        }
    }

    /**
     * Export data to XLSX with styled header
     */
    exportToXLSX() {
        uiManager.showLoading();

        try {
            const data = uiManager.getDisplayedRows();
            const activeFilters = uiManager.getActiveFilters();
            const now = new Date();

            const aoa = [
                ['Projeto Nós na Rede - Fiocruz Brasília'],
                ['Relatório de Presenças e Faltas'],
                [`Gerado em: ${now.toLocaleDateString('pt-BR')} às ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`],
                [`Total de registros: ${data.length}`],
                []
            ];

            if (activeFilters.length > 0) {
                aoa.push(['Filtros aplicados:']);
                activeFilters.forEach(f => aoa.push(['', `${f.filter}: ${f.value}`]));
            } else {
                aoa.push(['Nenhum filtro aplicado — relatório completo']);
            }

            aoa.push([]);

            aoa.push([
                'Nome', 'CPF', 'Município', 'Turma', 'Educador(a)',
                'Status', 'Situação Certificação',
                'Presenças', 'Faltas', 'Justificados', '% Frequência'
            ]);

            data.forEach(item => {
                // Aplica prefixo de escape para previnir interpretação de fórmula
                const safeValue = (v) => {
                    const s = String(v ?? '');
                    if (s && /^[=+\-@]/.test(s)) return "'" + s;
                    return s;
                };
                aoa.push([
                    safeValue(item.nome),
                    safeValue(item.cpfRaw),
                    safeValue(item.municipio),
                    safeValue(item.turma),
                    safeValue(item.educador),
                    safeValue(item.status),
                    safeValue(item.certificacao || ''),
                    item.presencas,
                    item.faltas,
                    item.justificados || 0,
                    item.taxaPresenca
                ]);
            });

            const worksheet = XLSX.utils.aoa_to_sheet(aoa);
            const numCols = 10;

            worksheet['!merges'] = [
                { s: { r: 0, c: 0 }, e: { r: 0, c: numCols - 1 } },
                { s: { r: 1, c: 0 }, e: { r: 1, c: numCols - 1 } },
                { s: { r: 2, c: 0 }, e: { r: 2, c: numCols - 1 } },
                { s: { r: 3, c: 0 }, e: { r: 3, c: numCols - 1 } }
            ];

            worksheet['!cols'] = [
                { wch: 32 }, { wch: 14 }, { wch: 22 }, { wch: 22 }, { wch: 24 },
                { wch: 12 }, { wch: 20 }, { wch: 11 }, { wch: 9 }, { wch: 13 }
            ];

            // Estilos (basic, xlsx community lib tem suporte limitado)
            if (worksheet['A1']) worksheet['A1'].s = { font: { bold: true, sz: 16, color: { rgb: 'FF6B9B' } } };
            if (worksheet['A2']) worksheet['A2'].s = { font: { bold: true, sz: 12, color: { rgb: '00BAD6' } } };
            if (worksheet['A3']) worksheet['A3'].s = { font: { sz: 10, italic: true, color: { rgb: '585858' } } };
            if (worksheet['A4']) worksheet['A4'].s = { font: { sz: 10, color: { rgb: '585858' } } };

            const filterRows = activeFilters.length > 0 ? activeFilters.length + 1 : 1;
            const headerRowIdx = 4 + filterRows + 1 + 1;

            for (let c = 0; c < numCols; c++) {
                const cellRef = XLSX.utils.encode_cell({ r: headerRowIdx, c });
                if (worksheet[cellRef]) {
                    worksheet[cellRef].s = {
                        font: { bold: true, sz: 11, color: { rgb: '1A1A1A' } },
                        fill: { fgColor: { rgb: 'FFB800' } },
                        alignment: { horizontal: 'center', vertical: 'center' }
                    };
                }
            }

            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Cursistas');
            XLSX.writeFile(workbook, `relatorio_cursistas_${now.toISOString().split('T')[0]}.xlsx`);
        } catch (e) {
            console.error('XLSX export failed:', e);
            this.showActionStatus('<i class="fas fa-times-circle"></i> Erro ao gerar Excel', 'error');
        } finally {
            uiManager.hideLoading();
        }
    }

    /**
     * Get color for certification label
     */
    getCertColor(label) {
        if (label === 'Apto') return '#00D084';
        if (label === 'Não pode faltar') return '#FFB800';
        if (label === 'Sem possibilidade') return '#FE2D2D';
        return '#1A1A1A';
    }

    /**
     * Get color for attendance percentage
     */
    getTaxaColor(taxa) {
        if (taxa >= 75) return '#00D084';
        if (taxa >= 50) return '#FFB800';
        return '#FE2D2D';
    }

    /**
     * Truncate text safely for PDF display
     */
    truncate(str, maxLen = 30) {
        if (!str) return '-';
        const s = String(str);
        return s.length > maxLen ? s.substring(0, maxLen) + '...' : s;
    }

    /**
     * Download file helper
     */
    downloadFile(content, filename, type) {
        const blob = new Blob([content], { type });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
        URL.revokeObjectURL(link.href);
    }

    /**
     * Export data to PDF with logo header.
     * Bug fix: this-binding via `self` para callbacks em .map (antes quebrava em strict mode).
     */
    async exportToPDF() {
        uiManager.showLoading();

        try {
            const data = uiManager.getDisplayedRows();
            const activeFilters = uiManager.getActiveFilters();
            const now = new Date();
            const logo = await loadLogo();

            // Captura referência a this para uso em callbacks
            const self = this;

            const filterContent = activeFilters.length > 0
                ? [
                    { text: 'Filtros aplicados:', style: 'filterLabel' },
                    {
                        ul: activeFilters.map(f => ({
                            text: `${f.filter}: ${f.value}`,
                            style: 'filterItem'
                        })),
                        margin: [0, 2, 0, 0]
                    }
                ]
                : [{ text: 'Nenhum filtro aplicado — relatório completo', style: 'filterEmpty' }];

            const headerStack = [
                { text: 'Projeto Nós na Rede', style: 'headerTitle' },
                { text: 'Fiocruz Brasília · Ministério da Saúde', style: 'headerSubtitle' }
            ];

            const docDefinition = {
                pageSize: 'A4',
                pageOrientation: 'landscape',
                pageMargins: [40, 90, 40, 50],

                header: logo ? {
                    margin: [40, 25, 40, 0],
                    columns: [
                        { image: logo, width: 60, alignment: 'left' },
                        { stack: headerStack, margin: [12, 8, 0, 0], alignment: 'left' },
                        {
                            stack: [
                                { text: 'Relatório de Presenças', style: 'reportTitle' },
                                { text: `Gerado em ${now.toLocaleDateString('pt-BR')}`, style: 'reportDate' }
                            ],
                            alignment: 'right',
                            margin: [0, 8, 0, 0]
                        }
                    ]
                } : {
                    margin: [40, 25, 40, 0],
                    columns: [
                        { text: 'Projeto Nós na Rede', style: 'headerTitleNoLogo' },
                        {
                            stack: [
                                { text: 'Relatório de Presenças', style: 'reportTitle' },
                                { text: `Gerado em ${now.toLocaleDateString('pt-BR')}`, style: 'reportDate' }
                            ],
                            alignment: 'right',
                            margin: [0, 8, 0, 0]
                        }
                    ]
                },

                footer: function (currentPage, pageCount) {
                    return {
                        text: `Página ${currentPage} de ${pageCount} · Projeto Nós na Rede · Fiocruz Brasília`,
                        alignment: 'center',
                        fontSize: 8,
                        color: '#666666',
                        margin: [0, 20, 0, 0]
                    };
                },

                content: [
                    {
                        text: 'Lista de Cursistas',
                        style: 'sectionTitle',
                        margin: [0, 0, 0, 4]
                    },
                    {
                        text: `${data.length} registro${data.length !== 1 ? 's' : ''}`,
                        style: 'sectionSubtitle',
                        margin: [0, 0, 0, 8]
                    },
                    ...filterContent.map(c => ({ ...c, margin: [0, 0, 0, 4] })),
                    { text: '', margin: [0, 0, 0, 8] },
                    {
                        table: {
                            headerRows: 1,
                            dontBreakRows: true,
                            widths: ['*', 60, 75, 75, 70, 42, 65, 28, 28, 32, 38],
                            body: [
                                [
                                    { text: 'Nome', style: 'th' },
                                    { text: 'CPF', style: 'th' },
                                    { text: 'Município', style: 'th' },
                                    { text: 'Turma', style: 'th' },
                                    { text: 'Educador(a)', style: 'th' },
                                    { text: 'Status', style: 'th' },
                                    { text: 'Situação', style: 'th' },
                                    { text: 'Pres.', style: 'th' },
                                    { text: 'Faltas', style: 'th' },
                                    { text: 'Just.', style: 'th' },
                                    { text: '%', style: 'th' }
                                ],
                                ...data.map(item => [
                                    { text: self.truncate(item.nome, 26), style: 'td' },
                                    { text: item.cpfRaw || '-', style: 'tdMono' },
                                    { text: self.truncate(item.municipio, 18), style: 'td' },
                                    { text: self.truncate(item.turma, 15), style: 'td' },
                                    { text: self.truncate(item.educador, 16), style: 'td' },
                                    { text: item.status || '-', style: 'tdCenter' },
                                    { text: item.certificacao || '-', style: 'tdCenter', color: self.getCertColor(item.certificacao) },
                                    { text: String(item.presencas ?? 0), style: 'tdCenter' },
                                    { text: String(item.faltas ?? 0), style: 'tdCenter' },
                                    { text: String(item.justificados ?? 0), style: 'tdCenter' },
                                    { text: (item.taxaPresenca ?? '0') + '%', style: 'tdCenter', color: self.getTaxaColor(parseFloat(item.taxaPresenca)) }
                                ])
                            ]
                        },
                        layout: {
                            hLineColor: () => '#E9ECEF',
                            vLineColor: () => '#E9ECEF',
                            hLineWidth: () => 0.5,
                            vLineWidth: () => 0.5,
                            fillColor: (rowIndex) => {
                                if (rowIndex === 0) return '#FFB800';
                                return rowIndex % 2 === 0 ? '#F8F5FD' : null;
                            }
                        }
                    }
                ],

                styles: {
                    headerTitle: { fontSize: 16, bold: true, color: '#FF6B9B', characterSpacing: -0.3 },
                    headerTitleNoLogo: { fontSize: 16, bold: true, color: '#FF6B9B' },
                    headerSubtitle: { fontSize: 9, color: '#585858' },
                    reportTitle: { fontSize: 11, bold: true, color: '#00BAD6' },
                    reportDate: { fontSize: 8, color: '#666666' },
                    sectionTitle: { fontSize: 14, bold: true, color: '#1A1A1A' },
                    sectionSubtitle: { fontSize: 9, color: '#666666', italics: true },
                    filterLabel: { fontSize: 9, bold: true, color: '#FF6B9B', decoration: 'underline' },
                    filterItem: { fontSize: 9, color: '#585858' },
                    filterEmpty: { fontSize: 9, color: '#999999', italics: true },
                    th: { fontSize: 9, bold: true, color: '#1A1A1A', alignment: 'center', fillColor: '#FFB800' },
                    td: { fontSize: 8, color: '#1A1A1A' },
                    tdMono: { fontSize: 8, color: '#1A1A1A' },
                    tdCenter: { fontSize: 8, color: '#1A1A1A', alignment: 'center' }
                }
            };

            pdfMake.createPdf(docDefinition).download(`relatorio_cursistas_${now.toISOString().split('T')[0]}.pdf`);
        } catch (e) {
            console.error('PDF generation failed:', e);
            this.showActionStatus('<i class="fas fa-times-circle"></i> Erro ao gerar PDF', 'error');
        } finally {
            uiManager.hideLoading();
        }
    }

    /**
     * Copy the currently displayed (filtered) data to the clipboard.
     * Uses TSV (tab-separated) format so Excel and Google Sheets
     * paste it cleanly as columns.
     */
    async copyToClipboard() {
        const data = uiManager.getDisplayedRows();
        const activeFilters = uiManager.getActiveFilters();
        const now = new Date();

        const safeValue = (v) => {
            const s = String(v ?? '');
            // CSV/TSV injection prevention: prefix with apostrophe
            if (s && /^[=+\-@\t\r]/.test(s)) return "'" + s;
            return s;
        };

        const headerComment = [
            `Projeto Nós na Rede - Fiocruz Brasília`,
            `Relatório de Presenças e Faltas`,
            `Gerado em: ${now.toLocaleDateString('pt-BR')} às ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
            `Total de registros: ${data.length}`
        ];

        if (activeFilters.length > 0) {
            headerComment.push('Filtros aplicados:');
            activeFilters.forEach(f => headerComment.push(`  • ${f.filter}: ${f.value}`));
        } else {
            headerComment.push('Nenhum filtro aplicado — relatório completo');
        }

        const headers = [
            'Nome', 'CPF', 'Município', 'Turma', 'Educador(a)',
            'Status', 'Situação Certificação',
            'Presenças', 'Faltas', 'Justificados', '% Frequência'
        ];

        const rows = data.map(item => [
            safeValue(item.nome),
            safeValue(item.cpfRaw),
            safeValue(item.municipio),
            safeValue(item.turma),
            safeValue(item.educador),
            safeValue(item.status),
            safeValue(item.certificacao),
            item.presencas,
            item.faltas,
            item.justificados || 0,
            item.taxaPresenca
        ]);

        // TSV: header comments joined by newline, then columns joined by tab
        const tsv = [
            headerComment.join('\n'),
            '',
            headers.join('\t'),
            ...rows.map(r => r.join('\t'))
        ].join('\n');

        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(tsv);
            } else {
                const ta = document.createElement('textarea');
                ta.value = tsv;
                ta.style.position = 'fixed';
                ta.style.left = '-9999px';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
            }
            this.showActionStatus(`<i class="fas fa-check-circle"></i> ${data.length} registro${data.length !== 1 ? 's' : ''} copiado${data.length !== 1 ? 's' : ''}!`, 'success');
        } catch (err) {
            console.error('Copy failed:', err);
            this.showActionStatus(`<i class="fas fa-times-circle"></i> Erro ao copiar`, 'error');
        }
    }

    /**
     * Show transient status message next to the action buttons
     */
    showActionStatus(html, type = 'success') {
        const el = document.getElementById('actionBarStatus');
        if (!el) return;
        el.innerHTML = html;
        el.classList.toggle('error', type === 'error');
        el.classList.add('visible');
        clearTimeout(this._statusTimer);
        this._statusTimer = setTimeout(() => {
            el.classList.remove('visible');
        }, 3000);
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const app = new DashboardApp();
    app.init();

    // Export for debugging
    window.DashboardApp = DashboardApp;
    window.getApp = () => app;
});

export default DashboardApp;
