// ============================================
// api.js  –  Integração frontend ↔ Backend
// Inclua este arquivo no index.html com:
//   <script src="api.js"></script>
// ANTES do bloco <script> principal
// ============================================

// URL base da sua API (ajuste conforme o ambiente)
const API_BASE = "https://economiza-backend.onrender.com/api";

// ────────────────────────────────────────────
// Utilitário interno de requisição
// ────────────────────────────────────────────
async function _req(method, path, body) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);

  try {
    const res = await fetch(`${API_BASE}${path}`, opts);
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || "Erro desconhecido na API");
    return json;
  } catch (err) {
    console.warn(`[API] ${method} ${path} →`, err.message);
    throw err;
  }
}

// ============================================
// REPORTES — integração com GitHub via backend
// ============================================

/**
 * Envia um reporte de preço para o servidor (salvo no GitHub).
 * Substitui salvarReportesLocal() quando o backend está disponível.
 *
 * @param {{ produto: string, mercado: string, preco: number }} dados
 */
async function reportarPrecoAPI(dados) {
  return await _req("POST", "/reportes", dados);
}

/**
 * Carrega todos os reportes da comunidade (vindos do GitHub).
 * Use no lugar (ou em adição) ao localStorage.
 *
 * @param {{ mercado?, produto?, dias? }} filtros  (opcionais)
 * @returns {Array}  lista de reportes
 */
async function carregarReportesAPI(filtros = {}) {
  const params = new URLSearchParams();
  if (filtros.mercado) params.set("mercado", filtros.mercado);
  if (filtros.produto) params.set("produto", filtros.produto);
  if (filtros.dias) params.set("dias", filtros.dias);

  const query = params.toString() ? `?${params}` : "";
  const json = await _req("GET", `/reportes${query}`);
  return json.reportes;
}

/**
 * Remove um reporte pelo ID (somente admin / uso interno).
 *
 * @param {string} id
 */
async function removerReporteAPI(id) {
  return await _req("DELETE", `/reportes/${id}`);
}

// ============================================
// LISTA DE COMPRAS — sincronização via GitHub
// ============================================

/**
 * Salva a lista de compras atual no GitHub.
 * Use um slug identificador único (ex: "lista-pedro").
 *
 * @param {string} slug    identificador da lista
 * @param {Array}  itens   array de itens da listaCompras
 * @param {number} economia valor economizado
 */
async function salvarListaAPI(slug, itens, economia = 0) {
  const total = itens.reduce((s, i) => s + i.preco, 0);
  return await _req("PUT", `/lista/${slug}`, { itens, total, economia });
}

/**
 * Recupera uma lista de compras salva no GitHub.
 *
 * @param {string} slug
 * @returns {{ itens, total, economia, atualizadoEm }}
 */
async function carregarListaAPI(slug) {
  const json = await _req("GET", `/lista/${slug}`);
  return json.lista;
}

// ============================================
// INTEGRAÇÃO COM O APP EXISTENTE
// (cole este bloco no final do DOMContentLoaded)
// ============================================

/**
 * Inicializa a sincronização com a API remota.
 * Mescla reportes remotos com os locais (localStorage).
 *
 * Chame dentro do DOMContentLoaded, após carregarReportes():
 *
 *   await sincronizarComAPI();
 */
async function sincronizarComAPI() {
  try {
    // 1. Carrega reportes remotos (últimos 30 dias)
    const remotos = await carregarReportesAPI({ dias: 30 });

    if (remotos && remotos.length > 0) {
      // Mescla: mantém locais + adiciona remotos que não existam localmente
      const idsLocais = new Set(reportesUsuarios.map((r) => r.id || r.produto + r.mercado));

      remotos.forEach((r) => {
        const chave = r.id || r.produto + r.mercado;
        if (!idsLocais.has(chave)) {
          reportesUsuarios.push(r);
        }
      });

      salvarReportes(); // persiste no localStorage também
      construirBancoDados();
      atualizarIndicador();
      console.log(`[API] ${remotos.length} reportes remotos carregados.`);
    }
  } catch (err) {
    // Falha silenciosa: o app continua com dados locais
    console.warn("[API] Sincronização com servidor falhou. Usando dados locais.", err.message);
  }
}

/**
 * Versão aprimorada de enviarReporte() que também salva no GitHub.
 * Substitua a chamada de enviarReporte() no HTML por enviarReporteComAPI().
 */
async function enviarReporteComAPI() {
  const pr = document.getElementById("reporteProduto").value;
  const me = document.getElementById("reporteMercado").value;
  const pc = parseFloat(document.getElementById("reportePreco").value);

  if (!pr || !me || !pc || pc <= 0) {
    showToast("⚠️ Preencha todos os campos!");
    return;
  }

  // Salva localmente (comportamento original)
  reportesUsuarios.push({
    id: Date.now().toString(36),
    produto: pr,
    mercado: me,
    preco: pc,
    data: new Date().toISOString(),
    usuario: "anonimo",
  });

  if (reportesUsuarios.length > 100) reportesUsuarios = reportesUsuarios.slice(-100);
  salvarReportes();
  construirBancoDados();
  atualizarIndicador();
  fecharModalReporte();

  if (document.getElementById("search").value.trim()) buscar();
  showToast("✅ Preço reportado!");

  // Tenta salvar no GitHub em segundo plano
  try {
    await reportarPrecoAPI({ produto: pr, mercado: me, preco: pc });
    console.log("[API] Reporte enviado ao GitHub com sucesso.");
  } catch (err) {
    console.warn("[API] Não foi possível salvar reporte remotamente:", err.message);
  }
}
