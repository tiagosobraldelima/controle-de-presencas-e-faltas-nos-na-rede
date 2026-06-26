/**
 * Data Processor Module
 * Projeto Nós na Rede - Fiocruz Brasília
 * 
 * Handles all data transformation and business logic
 */

import Config from './config.js';

class DataProcessor {
    constructor() {
        this.rawData = [];
        this.processedData = [];
        this.filteredData = [];
        this.filters = {
            municipio: '',
            turma: '',
            educador: '',
            status: ''
        };
        this.listeners = [];
        // Snapshot dos stats sem filtro (para calcular deltas nos cards)
        this.baselineStats = null;
    }

    /**
     * Register change listener
     */
    onChange(callback) {
        this.listeners.push(callback);
    }

    /**
     * Notify all listeners
     */
    notify() {
        this.listeners.forEach(cb => cb(this.filteredData));
    }

    /**
     * Process raw CSV data
     */
    processRawData(rawData) {
        this.rawData = rawData;
        this.processedData = this.aggregateStudents();
        this.applyFilters();
        // Captura baseline (stats sem filtro) para cálculo de delta nos cards
        this.baselineStats = this._computeStatsFromData(this.processedData);
        this.notify();
        return this.processedData;
    }

    /**
     * Compute stats from a given dataset (used internally for both filtered and baseline).
     */
    _computeStatsFromData(data) {
        let totalPresencas = 0, totalFaltas = 0, totalJustificados = 0;
        let totalAptosCard = 0, totalNaoPodeFaltarCard = 0, totalSemPossibilidadeCard = 0;
        let totalDispensaAutomatica = 0;
        const municipios = new Set();
        const turmas = new Set();
        const educadores = new Set();

        const certificados = {
            [Config.CERTIFICACAO.APTO]: 0,
            [Config.CERTIFICACAO.NAO_PODE_FALTAR]: 0,
            [Config.CERTIFICACAO.SEM_POSSIBILIDADE]: 0
        };

        data.forEach(d => {
            totalPresencas += d.presencas || 0;
            totalFaltas += d.faltas || 0;
            totalJustificados += d.justificados || 0;
            if (d.encontro1Dispensado) totalDispensaAutomatica++;
            const faltas = d.faltas || 0;
            if (faltas <= 3) totalAptosCard++;
            if (faltas === 2 || faltas === 3) totalNaoPodeFaltarCard++;
            if (faltas >= 4) totalSemPossibilidadeCard++;
            const code = d.certificacaoCode || d.certificacao;
            if (certificados.hasOwnProperty(code)) certificados[code]++;

            if (d.municipio) municipios.add(d.municipio);
            if (d.turma) turmas.add(d.turma);
            if (d.educador) educadores.add(d.educador);
        });

        const totalInscritos = data.length;
        const totalPeriodos = Config.COURSE.TOTAL_PERIODOS;
        const taxaPresenca = totalPeriodos > 0
            ? ((totalPresencas / (totalInscritos * totalPeriodos)) * 100).toFixed(1)
            : 0;

        const totalDesistentes = data.filter(d => d.status === Config.STATUS.DESISTENTE).length;
        const percentDesistentes = totalInscritos > 0
            ? ((totalDesistentes / totalInscritos) * 100).toFixed(1)
            : 0;

        return {
            totalInscritos,
            totalPresencas,
            totalFaltas,
            totalJustificados,
            totalDispensaAutomatica,
            taxaPresenca,
            totalAptos: certificados[Config.CERTIFICACAO.APTO],
            totalNaoPodeFaltar: certificados[Config.CERTIFICACAO.NAO_PODE_FALTAR],
            totalSemPossibilidade: certificados[Config.CERTIFICACAO.SEM_POSSIBILIDADE],
            totalAptosCard,
            totalNaoPodeFaltarCard,
            totalSemPossibilidadeCard,
            totalPotencialApto: totalAptosCard,
            totalMunicipios: municipios.size,
            totalTurmas: turmas.size,
            totalEducadores: educadores.size,
            totalDesistentes,
            percentDesistentes
        };
    }

    /**
     * Indica se há filtros ativos (algum campo diferente de vazio)
     */
    hasActiveFilters() {
        return Object.values(this.filters).some(v => v !== '' && v !== null && v !== undefined);
    }

    /**
     * Retorna snapshot dos stats sem nenhum filtro aplicado (baseline).
     * Usado para mostrar o delta nos cards.
     */
    getBaselineStats() {
        return this.baselineStats;
    }

    /**
     * Aggregate raw rows by student
     */
    aggregateStudents() {
        const studentMap = new Map();

        this.rawData.forEach(row => {
            const key = this.generateStudentKey(row);
            
            if (!studentMap.has(key)) {
                studentMap.set(key, this.createStudentRecord(row));
            }

            this.updateStudentEncontro(studentMap.get(key), row);
        });

        return Array.from(studentMap.values()).map(student => 
            this.calculateStudentStats(student)
        );
    }

    /**
     * Generate unique key for student
     */
    generateStudentKey(row) {
        return `${row['NOME']}-${row['CPF']}`;
    }

    /**
     * Create initial student record
     */
    createStudentRecord(row) {
        return {
            nome: row['NOME'] || '',
            cpf: this.maskCPF(row['CPF'] || ''),
            cpfRaw: row['CPF'] || '',
            inscricao: row['Nº INSCRIÇÃO'] || '',
            status: row['STATUS DA INSCRIÇÃO'] || Config.STATUS.INSCRITO,
            municipio: this.extractMunicipio(row['MUNICÍPIO'] || ''),
            turma: row['TURMA'] || '',
            email: row['E-MAIL'] || '',
            educador: row['EDUCADOR(A)'] || '',
            encontros: {}
        };
    }

    /**
     * Update student with encontro data
     */
    updateStudentEncontro(student, row) {
        const encontroNum = this.normalizeEncontroNum(row['Nº ENCONTRO'] || '1º');
        
        if (!student.encontros[encontroNum]) {
            student.encontros[encontroNum] = {
                data: row['DATA DO ENCONTRO'] || '',
                periodo1: row['1º TURNO'] || '',
                periodo2: row['2º TURNO'] || '',
                observacoes: row['OBSERVAÇÕES'] || ''
            };
        }
    }

    /**
     * Normalize encontro number (1º -> 1)
     */
    normalizeEncontroNum(encontro) {
        return parseInt(encontro.replace('º', '')) || 1;
    }

    /**
     * Extract municipality from full address
     */
    extractMunicipio(municipio) {
        if (!municipio) return '';
        if (municipio.includes(',')) {
            return municipio.split(',')[0].trim();
        }
        return municipio.trim();
    }

    /**
     * Mask CPF for display
     */
    maskCPF(cpf) {
        if (!cpf || cpf.length < 4) return cpf;
        return `***.${cpf.slice(-4)}`;
    }

    /**
     * Friendly labels for certification codes.
     * Used for table display & user-facing filters.
     */
    getCertificationLabel(code) {
        const labels = {
            [Config.CERTIFICACAO.APTO]: 'Apto',
            [Config.CERTIFICACAO.NAO_PODE_FALTAR]: 'Não pode faltar',
            [Config.CERTIFICACAO.SEM_POSSIBILIDADE]: 'Sem possibilidade'
        };
        return labels[code] || code || '';
    }

    /**
     * Safely parse a number from various input types (string, number, null).
     * Returns NaN if value is not a valid number, never throws.
     */
    safeParseInt(value, defaultValue = 0) {
        if (value === null || value === undefined || value === '') return defaultValue;
        const n = parseInt(value, 10);
        return Number.isFinite(n) ? n : defaultValue;
    }

    /**
     * Safely parse a float with similar guarantees.
     */
    safeParseFloat(value, defaultValue = 0) {
        if (value === null || value === undefined || value === '') return defaultValue;
        // Brazilian format: "1.234,56" or "33,5%"
        let normalized = String(value).replace(/[^\d,.-]/g, '').replace('.', '').replace(',', '.');
        const n = parseFloat(normalized);
        return Number.isFinite(n) ? n : defaultValue;
    }

    /**
     * Calculate student statistics.
     *
     * REGRAS DE NEGÓCIO:
     * 1. Atestados médicos e dispensações contam como PRESENÇA
     *    (não afetam negativamente a frequência).
     * 2. Cursistas SEM registro no 1º Encontro presencial são
     *    automaticamente considerados como DISPENSA (2 presenças
     *    + 2 justificados adicionais).
     *
     * Ambos os casos são rastreados em `justificados` para fins de auditoria.
     */
    calculateStudentStats(student) {
        const periods = [];
        let presencas = 0;
        let faltas = 0;
        let justificados = 0;

        // Regra: Verifica se existe registro do 1º Encontro presencial
        const temRegistroEncontro1 = !!student.encontros[1];

        const isValidPresence = (status) => {
            if (!status) return false;
            const s = String(status).toUpperCase();
            return s === 'PRESENTE'
                || s.includes('ATESTADO')
                || s.includes('DISPENSA')
                || s.includes('DISPENSADO');
        };

        for (let i = 1; i <= Config.COURSE.TOTAL_PERIODOS; i++) {
            const encontro = Math.ceil(i / 2);
            const periodo = (i % 2) || 2;
            const encontroData = student.encontros[encontro];

            if (encontroData) {
                const status = (periodo === 1 ? encontroData.periodo1 : encontroData.periodo2) || '';
                periods.push(status);

                if (isValidPresence(status)) {
                    presencas++;
                    if (typeof status === 'string' && (status.includes('ATESTADO') || status.includes('DISPENSA'))) {
                        justificados++;
                    }
                } else if (status === Config.STATUS.AUSENTE) {
                    faltas++;
                }
            } else {
                periods.push('');
            }
        }

        // REGRA DE NEGÓCIO: cursistas sem registro no 1º Encontro presencial
        // são automaticamente considerados como DISPENSA.
        if (!temRegistroEncontro1) {
            // Substitui os 2 primeiros períodos (E1-P1 e E1-P2) por DISPENSA
            periods[0] = 'DISPENSA';
            periods[1] = 'DISPENSA';
            presencas += 2;
            justificados += 2;
        }

        // Taxa baseada em presenças efetivas (PRESENTE + atestados + dispensas)
        // sobre o total de períodos do curso (10)
        const totalPeriodos = Config.COURSE.TOTAL_PERIODOS;
        const taxaPresenca = totalPeriodos > 0
            ? (presencas / totalPeriodos * 100)
            : 0;

        const certCode = this.calculateCertificationStatus(presencas, faltas, totalPeriodos);

        return {
            ...student,
            presencas,
            faltas,
            justificados,
            totalPeriodos,
            taxaPresenca: taxaPresenca.toFixed(1),
            periods,
            totalEncontros: Object.keys(student.encontros).length,
            encontro1Dispensado: !temRegistroEncontro1, // flag para rastreamento
            certificacao: this.getCertificationLabel(certCode),
            certificacaoCode: certCode
        };
    }

    /**
     * Calculate certification eligibility status.
     *
     * REGRA: atestados e dispensações contam como presença (já estão
     * incluídos em `presencas` no calculateStudentStats). Aqui classificamos
     * baseado em presenças efetivas e faltas reais.
     *
     * Categorization — 10 periods total, 75% threshold (need ≥ 8 effective presences):
     *  - APTO:              já atingiu o critério de 75% (≥ 8 presenças) com ≤ 1 falta real.
     *  - NAO_PODE_FALTAR:   2 ou 3 faltas registradas (zona crítica), OU ≤ 1 falta
     *                       mas ainda não atingiu 8 presenças.
     *  - SEM_POSSIBILIDADE: ≥ 4 faltas, OU matematicamente impossível atingir
     *                       8 presenças mesmo comparecendo aos períodos restantes.
     */
    calculateCertificationStatus(presencas, faltas, totalPeriodos = Config.COURSE.TOTAL_PERIODOS) {
        const minimoParaCertificar = Math.ceil(totalPeriodos * (Config.COURSE.MINIMUM_ATTENDANCE / 100));

        // 1) SEM_POSSIBILIDADE — 4+ faltas registradas
        if (faltas >= 4) {
            return Config.CERTIFICACAO.SEM_POSSIBILIDADE;
        }

        // 2) NAO_PODE_FALTAR — 2 ou 3 faltas registradas (zona crítica)
        if (faltas >= 2) {
            return Config.CERTIFICACAO.NAO_PODE_FALTAR;
        }

        // 3) APTO — já atingiu o critério de 75% com ≤ 1 falta real
        if (presencas >= minimoParaCertificar) {
            return Config.CERTIFICACAO.APTO;
        }

        // 4) NAO_PODE_FALTAR — ≤ 1 falta mas ainda não atingiu 8 presenças
        //    (precisa comparecer aos próximos encontros)
        return Config.CERTIFICACAO.NAO_PODE_FALTAR;
    }

    /**
     * Apply current filters
     */
    applyFilters() {
        this.filteredData = this.processedData.filter(student => {
            if (this.filters.municipio && student.municipio !== this.filters.municipio) {
                return false;
            }
            if (this.filters.turma && student.turma !== this.filters.turma) {
                return false;
            }
            if (this.filters.educador && student.educador !== this.filters.educador) {
                return false;
            }
            if (this.filters.status && student.status !== this.filters.status) {
                return false;
            }
            return true;
        });
    }

    /**
     * Set filter and reapply
     */
    setFilter(key, value) {
        this.filters[key] = value;
        this.applyFilters();
        this.notify();
    }

    /**
     * Reset all filters
     */
    resetFilters() {
        this.filters = {
            municipio: '',
            turma: '',
            educador: '',
            status: ''
        };
        this.applyFilters();
        this.notify();
    }

    /**
     * Get unique values for filter options.
     * Aceita filtros contextuais para popular dropdowns em cascata.
     *
     * @param {Object} context - Filtros ativos { educador, turma }
     * @returns {Object} { municipios, turmas, educadores }
     */
    getFilterOptions(context = {}) {
        let baseData = this.processedData;
        if (context.educador) {
            baseData = baseData.filter(d => d.educador === context.educador);
        }
        if (context.turma) {
            baseData = baseData.filter(d => d.turma === context.turma);
        }

        const unique = (arr) => [...new Set(arr)].filter(Boolean).sort();

        return {
            municipios: unique(this.processedData.map(d => d.municipio)),
            turmas: unique(baseData.map(d => d.turma)),
            educadores: unique(this.processedData.map(d => d.educador))
        };
    }

    /**
     * Get turmas filtered by educador (for cascade filter)
     */
    getTurmasByEducador(educador) {
        if (!educador) {
            return [...new Set(this.processedData.map(d => d.turma))].filter(Boolean).sort();
        }
        return [...new Set(
            this.processedData
                .filter(d => d.educador === educador)
                .map(d => d.turma)
        )].filter(Boolean).sort();
    }

    /**
     * Get educadores filtered by turma (for cascade filter)
     */
    getEducadoresByTurma(turma) {
        if (!turma) {
            return [...new Set(this.processedData.map(d => d.educador))].filter(Boolean).sort();
        }
        return [...new Set(
            this.processedData
                .filter(d => d.turma === turma)
                .map(d => d.educador)
        )].filter(Boolean).sort();
    }

    /**
     * Calculate global statistics (baseado em filteredData, respeitando filtros do topo)
     */
    getStats() {
        return this._computeStatsFromData(this.filteredData);
    }

    /**
     * Calculate statistics per period.
     * Atestados e dispensações contam como presença.
     */
    getPeriodStats() {
        const stats = [];

        const isValidPresence = (status) => {
            if (!status) return false;
            const s = String(status).toUpperCase();
            return s === 'PRESENTE'
                || s.includes('ATESTADO')
                || s.includes('DISPENSA')
                || s.includes('DISPENSADO');
        };

        for (let i = 1; i <= Config.COURSE.TOTAL_PERIODOS; i++) {
            const encontro = Math.ceil(i / 2);
            const periodo = (i % 2) || 2;

            let presencas = 0;
            let faltas = 0;
            let justificados = 0;

            this.filteredData.forEach(d => {
                const status = d.periods[i - 1];
                if (isValidPresence(status)) {
                    presencas++;
                    if (typeof status === 'string' && (status.includes('ATESTADO') || status.includes('DISPENSA'))) {
                        justificados++;
                    }
                } else if (status === Config.STATUS.AUSENTE) {
                    faltas++;
                }
            });

            const total = presencas + faltas;
            const taxa = total > 0 ? ((presencas / total) * 100).toFixed(0) : 0;

            stats.push({
                label: `E${encontro}-P${periodo}`,
                encontro,
                periodo,
                presencas,
                faltas,
                justificados,
                total,
                taxa
            });
        }

        return stats;
    }

    /**
     * Get attendance data for charts.
     * Atestados e dispensações contam como presença.
     */
    getAttendanceChartData() {
        const labels = [];
        const presencasData = [];
        const faltasData = [];

        const isValidPresence = (status) => {
            if (!status) return false;
            const s = String(status).toUpperCase();
            return s === 'PRESENTE'
                || s.includes('ATESTADO')
                || s.includes('DISPENSA')
                || s.includes('DISPENSADO');
        };

        for (let e = 1; e <= Config.COURSE.TOTAL_ENCONTROS; e++) {
            labels.push(`Encontro ${e}`);

            let p = 0, f = 0;
            this.filteredData.forEach(d => {
                const periodA = d.periods[(e-1)*2];
                const periodB = d.periods[(e-1)*2 + 1];
                if (isValidPresence(periodA)) p++;
                else if (periodA === Config.STATUS.AUSENTE) f++;
                if (isValidPresence(periodB)) p++;
                else if (periodB === Config.STATUS.AUSENTE) f++;
            });

            presencasData.push(p);
            faltasData.push(f);
        }

        return {
            labels,
            datasets: [
                {
                    label: 'Presenças (incl. atestados/dispensas)',
                    data: presencasData,
                    backgroundColor: this.createGradientFn('rgba(0, 208, 132, 0.85)', 'rgba(74, 234, 176, 0.65)'),
                    borderRadius: 8,
                    borderSkipped: false,
                    maxBarThickness: 48
                },
                {
                    label: 'Faltas',
                    data: faltasData,
                    backgroundColor: this.createGradientFn('rgba(254, 45, 45, 0.85)', 'rgba(254, 45, 45, 0.55)'),
                    borderRadius: 8,
                    borderSkipped: false,
                    maxBarThickness: 48
                }
            ]
        };
    }

    /**
     * Helper: create a gradient fill for a chart bar/segment.
     * Stored as a function so Chart.js can resolve it per-element.
     */
    createGradientFn(colorTop, colorBottom) {
        return (ctx) => {
            const chart = ctx.chart;
            const { ctx: c, chartArea } = chart;
            if (!chartArea) return colorTop;
            const gradient = c.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
            gradient.addColorStop(0, colorBottom);
            gradient.addColorStop(1, colorTop);
            return gradient;
        };
    }

    /**
     * Get status distribution for charts (Inscrito vs Desistente)
     */
    getStatusChartData() {
        const counts = { [Config.STATUS.INSCRITO]: 0, [Config.STATUS.DESISTENTE]: 0 };

        this.filteredData.forEach(d => {
            if (counts.hasOwnProperty(d.status)) {
                counts[d.status]++;
            }
        });

        return {
            labels: ['Inscritos', 'Desistentes'],
            datasets: [{
                data: [counts[Config.STATUS.INSCRITO], counts[Config.STATUS.DESISTENTE]],
                backgroundColor: ['#00BAD6', '#FE2D2D'],
                borderWidth: 0,
                hoverOffset: 8
            }]
        };
    }

    /**
     * Get certification eligibility distribution for charts.
     * Usa a mesma lógica dos cards (contagem direta de faltas),
     * garantindo coerência entre o card, o filtro e o gráfico.
     */
    getCertificacaoChartData() {
        const aptoLabel = this.getCertificationLabel(Config.CERTIFICACAO.APTO);
        const alertaLabel = this.getCertificationLabel(Config.CERTIFICACAO.NAO_PODE_FALTAR);
        const bloqueadoLabel = this.getCertificationLabel(Config.CERTIFICACAO.SEM_POSSIBILIDADE);

        const counts = {
            [aptoLabel]: 0,
            [alertaLabel]: 0,
            [bloqueadoLabel]: 0
        };

        this.filteredData.forEach(d => {
            const faltas = d.faltas || 0;
            if (faltas <= 3) counts[aptoLabel]++;
            else counts[bloqueadoLabel]++;

            if (faltas === 2 || faltas === 3) counts[alertaLabel]++;
        });

        return {
            labels: [aptoLabel, alertaLabel, bloqueadoLabel],
            datasets: [{
                data: [counts[aptoLabel], counts[alertaLabel], counts[bloqueadoLabel]],
                backgroundColor: ['#00D084', '#FFB800', '#FE2D2D'],
                borderWidth: 0,
                hoverOffset: 8
            }]
        };
    }

    /**
     * Get turma distribution for charts
     */
    getTurmasChartData() {
        const counts = {};
        this.filteredData.forEach(d => {
            counts[d.turma] = (counts[d.turma] || 0) + 1;
        });

        const sorted = Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);

        // Use color palette for multi-bar
        const palette = Config.CHARTS.PALETTE;
        return {
            labels: sorted.map(s => s[0].substring(0, 20)),
            datasets: [{
                label: 'Cursistas',
                data: sorted.map(s => s[1]),
                backgroundColor: sorted.map((_, i) => palette[i % palette.length]),
                borderRadius: 6,
                borderSkipped: false,
                maxBarThickness: 32
            }]
        };
    }

    /**
     * Get educadores distribution for charts
     */
    getEducadoresChartData() {
        const counts = {};
        this.filteredData.forEach(d => {
            counts[d.educador] = (counts[d.educador] || 0) + 1;
        });

        const sorted = Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);

        const palette = Config.CHARTS.PALETTE;
        return {
            labels: sorted.map(s => s[0].substring(0, 25)),
            datasets: [{
                label: 'Cursistas',
                data: sorted.map(s => s[1]),
                backgroundColor: sorted.map((_, i) => palette[i % palette.length]),
                borderRadius: 6,
                borderSkipped: false,
                maxBarThickness: 32
            }]
        };
    }

    /**
     * Format period status for display
     */
    formatPeriodStatus(status) {
        if (!status) return { class: 'secondary', text: '-', abbrev: '' };
        if (status === Config.STATUS.PRESENTE) return { class: 'presente', text: 'Presente', abbrev: 'P' };
        if (status.includes('ATESTADO')) return { class: 'justificado', text: 'Justificado', abbrev: 'J' };
        return { class: 'ausente', text: 'Ausente', abbrev: 'F' };
    }

    /**
     * Get percentage color class
     */
    getPercentageColor(percentage) {
        const num = parseFloat(percentage);
        if (num >= 75) return 'success';
        if (num >= 50) return 'warning';
        return 'danger';
    }
}

// Create singleton instance
const dataProcessor = new DataProcessor();

export default dataProcessor;
