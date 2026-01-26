from fastapi import APIRouter, Depends, HTTPException
from ..auth import get_current_user, UserContext
from ..database import get_supabase_client

router = APIRouter()

@router.get("/user/points")
async def get_user_points(user: UserContext = Depends(get_current_user)):
    """Get user's current points balance"""
    supabase = get_supabase_client()
    
    result = supabase.table("user_profiles").select("points_balance").eq("user_id", user.id).single().execute()
    
    if not result.data:
        return {"points_balance": 0}
    
    return {"points_balance": result.data["points_balance"] or 0}

@router.get("/user/points/history")
async def get_points_history(user: UserContext = Depends(get_current_user)):
    """Get user's points transaction history"""
    supabase = get_supabase_client()
    
    result = supabase.table("points_transactions").select("*").eq("user_id", user.id).order("created_at", desc=True).limit(50).execute()
    
    return result.data or []

@router.get("/points/rewards")
async def get_rewards():
    """Get available rewards catalog"""
    supabase = get_supabase_client()
    
    result = supabase.table("points_rewards").select("*").eq("active", True).order("points_cost").execute()
    
    return result.data or []

@router.post("/points/redeem/{reward_id}")
async def redeem_reward(reward_id: str, user: UserContext = Depends(get_current_user)):
    """Redeem points for a reward"""
    supabase = get_supabase_client()
    
    try:
        # Call the database function to handle redemption
        result = supabase.rpc("redeem_points_for_reward", {
            "user_id_param": user.id,
            "reward_id_param": reward_id
        }).execute()
        
        if result.data and result.data.get("success"):
            return {
                "message": "Reward redeemed successfully!",
                "coupon_code": result.data.get("coupon_code"),
                "points_deducted": result.data.get("points_deducted")
            }
        else:
            error_msg = result.data.get("error", "Redemption failed") if result.data else "Redemption failed"
            raise HTTPException(status_code=400, detail=error_msg)
            
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to redeem reward")

def award_points_for_payment(user_id: str, booking_id: str, amount_paid: float):
    """Helper function to award points for booking payment"""
    supabase = get_supabase_client()
    
    try:
        # Call the database function to award points
        result = supabase.rpc("award_points_for_booking", {
            "booking_id_param": booking_id,
            "user_id_param": user_id,
            "amount_paid": amount_paid
        }).execute()
        
        return result.data
    except Exception as e:
        print(f"Error awarding points: {e}")
        return 0 