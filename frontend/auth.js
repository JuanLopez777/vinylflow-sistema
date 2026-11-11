const API_BASE = "/api";

const Auth = {
  get token() { return localStorage.getItem("vf_token"); },
  get usuario() {
    try { return JSON.parse(localStorage.getItem("vf_user") || "null"); }
    catch { return null; }
  },
  guardar(token, usuario) {
    localStorage.setItem("vf_token", token);
    localStorage.setItem("vf_user", JSON.stringify(usuario));
  },
  limpiar() {
    localStorage.removeItem("vf_token");
    localStorage.removeItem("vf_user");
  },
  headers() {
    return {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${this.token}`,
    };
  },
  esAdmin() { return this.usuario?.rol === "admin"; },
  requerirLogin() {
    if (!this.token || !this.usuario) {
      window.location.href = "/login.html";
      return false;
    }
    return true;
  },
  logout() {
    this.limpiar();
    window.location.href = "/login.html";
  },
};

async function apiFetch(url, options = {}) {
  const res = await fetch(API_BASE + url, {
    ...options,
    headers: { ...Auth.headers(), ...(options.headers || {}) },
  });
  if (res.status === 401) {
    Auth.limpiar();
    window.location.href = "/login.html";
    throw new Error("Sesión expirada");
  }
  return res;
}