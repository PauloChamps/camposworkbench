const equipamentos = [
  { numero: "24000", nome: "Rebarbadora" },
  { numero: "25000", nome: "Aparafusadora" },
];

const funcionarios = [
  { id: "101", nome: "João Silva" },
  { id: "102", nome: "Maria Souza" },
];

let emprestimos = [];

const STORAGE_KEY = "campos_workbench_emprestimos_v1";

const $ = (id) => document.getElementById(id);

const state = {
  sortBy: "dataEmprestimo",
  sortDirection: "desc",
  page: 1,
  perPage: 8,
};

let equipmentChart;
let workerChart;

const formatDateBR = (v) => {
  if (!v) return "-";
  const parsed = new Date(`${v}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? v : parsed.toLocaleDateString("pt-BR");
};

const normalize = (v = "") => v.toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const todayISO = () => new Date().toISOString().slice(0, 10);
const nowTime = () => new Date().toTimeString().slice(0, 5);

function showLoading(show) {
  $("loading").classList.toggle("hidden", !show);
}

function notify(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  $("toastStack").appendChild(toast);
  setTimeout(() => toast.remove(), 2800);
}

function confirmAction({ title, text, onConfirm }) {
  $("confirmTitle").textContent = title;
  $("confirmText").textContent = text;
  $("confirmModal").classList.remove("hidden");

  const cancel = () => cleanup();
  const proceed = () => {
    onConfirm?.();
    cleanup();
  };

  const cleanup = () => {
    $("confirmModal").classList.add("hidden");
    $("confirmCancel").removeEventListener("click", cancel);
    $("confirmOk").removeEventListener("click", proceed);
  };

  $("confirmCancel").addEventListener("click", cancel);
  $("confirmOk").addEventListener("click", proceed);
}

function isOverdue(record) {
  if (record.devolvida) return false;
  const base = new Date(`${record.dataEmprestimo}T${record.horaEmprestimo || "00:00"}:00`).getTime();
  if (Number.isNaN(base)) return false;
  return (Date.now() - base) / 86400000 >= 2;
}

function saveEmprestimos() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(emprestimos));
}

function loadEmprestimos() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    emprestimos = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(emprestimos)) emprestimos = [];
  } catch {
    emprestimos = [];
  }
}

function applyFiltersAndSort() {
  const q = normalize($("busca").value.trim());
  const status = $("filtroStatus").value;
  const func = $("filtroFuncionario").value;
  const start = $("filtroDataInicio").value;
  const end = $("filtroDataFim").value;

  return emprestimos
    .filter((e) => {
      const target = normalize(`${e.numFerramenta} ${e.nomeEquipamento || ""} ${e.nomePessoa} ${e.idPessoa}`);
      const byQ = !q || target.includes(q);
      const byStatus = status === "todos" || (status === "devolvida" ? e.devolvida : !e.devolvida);
      const byFunc = !func || e.idPessoa === func;
      const byStart = !start || e.dataEmprestimo >= start;
      const byEnd = !end || e.dataEmprestimo <= end;
      return byQ && byStatus && byFunc && byStart && byEnd;
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

function renderTable() {
  const all = applyFiltersAndSort();
  const maxPages = Math.max(1, Math.ceil(all.length / state.perPage));
  state.page = Math.min(state.page, maxPages);
  const start = (state.page - 1) * state.perPage;
  const rows = all.slice(start, start + state.perPage);

  $("listaEmprestimos").innerHTML = rows
    .map(
      (r) => `
    <tr class="${isOverdue(r) ? "overdue" : ""}">
      <td>${r.numFerramenta}<br><small>${r.nomeEquipamento || ""}</small></td>
      <td>${formatDateBR(r.dataEmprestimo)} ${r.horaEmprestimo || ""}</td>
      <td>${r.quemEntregou}</td>
      <td>${r.nomePessoa}</td>
      <td>${r.idPessoa}</td>
      <td>
        ${
          r.devolvida
            ? '<span class="badge badge--done">✅ Devolvida</span>'
            : '<span class="badge badge--pending">⛔ Pendente</span>'
        }
      </td>
      <td>${r.dataDevolucao ? `${formatDateBR(r.dataDevolucao)} ${r.horaDevolucao || ""}` : "-"}</td>
      <td>
        ${!r.devolvida ? `<button class="btn btn--primary js-return" data-id="${r.id}">Devolver</button>` : ""}
        <button class="btn btn--danger js-delete" data-id="${r.id}">Excluir</button>
      </td>
    </tr>`,
    )
    .join("");

  $("pageInfo").textContent = `Página ${state.page} de ${maxPages}`;
}

function renderRegisters() {
  $("equipamentosList").innerHTML = equipamentos.map((e) => `<option value="${e.numero}">${e.nome}</option>`).join("");
  $("funcionariosList").innerHTML = funcionarios.map((f) => `<option value="${f.id}">${f.nome}</option>`).join("");
  $("funcionariosNomeList").innerHTML = funcionarios.map((f) => `<option value="${f.nome}">${f.id}</option>`).join("");

  $("filtroFuncionario").innerHTML = `<option value="">Todos funcionários</option>${funcionarios
    .map((f) => `<option value="${f.id}">${f.nome} (${f.id})</option>`)
    .join("")}`;
  $("historicoEquipamento").innerHTML = `<option value="">Selecione equipamento</option>${equipamentos
    .map((e) => `<option value="${e.numero}">${e.numero} - ${e.nome}</option>`)
    .join("")}`;
  $("historicoFuncionario").innerHTML = `<option value="">Selecione funcionário</option>${funcionarios
    .map((f) => `<option value="${f.id}">${f.nome} (${f.id})</option>`)
    .join("")}`;
}

function renderKpis() {
  const pendentes = emprestimos.filter((e) => !e.devolvida).length;
  const devolvidosHoje = emprestimos.filter((e) => e.devolvida && e.dataDevolucao === todayISO()).length;
  const atrasados = emprestimos.filter((e) => isOverdue(e)).length;

  $("kpiTotalEquip").textContent = equipamentos.length;
  $("kpiPendentes").textContent = pendentes;
  $("kpiDevolvidosHoje").textContent = devolvidosHoje;
  $("kpiAtrasados").textContent = atrasados;
}

function renderHistory() {
  const eq = $("historicoEquipamento").value;
  const fn = $("historicoFuncionario").value;

  $("historicoEquipamentoBody").innerHTML = emprestimos
    .filter((e) => !eq || e.numFerramenta === eq)
    .map(
      (e) =>
        `<tr><td>${formatDateBR(e.dataEmprestimo)} ${e.horaEmprestimo || ""}</td><td>${e.nomePessoa}</td><td>${
          e.devolvida ? "Devolvida" : "Pendente"
        }</td></tr>`,
    )
    .join("");

  $("historicoFuncionarioBody").innerHTML = emprestimos
    .filter((e) => !fn || e.idPessoa === fn)
    .map(
      (e) =>
        `<tr><td>${e.numFerramenta} - ${e.nomeEquipamento || ""}</td><td>${formatDateBR(e.dataEmprestimo)} ${
          e.horaEmprestimo || ""
        }</td><td>${e.devolvida ? "Devolvida" : "Pendente"}</td></tr>`,
    )
    .join("");
}

function renderCharts() {
  const eqMap = {};
  const fnMap = {};

  emprestimos.forEach((e) => {
    eqMap[e.numFerramenta] = (eqMap[e.numFerramenta] || 0) + 1;
    fnMap[e.idPessoa] = (fnMap[e.idPessoa] || 0) + 1;
  });

  const eqLabels = Object.keys(eqMap).slice(0, 8);
  const eqData = eqLabels.map((k) => eqMap[k]);
  const fnLabels = Object.keys(fnMap).slice(0, 8);
  const fnData = fnLabels.map((k) => fnMap[k]);

  equipmentChart?.destroy();
  workerChart?.destroy();

  equipmentChart = new Chart($("chartEquipamentos"), {
    type: "bar",
    data: { labels: eqLabels, datasets: [{ label: "Quantidade", data: eqData, backgroundColor: "#2563eb" }] },
    options: { plugins: { legend: { display: false } }, responsive: true },
  });

  workerChart = new Chart($("chartFuncionarios"), {
    type: "doughnut",
    data: { labels: fnLabels, datasets: [{ data: fnData }] },
    options: { responsive: true },
  });
}

function refreshUI() {
  renderRegisters();
  renderKpis();
  renderTable();
  renderHistory();
  renderCharts();
}

function createLoan(event) {
  event.preventDefault();

  const numFerramenta = $("numFerramenta").value.replace(/\D/g, "");
  const quemEntregou = $("quemEntregou").value.trim();
  const idPessoa = $("idPessoa").value.trim();
  const dataEmprestimo = $("dataEmprestimo").value;
  const horaEmprestimo = $("horaEmprestimo").value;

  const equip = equipamentos.find((e) => e.numero === numFerramenta);
  if (!equip) {
    notify("Equipamento não cadastrado.", "error");
    return;
  }

  const func = funcionarios.find((f) => f.id === idPessoa);
  if (!func) {
    notify("Funcionário não cadastrado.", "error");
    return;
  }

  if (!quemEntregou || !dataEmprestimo || !horaEmprestimo) {
    notify("Preencha todos os campos obrigatórios.", "error");
    return;
  }

  if (emprestimos.some((e) => e.numFerramenta === numFerramenta && !e.devolvida)) {
    notify("Equipamento já está emprestado.", "error");
    return;
  }

  const novo = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    numFerramenta,
    nomeEquipamento: equip.nome,
    quemEntregou,
    idPessoa: func.id,
    nomePessoa: func.nome,
    dataEmprestimo,
    horaEmprestimo,
    devolvida: false,
    dataDevolucao: null,
    horaDevolucao: null,
    createdAt: new Date().toISOString(),
  };

  emprestimos.unshift(novo);
  saveEmprestimos();

  event.target.reset();
  $("nomeEquipamento").value = "";
  $("nomePessoa").value = "";
  $("dataEmprestimo").value = todayISO();
  $("horaEmprestimo").value = nowTime();

  notify("Empréstimo registrado com sucesso.");
  refreshUI();
}

function markAsReturned(id) {
  const item = emprestimos.find((e) => e.id === id);
  if (!item) return;

  item.devolvida = true;
  item.dataDevolucao = todayISO();
  item.horaDevolucao = nowTime();

  saveEmprestimos();
  notify("Devolução registrada.");
  refreshUI();
}

function removeLoan(id) {
  emprestimos = emprestimos.filter((e) => e.id !== id);
  saveEmprestimos();
  notify("Registro removido.");
  refreshUI();
}

function exportCsv() {
  const headers = ["Equipamento", "Nome", "Data", "Hora", "Entregue por", "Funcionário", "ID", "Status", "Data devolução", "Hora devolução"];
  const rows = applyFiltersAndSort().map((e) => [
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

  const csv = [headers, ...rows]
    .map((line) => line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(";"))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `emprestimos_filtrados_${todayISO()}.csv`;
  link.click();
}

function bindUI() {
  document.querySelectorAll(".nav__btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".nav__btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
      btn.classList.add("active");
      $(`view-${btn.dataset.view}`).classList.add("active");
      $("pageTitle").textContent = btn.textContent.replace(/[📊🧾📚]\s*/, "");
    });
  });

  $("formEmprestimo").addEventListener("submit", createLoan);

  $("numFerramenta").addEventListener("input", () => {
    $("numFerramenta").value = $("numFerramenta").value.replace(/\D/g, "");
    const numero = $("numFerramenta").value;
    const equip = equipamentos.find((e) => e.numero === numero);
    $("nomeEquipamento").value = equip?.nome || "";
  });

  $("idPessoa").addEventListener("input", () => {
    const id = $("idPessoa").value.trim();
    const func = funcionarios.find((f) => f.id === id);
    $("nomePessoa").value = func?.nome || "";
  });

  $("nomePessoa").addEventListener("input", () => {
    const fn = funcionarios.find((f) => normalize(f.nome) === normalize($("nomePessoa").value.trim()));
    if (fn) $("idPessoa").value = fn.id;
  });

  ["busca", "filtroStatus", "filtroFuncionario", "filtroDataInicio", "filtroDataFim"].forEach((id) => {
    $(id).addEventListener("input", () => {
      state.page = 1;
      renderTable();
    });
    $(id).addEventListener("change", () => {
      state.page = 1;
      renderTable();
    });
  });

  $("limparFiltros").addEventListener("click", () => {
    ["busca", "filtroDataInicio", "filtroDataFim"].forEach((id) => {
      $(id).value = "";
    });
    $("filtroStatus").value = "todos";
    $("filtroFuncionario").value = "";
    state.page = 1;
    renderTable();
  });

  document.querySelector("#view-emprestimos thead").addEventListener("click", (event) => {
    const th = event.target.closest("th[data-sort]");
    if (!th) return;
    state.sortDirection = state.sortBy === th.dataset.sort && state.sortDirection === "asc" ? "desc" : "asc";
    state.sortBy = th.dataset.sort;
    renderTable();
  });

  $("listaEmprestimos").addEventListener("click", (event) => {
    const btnReturn = event.target.closest(".js-return");
    const btnDelete = event.target.closest(".js-delete");

    if (btnReturn) {
      confirmAction({
        title: "Confirmar devolução",
        text: "Deseja registrar a devolução deste equipamento?",
        onConfirm: () => markAsReturned(btnReturn.dataset.id),
      });
    }

    if (btnDelete) {
      confirmAction({
        title: "Excluir empréstimo",
        text: "Esta ação é permanente. Deseja continuar?",
        onConfirm: () => removeLoan(btnDelete.dataset.id),
      });
    }
  });

  $("prevPage").addEventListener("click", () => {
    state.page = Math.max(1, state.page - 1);
    renderTable();
  });

  $("nextPage").addEventListener("click", () => {
    const max = Math.max(1, Math.ceil(applyFiltersAndSort().length / state.perPage));
    state.page = Math.min(max, state.page + 1);
    renderTable();
  });

  $("historicoEquipamento").addEventListener("change", renderHistory);
  $("historicoFuncionario").addEventListener("change", renderHistory);
  $("exportCsvBtn").addEventListener("click", exportCsv);

  $("themeToggle").addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
  });
}

function initDefaults() {
  document.documentElement.setAttribute("data-theme", localStorage.getItem("theme") || "light");
  $("dataEmprestimo").value = todayISO();
  $("horaEmprestimo").value = nowTime();
}

function init() {
  showLoading(true);
  loadEmprestimos();
  initDefaults();
  bindUI();
  refreshUI();
  showLoading(false);
}

init();
