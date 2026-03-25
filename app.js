import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  limit,
  onSnapshot,
  query,
  updateDoc,
  where,
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDR5LfYXB0KV63MDsiW_E5z8TemwlSfTGA",
  authDomain: "camposworkbench.firebaseapp.com",
  projectId: "camposworkbench",
  storageBucket: "camposworkbench.firebasestorage.app",
  messagingSenderId: "588651522200",
  appId: "1:588651522200:web:80b95c0c44b4edc95888ed",
};

const db = getFirestore(initializeApp(firebaseConfig));
const $ = (id) => document.getElementById(id);

const state = {
  emprestimos: [],
  equipamentos: [],
  funcionarios: [],
  sortBy: "dataEmprestimo",
  sortDirection: "desc",
  page: 1,
  perPage: 8,
  unsubscribers: [],
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

function applyFiltersAndSort() {
  const q = normalize($("busca").value.trim());
  const status = $("filtroStatus").value;
  const func = $("filtroFuncionario").value;
  const start = $("filtroDataInicio").value;
  const end = $("filtroDataFim").value;

  return state.emprestimos
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
        ${!r.devolvida ? `<button class="btn btn--primary js-return" data-id="${r.docId}">Devolver</button>` : ""}
        <button class="btn btn--danger js-delete" data-id="${r.docId}">Excluir</button>
      </td>
    </tr>`,
    )
    .join("");

  $("pageInfo").textContent = `Página ${state.page} de ${maxPages}`;
}

function renderRegisters() {
  $("listaEquipamentos").innerHTML = state.equipamentos.map((e) => `<li><strong>${e.numero}</strong> — ${e.nome}</li>`).join("");
  $("listaFuncionarios").innerHTML = state.funcionarios.map((f) => `<li><strong>${f.id}</strong> — ${f.nome}</li>`).join("");

  $("equipamentosList").innerHTML = state.equipamentos.map((e) => `<option value="${e.numero}">${e.nome}</option>`).join("");
  $("funcionariosList").innerHTML = state.funcionarios.map((f) => `<option value="${f.id}">${f.nome}</option>`).join("");
  $("funcionariosNomeList").innerHTML = state.funcionarios.map((f) => `<option value="${f.nome}">${f.id}</option>`).join("");

  $("filtroFuncionario").innerHTML = `<option value="">Todos funcionários</option>${state.funcionarios
    .map((f) => `<option value="${f.id}">${f.nome} (${f.id})</option>`)
    .join("")}`;
  $("historicoEquipamento").innerHTML = `<option value="">Selecione equipamento</option>${state.equipamentos
    .map((e) => `<option value="${e.numero}">${e.numero} - ${e.nome}</option>`)
    .join("")}`;
  $("historicoFuncionario").innerHTML = `<option value="">Selecione funcionário</option>${state.funcionarios
    .map((f) => `<option value="${f.id}">${f.nome} (${f.id})</option>`)
    .join("")}`;
}

function renderKpis() {
  const pendentes = state.emprestimos.filter((e) => !e.devolvida).length;
  const devolvidosHoje = state.emprestimos.filter((e) => e.devolvida && e.dataDevolucao === todayISO()).length;
  const atrasados = state.emprestimos.filter((e) => isOverdue(e)).length;

  $("kpiTotalEquip").textContent = state.equipamentos.length;
  $("kpiPendentes").textContent = pendentes;
  $("kpiDevolvidosHoje").textContent = devolvidosHoje;
  $("kpiAtrasados").textContent = atrasados;
}

function renderHistory() {
  const eq = $("historicoEquipamento").value;
  const fn = $("historicoFuncionario").value;

  $("historicoEquipamentoBody").innerHTML = state.emprestimos
    .filter((e) => !eq || e.numFerramenta === eq)
    .map(
      (e) =>
        `<tr><td>${formatDateBR(e.dataEmprestimo)} ${e.horaEmprestimo || ""}</td><td>${e.nomePessoa}</td><td>${
          e.devolvida ? "Devolvida" : "Pendente"
        }</td></tr>`,
    )
    .join("");

  $("historicoFuncionarioBody").innerHTML = state.emprestimos
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
  state.emprestimos.forEach((e) => {
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

async function seedIfNeeded() {
  try {
    if (!state.equipamentos.length) {
      await Promise.all(
        [
          { numero: "24000", nome: "Rebarbadora" },
          { numero: "25000", nome: "Aparafusadora" },
          { numero: "23000", nome: "Martelo" },
          { numero: "26000", nome: "Serra Circular" },
          { numero: "27000", nome: "Furadeira" },
        ].map((item) => addDoc(collection(db, "equipamentos"), item)),
      );
    }

    if (!state.funcionarios.length) {
      await Promise.all(
        [
          { id: "404", nome: "Paulo Campos" },
          { id: "123", nome: "Sergio Ramos" },
          { id: "789", nome: "Carlos Oliveira" },
          { id: "101", nome: "Pereira" },
          { id: "102", nome: "Rafael Costa" },
        ].map((item) => addDoc(collection(db, "funcionarios"), item)),
      );
    }
  } catch (error) {
    console.error(error);
    notify("Falha ao inicializar dados base.", "error");
  }
}

async function initialLoad() {
  showLoading(true);
  try {
    const [emprestimosSnap, equipamentosSnap, funcionariosSnap] = await Promise.all([
      getDocs(collection(db, "emprestimos")),
      getDocs(collection(db, "equipamentos")),
      getDocs(collection(db, "funcionarios")),
    ]);

    state.emprestimos = emprestimosSnap.docs.map((d) => ({ docId: d.id, ...d.data() }));
    state.equipamentos = equipamentosSnap.docs.map((d) => ({ docId: d.id, ...d.data() }));
    state.funcionarios = funcionariosSnap.docs.map((d) => ({ docId: d.id, ...d.data() }));

    await seedIfNeeded();
    refreshUI();
  } catch (error) {
    console.error(error);
    notify("Erro ao carregar dados iniciais.", "error");
  } finally {
    showLoading(false);
  }
}

function setupRealtimeSync() {
  state.unsubscribers.forEach((unsub) => unsub());
  state.unsubscribers = [];

  const unEmp = onSnapshot(
    collection(db, "emprestimos"),
    (snap) => {
      state.emprestimos = snap.docs.map((d) => ({ docId: d.id, ...d.data() }));
      refreshUI();
    },
    (error) => {
      console.error(error);
      notify("Falha na atualização de empréstimos.", "error");
    },
  );

  const unEq = onSnapshot(
    collection(db, "equipamentos"),
    (snap) => {
      state.equipamentos = snap.docs.map((d) => ({ docId: d.id, ...d.data() }));
      refreshUI();
    },
    (error) => {
      console.error(error);
      notify("Falha na atualização de equipamentos.", "error");
    },
  );

  const unFn = onSnapshot(
    collection(db, "funcionarios"),
    (snap) => {
      state.funcionarios = snap.docs.map((d) => ({ docId: d.id, ...d.data() }));
      refreshUI();
    },
    (error) => {
      console.error(error);
      notify("Falha na atualização de funcionários.", "error");
    },
  );

  state.unsubscribers.push(unEmp, unEq, unFn);
}

async function lookupEquipamentoNumero(numero) {
  const local = state.equipamentos.find((e) => e.numero === numero);
  if (local) return local;

  const snap = await getDocs(query(collection(db, "equipamentos"), where("numero", "==", numero), limit(1)));
  return snap.empty ? null : snap.docs[0].data();
}

async function lookupFuncionarioId(id) {
  const local = state.funcionarios.find((f) => f.id === id);
  if (local) return local;

  const snap = await getDocs(query(collection(db, "funcionarios"), where("id", "==", id), limit(1)));
  return snap.empty ? null : snap.docs[0].data();
}

async function createLoan(event) {
  event.preventDefault();

  const payload = {
    numFerramenta: $("numFerramenta").value.replace(/\D/g, ""),
    nomeEquipamento: $("nomeEquipamento").value.trim(),
    quemEntregou: $("quemEntregou").value.trim(),
    idPessoa: $("idPessoa").value.trim(),
    nomePessoa: $("nomePessoa").value.trim(),
    dataEmprestimo: $("dataEmprestimo").value,
    horaEmprestimo: $("horaEmprestimo").value,
    devolvida: false,
    dataDevolucao: null,
    horaDevolucao: null,
    createdAt: new Date().toISOString(),
  };

  if (!payload.numFerramenta || !payload.nomeEquipamento || !payload.quemEntregou || !payload.idPessoa || !payload.nomePessoa || !payload.dataEmprestimo || !payload.horaEmprestimo) {
    notify("Preencha todos os campos obrigatórios.", "error");
    return;
  }

  const equip = await lookupEquipamentoNumero(payload.numFerramenta);
  if (!equip) {
    notify("Equipamento não cadastrado.", "error");
    return;
  }

  if (state.emprestimos.some((e) => e.numFerramenta === payload.numFerramenta && !e.devolvida)) {
    notify("Equipamento já está emprestado.", "error");
    return;
  }

  try {
    showLoading(true);
    await addDoc(collection(db, "emprestimos"), payload);
    event.target.reset();
    $("dataEmprestimo").value = todayISO();
    $("horaEmprestimo").value = nowTime();
    notify("Empréstimo registrado com sucesso.");
  } catch (error) {
    console.error(error);
    notify("Erro ao registrar empréstimo.", "error");
  } finally {
    showLoading(false);
  }
}

async function markAsReturned(docId) {
  try {
    showLoading(true);
    const now = new Date();
    await updateDoc(doc(db, "emprestimos", docId), {
      devolvida: true,
      dataDevolucao: now.toISOString().slice(0, 10),
      horaDevolucao: now.toTimeString().slice(0, 5),
    });
    notify("Devolução registrada.");
  } catch (error) {
    console.error(error);
    notify("Erro ao registrar devolução.", "error");
  } finally {
    showLoading(false);
  }
}

async function removeLoan(docId) {
  try {
    showLoading(true);
    await deleteDoc(doc(db, "emprestimos", docId));
    notify("Registro removido.");
  } catch (error) {
    console.error(error);
    notify("Erro ao excluir registro.", "error");
  } finally {
    showLoading(false);
  }
}

async function createEquipment(event) {
  event.preventDefault();
  const numero = $("equipNumero").value.replace(/\D/g, "");
  const nome = $("equipNome").value.trim();
  if (!numero || !nome) {
    notify("Informe número e nome.", "error");
    return;
  }
  if (state.equipamentos.some((e) => e.numero === numero)) {
    notify("Número já cadastrado.", "error");
    return;
  }

  try {
    showLoading(true);
    await addDoc(collection(db, "equipamentos"), { numero, nome });
    event.target.reset();
    notify("Equipamento salvo.");
  } catch (error) {
    console.error(error);
    notify("Erro ao salvar equipamento.", "error");
  } finally {
    showLoading(false);
  }
}

async function createWorker(event) {
  event.preventDefault();
  const id = $("funcId").value.trim();
  const nome = $("funcNome").value.trim();
  if (!id || !nome) {
    notify("Informe ID e nome.", "error");
    return;
  }
  if (state.funcionarios.some((f) => f.id === id)) {
    notify("ID já cadastrado.", "error");
    return;
  }

  try {
    showLoading(true);
    await addDoc(collection(db, "funcionarios"), { id, nome });
    event.target.reset();
    notify("Funcionário salvo.");
  } catch (error) {
    console.error(error);
    notify("Erro ao salvar funcionário.", "error");
  } finally {
    showLoading(false);
  }
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
      $("pageTitle").textContent = btn.textContent.replace(/[📊🧾🗂📚]\s*/, "");
    });
  });

  $("formEmprestimo").addEventListener("submit", createLoan);
  $("formEquipamento").addEventListener("submit", createEquipment);
  $("formFuncionario").addEventListener("submit", createWorker);

  $("numFerramenta").addEventListener("input", async () => {
    $("numFerramenta").value = $("numFerramenta").value.replace(/\D/g, "");
    const numero = $("numFerramenta").value;
    if (!numero) {
      $("nomeEquipamento").value = "";
      return;
    }

    try {
      const equip = await lookupEquipamentoNumero(numero);
      $("nomeEquipamento").value = equip?.nome || "";
    } catch (error) {
      console.error(error);
      $("nomeEquipamento").value = "";
    }
  });

  $("idPessoa").addEventListener("input", async () => {
    const id = $("idPessoa").value.trim();
    if (!id) {
      $("nomePessoa").value = "";
      return;
    }

    try {
      const func = await lookupFuncionarioId(id);
      if (func) $("nomePessoa").value = func.nome;
    } catch (error) {
      console.error(error);
    }
  });

  $("nomePessoa").addEventListener("input", () => {
    const fn = state.funcionarios.find((f) => normalize(f.nome) === normalize($("nomePessoa").value.trim()));
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

initDefaults();
bindUI();
initialLoad().then(setupRealtimeSync);
