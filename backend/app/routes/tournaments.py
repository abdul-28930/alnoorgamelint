from fastapi import APIRouter, Depends, HTTPException
from ..auth import get_current_user, require_role, UserContext
from ..database import get_supabase_client, get_supabase_admin_client
from pydantic import BaseModel

router = APIRouter()

class TournamentCreate(BaseModel):
    name: str
    game: str
    platform: str
    max_players: int
    tournament_type: str
    description: str = ""
    banner_image: str = ""

@router.get("/tournaments")
async def get_tournaments():
    """Get all active tournaments for users"""
    supabase = get_supabase_client()
    result = supabase.table("tournaments").select("*").eq("status", "open").execute()
    return result.data

@router.post("/tournaments/{tournament_id}/register")
async def register_for_tournament(tournament_id: str, user: UserContext = Depends(get_current_user)):
    """Register user for tournament"""
    supabase = get_supabase_client()
    
    # Check if tournament exists and is open
    tournament = supabase.table("tournaments").select("*").eq("id", tournament_id).eq("status", "open").execute()
    if not tournament.data:
        raise HTTPException(status_code=404, detail="Tournament not found or not open")
    
    # Check if already registered
    existing = supabase.table("tournament_registrations").select("*").eq("tournament_id", tournament_id).eq("user_id", user.id).execute()
    if existing.data:
        raise HTTPException(status_code=400, detail="Already registered")
    
    # Register user
    result = supabase.table("tournament_registrations").insert({
        "tournament_id": tournament_id,
        "user_id": user.id
    }).execute()
    
    return {"message": "Registered successfully"}

@router.get("/admin/tournaments")
async def get_all_tournaments(user: UserContext = Depends(require_role(["admin"]))):
    """Get all tournaments for admin"""
    supabase = get_supabase_admin_client()
    result = supabase.table("tournaments").select("*").order("created_at", desc=True).execute()
    return result.data

@router.post("/admin/tournaments")
async def create_tournament(tournament: TournamentCreate, user: UserContext = Depends(require_role(["admin"]))):
    """Create new tournament"""
    supabase = get_supabase_admin_client()
    
    result = supabase.table("tournaments").insert({
        "name": tournament.name,
        "game": tournament.game,
        "platform": tournament.platform,
        "max_players": tournament.max_players,
        "tournament_type": tournament.tournament_type,
        "description": tournament.description,
        "banner_image": tournament.banner_image
    }).execute()
    
    return {"message": "Tournament created", "id": result.data[0]["id"]}

@router.put("/admin/tournaments/{tournament_id}/status")
async def update_tournament_status(tournament_id: str, status: str, user: UserContext = Depends(require_role(["admin"]))):
    """Update tournament status"""
    supabase = get_supabase_admin_client()
    
    if status not in ["draft", "open", "paused", "active", "completed"]:
        raise HTTPException(status_code=400, detail="Invalid status")
    
    result = supabase.table("tournaments").update({"status": status}).eq("id", tournament_id).execute()
    return {"message": f"Tournament status updated to {status}"}

@router.get("/admin/tournaments/{tournament_id}/registrations")
async def get_tournament_registrations(tournament_id: str, user: UserContext = Depends(require_role(["admin"]))):
    """Get tournament registrations"""
    supabase = get_supabase_admin_client()
    result = supabase.table("tournament_registrations").select("*, user_profiles!user_id(username, full_name)").eq("tournament_id", tournament_id).execute()
    return result.data 