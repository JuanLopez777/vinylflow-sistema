import os
import logging
from functools import wraps
from datetime import timedelta

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from flask_jwt_extended import (
    JWTManager, create_access_token, jwt_required, get_jwt,
    get_jwt_identity, decode_token
)
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from werkzeug.security import check_password_hash, generate_password_hash

from config import Config
from database import get_db

# 1. Configuración de Logs (Para auditar el servidor en producción)
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

app = Flask(__name__)
app.config.from_object(Config)
CORS(app, allow_headers=["Content-Type", "Authorization"])
jwt = JWTManager(app)

# 2. Rate Limiting (Protección contra Fuerza Bruta)
limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=["200 per day", "50 per hour"],
    storage_uri="memory://",
)

# 3. Manejo Global de Errores
@app.errorhandler(500)
def internal_error(error):
    logging.error(f"Error en el servidor: {error}")
    return jsonify({"msg": "Error interno del servidor. Intente más tarde."}), 500

@app.errorhandler(404)
def not_found(error):
    return jsonify({"msg": "Ruta no encontrada"}), 404

# 4. Lista negra de Tokens (Para hacer un Logout real)
TOKEN_BLACKLIST = set()

@jwt.token_in_blocklist_loader
def check_if_token_revoked(jwt_header, jwt_payload: dict) -> bool:
    return jwt_payload["jti"] in TOKEN_BLACKLIST

# ---------- HEALTH ----------
@app.get("/api/health")
def health():
    return jsonify({"status": "ok", "app": "VinylFlow"})

# ---------- AUTH ----------
@app.post("/api/auth/login")
@limiter.limit("5 per minute") # Solo 5 intentos por minuto
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
        logging.warning(f"Intento de login fallido para: {email}")
        return jsonify({"msg": "Credenciales incorrectas"}), 401

    token = create_access_token(
        identity=str(user["id"]),
        additional_claims={"rol": user["rol"], "nombre": user["nombre"]},
    )
    return jsonify({
        "token": token,
        "usuario": {"id": user["id"], "nombre": user["nombre"], "email": user["email"], "rol": user["rol"]},
    })

@app.post("/api/auth/logout")
@jwt_required()
def logout():
    jti = get_jwt()["jti"]
    TOKEN_BLACKLIST.add(jti)
    return jsonify({"msg": "Sesión cerrada correctamente"}), 200

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
            return jsonify({"msg": "Permiso denegado"}), 403
        return fn(*args, **kwargs)
    return wrapper


# ---------- CRUD VINILOS (CON PAGINACIÓN) ----------
@app.get("/api/vinilos")
@jwt_required()
def listar_vinilos():
    page = request.args.get('page', 1, type=int)
    limit = request.args.get('limit', 20, type=int)
    offset = (page - 1) * limit

    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) as total FROM vinilos")
            total = cur.fetchone()["total"]

            cur.execute("SELECT * FROM vinilos ORDER BY id DESC LIMIT %s OFFSET %s", (limit, offset))
            rows = cur.fetchall()
    finally:
        conn.close()
    
    return jsonify({
        "data": rows,
        "meta": {
            "total_items": total,
            "current_page": page,
            "total_pages": (total + limit - 1) // limit
        }
    })

@app.post("/api/vinilos")
@admin_required
def crear_vinilo():
    d = request.get_json() or {}
    required = ["titulo", "artista", "anio", "sello", "genero", "tamano", "estado"]
    if not all(d.get(k) for k in required):
        return jsonify({"msg": "Faltan campos obligatorios"}), 400

    try:
        stock = int(d.get("stock", 0))
        precio = float(d.get("precio", 0))
        anio = int(d["anio"])
    except ValueError:
        return jsonify({"msg": "Stock, Precio o Año inválidos"}), 400

    if stock < 0 or precio < 0:
        return jsonify({"msg": "Stock y precio no pueden ser negativos"}), 400

    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO vinilos (titulo,artista,anio,sello,genero,tamano,estado,stock,precio,imagen)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                (d["titulo"], d["artista"], anio, d["sello"], d["genero"], d["tamano"], d["estado"], stock, precio, d.get("imagen", "")),
            )
            nid = cur.lastrowid
    finally:
        conn.close()
    return jsonify({"id": nid, **d}), 201

@app.put("/api/vinilos/<int:vid>")
@admin_required
def actualizar_vinilo(vid):
    d = request.get_json() or {}
    try:
        stock = int(d.get("stock", 0))
        precio = float(d.get("precio", 0))
        anio = int(d["anio"])
    except ValueError:
        return jsonify({"msg": "Stock, Precio o Año inválidos"}), 400

    if stock < 0 or precio < 0:
        return jsonify({"msg": "Stock y precio no pueden ser negativos"}), 400

    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """UPDATE vinilos SET titulo=%s,artista=%s,anio=%s,sello=%s,genero=%s,tamano=%s,estado=%s,stock=%s,precio=%s,imagen=%s WHERE id=%s""",
                (d["titulo"], d["artista"], anio, d["sello"], d["genero"], d["tamano"], d["estado"], stock, precio, d.get("imagen", ""), vid),
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


# ---------- PAGOS SEGUROS ----------
@app.post("/api/vinilos/<int:vid>/intent")
@jwt_required()
def crear_intencion_pago(vid):
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT stock FROM vinilos WHERE id=%s", (vid,))
            v = cur.fetchone()
            if not v or v["stock"] <= 0:
                return jsonify({"msg": "Vinilo agotado o no existe"}), 400
    finally:
        conn.close()

    intent_token = create_access_token(
        identity=get_jwt_identity(),
        additional_claims={"type": "payment_intent", "vinilo_id": vid},
        expires_delta=timedelta(minutes=5)
    )
    return jsonify({"payment_intent": intent_token})

@app.post("/api/vinilos/<int:vid>/comprar")
@jwt_required()
def comprar_vinilo(vid):
    data = request.get_json() or {}
    intent_token = data.get("payment_intent")

    if not intent_token:
        return jsonify({"msg": "No se proporcionó intención de pago"}), 402

    try:
        decoded = decode_token(intent_token)
        if (decoded.get("type") != "payment_intent" or decoded.get("vinilo_id") != vid or decoded.get("sub") != get_jwt_identity()):
            raise ValueError("Token inválido")
    except Exception:
        return jsonify({"msg": "Intención de pago inválida o expirada"}), 402

    user_id = get_jwt_identity()

    conn = get_db()
    try:
        with conn.cursor() as cur:
            # 1. Restamos el stock atómicamente
            cur.execute("UPDATE vinilos SET stock = stock - 1 WHERE id=%s AND stock > 0", (vid,))
            if cur.rowcount == 0:
                cur.execute("SELECT stock, titulo FROM vinilos WHERE id=%s", (vid,))
                vinilo = cur.fetchone()
                if not vinilo: return jsonify({"msg": "Vinilo no existe"}), 404
                return jsonify({"msg": f"Lo sentimos, '{vinilo['titulo']}' se acaba de agotar"}), 400
            
            # 2. Obtenemos los datos para el recibo
            cur.execute("SELECT titulo, artista, precio FROM vinilos WHERE id=%s", (vid,))
            vinilo = cur.fetchone()

            # 3. Guardamos la venta en el historial
            cur.execute(
                """INSERT INTO ventas (usuario_id, vinilo_id, titulo_vinilo, artista_vinilo, precio)
                   VALUES (%s, %s, %s, %s, %s)""",
                (user_id, vid, vinilo["titulo"], vinilo["artista"], vinilo["precio"])
            )
    finally:
        conn.close()
        
    return jsonify({"ok": True, "msg": f"¡Compra de '{vinilo['titulo']}' exitosa!"})

@app.get("/api/ventas")
@admin_required
def listar_ventas():
    conn = get_db()
    try:
        with conn.cursor() as cur:
            # Hacemos un JOIN para traer el nombre del comprador
            cur.execute("""
                SELECT v.id, v.titulo_vinilo, v.artista_vinilo, v.precio, v.fecha_venta,
                       u.nombre AS comprador, u.email AS comprador_email
                FROM ventas v
                JOIN usuarios u ON v.usuario_id = u.id
                ORDER BY v.fecha_venta DESC
            """)
            ventas = cur.fetchall()
    finally:
        conn.close()
    return jsonify(ventas)

# ---------- SERVIR FRONTEND ----------
@app.get("/")
def index_page():
    return send_from_directory(Config.FRONTEND_DIR, "login.html")

@app.get("/<path:path>")
def assets(path):
    if path.startswith("api/"):
        return jsonify({"msg": "Ruta no encontrada"}), 404
    return send_from_directory(Config.FRONTEND_DIR, path)

if __name__ == "__main__":
    is_debug = os.getenv("FLASK_ENV") == "development"
    app.run(debug=is_debug, port=5000)