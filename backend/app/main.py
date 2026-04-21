from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import auth, usuarios, proyectos, roles, dashboard, analisis, plantillas

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

app.include_router(auth.router,      prefix="/api/v1/auth",      tags=["Autenticación"])
app.include_router(usuarios.router,  prefix="/api/v1/usuarios",  tags=["Usuarios"])
app.include_router(proyectos.router, prefix="/api/v1/proyectos", tags=["Proyectos"])
app.include_router(roles.router,     prefix="/api/v1/roles",     tags=["Roles"])
app.include_router(dashboard.router, prefix="/api/v1/dashboard", tags=["Dashboard"])
app.include_router(analisis.router, prefix="/api/v1/analisis", tags=["Análisis"])
app.include_router(plantillas.router, prefix="/api/v1/plantillas", tags=["Plantillas"])


@app.get("/")
def root():
    return {"status": "ok", "app": "Trinnova API"}

@app.get("/health")
def health():
    return {"status": "healthy"}