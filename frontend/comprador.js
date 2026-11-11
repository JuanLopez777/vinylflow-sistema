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
          <button class="btn-primary" style="width:100%;" ${agotado ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''} onclick="simularCompra(${v.id}, '${escapeHTML(v.titulo)}')">
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

async function simularCompra(id, titulo) {
  if (!confirm(`¿Estás seguro de que deseas comprar "${titulo}"?`)) return;

  try {
    const res = await apiFetch(`/vinilos/${id}/comprar`, { method: "POST" });
    const data = await res.json();
    
    if (!res.ok) throw new Error(data.msg);

    alert(data.msg); // Mensaje de éxito del backend
    await cargarVinilos(); // Refresca el catálogo para ver el stock descontado
    
  } catch (err) {
    alert("Error: " + err.message);
  }
}