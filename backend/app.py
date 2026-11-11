from functools import wraps

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from flask_jwt_extended import (
    JWTManager, create_access_token, jwt_required, get_jwt,
)
from werkzeug.security import check_password_hash, generate_password_hash

from config import Config
from database import get_db

app = Flask(__name__)
app.config.from_object(Config)
CORS(app, allow_headers=["Content-Type", "Authorization"])
jwt = JWTManager(app)


# ---------- HEALTH ----------
@app.get("/api/health")
def health():
    return jsonify({"status": "ok", "app": "VinylFlow"})


# ---------- LOGIN ----------
@app.post("/api/auth/login")
def login():
    d = request.get_json() or {}
    email    = (d.get("email")    or "").strip().lower()
    password =  d.get("password") or ""

    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM usuarios WHERE email=%s AND activo=1", (email,))
            user = cur.fetchone()
    finally:
        conn.close()

    if not user or not check_password_hash(user["password_hash"], password):
        return jsonify({"msg": "Credenciales incorrectas"}), 401

    token = create_access_token(
        identity=str(user["id"]),
        additional_claims={"rol": user["rol"], "nombre": user["nombre"]},
    )
    return jsonify({
        "token": token,
        "usuario": {
            "id": user["id"], "nombre": user["nombre"],
            "email": user["email"], "rol": user["rol"],
        },
    })


# ---------- REGISTRO (compradores ilimitados) ----------
@app.post("/api/auth/register")
def register():
    d = request.get_json() or {}
    nombre   = (d.get("nombre")   or "").strip()
    email    = (d.get("email")    or "").strip().lower()
    password =  d.get("password") or ""

    if not nombre or not email or not password:
        return jsonify({"msg": "Nombre, correo y contraseña son obligatorios"}), 400
    if "@" not in email:
        return jsonify({"msg": "Correo inválido"}), 400
    if len(password) < 6:
        return jsonify({"msg": "La contraseña debe tener mínimo 6 caracteres"}), 400

    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM usuarios WHERE email=%s", (email,))
            if cur.fetchone():
                return jsonify({"msg": "Ese correo ya está registrado"}), 409

            cur.execute(
                """INSERT INTO usuarios (nombre,email,password_hash,rol)
                   VALUES (%s,%s,%s,'comprador')""",
                (nombre, email, generate_password_hash(password)),
            )
            uid = cur.lastrowid
    finally:
        conn.close()

    token = create_access_token(
        identity=str(uid),
        additional_claims={"rol": "comprador", "nombre": nombre},
    )
    return jsonify({
        "token": token,
        "usuario": {"id": uid, "nombre": nombre, "email": email, "rol": "comprador"},
    }), 201


# ---------- PERMISOS ----------
def admin_required(fn):
    @wraps(fn)
    @jwt_required()
    def wrapper(*args, **kwargs):
        if get_jwt().get("rol") != "admin":
            return jsonify({"msg": "Permiso denegado: solo administradores"}), 403
        return fn(*args, **kwargs)
    return wrapper


# ---------- CRUD VINILOS ----------
@app.get("/api/vinilos")
@jwt_required()
def listar_vinilos():
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM vinilos ORDER BY id DESC")
            rows = cur.fetchall()
    finally:
        conn.close()
    return jsonify(rows)


@app.post("/api/vinilos")
@admin_required
def crear_vinilo():
    d = request.get_json() or {}
    required = ["titulo", "artista", "anio", "sello", "genero", "tamano", "estado"]
    if not all(d.get(k) for k in required):
        return jsonify({"msg": "Faltan campos obligatorios"}), 400

    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO vinilos
                   (titulo,artista,anio,sello,genero,tamano,estado,stock,precio,imagen)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                (d["titulo"], d["artista"], int(d["anio"]), d["sello"],
                 d["genero"], d["tamano"], d["estado"],
                 int(d.get("stock", 0)), float(d.get("precio", 0)),
                 d.get("imagen", "")),
            )
            nid = cur.lastrowid
    finally:
        conn.close()
    return jsonify({"id": nid, **d}), 201


@app.put("/api/vinilos/<int:vid>")
@admin_required
def actualizar_vinilo(vid):
    d = request.get_json() or {}
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """UPDATE vinilos SET titulo=%s,artista=%s,anio=%s,sello=%s,
                   genero=%s,tamano=%s,estado=%s,stock=%s,precio=%s,imagen=%s
                   WHERE id=%s""",
                (d["titulo"], d["artista"], int(d["anio"]), d["sello"],
                 d["genero"], d["tamano"], d["estado"],
                 int(d.get("stock", 0)), float(d.get("precio", 0)),
                 d.get("imagen", ""), vid),
            )
    finally:
        conn.close()
    return jsonify({"ok": True})


@app.delete("/api/vinilos/<int:vid>")
@admin_required
def borrar_vinilo(vid):
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM vinilos WHERE id=%s", (vid,))
    finally:
        conn.close()
    return jsonify({"ok": True})


@app.post("/api/vinilos/<int:vid>/comprar")
@jwt_required()
def comprar_vinilo(vid):
    conn = get_db()
    try:
        with conn.cursor() as cur:
            # Verificar stock actual
            cur.execute("SELECT stock, titulo FROM vinilos WHERE id=%s", (vid,))
            vinilo = cur.fetchone()
            
            if not vinilo:
                return jsonify({"msg": "El vinilo no existe"}), 404
            if vinilo["stock"] <= 0:
                return jsonify({"msg": f"Lo sentimos, '{vinilo['titulo']}' está agotado"}), 400
                
            # Descontar 1 unidad
            cur.execute("UPDATE vinilos SET stock = stock - 1 WHERE id=%s", (vid,))
    finally:
        conn.close()
        
    return jsonify({"ok": True, "msg": f"¡Compra simulada de '{vinilo['titulo']}' exitosa!"})

# ---------- SERVIR FRONTEND ----------
@app.get("/")
def index_page():
    return send_from_directory(Config.FRONTEND_DIR, "login.html")

@app.get("/<path:path>")
def assets(path):
    if path.startswith("api/"):
        return jsonify({"msg": "Ruta no encontrada"}), 404
    return send_from_directory(Config.FRONTEND_DIR, path)


# ---------- ARRANQUE ----------
if __name__ == "__main__":
    app.run(debug=True, port=5000)