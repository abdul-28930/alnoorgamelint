from fastapi import APIRouter, Depends, HTTPException
from ..auth import get_current_user, require_role, UserContext
from ..database import get_supabase_client
from datetime import datetime, timedelta

router = APIRouter()

@router.post("/validate-coupon")
async def validate_coupon(coupon_code: str, user: UserContext = Depends(get_current_user)):
    """Validate coupon and return discount"""
    supabase = get_supabase_client()
    
    # Check if coupon exists and is valid
    result = supabase.table("coupons").select("*").eq("code", coupon_code).eq("is_active", True).is_("used_by", None).execute()
    
    if not result.data:
        raise HTTPException(status_code=404, detail="Invalid or expired coupon")
    
    coupon = result.data[0]
    
    # Check if user can use this coupon
    if coupon["created_for"] and coupon["created_for"] != user.id:
        raise HTTPException(status_code=403, detail="This coupon is not for you")
    
    return {"discount_percentage": coupon["discount_percentage"], "valid": True}

@router.post("/create-first-booking-coupon")
async def create_first_booking_coupon(user: UserContext = Depends(get_current_user)):
    """Create first booking coupon for new user"""
    supabase = get_supabase_client()
    
    # Check if user already has first booking coupon
    existing = supabase.table("coupons").select("*").eq("created_for", user.id).eq("type", "FIRST_BOOKING").execute()
    if existing.data:
        return {"message": "First booking coupon already exists"}
    
    # Create first booking coupon
    coupon_data = {
        "code": f"FIRST{user.id[:8].upper()}",
        "type": "FIRST_BOOKING",
        "discount_percentage": 30.0,
        "created_for": user.id,
        "expires_at": (datetime.now() + timedelta(days=30)).isoformat()
    }
    
    result = supabase.table("coupons").insert(coupon_data).execute()
    return {"message": "First booking coupon created", "code": coupon_data["code"]}

@router.post("/use-referral")
async def use_referral_code(referral_code: str, user: UserContext = Depends(get_current_user)):
    """Use referral code and create coupons for both users"""
    supabase = get_supabase_client()
    
    # Find referrer by referral code
    referrer = supabase.table("user_profiles").select("user_id").eq("referral_code", referral_code).execute()
    if not referrer.data:
        raise HTTPException(status_code=404, detail="Invalid referral code")
    
    referrer_id = referrer.data[0]["user_id"]
    if referrer_id == user.id:
        raise HTTPException(status_code=400, detail="Cannot use your own referral code")
    
    # Check if user is new (no previous bookings)
    bookings = supabase.table("bookings").select("id").eq("user_id", user.id).execute()
    if bookings.data:
        raise HTTPException(status_code=400, detail="Referral codes are only for new users")
    
    # Create referral coupons using SQL function
    supabase.rpc("create_referral_coupons", {"referrer_id": referrer_id, "referee_id": user.id}).execute()
    
    return {"message": "Referral coupons created for both users"}

@router.get("/my-coupons")
async def get_my_coupons(user: UserContext = Depends(get_current_user)):
    """Get user's available coupons"""
    supabase = get_supabase_client()
    result = supabase.table("coupons").select("*").eq("created_for", user.id).execute()
    return result.data

@router.get("/admin/all-coupons")
async def get_all_coupons(user: UserContext = Depends(require_role(["admin"]))):
    """Get all coupons for admin"""
    supabase = get_supabase_client()
    result = supabase.table("coupons").select("*").execute()
    return result.data

@router.post("/admin/create-coupon")
async def create_coupon(
    code: str,
    discount_percentage: float,
    coupon_type: str = "PROMO",
    expires_days: int = 30,
    user: UserContext = Depends(require_role(["admin"]))
):
    """Admin create a general coupon"""
    supabase = get_supabase_client()
    coupon_data = {
        "code": code.upper(),
        "type": coupon_type,
        "discount_percentage": discount_percentage,
        "created_for": None,
        "is_active": True,
        "expires_at": (datetime.now() + timedelta(days=expires_days)).isoformat()
    }
    result = supabase.table("coupons").insert(coupon_data).execute()
    return result.data[0] if result.data else {"message": "Coupon created"} 