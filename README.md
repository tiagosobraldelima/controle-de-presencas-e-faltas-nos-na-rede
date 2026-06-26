# Controle de Presenças e Faltas — Projeto Nós na Rede

Dashboard de monitoramento de presenças e certificação desenvolvido para o **Projeto Nós na Rede** da Fiocruz Brasília, no âmbito do Programa de Formação de Cuidadores.

![Status](https://img.shields.io/badge/status-ativo-success)
![Licença](https://img.shields.io/badge/licen%C3%A7a-MIT-blue)
![Python](https://img.shields.io/badge/Python-3.x-3776AB?logo=python&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?logo=javascript&logoColor=black)

---

## 📋 Sobre o Projeto

O **Projeto Nós na Rede** é uma iniciativa do Ministério da Saúde, conduzida pela Fiocruz Brasília, que oferece formação para cuidadores em saúde mental. O curso tem carga horária de **120 horas** (90h EAD + 30h presencial), distribuídas em **5 encontros presenciais** (10 períodos de 2 turnos cada).

Este dashboard foi desenvolvido para acompanhar:
- **Frequência** dos cursistas em cada encontro presencial
- **Status de certificação** baseado nos critérios de presença
- **Análise por município, turma e educador**
- **Geração de relatórios** para prestação de contas

---

## ✨ Funcionalidades

### Cards e Estatísticas
- **Total de Inscritos**, **Presenças**, **Faltas**, **Taxa de Presença**
- **Situação para Certificação**: Aptos / Não Podem Faltar / Sem Possibilidade
- **Cobertura**: Municípios, Turmas, Educadores, Desistentes
- Cards reativos com **badge "Filtrado"**, **delta comparativo** e **animações**

### Filtros Inteligentes (Cascata)
- Filtro por Município, Turma, Educador(a), Status
- **Cascata automática**: selecionar Educador restringe Turmas (e vice-versa)
- Auto-aplicação ao mudar qualquer filtro
- Banner visual indica quantos filtros estão ativos
- Botão "Limpar Filtros" com scroll suave

### Regras de Negócio Implementadas
- ✅ Atestados médicos contam como **presença**
- ✅ Dispensas contam como **presença**
- ✅ Cursistas sem registro no 1º Encontro recebem **DISPENSA automática** (2 períodos)
- ✅ Cálculo de certificação: **75% de frequência mínima** (≥ 8 presenças em 10)
- ✅ Categorização: Apto (≥8 pres + ≤1 falta), Não Pode Faltar (2-3 faltas), Sem Possibilidade (≥4 faltas)

### Tabela Interativa
- **Filtros por coluna** (texto para Nome/CPF, dropdown para categóricas)
- Paginação configurável (10, 25, 50, 100, Todos)
- Indicador de filtros ativos + botão de limpeza
- Legenda com esquema de cores

### Gráficos (Chart.js)
- **Presença por Encontro** (com gradientes e cores oficiais)
- **Situação para Certificação** (doughnut)
- **Status dos Inscritos** (doughnut)
- **Distribuição por Turma/Educador** (barras horizontais)
- **Resumo Geral** consolidado (tiles com mini-ícones)

### Exportações
- **Copiar** (TSV formatado para Excel/Sheets)
- **Excel (.xlsx)** com cabeçalho estilizado e logo
- **CSV** com metadados de filtros aplicados
- **PDF** com logo do projeto e formatação institucional

---

## 🚀 Tecnologias

### Frontend
- **HTML5** + **CSS3** (variáveis CSS, animações, grid/flexbox)
- **JavaScript ES6+** (módulos nativos, sem build)
- **Bootstrap 5.3** (CDN)
- **DataTables** (paginação, filtros, ordenação)
- **Chart.js** (gráficos responsivos)
- **Select2** (selects com busca)
- **Font Awesome 6** (ícones)
- **Google Fonts** (Archivo + Open Sans — alinhado com a página oficial)

### Backend
- **Python 3** (servidor HTTP nativo + `http.server`)
- Resolve problemas de CORS ao buscar dados do Google Sheets
- **Proxy seguro** com whitelist de hosts (anti-SSRF)
- **Validação SSL rigorosa** + path traversal prevention
- CSV injection prevenido em exports

### Dados
- **Google Sheets** (CSV publicado) como fonte primária
- Processamento 100% client-side após fetch

---

## 📦 Estrutura do Projeto

```
nos-na-rede-dashboard/
├── index.html                 # Página principal
├── server.py                  # Servidor Python (CORS proxy)
├── README.md                  # Este arquivo
├── .gitignore                 # Arquivos ignorados pelo git
│
├── css/
│   └── styles.css             # Estilos do dashboard
│
├── js/                        # Módulos ES6
│   ├── config.js              # Configurações centralizadas
│   ├── api.js                 # Cliente HTTP com retry + cache
│   ├── data-processor.js      # Lógica de negócio
│   ├── ui.js                  # Gerenciamento de DOM + gráficos
│   └── app.js                 # Orquestrador principal
│
└── images/
    ├── logo.png               # Logo do projeto Nós na Rede
    └── regua-assinatura.png   # Régua de logos institucionais
```

---

## 🌐 Acesso Web (Deploy)

O dashboard detecta automaticamente o ambiente e se adapta:

| Ambiente | Modo | Funcionamento |
|---|---|---|
| `localhost` / `127.0.0.1` | `proxy` | Usa `server.py` (CORS proxy local) |
| GitHub Pages, Netlify, Vercel, etc. | `static` | Fetch direto do Google Sheets (CORS liberado) |
| `file://` | `static` | Fetch direto + fallback para proxies CORS públicos |

### 🌐 Demo online (GitHub Pages)

**URL:** https://tiagosobraldelima.github.io/controle-de-presencas-e-faltas-nos-na-rede/

Não requer servidor — os dados são carregados diretamente do Google Sheets público. Funciona em qualquer dispositivo com navegador moderno.

---

## 🛠️ Instalação Local

### Pré-requisitos
- Python 3.7+ (apenas para o servidor proxy local)
- Navegador moderno (Chrome, Firefox, Safari, Edge)
- Acesso à planilha Google Sheets pública do projeto

### 1. Clone o repositório
```bash
git clone https://github.com/tiagosobraldelima/controle-de-presencas-e-faltas-nos-na-rede.git
cd controle-de-presencas-e-faltas-nos-na-rede
```

### 2. Inicie o servidor Python (opcional)
```bash
python3 server.py
```

O servidor tentará as portas 8000, 8001, 8080 e 8888 automaticamente.

### 3. Acesse no navegador
```
http://localhost:8000
```

> **Dica:** Se você só quer visualizar os dados, abra `index.html` diretamente no navegador ou hospede o repositório em qualquer serviço de static hosting (GitHub Pages, Netlify, Vercel, Cloudflare Pages). O modo `static` cuida do resto.

---

## ⚙️ Configuração

### Fonte de Dados (Google Sheets)

Edite a constante `GOOGLE_SHEET_CSV_URL` em `server.py`:

```python
GOOGLE_SHEET_CSV_URL = (
    'https://docs.google.com/spreadsheets/d/e/2PACX-1vQoGnE2RG9yDysuCwJubfxoJcbbdC8yfeguHrKOXwxyiIGAKxy71hvp8Uow4-3gucHLQlBOqp24NdaU/'
    'pub?gid=1700106572&single=true&output=csv'
)
```

### Configurações do Curso

Edite `js/config.js`:

```javascript
COURSE: {
    TOTAL_ENCONTROS: 5,
    TOTAL_PERIODOS: 10,
    MINIMUM_ATTENDANCE: 75, // % mínima para certificação
}
```

---

## 🔒 Segurança

Este projeto implementa várias camadas de segurança:

- **SSL verification** rigorosa (certificados válidos)
- **Path traversal** prevenido via canonicalização
- **SSRF prevention** via whitelist de hosts no proxy
- **XSS prevention** via DOM API + textContent
- **CSV Injection prevention** em exports (Excel/CSV/TSV)
- **Memory leak** prevenido com eviction de cache
- **Retry com backoff exponencial** para resiliência

> **Importante:** Este projeto lida com dados de cursistas reais. NUNCA commite dados de produção. Use sempre a planilha pública do Google Sheets configurada em `server.py`.

---

## 📐 Identidade Visual

O dashboard segue rigorosamente a identidade visual da página oficial do Projeto Nós na Rede:

- **Cores oficiais:** Rosa `#FF6B9B`, Ciano `#00BAD6`, Amarelo `#FFB800`
- **Tipografia:** Archivo (títulos, peso 800/900) + Open Sans (corpo)
- **Logo e régua de assinaturas** oficiais do projeto

---

## 🤝 Contribuindo

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/MinhaFeature`)
3. Commit suas mudanças (`git commit -m 'Adiciona MinhaFeature'`)
4. Push para a branch (`git push origin feature/MinhaFeature`)
5. Abra um Pull Request

---

## 🚀 Deploy em Produção

### GitHub Pages (recomendado — grátis, rápido)

1. Faça push do código para um repositório GitHub
2. Vá em **Settings → Pages**
3. Em **Source**, selecione o branch `main` e pasta `/ (root)`
4. Aguarde ~1 minuto para o build
5. Acesse: `https://SEU_USUARIO.github.io/NOME_DO_REPO/`

A detecção de hosting estático é automática. Não requer configuração adicional.

### Via CLI
```bash
gh api -X POST "/repos/SEU_USUARIO/NOME_DO_REPO/pages" \
    -f "source[branch]=main" -f "source[path]=/"
```

### Netlify / Vercel / Cloudflare Pages
Basta importar o repositório — o dashboard detecta automaticamente que está em hosting estático.

### Customização para outros dados

Edite `js/config.js` para apontar para sua própria planilha Google Sheets:

```javascript
API: {
    MODE: 'auto',  // 'auto' | 'static' | 'proxy'
    CSV_URL: 'https://docs.google.com/spreadsheets/d/SEU_DOC_ID/pub?gid=0&single=true&output=csv',
}
```

A planilha precisa estar **publicada na web** (Arquivo → Compartilhar → Publicar na web → CSV).

---

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo `LICENSE` para mais detalhes.

---

## 🏛️ Créditos

**Projeto Nós na Rede** — Fiocruz Brasília / Ministério da Saúde
- Site oficial: https://brasilia.fiocruz.br/nosnarede/
- Programa: Formação de cuidadores em saúde mental

**Dashboard desenvolvido** para acompanhamento e certificação de cursistas.

---

<p align="center">
  Feito com 💜 para a saúde mental brasileira
</p>