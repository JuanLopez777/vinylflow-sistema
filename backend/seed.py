from werkzeug.security import generate_password_hash
from database import get_db

ADMINS = [
    ("Alexa del Carmen Ramírez Gómez", "alexa@vinylflow.com",     "admin123"),
    ("Juan Pablo López Gómez",         "juanpablo@vinylflow.com", "admin123"),
    ("Mariana Yamile Alvarez Camacho", "mariana@vinylflow.com",   "admin123"),
    ("Fedro Rojas Plata",              "fedro@vinylflow.com",     "admin123"),
    ("Administrador Cinco",            "admin5@vinylflow.com",    "admin123"),
]

def seed():
    conn = get_db()
    try:
        with conn.cursor() as cur:
            for nombre, email, pw in ADMINS:
                cur.execute("SELECT id FROM usuarios WHERE email=%s", (email,))
                if cur.fetchone():
                    print(f"[=] Ya existe: {email}")
                    continue
                cur.execute(
                    """INSERT INTO usuarios (nombre, email, password_hash, rol)
                       VALUES (%s, %s, %s, 'admin')""",
                    (nombre, email, generate_password_hash(pw)),
                )
                print(f"[+] Admin creado: {email}")
    finally:
        conn.close()
    print("--- Seed completado ---")

if __name__ == "__main__":
    seed()