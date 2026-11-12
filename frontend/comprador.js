let inventarioVinilos = [];
let intentoDePagoActual = null; 
let viniloEnProceso = null;     
let paginaActual = 1;
let totalPaginas = 1;
const VINILOS_POR_PAGINA = 6; // Cantidad de discos por página

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
  if (Auth.esAdmin()) { window.location.href = "/admin.html"; return; }

  const u = Auth.usuario;
  document.getElementById("userInfo").textContent = `Hola, ${u.nombre}`;

  configurarFiltros();
  await cargarVinilos();
});

// --- PAGINACIÓN ---
async function cargarVinilos(page = 1) {
  try {
    const res = await apiFetch(`/vinilos?page=${page}&limit=${VINILOS_POR_PAGINA}`);
    const json = await res.json();
    
    inventarioVinilos = json.data;
    paginaActual = json.meta.current_page;
    totalPaginas = json.meta.total_pages;

    renderizarInventario();
    actualizarControlesPaginacion();
  } catch (err) {
    console.error("Error al cargar:", err);
  }
}

function cambiarPagina(direccion) {
  const nuevaPagina = paginaActual + direccion;
  if (nuevaPagina >= 1 && nuevaPagina <= totalPaginas) {
    cargarVinilos(nuevaPagina);
  }
}

function actualizarControlesPaginacion() {
  const info = document.getElementById("pageInfo");
  const prev = document.getElementById("btnPrev");
  const next = document.getElementById("btnNext");

  if (info) info.textContent = `Página ${paginaActual} de ${totalPaginas}`;
  if (prev) prev.disabled = (paginaActual === 1);
  if (next) next.disabled = (paginaActual === totalPaginas);
}

function renderizarInventario(lista = inventarioVinilos) {
  const grid = document.getElementById("catalogGrid");
  grid.innerHTML = "";

  if (lista.length === 0) {
    grid.innerHTML = `<p style="color: var(--text-muted); grid-column: 1/-1; text-align: center; padding: 2rem;">No se encontraron vinilos en esta página.</p>`;
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

// --- LÓGICA DE COMPRA ---
function simularCompra(id) {
  const v = inventarioVinilos.find(item => item.id == id);
  if (!v) return;

  viniloEnProceso = v; 
  document.getElementById("confirmCompraImagen").src = v.imagen || "https://images.unsplash.com/photo-1539375665275-f9de415ef9ac?auto=format&fit=crop&w=400&q=80";
  document.getElementById("confirmCompraTitulo").textContent = v.titulo;
  document.getElementById("confirmCompraArtista").textContent = v.artista;
  document.getElementById("confirmCompraAnio").textContent = v.anio;
  document.getElementById("confirmCompraSello").textContent = v.sello;
  document.getElementById("confirmCompraGenero").textContent = v.genero;
  document.getElementById("confirmCompraEstado").textContent = v.estado;
  document.getElementById("confirmCompraFormato").textContent = v.tamano;
  document.getElementById("confirmCompraPrecio").textContent = `$${Number(v.precio).toFixed(2)}`;

  document.getElementById("btnConfirmarDefinitivo").onclick = solicitarTokenYPagar;
  document.getElementById("modalConfirmacion").style.display = "flex";
}

function cerrarModalConfirmacion() {
  document.getElementById("modalConfirmacion").style.display = "none";
}

async function solicitarTokenYPagar() {
  cerrarModalConfirmacion();
  const btnConfirmar = document.getElementById("btnConfirmarDefinitivo");
  
  try {
    btnConfirmar.textContent = "Validando stock...";
    btnConfirmar.disabled = true;

    const res = await apiFetch(`/vinilos/${viniloEnProceso.id}/intent`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.msg);

    intentoDePagoActual = data.payment_intent; 

    document.getElementById("pagoTotalMonto").textContent = `$${Number(viniloEnProceso.precio).toFixed(2)}`;
    document.getElementById("formPago").onsubmit = procesarPago;
    document.getElementById("modalPago").style.display = "flex";

  } catch (err) {
    alert("No se puede iniciar el pago: " + err.message);
  } finally {
    btnConfirmar.textContent = "Confirmar Compra";
    btnConfirmar.disabled = false;
  }
}

function cerrarModalPago() {
  document.getElementById("modalPago").style.display = "none";
  intentoDePagoActual = null;
}

// --- FORMATEADORES Y VALIDACIONES ---
function validarLuhn(numero) {
  let suma = 0;
  let alternar = false;
  for (let i = numero.length - 1; i >= 0; i--) {
    let digito = parseInt(numero.charAt(i), 10);
    if (alternar) {
      digito *= 2;
      if (digito > 9) digito -= 9;
    }
    suma += digito;
    alternar = !alternar;
  }
  return (suma % 10) === 0;
}

function formatearTarjeta(input) {
  let valor = input.value.replace(/\D/g, ''); 
  valor = valor.replace(/(.{4})/g, '$1 ').trim(); 
  input.value = valor;
  ocultarError("error-tarjeta", input);
}

function formatearFecha(input) {
  let valor = input.value.replace(/\D/g, ''); 
  if (valor.length >= 2) {
    let mes = parseInt(valor.substring(0, 2));
    if (mes > 12 || mes === 0) {
      valor = valor.substring(0, 1); 
    } else {
      valor = valor.substring(0, 2) + '/' + valor.substring(2, 4);
    }
  }
  input.value = valor;
  ocultarError("error-fecha", input);
}

function formatearCVV(input) {
  input.value = input.value.replace(/\D/g, '');
  ocultarError("error-cvv", input);
}

function mostrarError(idSpan, input, mensaje) {
  const span = document.getElementById(idSpan);
  span.textContent = mensaje;
  span.classList.add("show");
  input.classList.add("error");
}

function ocultarError(idSpan, input) {
  const span = document.getElementById(idSpan);
  span.classList.remove("show");
  input.classList.remove("error");
}

async function procesarPago(event) {
  event.preventDefault();
  
  const inputTarjeta = document.getElementById("cardNumber");
  const inputFecha = document.getElementById("cardExp");
  const inputCvv = document.getElementById("cardCvv");
  
  let formularioValido = true;

  const tarjetaLimpia = inputTarjeta.value.replace(/\s/g, '');
  if (tarjetaLimpia.length !== 16) {
    mostrarError("error-tarjeta", inputTarjeta, "Debe tener 16 dígitos.");
    formularioValido = false;
  } else if (!validarLuhn(tarjetaLimpia)) {
    mostrarError("error-tarjeta", inputTarjeta, "Número de tarjeta inválido.");
    formularioValido = false;
  }

  if (inputFecha.value.length !== 5) {
    mostrarError("error-fecha", inputFecha, "Formato incompleto (MM/YY).");
    formularioValido = false;
  } else {
    const hoy = new Date();
    const mesActual = hoy.getMonth() + 1; 
    const anioActual = parseInt(hoy.getFullYear().toString().slice(-2));
    
    const partes = inputFecha.value.split('/');
    const mesIngresado = parseInt(partes[0]);
    const anioIngresado = parseInt(partes[1]);

    if (anioIngresado < anioActual || (anioIngresado === anioActual && mesIngresado < mesActual)) {
      mostrarError("error-fecha", inputFecha, "La tarjeta está vencida.");
      formularioValido = false;
    } else if (anioIngresado > anioActual + 10) {
      mostrarError("error-fecha", inputFecha, "Año de vencimiento muy lejano.");
      formularioValido = false;
    }
  }

  if (inputCvv.value.length !== 3) {
    mostrarError("error-cvv", inputCvv, "Debe tener 3 dígitos.");
    formularioValido = false;
  }

  if (!formularioValido) return; 

  const btnPagar = document.getElementById("btnPagar");
  btnPagar.textContent = "Conectando con el banco...";
  btnPagar.disabled = true;
  btnPagar.style.opacity = "0.7";

  setTimeout(async () => {
    try {
      const res = await apiFetch(`/vinilos/${viniloEnProceso.id}/comprar`, { 
        method: "POST",
        body: JSON.stringify({ payment_intent: intentoDePagoActual })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.msg);

      cerrarModalPago();
      document.getElementById("formPago").reset();
      
      document.getElementById("compraTitulo").textContent = viniloEnProceso.titulo;
      document.getElementById("compraArtista").textContent = viniloEnProceso.artista;
      document.getElementById("compraFormato").textContent = viniloEnProceso.tamano;
      document.getElementById("compraCantidad").textContent = "1 Unidad";
      document.getElementById("compraPrecio").textContent = `$${Number(viniloEnProceso.precio).toFixed(2)}`;

      document.getElementById("modalCompra").style.display = "flex";

      await cargarVinilos(); 
      
    } catch (err) {
      alert("Error del banco: " + err.message);
    } finally {
      btnPagar.textContent = "Pagar y Finalizar";
      btnPagar.disabled = false;
      btnPagar.style.opacity = "1";
    }
  }, 2000); 
}

function cerrarModalCompra() {
  document.getElementById("modalCompra").style.display = "none";
}