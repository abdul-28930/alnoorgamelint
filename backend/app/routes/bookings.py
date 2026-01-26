from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from ..auth import get_current_user, UserContext
from ..database import get_supabase_client
from ..notifications import send_booking_confirmation
from datetime import datetime, timezone, timedelta
from typing import Optional, List

router = APIRouter()

class BookingCreate(BaseModel):
    station_id: Optional[str] = None
    station_type: Optional[str] = None
    start_at: Optional[str] = None
    end_at: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    duration_hours: int
    user_count: int = 1
    advance_payment: bool = False
    food_items: List[str] = []
    food_total: float = 0.0
    coupon_code: Optional[str] = None


@router.get("/prepaid/plans")
async def list_prepaid_plans():
    supabase = get_supabase_client()
    result = supabase.table("prepaid_plans").select("*").eq("active", True).order("price").execute()
    return result.data or []


@router.get("/prepaid/balance")
async def get_prepaid_balance(user: UserContext = Depends(get_current_user)):
    supabase = get_supabase_client()
    result = supabase.table("user_prepaid_cards").select("remaining_minutes").eq("user_id", user.id).execute()
    minutes = sum((row.get("remaining_minutes") or 0) for row in (result.data or []))
    return {"remaining_minutes": minutes}


@router.post("/prepaid/purchase")
async def purchase_prepaid(plan_id: str, user: UserContext = Depends(get_current_user)):
    supabase = get_supabase_client()
    plan_result = supabase.table("prepaid_plans").select("*").eq("id", plan_id).eq("active", True).single().execute()
    plan = plan_result.data
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    result = supabase.table("user_prepaid_cards").insert({
        "user_id": user.id,
        "plan_id": plan["id"],
        "total_minutes": plan["minutes"],
        "remaining_minutes": plan["minutes"],
    }).execute()
    return result.data[0]


@router.get("/prepaid/my-cards")
async def get_my_prepaid_cards(user: UserContext = Depends(get_current_user)):
    supabase = get_supabase_client()
    result = supabase.table("user_prepaid_cards") \
        .select("id, total_minutes, remaining_minutes, prepaid_plans(name, price, minutes)") \
        .eq("user_id", user.id).execute()
    return result.data or []


def update_booking_statuses():
    """Update booking statuses based on current IST time"""
    supabase = get_supabase_client()
    
    # Use IST timezone to match stored booking times
    ist_tz = timezone(timedelta(hours=5, minutes=30))
    now = datetime.now(ist_tz)
    # Format to match stored format: "YYYY-MM-DD HH:MM:SS"
    now_str = now.strftime("%Y-%m-%d %H:%M:%S")
    
    try:
        # Direct UPCOMING -> ENDED (for past bookings, exclude reservations)
        result1 = supabase.table("bookings").update({"status": "ENDED"}) \
            .eq("status", "UPCOMING") \
            .lte("end_at", now_str) \
            .not_.is_("start_time", "null") \
            .execute()
        
        # UPCOMING -> ONGOING (for current sessions, exclude reservations)
        result2 = supabase.table("bookings").update({"status": "ONGOING"}) \
            .eq("status", "UPCOMING") \
            .lte("start_at", now_str) \
            .gt("end_at", now_str) \
            .not_.is_("start_time", "null") \
            .execute()
        
        # ONGOING -> ENDED (for finished current sessions, but exclude checked-in bookings)
        result3 = supabase.table("bookings").update({"status": "ENDED"}) \
            .eq("status", "ONGOING") \
            .lte("end_at", now_str) \
            .neq("checked_in", True) \
            .execute()
            
        print(f"Status updates: {len(result1.data or [])} ended, {len(result2.data or [])} ongoing, {len(result3.data or [])} finished")
        
    except Exception as e:
        print(f"Error updating booking statuses: {e}")

@router.get("/stations/availability-by-type")
async def get_availability_by_type(type: str = Query(...), date: str = Query(...)):
    """Get available time slots for a station type (PC/PS5)"""
    print(f"🔍 [DEBUG] Route hit: type={type}, date={date}")
    supabase = get_supabase_client()
    
    # Get all active stations of this type
    stations_result = supabase.table("stations").select("*").eq("type", type).eq("active", True).execute()
    all_stations = stations_result.data or []
    
    if not all_stations:
        return []
    
    # Generate time slots (24 hours: 00:00 - 23:00 = 24 slots)
    time_slots = []
    for hour in range(0, 24):  # 00:00 to 23:00 (24 hours)
        hour_slot = f"{hour:02d}:00:00"
        
        # Check how many stations are available at this time
        available_stations = []
        for station in all_stations:
            # Check if station is booked at this time slot (format: "YYYY-MM-DD HH:MM:SS")
            start_time_str = f"{date} {hour_slot}"
            # Handle hour 23: end time should be next day 00:00:00
            if hour == 23:
                next_day = (datetime.strptime(date, "%Y-%m-%d") + timedelta(days=1)).strftime("%Y-%m-%d")
                end_time_str = f"{next_day} 00:00:00"
            else:
                end_time_str = f"{date} {hour+1:02d}:00:00"
            
            bookings_result = supabase.table("bookings").select("*") \
                .eq("station_id", station["id"]) \
                .lt("start_at", end_time_str) \
                .gt("end_at", start_time_str) \
                .neq("status", "CANCELLED") \
                .execute()
            
            if not bookings_result.data:
                available_stations.append(station)
        
        # Pick first available station for auto-assignment (load balancing)
        available_station = None
        if available_stations:
            # Simple load balancing: pick station with fewest bookings today
            station_booking_counts = []
            for station in available_stations:
                count_result = supabase.table("bookings").select("*", count="exact") \
                    .eq("station_id", station["id"]) \
                    .gte("start_at", f"{date}") \
                    .lt("start_at", f"{date} 23:59:59") \
                    .neq("status", "CANCELLED") \
                    .execute()
                station_booking_counts.append({
                    "station": station,
                    "count": count_result.count or 0
                })
            
            # Sort by booking count and pick the one with least bookings
            station_booking_counts.sort(key=lambda x: x["count"])
            available_station = station_booking_counts[0]["station"]
        
        time_slots.append({
            "hour_slot": hour_slot,
            "is_available": len(available_stations) > 0,
            "available_count": len(available_stations),
            "total_count": len(all_stations),
            "available_station": available_station
        })
    
    return time_slots

@router.get("/stations")
async def get_stations():
    """Get all active stations"""
    supabase = get_supabase_client()
    result = supabase.table("stations").select("*").eq("active", True).execute()
    return result.data

@router.post("/bookings")
async def create_booking(
    booking_data: BookingCreate,
    user: UserContext = Depends(get_current_user)
):
    """Create a new booking"""
    supabase = get_supabase_client()
    
    # Check if this is a reservation (no start_time = reservation)
    is_reservation = booking_data.start_time is None
    
    # Auto-assign station if station_type provided and station_id not provided
    # BUT skip auto-assignment for reservations (they get assigned during check-in)
    station = None
    station_id_to_use = booking_data.station_id
    
    if not station_id_to_use and booking_data.station_type:
        # Get station info for rate calculation (needed even for reservations)
        stations_result = supabase.table("stations").select("*").eq("type", booking_data.station_type).eq("active", True).execute()
        available_stations = stations_result.data or []
        
        if not available_stations:
            raise HTTPException(status_code=404, detail=f"No {booking_data.station_type} stations available")
        
        # For reservations, just get first station for rate calculation, don't assign
        if is_reservation:
            station = available_stations[0]  # Use first station for rate calculation
            station_id_to_use = None  # Don't assign station for reservations
        else:
            # For regular bookings, auto-assign station based on type and time slot
            # Parse the date from start_at (format: "YYYY-MM-DD HH:MM:SS")
            booking_date = booking_data.start_at.split(' ')[0]
            
            # Find available stations at this time slot
            available_at_slot = []
            for station in available_stations:
                # Check for overlapping bookings
                overlap_result = supabase.table("bookings").select("*") \
                    .eq("station_id", station["id"]) \
                    .gte("start_at", booking_data.start_at) \
                    .lt("start_at", booking_data.end_at) \
                    .neq("status", "CANCELLED") \
                    .execute()
                
                if not overlap_result.data:
                    available_at_slot.append(station)
            
            if not available_at_slot:
                raise HTTPException(status_code=400, detail="No stations available at selected time slot")
            
            # Load balancing: pick station with fewest bookings today
            station_booking_counts = []
            for station in available_at_slot:
                count_result = supabase.table("bookings").select("*", count="exact") \
                    .eq("station_id", station["id"]) \
                    .gte("start_at", f"{booking_date}") \
                    .lt("start_at", f"{booking_date} 23:59:59") \
                    .neq("status", "CANCELLED") \
                    .execute()
                station_booking_counts.append({
                    "station": station,
                    "count": count_result.count or 0
                })
            
            # Sort by booking count and pick the one with least bookings
            station_booking_counts.sort(key=lambda x: x["count"])
            station = station_booking_counts[0]["station"]
            station_id_to_use = station["id"]
    
    elif station_id_to_use:
        # Use provided station_id (backward compatibility)
        station_result = supabase.table("stations").select("*").eq("id", station_id_to_use).eq("active", True).execute()
        if not station_result.data:
            raise HTTPException(status_code=404, detail="Station not found or inactive")
        station = station_result.data[0]
    elif not is_reservation:
        # Only require station for non-reservations
        raise HTTPException(status_code=400, detail="Either station_id or station_type must be provided")
    else:
        # For reservations without station_type, get any station for rate calculation
        stations_result = supabase.table("stations").select("*").eq("active", True).execute()
        if stations_result.data:
            station = stations_result.data[0]  # Use first station for rate calculation
            station_id_to_use = None  # Don't assign
        else:
            raise HTTPException(status_code=404, detail="No stations available")
    
    # Calculate total amount: hourly_rate × duration × user_count + food
    base_amount = (station["hourly_rate"] * booking_data.duration_hours * booking_data.user_count) + booking_data.food_total
    
    # Apply coupon discount if provided
    discount_amount = 0
    if booking_data.coupon_code:
        coupon_result = supabase.table("coupons").select("*").eq("code", booking_data.coupon_code).eq("is_active", True).is_("used_by", None).execute()
        if coupon_result.data:
            coupon = coupon_result.data[0]
            if not coupon["created_for"] or coupon["created_for"] == user.id:
                discount_amount = round(base_amount * coupon["discount_percentage"] / 100, 2)
                # Mark coupon as used
                supabase.table("coupons").update({"used_by": user.id, "used_at": "now()"}).eq("id", coupon["id"]).execute()
    
    total_amount = base_amount - discount_amount
    
    # Calculate advance payment (30% if selected)
    advance_amount = round(total_amount * 0.3, 2) if booking_data.advance_payment else 0
    remaining_amount = total_amount - advance_amount if booking_data.advance_payment else total_amount
    payment_status = "ADVANCE_PAID" if booking_data.advance_payment else "PENDING"
    
    # Get user profile for email and phone
    profile_result = supabase.table("user_profiles").select("*").eq("user_id", user.id).single().execute()
    
    # If times not provided, calculate default times based on date and duration
    if not booking_data.start_at or not booking_data.end_at:
        # Parse date from start_at if provided, otherwise use today
        if booking_data.start_at:
            booking_date = booking_data.start_at.split(' ')[0]
        else:
            booking_date = datetime.now(timezone(timedelta(hours=5, minutes=30))).strftime("%Y-%m-%d")
        
        default_start_time = "10:00:00"
        start_at = f"{booking_date} {default_start_time}"
        
        # Calculate end time from duration
        start_dt = datetime.strptime(start_at, "%Y-%m-%d %H:%M:%S")
        end_dt = start_dt + timedelta(hours=booking_data.duration_hours)
        end_at = end_dt.strftime("%Y-%m-%d %H:%M:%S")
        
        start_time = "10:00"
        end_time = end_dt.strftime("%H:%M")
    else:
        start_at = booking_data.start_at
        end_at = booking_data.end_at
        start_time = booking_data.start_time  # Preserve null for reservations
        # Preserve null for reservations, only calculate if explicitly needed
        if booking_data.end_time is not None:
            end_time = booking_data.end_time
        else:
            end_time = None  # Keep null for reservations
    
    # Create booking
    booking_data_dict = {
        "user_id": user.id,
        "station_id": station_id_to_use,
        "start_at": start_at,
        "end_at": end_at,
        "start_time": start_time,
        "end_time": end_time,
        "duration_hours": booking_data.duration_hours,
        "user_count": booking_data.user_count,
        "total_amount": total_amount,
        "advance_amount": advance_amount,
        "remaining_amount": remaining_amount,
        "payment_status": payment_status,
        "amount_paid": advance_amount,
        "food_items": booking_data.food_items,
        "food_total": booking_data.food_total,
        "status": "PENDING" if start_time is None else "UPCOMING",
        "coupon_code": booking_data.coupon_code if discount_amount > 0 else None,
        "coupon_discount": discount_amount if discount_amount > 0 else 0
    }
    
    result = supabase.table("bookings").insert(booking_data_dict).execute()
    
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create booking")
    
    # Send confirmation email
    try:
        send_booking_confirmation(user.email, profile_result.data.get("phone") or "", {
            "station_name": station["name"] if station else "TBD",
            "start_at": booking_data.start_at,
            "end_at": booking_data.end_at,
            "total_amount": total_amount
        })
    except Exception as e:
        print(f"Failed to send confirmation email: {e}")
    
    return result.data[0]

@router.get("/bookings")
async def get_user_bookings(user: UserContext = Depends(get_current_user)):
    """Get user's bookings"""
    update_booking_statuses()  # Update statuses first
    supabase = get_supabase_client()
    result = supabase.table("bookings").select("*, stations(*)").eq("user_id", user.id).order("start_at", desc=False).execute()
    return result.data

@router.delete("/bookings/{booking_id}")
async def cancel_booking(
    booking_id: str,
    user: UserContext = Depends(get_current_user)
):
    """Cancel a booking with refund calculation"""
    supabase = get_supabase_client()
    
    # Check if booking belongs to user
    booking_result = supabase.table("bookings").select("*").eq("id", booking_id).eq("user_id", user.id).execute()
    if not booking_result.data:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    booking = booking_result.data[0]
    
    # Calculate refund based on time elapsed
    created_at = datetime.fromisoformat(booking["created_at"].replace('Z', '+00:00'))
    now = datetime.now(timezone.utc)
    time_elapsed = now - created_at
    
    amount_paid = booking.get("amount_paid", 0) or 0
    
    # Refund logic: 1 hour grace period, then 5% fee
    if time_elapsed.total_seconds() <= 3600:  # 1 hour = 3600 seconds
        refund_amount = amount_paid
        cancellation_fee = 0
    else:
        cancellation_fee = round(amount_paid * 0.05, 2)
        refund_amount = amount_paid - cancellation_fee
    
    # Update booking with cancellation and refund info
    try:
        result = supabase.table("bookings").update({
            "status": "CANCELLED",
            "cancelled_at": now.isoformat(),
            "refund_amount": refund_amount,
            "cancellation_fee": cancellation_fee
        }).eq("id", booking_id).execute()
        
        return {
            "message": "Booking cancelled successfully",
            "refund_amount": refund_amount,
            "cancellation_fee": cancellation_fee
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to cancel booking")

