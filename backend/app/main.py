from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.background import BackgroundScheduler

app = FastAPI(
    title="Neo Gaming Cafe API",
    description="Backend API for Neo Gaming Cafe booking system",
    version="0.1.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure properly for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "Neo Gaming Cafe API is running"}

@app.get("/healthz")
async def health_check():
    return {"status": "healthy"}

# Import routes
from .routes import auth, bookings, admin, coupons, tournaments, points

app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(bookings.router, prefix="/api/v1", tags=["bookings"])
app.include_router(admin.router, prefix="/api/v1/admin", tags=["admin"])
app.include_router(coupons.router, prefix="/api/v1", tags=["coupons"])
app.include_router(tournaments.router, prefix="/api/v1", tags=["tournaments"])
app.include_router(points.router, prefix="/api/v1", tags=["points"])

# Start reminder scheduler
from .notifications import check_and_send_reminders
scheduler = BackgroundScheduler()
scheduler.add_job(check_and_send_reminders, 'interval', minutes=5)
scheduler.start()  # RE-ENABLED 