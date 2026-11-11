// 1. Si ya hay una sesión activa, redirigir según el rol
if (Auth.token && Auth.usuario) {
    if (Auth.esAdmin()) {
        window.location.href = "/admin.html";
    } else {
        window.location.href = "/comprador.html";
    }
}

// --- Lógica de las pestañas ---
document.querySelectorAll(".auth-tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".auth-tab").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.dataset.tab;
    document.getElementById("formLogin").style.display    = tab === "login"    ? "block" : "none";
    document.getElementById("formRegister").style.display = tab === "register" ? "block" : "none";
  });
});

// --- INICIAR SESIÓN ---
document.getElementById("formLogin").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = document.getElementById("loginMsg");
  msg.textContent = "Verificando…";
  msg.className = "auth-msg";

  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email:    document.getElementById("loginEmail").value.trim(),
        password: document.getElementById("loginPassword").value,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.msg || "Error al iniciar sesión");
    
    Auth.guardar(data.token, data.usuario);
    
    // 2. Redirección inteligente según el rol al iniciar sesión
    if (data.usuario.rol === 'admin') {
        window.location.href = "/admin.html";
    } else {
        window.location.href = "/comprador.html";
    }
  } catch (err) {
    msg.textContent = err.message;
    msg.className = "auth-msg error";
  }
});

// --- REGISTRARSE ---
document.getElementById("formRegister").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = document.getElementById("registerMsg");
  msg.textContent = "Creando cuenta…";
  msg.className = "auth-msg";

  try {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre:   document.getElementById("regNombre").value.trim(),
        email:    document.getElementById("regEmail").value.trim(),
        password: document.getElementById("regPassword").value,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.msg || "Error al registrarse");
    
    Auth.guardar(data.token, data.usuario);
    
    // 3. Redirección inteligente según el rol al registrarse
    if (data.usuario.rol === 'admin') {
        window.location.href = "/admin.html";
    } else {
        window.location.href = "/comprador.html";
    }
  } catch (err) {
    msg.textContent = err.message;
    msg.className = "auth-msg error";
  }
});