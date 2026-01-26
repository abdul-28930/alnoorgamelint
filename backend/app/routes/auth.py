from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from ..auth import get_current_user, UserContext
from ..database import get_supabase_client, get_supabase_admin_client

router = APIRouter()

class SignupRequest(BaseModel):
    email: str
    password: str
    full_name: str
    username: str
    phone: str

class LoginRequest(BaseModel):
    email_or_username: str
    password: str

@router.post("/signup")
async def signup(request: SignupRequest):
    """Create new user account with profile"""
    supabase = get_supabase_admin_client()
    
    try:
        # Check username availability first
        username_check = supabase.rpc("is_username_available", {"check_username": request.username}).execute()
        if not username_check.data:
            raise HTTPException(status_code=400, detail="Username is already taken")
        
        # Create auth user
        auth_result = supabase.auth.admin.create_user({
            "email": request.email,
            "password": request.password,
            "email_confirm": True
        })
        
        if not auth_result.user:
            raise HTTPException(status_code=400, detail="Failed to create user")
        
        # Create user profile
        profile_data = {
            "user_id": auth_result.user.id,
            "username": request.username,
            "full_name": request.full_name,
            "phone": request.phone
        }
        
        profile_result = supabase.table("user_profiles").insert(profile_data).execute()
        
        if not profile_result.data:
            # Cleanup: delete the auth user if profile creation fails
            supabase.auth.admin.delete_user(auth_result.user.id)
            raise HTTPException(status_code=500, detail="Failed to create user profile")
        
        return {"message": "Account created successfully", "user_id": auth_result.user.id}
        
    except Exception as e:
        if "Username is already taken" in str(e) or "Failed to create user" in str(e):
            raise e
        raise HTTPException(status_code=500, detail="Signup failed")

@router.post("/login-with-username")
async def login_with_username(request: LoginRequest):
    """Get email for username or return email as-is"""
    supabase = get_supabase_admin_client()
    
    # If email, return as-is
    if "@" in request.email_or_username:
        return {"email": request.email_or_username}
    
    # If username, lookup email
    try:
        profile = supabase.table("user_profiles").select("user_id").eq("username", request.email_or_username).single().execute()
        if not profile.data:
            raise HTTPException(status_code=404, detail="Username not found")
        
        user = supabase.auth.admin.get_user_by_id(profile.data["user_id"])
        return {"email": user.user.email}
    except:
        raise HTTPException(status_code=404, detail="Username not found")

@router.post("/check-username")
async def check_username(username: str = Query(...)):
    """Check if username is available"""
    supabase = get_supabase_admin_client()
    
    try:
        result = supabase.rpc("is_username_available", {"check_username": username}).execute()
        return {"available": result.data}
    except Exception as e:
        return {"available": False}

@router.get("/profile")
async def get_profile(user: UserContext = Depends(get_current_user)):
    """Get current user profile"""
    return {
        "id": user.id,
        "email": user.email,
        "role": user.role
    }

@router.put("/profile")
async def update_profile(
    profile_data: dict,
    user: UserContext = Depends(get_current_user)
):
    """Update user profile"""
    supabase = get_supabase_client()
    
    # Only allow updating safe fields  
    allowed_fields = ["full_name", "profile_pic_url", "phone"]
    update_data = {k: v for k, v in profile_data.items() if k in allowed_fields}
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No valid fields to update")
    
    try:
        result = supabase.table("user_profiles").update(update_data).eq("user_id", user.id).execute()
        return {"message": "Profile updated successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to update profile")











