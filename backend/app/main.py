from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import auth, usuarios

app = FastAPI(
    title="Trinnova API",
    description="Sistema de gestión y emisión de documentos",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth.router,     prefix="/api/v1/auth",     tags=["Autenticación"])
app.include_router(usuarios.router, prefix="/api/v1/usuarios", tags=["Usuarios"])


@app.get("/")
def root():
    return {"status": "ok", "app": "Trinnova API"}


@app.get("/health")
def health():
    return {"status": "healthy"}