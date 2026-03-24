import { initializeApp } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-app.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.4.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDR5LfYXB0KV63MDsiW_E5z8TemwlSfTGA",
  authDomain: "camposworkbench.firebaseapp.com",
  projectId: "camposworkbench",
  storageBucket: "camposworkbench.firebasestorage.app",
  messagingSenderId: "588651522200",
  appId: "1:588651522200:web:80b95c0c44b4edc95888ed",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const state = {
  emprestimos: [],
  equipamentos: [],
  funcionarios: [],
  sortBy: "dataEmprestimo",
  sortDirection: "desc",
  currentPage: 1,
  perPage: 10,
};

const $ = (id) => document.getElementById(id);

function showLoading(show) { $("loading").classList.toggle("hidden", !show); }
function toast(message, type = "success") {
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  $("toastContainer").appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

function formatDateBR(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("pt-BR");
}

function getStatus(record) { return record.devolvida ? "devolvida" : "pendente"; }
function normalizeText(text = "") { return text.toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }

function openConfirm({ title, text, onConfirm }) {
  $("confirmTitle").textContent = title;
  $("confirmText").textContent = text;
  $("confirmModal").classList.remove("hidden");

  const ok = () => {
    onConfirm?.();
    cleanup();
  };
  const cancel = () => cleanup();
  const cleanup = () => {
    $("confirmModal").classList.add("hidden");
    $("confirmOk").removeEventListener("click", ok);
    $("confirmCancel").removeEventListener("click", cancel);
  };

  $("confirmOk").addEventListener("click", ok);
  $("confirmCancel").addEventListener("click", cancel);
}

async function loadCollections() {
  showLoading(true);
  try {
    const [empSnap, eqSnap, fnSnap] = await Promise.all([
      getDocs(collection(db, "emprestimos")),
      getDocs(collection(db, "equipamentos")),
      getDocs(collection(db, "funcionarios")),
    ]);

    state.emprestimos = empSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    state.equipamentos = eqSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    state.funcionarios = fnSnap.docs.map((d) => ({ idDoc: d.id, ...d.data() }));

    if (!state.equipamentos.length || !state.funcionarios.length) {
      await seedIfNeeded();
    }

    renderAll();
  } catch {
    toast("Falha ao carregar dados do Firestore.", "error");
  } finally {
    showLoading(false);
  }
}

async function seedIfNeeded() {
  const equipamentosSeed = [
    { numero: "24000", nome: "Rebarbadora" },
    { numero: "25000", nome: "Aparafusadora" },
    { numero: "23000", nome: "Martelo" },
    { numero: "26000", nome: "Serra Circular" },
    { numero: "27000", nome: "Furadeira" },
  ];

  const funcionariosSeed = [
    { id: "404", nome: "Paulo Campos" },
    { id: "123", nome: "Sergio Ramos" },
    { id: "789", nome: "Carlos Oliveira" },
    { id: "101", nome: "Pereira" },
    { id: "102", nome: "Rafael Costa" },
  ];

  if (!state.equipamentos.length) {
    await Promise.all(equipamentosSeed.map((item) => addDoc(collection(db, "equipamentos"), item)));
  }
  if (!state.funcionarios.length) {
    await Promise.all(funcionariosSeed.map((item) => addDoc(collection(db, "funcionarios"), item)));
  }

  const [eqSnap, fnSnap] = await Promise.all([
    getDocs(collection(db, "equipamentos")),
    getDocs(collection(db, "funcionarios")),
  ]);
  state.equipamentos = eqSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  state.funcionarios = fnSnap.docs.map((d) => ({ idDoc: d.id, ...d.data() }));
}

function getFilteredData() {
  const busca = normalizeText($("busca").value.trim());
  const status = $("filtroStatus").value;
  const funcionario = $("filtroFuncionario").value;
  const inicio = $("filtroDataInicio").value;
  const fim = $("filtroDataFim").value;

  return state.emprestimos
    .filter((e) => {
      const textTarget = normalizeText(`${e.numFerramenta} ${e.nomePessoa} ${e.idPessoa} ${e.nomeEquipamento || ""}`);
      const bySearch = !busca || textTarget.includes(busca);
      const byStatus = status === "todos" || (status === "devolvida" ? e.devolvida : !e.devolvida);
      const byFuncionario = !funcionario || e.idPessoa === funcionario;
      const byInicio = !inicio || e.dataEmprestimo >= inicio;
      const byFim = !fim || e.dataEmprestimo <= fim;
      return bySearch && byStatus && byFuncionario && byInicio && byFim;
    })
    .sort((a, b) => {
      const key = state.sortBy;
      const dir = state.sortDirection === "asc" ? 1 : -1;
      let av = a[key] ?? "";
      let bv = b[key] ?? "";
      if (key === "status") {
        av = a.devolvida ? 1 : 0;
        bv = b.devolvida ? 1 : 0;
      }
      return av > bv ? dir : av < bv ? -dir : 0;
    });
}

function renderEmprestimos() {
  const data = getFilteredData();
  const totalPages = Math.max(1, Math.ceil(data.length / state.perPage));
  state.currentPage = Math.min(state.currentPage, totalPages);
  const start = (state.currentPage - 1) * state.perPage;
  const current = data.slice(start, start + state.perPage);

  $("listaEmprestimos").innerHTML = current
    .map((e) => {
      const isOverdue = !e.devolvida && ((Date.now() - new Date(`${e.dataEmprestimo}T${e.horaEmprestimo || "00:00"}:00`).getTime()) / 86400000) >= 2;
      return `
      <tr class="${isOverdue ? "overdue" : ""}">
        <td>${e.numFerramenta}<br><small>${e.nomeEquipamento || ""}</small></td>
        <td>${formatDateBR(e.dataEmprestimo)} ${e.horaEmprestimo || ""}</td>
        <td>${e.quemEntregou || "-"}</td>
        <td>${e.nomePessoa}</td>
        <td>${e.idPessoa}</td>
        <td><span class="status ${getStatus(e)}">${e.devolvida ? "✅ Devolvida" : "⛔ Pendente"}</span></td>
        <td>${e.dataDevolucao ? `${formatDateBR(e.dataDevolucao)} ${e.horaDevolucao || ""}` : "-"}</td>
        <td>
          ${!e.devolvida ? `<button class="btn btn--primary action-devolver" data-id="${e.id}">Devolver</button>` : ""}
          <button class="btn btn--danger action-excluir" data-id="${e.id}">Excluir</button>
        </td>
      </tr>`;
    })
    .join("");

  $("pageInfo").textContent = `Página ${state.currentPage} de ${totalPages}`;
}

function renderCadastros() {
  $("listaEquipamentos").innerHTML = state.equipamentos.map((e) => `<li><strong>${e.numero}</strong> — ${e.nome}</li>`).join("");
  $("listaFuncionarios").innerHTML = state.funcionarios.map((f) => `<li><strong>${f.id}</strong> — ${f.nome}</li>`).join("");

  $("equipamentosList").innerHTML = state.equipamentos.map((e) => `<option value="${e.numero}">${e.nome}</option>`).join("");
  $("funcionariosList").innerHTML = state.funcionarios.map((f) => `<option value="${f.id}">${f.nome}</option>`).join("");
  $("funcionariosNomeList").innerHTML = state.funcionarios.map((f) => `<option value="${f.nome}">${f.id}</option>`).join("");

  $("filtroFuncionario").innerHTML = `<option value="">Funcionário: Todos</option>${state.funcionarios.map((f) => `<option value="${f.id}">${f.nome} (${f.id})</option>`).join("")}`;
  $("historicoEquipamento").innerHTML = `<option value="">Selecione equipamento</option>${state.equipamentos.map((e) => `<option value="${e.numero}">${e.numero} - ${e.nome}</option>`).join("")}`;
  $("historicoFuncionario").innerHTML = `<option value="">Selecione funcionário</option>${state.funcionarios.map((f) => `<option value="${f.id}">${f.nome} (${f.id})</option>`).join("")}`;
}

function renderKpis() {
  const today = new Date().toISOString().slice(0, 10);
  $("kpiTotalEquip").textContent = state.equipamentos.length;
  $("kpiPendentes").textContent = state.emprestimos.filter((e) => !e.devolvida).length;
  $("kpiDevolvidosHoje").textContent = state.emprestimos.filter((e) => e.devolvida && e.dataDevolucao === today).length;
}

let chartEquip;
let chartFunc;
function renderCharts() {
  const countByEq = {};
  const countByFunc = {};

  state.emprestimos.forEach((e) => {
    countByEq[e.numFerramenta] = (countByEq[e.numFerramenta] || 0) + 1;
    countByFunc[e.idPessoa] = (countByFunc[e.idPessoa] || 0) + 1;
  });

  const eqLabels = Object.keys(countByEq).slice(0, 10);
  const eqData = eqLabels.map((k) => countByEq[k]);
  const fnLabels = Object.keys(countByFunc).slice(0, 10);
  const fnData = fnLabels.map((k) => countByFunc[k]);

  chartEquip?.destroy();
  chartFunc?.destroy();

  chartEquip = new Chart($("chartEquipamentos"), {
    type: "bar",
    data: { labels: eqLabels, datasets: [{ label: "Usos", data: eqData }] },
    options: { responsive: true },
  });

  chartFunc = new Chart($("chartFuncionarios"), {
    type: "bar",
    data: { labels: fnLabels, datasets: [{ label: "Retiradas", data: fnData }] },
    options: { responsive: true },
  });
}

function renderHistoricoEquipamento() {
  const num = $("historicoEquipamento").value;
  const rows = state.emprestimos
    .filter((e) => !num || e.numFerramenta === num)
    .map((e) => `<tr><td>${formatDateBR(e.dataEmprestimo)} ${e.horaEmprestimo || ""}</td><td>${e.nomePessoa}</td><td>${e.devolvida ? "Devolvida" : "Pendente"}</td></tr>`)
    .join("");
  $("historicoEquipamentoBody").innerHTML = rows;
}

function renderHistoricoFuncionario() {
  const id = $("historicoFuncionario").value;
  const rows = state.emprestimos
    .filter((e) => !id || e.idPessoa === id)
    .map((e) => `<tr><td>${e.numFerramenta} - ${e.nomeEquipamento || ""}</td><td>${formatDateBR(e.dataEmprestimo)} ${e.horaEmprestimo || ""}</td><td>${e.devolvida ? "Devolvida" : "Pendente"}</td></tr>`)
    .join("");
  $("historicoFuncionarioBody").innerHTML = rows;
}

function renderAll() {
  renderCadastros();
  renderEmprestimos();
  renderKpis();
  renderCharts();
  renderHistoricoEquipamento();
  renderHistoricoFuncionario();
}

async function registrarEmprestimo(event) {
  event.preventDefault();
  const numFerramenta = $("numFerramenta").value.replace(/\D/g, "");
  const nomeEquipamento = $("nomeEquipamento").value.trim();
  const quemEntregou = $("quemEntregou").value.trim();
  const idPessoa = $("idPessoa").value.trim();
  const nomePessoa = $("nomePessoa").value.trim();
  const dataEmprestimo = $("dataEmprestimo").value;
  const horaEmprestimo = $("horaEmprestimo").value;

  if (!numFerramenta || !nomeEquipamento || !quemEntregou || !idPessoa || !nomePessoa || !dataEmprestimo || !horaEmprestimo) {
    return toast("Preencha todos os campos obrigatórios.", "error");
  }

  const equip = state.equipamentos.find((e) => e.numero === numFerramenta);
  if (!equip) return toast("Equipamento não cadastrado.", "error");

  const duplicado = state.emprestimos.some((e) => e.numFerramenta === numFerramenta && !e.devolvida);
  if (duplicado) return toast("Este equipamento já está emprestado.", "error");

  await addDoc(collection(db, "emprestimos"), {
    numFerramenta,
    nomeEquipamento,
    quemEntregou,
    idPessoa,
    nomePessoa,
    dataEmprestimo,
    horaEmprestimo,
    devolvida: false,
    dataDevolucao: null,
    horaDevolucao: null,
    createdAt: new Date().toISOString(),
  });

  toast("Empréstimo registrado com sucesso.");
  event.target.reset();
  await loadCollections();
}

async function devolverEmprestimo(id) {
  const now = new Date();
  await updateDoc(doc(db, "emprestimos", id), {
    devolvida: true,
    dataDevolucao: now.toISOString().slice(0, 10),
    horaDevolucao: now.toTimeString().slice(0, 5),
  });
  toast("Equipamento devolvido.");
  await loadCollections();
}

async function excluirEmprestimo(id) {
  await deleteDoc(doc(db, "emprestimos", id));
  toast("Registro excluído.");
  await loadCollections();
}

async function salvarEquipamento(event) {
  event.preventDefault();
  const numero = $("equipNumero").value.replace(/\D/g, "");
  const nome = $("equipNome").value.trim();
  if (!numero || !nome) return toast("Informe número e nome do equipamento.", "error");
  if (state.equipamentos.some((e) => e.numero === numero)) return toast("Número já cadastrado.", "error");
  await addDoc(collection(db, "equipamentos"), { numero, nome });
  event.target.reset();
  toast("Equipamento cadastrado com sucesso.");
  await loadCollections();
}

async function salvarFuncionario(event) {
  event.preventDefault();
  const id = $("funcId").value.trim();
  const nome = $("funcNome").value.trim();
  if (!id || !nome) return toast("Informe ID e nome do funcionário.", "error");
  if (state.funcionarios.some((f) => f.id === id)) return toast("ID já cadastrado.", "error");
  await addDoc(collection(db, "funcionarios"), { id, nome });
  event.target.reset();
  toast("Funcionário cadastrado com sucesso.");
  await loadCollections();
}

function hydrateAutoComplete() {
  $("numFerramenta").addEventListener("input", () => {
    $("numFerramenta").value = $("numFerramenta").value.replace(/\D/g, "");
    const equip = state.equipamentos.find((e) => e.numero === $("numFerramenta").value);
    $("nomeEquipamento").value = equip?.nome || "";
  });

  $("idPessoa").addEventListener("input", () => {
    const func = state.funcionarios.find((f) => f.id === $("idPessoa").value.trim());
    if (func) $("nomePessoa").value = func.nome;
  });

  $("nomePessoa").addEventListener("input", () => {
    const func = state.funcionarios.find((f) => normalizeText(f.nome) === normalizeText($("nomePessoa").value.trim()));
    if (func) $("idPessoa").value = func.id;
  });
}

function exportCsv() {
  const rows = getFilteredData();
  const headers = ["Nº Equipamento", "Nome Equipamento", "Data", "Hora", "Entregue por", "Retirado por", "ID", "Status", "Data Devolução", "Hora Devolução"];
  const dataRows = rows.map((e) => [
    e.numFerramenta,
    e.nomeEquipamento || "",
    formatDateBR(e.dataEmprestimo),
    e.horaEmprestimo || "",
    e.quemEntregou,
    e.nomePessoa,
    e.idPessoa,
    e.devolvida ? "Devolvida" : "Pendente",
    e.dataDevolucao ? formatDateBR(e.dataDevolucao) : "-",
    e.horaDevolucao || "-",
  ]);

  const csv = [headers, ...dataRows]
    .map((line) => line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(";"))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `emprestimos_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
}

function bindEvents() {
  document.querySelectorAll(".menu__item").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".menu__item").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
      const view = btn.dataset.view;
      $(`view-${view}`).classList.add("active");
      $("pageTitle").textContent = btn.textContent;
    });
  });

  ["busca", "filtroStatus", "filtroFuncionario", "filtroDataInicio", "filtroDataFim"].forEach((id) => {
    $(id).addEventListener("input", () => {
      state.currentPage = 1;
      renderEmprestimos();
    });
    $(id).addEventListener("change", () => {
      state.currentPage = 1;
      renderEmprestimos();
    });
  });

  $("limparFiltros").addEventListener("click", () => {
    ["busca", "filtroDataInicio", "filtroDataFim"].forEach((id) => ($(id).value = ""));
    $("filtroStatus").value = "todos";
    $("filtroFuncionario").value = "";
    state.currentPage = 1;
    renderEmprestimos();
  });

  document.querySelector("thead").addEventListener("click", (event) => {
    const th = event.target.closest("th[data-sort]");
    if (!th) return;
    const key = th.dataset.sort;
    state.sortDirection = state.sortBy === key && state.sortDirection === "asc" ? "desc" : "asc";
    state.sortBy = key;
    renderEmprestimos();
  });

  $("listaEmprestimos").addEventListener("click", (event) => {
    const devolverBtn = event.target.closest(".action-devolver");
    const excluirBtn = event.target.closest(".action-excluir");

    if (devolverBtn) {
      const id = devolverBtn.dataset.id;
      openConfirm({
        title: "Confirmar devolução",
        text: "Deseja marcar este equipamento como devolvido?",
        onConfirm: () => devolverEmprestimo(id),
      });
    }

    if (excluirBtn) {
      const id = excluirBtn.dataset.id;
      openConfirm({
        title: "Excluir registro",
        text: "Esta ação não pode ser desfeita. Deseja continuar?",
        onConfirm: () => excluirEmprestimo(id),
      });
    }
  });

  $("prevPage").addEventListener("click", () => {
    state.currentPage = Math.max(1, state.currentPage - 1);
    renderEmprestimos();
  });
  $("nextPage").addEventListener("click", () => {
    const totalPages = Math.max(1, Math.ceil(getFilteredData().length / state.perPage));
    state.currentPage = Math.min(totalPages, state.currentPage + 1);
    renderEmprestimos();
  });

  $("formEmprestimo").addEventListener("submit", registrarEmprestimo);
  $("formEquipamento").addEventListener("submit", salvarEquipamento);
  $("formFuncionario").addEventListener("submit", salvarFuncionario);
  $("historicoEquipamento").addEventListener("change", renderHistoricoEquipamento);
  $("historicoFuncionario").addEventListener("change", renderHistoricoFuncionario);
  $("exportCsvBtn").addEventListener("click", exportCsv);

  $("themeToggle").addEventListener("click", () => {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    document.documentElement.setAttribute("data-theme", isDark ? "light" : "dark");
    localStorage.setItem("theme", isDark ? "light" : "dark");
  });
}

function loadTheme() {
  const theme = localStorage.getItem("theme") || "light";
  document.documentElement.setAttribute("data-theme", theme);
}

loadTheme();
bindEvents();
hydrateAutoComplete();
loadCollections();
