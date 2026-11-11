let inventarioVinilos = [];

function escapeHTML(str) {
  return String(str ?? '').replace(/[&<>"']/g, s => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[s]);
}

function debounce(fn, wait = 250) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}

document.addEventListener("DOMContentLoaded", async () => {
  if (!Auth.requerirLogin()) return;

  // Proteger la ruta: si es admin, lo manda a su panel
  if (Auth.esAdmin()) { window.location.href = "/admin.html"; return; }

  const u = Auth.usuario;
  document.getElementById("userInfo").textContent = `Hola, ${u.nombre}`;

  configurarFiltros();
  await cargarVinilos();
});

async function cargarVinilos() {
  try {
    const res = await apiFetch("/vinilos");
    inventarioVinilos = await res.json();
    renderizarInventario();
  } catch (err) {
    console.error("Error al cargar:", err);
  }
}

function renderizarInventario(lista = inventarioVinilos) {
  const grid = document.getElementById("catalogGrid");
  grid.innerHTML = "";

  if (lista.length === 0) {
    grid.innerHTML = `<p style="color: var(--text-muted); grid-column: 1/-1; text-align: center; padding: 2rem;">No se encontraron vinilos.</p>`;
    return;
  }

  lista.forEach(v => {
    const esBajoStock = v.stock <= 2;
    const agotado = v.stock <= 0;
    const card = document.createElement("div");
    card.className = `vinyl-card ${esBajoStock ? 'low-stock-card' : ''}`;

    const imagen = v.imagen || "https://images.unsplash.com/photo-1539375665275-f9de415ef9ac?auto=format&fit=crop&w=400&q=80";

    card.innerHTML = `
      <div class="card-tag">$${Number(v.precio || 0).toFixed(2)}</div>
      <div class="vinyl-img-container">
        <div class="vinyl-disc"></div>
        <img src="${escapeHTML(imagen)}" alt="${escapeHTML(v.titulo)}" loading="lazy">
      </div>
      <div class="vinyl-info">
        <h3>${escapeHTML(v.titulo)}</h3>
        <p class="artist">${escapeHTML(v.artista)}</p>
        <ul class="vinyl-details">
          <li><strong>Año:</strong> ${escapeHTML(v.anio)}</li>
          <li><strong>Sello:</strong> ${escapeHTML(v.sello)}</li>
          <li><strong>Género:</strong> ${escapeHTML(v.genero)}</li>
          <li><strong>Estado:</strong> ${escapeHTML(v.estado)}</li>
        </ul>
        <div class="stock-status">
          <span>Disponibles:</span>
          <strong class="${esBajoStock ? 'stock-warning' : 'stock-ok'}">
            ${agotado ? 'Agotado' : v.stock + ' Unidades'}
          </strong>
        </div>
        <div class="card-actions">
          <button class="btn-primary" style="width:100%;" ${agotado ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''} onclick="simularCompra(${v.id})">
            ${agotado ? 'Sin Stock' : '🛒 Comprar Vinilo'}
          </button>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });
}

function configurarFiltros() {
  const searchInput = document.getElementById("searchInput");
  const genreFilter = document.getElementById("genreFilter");

  function aplicarFiltros() {
    const query = (searchInput.value || "").toLowerCase().trim();
    const genero = genreFilter.value;

    const filtrados = inventarioVinilos.filter(v => {
      const coincideTexto = (v.titulo||"").toLowerCase().includes(query) || 
                            (v.artista||"").toLowerCase().includes(query);
      const coincideGenero = genero === "todos" || v.genero === genero;
      return coincideTexto && coincideGenero;
    });
    renderizarInventario(filtrados);
  }

  searchInput.addEventListener("input", debounce(aplicarFiltros, 200));
  genreFilter.addEventListener("change", aplicarFiltros);
}

// ==========================================
// --- LÓGICA DE COMPRA EN 2 PASOS ---
// ==========================================

// PASO 1: Abrir el modal de confirmación
function simularCompra(id) {
  const v = inventarioVinilos.find(item => item.id == id);
  if (!v) return;

  // Llenar el modal de confirmación con TODOS los datos del vinilo
  document.getElementById("confirmCompraImagen").src = v.imagen || "https://images.unsplash.com/photo-1539375665275-f9de415ef9ac?auto=format&fit=crop&w=400&q=80";
  document.getElementById("confirmCompraTitulo").textContent = v.titulo;
  document.getElementById("confirmCompraArtista").textContent = v.artista;
  
  // Nuevas líneas para las especificaciones:
  document.getElementById("confirmCompraAnio").textContent = v.anio;
  document.getElementById("confirmCompraSello").textContent = v.sello;
  document.getElementById("confirmCompraGenero").textContent = v.genero;
  document.getElementById("confirmCompraEstado").textContent = v.estado;
  
  document.getElementById("confirmCompraFormato").textContent = v.tamano;
  document.getElementById("confirmCompraPrecio").textContent = `$${Number(v.precio).toFixed(2)}`;

  // Asignar la acción al botón de "Confirmar Compra"
  document.getElementById("btnConfirmarDefinitivo").onclick = () => ejecutarCompraReal(id, v);

  // Mostrar el modal
  document.getElementById("modalConfirmacion").style.display = "flex";
}

// Cerrar el modal de confirmación (si el usuario cancela)
function cerrarModalConfirmacion() {
  document.getElementById("modalConfirmacion").style.display = "none";
}

// PASO 2: Ejecutar la compra real si el usuario confirma
async function ejecutarCompraReal(id, viniloData) {
  cerrarModalConfirmacion(); // Cerramos el modal de confirmación

  try {
    // Llamar al backend para descontar el stock
    const res = await apiFetch(`/vinilos/${id}/comprar`, { method: "POST" });
    const data = await res.json();
    
    if (!res.ok) throw new Error(data.msg);

    // Llenar el modal de ÉXITO (Recibo)
    document.getElementById("compraTitulo").textContent = viniloData.titulo;
    document.getElementById("compraArtista").textContent = viniloData.artista;
    document.getElementById("compraFormato").textContent = viniloData.tamano;
    document.getElementById("compraCantidad").textContent = "1 Unidad";
    document.getElementById("compraPrecio").textContent = `$${Number(viniloData.precio).toFixed(2)}`;

    // Mostrar el modal de éxito
    document.getElementById("modalCompra").style.display = "flex";

    // Refrescar el catálogo en segundo plano para ver el nuevo stock
    await cargarVinilos(); 
    
  } catch (err) {
    alert("Error al procesar la compra: " + err.message);
  }
}

// Cerrar el modal de éxito (botón "Seguir comprando")
function cerrarModalCompra() {
  document.getElementById("modalCompra").style.display = "none";
}