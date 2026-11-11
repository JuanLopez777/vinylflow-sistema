// ============================================
// VinylFlow — admin.js (Panel de Administrador)
// ============================================

let inventarioVinilos = [];

// ---------- UTILIDADES ----------
function escapeHTML(str) {
  return String(str ?? '').replace(/[&<>"']/g, s => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;',
    '"': '&quot;', "'": '&#39;'
  })[s]);
}

function debounce(fn, wait = 250) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}

function showToast(mensaje, tipo = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${tipo}`;
  toast.textContent = mensaje;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 2800);
}

// ---------- INICIALIZACIÓN ----------
document.addEventListener("DOMContentLoaded", async () => {
  if (!Auth.requerirLogin()) return;

  // 🛑 PROTECCIÓN DE RUTA: Si no es admin, lo manda a la tienda de comprador
  if (!Auth.esAdmin()) {
    window.location.href = "/comprador.html";
    return;
  }

  const u = Auth.usuario;
  document.getElementById("userRole").textContent = `Rol: Administrador`;
  document.getElementById("userInfo").textContent = `ID: ${u.id} | ${u.nombre}`;

  configurarFiltros();
  configurarModal();
  await cargarVinilos();
});

async function cargarVinilos() {
  try {
    const res = await apiFetch("/vinilos");
    inventarioVinilos = await res.json();
    renderizarInventario();
  } catch (err) {
    console.error("No se pudo cargar el inventario:", err);
    showToast("Error al cargar inventario", "error");
  }
}

// ---------- CAMBIAR VISTA ----------
function cambiarVista(vista) {
  document.querySelectorAll(".view-section").forEach(sec => sec.style.display = "none");
  document.querySelectorAll(".nav-btn").forEach(btn => btn.classList.remove("active"));

  if (vista === 'inventario') {
    document.getElementById("vistaInventario").style.display = "block";
    document.getElementById("navInventario")?.classList.add("active");
  } else if (vista === 'alertas') {
    document.getElementById("vistaAlertas").style.display = "block";
    document.getElementById("navAlertas")?.classList.add("active");
    renderizarAlertasStock();
  } else if (vista === 'reportes') {
    document.getElementById("vistaReportes").style.display = "block";
    document.getElementById("navReportes")?.classList.add("active");
  }
}

// ---------- RENDERIZAR CATÁLOGO ----------
function renderizarInventario(lista = inventarioVinilos) {
  const grid = document.getElementById("catalogGrid");
  grid.innerHTML = "";

  let stockTotal = 0;
  let stockBajoCount = 0;
  let valorTotal = 0;

  inventarioVinilos.forEach(v => {
    stockTotal += Number(v.stock || 0);
    valorTotal += Number(v.precio || 0) * Number(v.stock || 0);
    if (v.stock <= 2) stockBajoCount++;
  });

  document.getElementById("total-stock").textContent = `${stockTotal} Unidades`;
  document.getElementById("total-items").textContent = inventarioVinilos.length;
  document.getElementById("low-stock-count").textContent =
    `${stockBajoCount} Vinilo(s) requiere reabastecimiento`;

  if (lista.length === 0) {
    grid.innerHTML = `<p style="color: var(--text-muted); grid-column: 1/-1; text-align: center; padding: 2rem;">No se encontraron registros en el inventario.</p>`;
    return;
  }

  lista.forEach(v => {
    const esBajoStock = v.stock <= 2;
    const card = document.createElement("div");
    card.className = `vinyl-card ${esBajoStock ? 'low-stock-card' : ''}`;
    card.setAttribute("data-genre", v.genero);
    card.setAttribute("data-condition", v.estado);

    const imagen = v.imagen || "https://images.unsplash.com/photo-1539375665275-f9de415ef9ac?auto=format&fit=crop&w=400&q=80";
    const badgeEstado = v.estado?.includes('Nuevo') ? 'badge-new' : 'badge-exc';

    card.innerHTML = `
      <div class="card-tag">id_vinilo: ${escapeHTML(v.id)}</div>
      <div class="vinyl-img-container">
        <div class="vinyl-disc"></div>
        <img src="${escapeHTML(imagen)}" alt="${escapeHTML(v.titulo)}" loading="lazy"
             onerror="this.src='https://images.unsplash.com/photo-1539375665275-f9de415ef9ac?auto=format&fit=crop&w=400&q=80'">
      </div>
      <div class="vinyl-info">
        <h3>${escapeHTML(v.titulo)}</h3>
        <p class="artist">${escapeHTML(v.artista)}</p>
        <ul class="vinyl-details">
          <li><strong>Año:</strong> ${escapeHTML(v.anio)}</li>
          <li><strong>Sello:</strong> ${escapeHTML(v.sello)}</li>
          <li><strong>Tamaño:</strong> ${escapeHTML(v.tamano)}</li>
          <li><strong>Precio:</strong> $${Number(v.precio || 0).toFixed(2)}</li>
          <li><strong>Estado:</strong> <span class="${badgeEstado}">${escapeHTML(v.estado)}</span></li>
        </ul>
        <div class="stock-status">
          <span>Stock Disponible:</span>
          <strong class="${esBajoStock ? 'stock-warning' : 'stock-ok'}">
            ${esBajoStock ? '⚠️ ' + v.stock + ' Unidad (Stock Bajo)' : v.stock + ' Unidades'}
          </strong>
        </div>
        <div class="card-actions">
            <button class="btn-edit" onclick="modificarVinilo(${v.id})">Modificar Vinilo</button>
            <button class="btn-delete" onclick="darDeBajaVinilo(${v.id})">Dar De Baja Vinilo</button>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });
}

// ---------- FILTROS Y BÚSQUEDA ----------
function configurarFiltros() {
  const searchInput = document.getElementById("searchInput");
  const genreFilter = document.getElementById("genreFilter");
  const conditionFilter = document.getElementById("conditionFilter");

  function aplicarFiltros() {
    const query = (searchInput.value || "").toLowerCase().trim();
    const genero = genreFilter.value;
    const estado = conditionFilter.value;

    const filtrados = inventarioVinilos.filter(v => {
      const t = (v.titulo || "").toLowerCase();
      const a = (v.artista || "").toLowerCase();
      const s = (v.sello || "").toLowerCase();
      const coincideTexto = t.includes(query) || a.includes(query) || s.includes(query);
      const coincideGenero = genero === "todos" || v.genero === genero;
      const coincideEstado = estado === "todos" || (v.estado || "").includes(estado);
      return coincideTexto && coincideGenero && coincideEstado;
    });

    renderizarInventario(filtrados);
  }

  const conDebounce = debounce(aplicarFiltros, 200);
  searchInput.addEventListener("input", conDebounce);
  genreFilter.addEventListener("change", aplicarFiltros);
  conditionFilter.addEventListener("change", aplicarFiltros);
}

// ---------- MODAL ----------
function configurarModal() {
  const overlay = document.getElementById("modalVinilo");
  if (!overlay) return;

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) cerrarModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.style.display !== "none") cerrarModal();
  });
}

function abrirModalRegistro() {
  document.getElementById("modalTitle").textContent = "Registrar Nuevo Vinilo";
  document.getElementById("formVinilo").reset();
  document.getElementById("viniloId").value = "";
  document.getElementById("modalVinilo").style.display = "flex";
}

function cerrarModal() {
  document.getElementById("modalVinilo").style.display = "none";
}

// ---------- GUARDAR (POST/PUT) ----------
async function guardarVinilo(event) {
  event.preventDefault();
  const idVal = document.getElementById("viniloId").value;

  const body = {
    titulo:  document.getElementById("inputTitulo").value.trim(),
    artista: document.getElementById("inputArtista").value.trim(),
    anio:    Number(document.getElementById("inputAnio").value),
    sello:   document.getElementById("inputSello").value.trim(),
    genero:  document.getElementById("inputGenero").value,
    tamano:  document.getElementById("inputTamano").value.trim(),
    estado:  document.getElementById("inputEstado").value,
    stock:   Math.max(0, Number(document.getElementById("inputStock").value) || 0),
    precio:  Math.max(0, Number(document.getElementById("inputPrecio")?.value) || 0),
    imagen:  document.getElementById("inputImagen").value.trim(),
  };

  try {
    if (idVal) {
      await apiFetch(`/vinilos/${idVal}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      showToast(`Vinilo ${idVal} modificado correctamente`);
    } else {
      await apiFetch("/vinilos", {
        method: "POST",
        body: JSON.stringify(body),
      });
      showToast(`Vinilo "${body.titulo}" registrado en MySQL`);
    }
    cerrarModal();
    await cargarVinilos();
  } catch (err) {
    showToast("Error al guardar: " + err.message, "error");
  }
}

// ---------- MODIFICAR ----------
function modificarVinilo(id) {
  const v = inventarioVinilos.find(item => item.id == id);
  if (!v) return;

  document.getElementById("modalTitle").textContent = `Modificar Vinilo - ID: ${id}`;
  document.getElementById("viniloId").value = v.id;
  document.getElementById("inputTitulo").value = v.titulo;
  document.getElementById("inputArtista").value = v.artista;
  document.getElementById("inputAnio").value = v.anio;
  document.getElementById("inputSello").value = v.sello;
  document.getElementById("inputGenero").value = v.genero;
  document.getElementById("inputTamano").value = v.tamano;
  document.getElementById("inputEstado").value = v.estado;
  document.getElementById("inputStock").value = v.stock;
  document.getElementById("inputPrecio").value = v.precio ?? 0;
  document.getElementById("inputImagen").value = v.imagen || "";

  document.getElementById("modalVinilo").style.display = "flex";
}

// ---------- ELIMINAR (DELETE) ----------
async function darDeBajaVinilo(id) {
  const v = inventarioVinilos.find(item => item.id == id);
  const titulo = v ? v.titulo : id;
  if (!confirm(`¿Estás seguro de eliminar el disco "${titulo}" del inventario?`)) return;

  try {
    await apiFetch(`/vinilos/${id}`, { method: "DELETE" });
    showToast(`Vinilo "${titulo}" eliminado de MySQL`);
    await cargarVinilos();
  } catch (err) {
    showToast("Error al eliminar: " + err.message, "error");
  }
}

// ---------- ALERTAS DE STOCK ----------
function verificarStockBajo() {
  return inventarioVinilos.filter(v => v.stock <= 2);
}

function renderizarAlertasStock() {
  const container = document.getElementById("alertContainer");
  if (!container) return;

  const criticos = verificarStockBajo();

  if (criticos.length === 0) {
    container.innerHTML = `<p style="color: var(--success); padding: 1rem;">✅ No hay alertas críticas. Todo el stock se encuentra en niveles óptimos.</p>`;
    return;
  }

  let html = `<div style="display: flex; flex-direction: column; gap: 1rem;">`;
  criticos.forEach(v => {
    html += `
      <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); padding: 1rem; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap;">
        <div>
          <h4 style="color: #fff; margin-bottom: 0.2rem;">⚠️ Stock Crítico: ${escapeHTML(v.titulo)} (${escapeHTML(v.artista)})</h4>
          <p style="font-size: 0.85rem; color: var(--text-muted);">ID: ${escapeHTML(v.id)} | Sello: ${escapeHTML(v.sello)} | <strong>Quedan ${v.stock} unidad(es)</strong></p>
        </div>
        <button class="btn-primary" onclick="showToast('Orden de reabastecimiento enviada')">Solicitar Resurtido</button>
      </div>
    `;
  });
  html += `</div>`;
  container.innerHTML = html;
}

// ---------- EXPORTAR PDF ----------
function generarPDF() {
  if (typeof window.jspdf === 'undefined') {
    showToast("Librería PDF no cargada. Recarga la página.", "error");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFillColor(15, 17, 26);
  doc.rect(0, 0, 210, 35, "F");

  doc.setTextColor(245, 158, 11);
  doc.setFontSize(18);
  doc.text("Sonido Autentico del Vinilo", 14, 15);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.text("Reporte Oficial de Inventario y Catalogo de Discos", 14, 23);
  doc.text(`Fecha de emision: ${new Date().toLocaleDateString()}`, 14, 29);

  doc.setTextColor(30, 30, 30);
  doc.setFontSize(12);
  let y = 45;

  doc.text("Listado de Ejemplares Registrados:", 14, y);
  y += 10;

  inventarioVinilos.forEach((v, index) => {
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
    doc.setFont("helvetica", "bold");
    doc.text(`${index + 1}. [ID: ${v.id}] ${v.titulo} - ${v.artista} (${v.anio})`, 14, y);

    doc.setFont("helvetica", "normal");
    doc.text(`   Sello: ${v.sello} | Genero: ${v.genero} | Formato: ${v.tamano}`, 14, y + 6);
    doc.text(`   Estado: ${v.estado} | Stock: ${v.stock} | Precio: $${Number(v.precio || 0).toFixed(2)}`, 14, y + 12);

    y += 20;
  });

  doc.save("Reporte_Inventario_VinylFlow.pdf");
  showToast("PDF generado correctamente");
}

// ---------- EXPORTAR EXCEL ----------
function exportarExcel() {
  if (typeof XLSX === 'undefined') {
    showToast("Librería Excel no cargada. Recarga la página.", "error");
    return;
  }

  const datosPlanos = inventarioVinilos.map(v => ({
    "ID Vinilo": v.id,
    "Título del Álbum": v.titulo,
    "Artista": v.artista,
    "Año": v.anio,
    "Sello Discográfico": v.sello,
    "Género": v.genero,
    "Tamaño": v.tamano,
    "Estado Físico": v.estado,
    "Stock Disponible": v.stock,
    "Precio (USD)": Number(v.precio || 0),
  }));

  const worksheet = XLSX.utils.json_to_sheet(datosPlanos);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Inventario Vinilos");

  XLSX.writeFile(workbook, "Inventario_VinylFlow.xlsx");
  showToast("Excel exportado correctamente");
}