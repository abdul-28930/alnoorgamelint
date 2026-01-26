from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from datetime import datetime, timezone, timedelta
from ..auth import require_role, UserContext
from ..database import get_supabase_admin_client, get_supabase_client
from .bookings import update_booking_statuses
from fastapi.responses import Response
import json
from io import BytesIO

router = APIRouter()

@router.get("/stats/summary")
async def get_stats_summary(
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    user: UserContext = Depends(require_role(["staff", "admin"]))
):
    """Get summary statistics for admin dashboard"""
    update_booking_statuses()
    supabase = get_supabase_admin_client()
    
    # Get all bookings first (since start_at is text type, filter in Python)
    bookings_result = supabase.table("bookings").select("*").neq("status", "CANCELLED").execute()
    all_bookings = bookings_result.data or []
    
    # Filter by date range in Python (since start_at is stored as text "YYYY-MM-DD HH:MM:SS")
    if start_date or end_date:
        filtered_bookings = []
        for booking in all_bookings:
            booking_start = booking.get("start_at", "")
            if not booking_start:
                continue
            
            # Extract date part from "YYYY-MM-DD HH:MM:SS" format
            booking_date = booking_start.split(' ')[0] if ' ' in booking_start else booking_start
            
            # Check if within date range
            if start_date and booking_date < start_date:
                continue
            if end_date and booking_date > end_date:
                continue
            
            filtered_bookings.append(booking)
        
        all_bookings = filtered_bookings
    
    # Get all stations
    stations_result = supabase.table("stations").select("*").eq("active", True).execute()
    active_stations = len(stations_result.data or [])
    
    # Calculate stats
    total_bookings = len(all_bookings)
    paid_bookings = len([b for b in all_bookings if b.get("paid", False)])
    total_revenue = sum([b.get("total_amount", 0) or 0 for b in all_bookings])
    
    # Calculate today's bookings if date range includes today
    today = datetime.now().strftime("%Y-%m-%d")
    today_bookings = len([b for b in all_bookings if b.get("start_at", "").startswith(today)])
    
    # Calculate occupancy rate
    total_stations = active_stations
    occupied_slots = len([b for b in all_bookings if b.get("status") in ["UPCOMING", "ONGOING"]])
    occupancy_rate = (occupied_slots / (total_stations * 24)) * 100 if total_stations > 0 else 0
    
    return {
        "total_bookings": total_bookings,
        "today_bookings": today_bookings,
        "paid_bookings": paid_bookings,
        "total_revenue": total_revenue,
        "occupancy_rate": round(occupancy_rate, 2)
    }

@router.get("/stats/payments")
async def get_payment_stats(user: UserContext = Depends(require_role(["staff", "admin"]))):
    """Get payment statistics"""
    update_booking_statuses()
    supabase = get_supabase_admin_client()
    
    bookings_result = supabase.table("bookings").select("*").neq("status", "CANCELLED").execute()
    all_bookings = bookings_result.data or []
    
    advance_bookings = [b for b in all_bookings if b.get("advance_paid", False)]
    total_advance = sum([b.get("advance_amount", 0) or 0 for b in advance_bookings])
    total_remaining = sum([b.get("remaining_amount", 0) or 0 for b in all_bookings])
    
    return {
        "total_advance_collected": total_advance,
        "total_remaining": total_remaining,
        "advance_bookings_count": len(advance_bookings),
        "total_bookings": len(all_bookings)
    }


@router.get("/prepaid/plans")
async def get_prepaid_plans(user: UserContext = Depends(require_role(["staff", "admin"]))):
    """List all prepaid plans for admin management"""
    supabase = get_supabase_admin_client()
    result = supabase.table("prepaid_plans").select("*").order("created_at").execute()
    return result.data or []


@router.post("/prepaid/plans")
async def upsert_prepaid_plan(plan: dict, user: UserContext = Depends(require_role(["staff", "admin"]))):
    """Create or update a prepaid plan"""
    supabase = get_supabase_admin_client()
    if plan.get("id"):
        result = supabase.table("prepaid_plans").update({
            "name": plan["name"],
            "price": plan["price"],
            "minutes": plan["minutes"],
            "active": plan.get("active", True),
        }).eq("id", plan["id"]).execute()
    else:
        result = supabase.table("prepaid_plans").insert({
            "name": plan["name"],
            "price": plan["price"],
            "minutes": plan["minutes"],
            "active": plan.get("active", True),
        }).execute()
    return result.data[0] if result.data else plan


@router.delete("/prepaid/plans/{plan_id}")
async def delete_prepaid_plan(plan_id: str, user: UserContext = Depends(require_role(["staff", "admin"]))):
    """Delete a prepaid plan"""
    supabase = get_supabase_admin_client()
    supabase.table("prepaid_plans").delete().eq("id", plan_id).execute()
    return {"message": "Deleted"}

@router.get("/bookings")
async def get_all_bookings(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    user: UserContext = Depends(require_role(["staff", "admin"]))
):
    """Get all bookings for staff/admin with pagination"""
    update_booking_statuses()
    supabase = get_supabase_admin_client()
    
    # Get total count
    count_result = supabase.table("bookings").select("id", count="exact").neq("status", "CANCELLED").execute()
    total = count_result.count or 0
    
    # Get paginated data
    start = (page - 1) * limit
    end = start + limit - 1
    result = supabase.table("bookings").select("*, stations(*), user_profiles!bookings_user_fk(username, full_name)").neq("status", "CANCELLED").order("start_at", desc=True).range(start, end).execute()
    
    return {
        "data": result.data or [],
        "total": total,
        "page": page,
        "limit": limit
    }

@router.get("/bookings/cancelled")
async def get_cancelled_bookings(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    user: UserContext = Depends(require_role(["staff", "admin"]))
):
    """Get cancelled bookings with pagination"""
    update_booking_statuses()
    supabase = get_supabase_admin_client()
    
    # Get total count
    count_result = supabase.table("bookings").select("id", count="exact").eq("status", "CANCELLED").execute()
    total = count_result.count or 0
    
    # Get paginated data
    start = (page - 1) * limit
    end = start + limit - 1
    result = supabase.table("bookings").select("*, stations(*), user_profiles!bookings_user_fk(username, full_name)").eq("status", "CANCELLED").order("start_at", desc=True).range(start, end).execute()
    
    return {
        "data": result.data or [],
        "total": total,
        "page": page,
        "limit": limit
    }

@router.get("/bookings/calendar")
async def get_bookings_calendar(user: UserContext = Depends(require_role(["staff", "admin"]))):
    """Get bookings in calendar format"""
    update_booking_statuses()
    supabase = get_supabase_admin_client()
    result = supabase.table("bookings").select("*, stations(name, type)").neq("status", "CANCELLED").execute()
    
    # Group by station and date
    calendar_data = {}
    for booking in result.data or []:
        station_name = booking["stations"]["name"]
        if station_name not in calendar_data:
            calendar_data[station_name] = []
        calendar_data[station_name].append(booking)
    
    return calendar_data

@router.get("/bookings/by-date")
async def get_bookings_by_date(
    date: str = Query(...),
    user: UserContext = Depends(require_role(["staff", "admin"]))
):
    """Get all bookings for a specific date grouped by station"""
    update_booking_statuses()
    supabase = get_supabase_admin_client()
    
    print(f"Searching for bookings on date: {date}")
    
    # Simple date-only search (most reliable)
    result = supabase.table("bookings").select("*, stations(*)") \
        .gte("start_at", f"{date}") \
        .lt("start_at", f"{date}T23:59:59") \
        .order("start_at") \
        .execute()
    
    print(f"Raw query result: {len(result.data or [])} bookings")
    if result.data:
        print(f"Sample booking: {result.data[0].get('start_at', 'No start_at')} - {result.data[0].get('id', 'No ID')}")
    
    # Get user profiles separately
    booking_ids = [b['user_id'] for b in result.data or []]
    user_profiles = {}
    
    if booking_ids:
        profiles_result = supabase.table("user_profiles").select("*").in_("user_id", booking_ids).execute()
        print(f"Found {len(profiles_result.data or [])} user profiles")
        for profile in profiles_result.data or []:
            user_profiles[profile['user_id']] = profile
    
    # Add user profiles to bookings
    for booking in result.data or []:
        booking['user_profiles'] = user_profiles.get(booking['user_id'])
    
    # Group by station
    station_bookings = {}
    for booking in result.data or []:
        station_name = booking["stations"]["name"]
        if station_name not in station_bookings:
            station_bookings[station_name] = []
        station_bookings[station_name].append(booking)
    
    print(f"Grouped into {len(station_bookings)} stations")
    return station_bookings

@router.put("/bookings/{booking_id}")
async def update_booking(booking_id: str, booking_data: dict, user: UserContext = Depends(require_role(["staff", "admin"]))):
    """Update booking details"""
    supabase = get_supabase_admin_client()
    
    # Filter to only valid bookings table columns
    valid_columns = {
        'user_id', 'station_id', 'start_at', 'end_at', 'paid', 'status', 'total_amount',
        'duration_hours', 'booking_notes', 'payment_method', 'cancelled_at', 'updated_at',
        'start_time', 'end_time', 'user_count', 'advance_amount', 'advance_paid', 'advance_payment_method',
        'payment_status', 'remaining_amount', 'amount_paid', 'food_items', 'food_total',
        'refund_amount', 'cancellation_fee', 'discount_type', 'discount_value',
        'original_amount', 'custom_hourly_rate', 'hourly_rate',
        'checked_in', 'coupon_code', 'coupon_discount'
    }
    
    filtered_data = {k: v for k, v in booking_data.items() if k in valid_columns}
    
    # Auto-recalculate total_amount if duration_hours, discount, or hourly_rate changes
    if 'duration_hours' in filtered_data or 'discount_type' in filtered_data or 'discount_value' in filtered_data or 'hourly_rate' in filtered_data:
        booking_result = supabase.table("bookings").select("*, stations(hourly_rate)").eq("id", booking_id).single().execute()
        if booking_result.data:
            booking = booking_result.data
            station = booking.get("stations", {})
            hourly_rate = filtered_data.get('hourly_rate') or booking.get('custom_hourly_rate') or station.get("hourly_rate", 0)
            
            new_duration = filtered_data.get('duration_hours', booking.get('duration_hours', 1))
            user_count = filtered_data.get('user_count', booking.get('user_count', 1))
            food_total = filtered_data.get('food_total', booking.get('food_total', 0))
            
            # Calculate original amount
            original_amount = (hourly_rate * new_duration * user_count) + food_total
            filtered_data['original_amount'] = original_amount
            
            # Store custom hourly rate if provided
            if 'hourly_rate' in filtered_data:
                filtered_data['custom_hourly_rate'] = filtered_data['hourly_rate']
                del filtered_data['hourly_rate']  # Remove hourly_rate key as it's not a real column
            
            # Apply discount
            discount_type = filtered_data.get('discount_type', booking.get('discount_type', 'NONE'))
            discount_value = filtered_data.get('discount_value', booking.get('discount_value', 0))
            
            if discount_type == 'PERCENTAGE':
                discount_amount = original_amount * (discount_value / 100)
            elif discount_type == 'AMOUNT':
                discount_amount = min(discount_value, original_amount)  # Don't exceed original amount
            else:
                discount_amount = 0
                
            filtered_data['total_amount'] = max(0, original_amount - discount_amount)  # Don't go below 0
            # Recalculate remaining_amount when total changes
            amount_paid = booking.get('amount_paid', 0) or 0
            filtered_data['remaining_amount'] = max(0, filtered_data['total_amount'] - amount_paid)
    
    result = supabase.table("bookings").update(filtered_data).eq("id", booking_id).execute()
    
    if not result.data:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    return result.data[0]

@router.put("/bookings/{booking_id}/payment")
async def update_booking_payment(booking_id: str, payment_data: dict, user: UserContext = Depends(require_role(["staff", "admin"]))):
    """Update booking payment amount"""
    supabase = get_supabase_admin_client()
    
    amount_paid = payment_data.get("amount_paid", 0)
    
    # Get current booking
    booking_result = supabase.table("bookings").select("*").eq("id", booking_id).single().execute()
    if not booking_result.data:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    booking = booking_result.data
    total_amount = booking.get("total_amount", 0) or 0
    remaining_amount = max(0, total_amount - amount_paid)
    payment_status = "PAID" if remaining_amount == 0 else "PARTIAL" if amount_paid > 0 else "PENDING"
    
    update_data = {
        "amount_paid": amount_paid,
        "remaining_amount": remaining_amount,
        "payment_status": payment_status,
        "paid": remaining_amount == 0
    }
    
    result = supabase.table("bookings").update(update_data).eq("id", booking_id).execute()
    
    return result.data[0] if result.data else {"message": "Payment updated successfully"}

@router.get("/users")
async def get_all_users(user: UserContext = Depends(require_role(["admin"]))):
    """Get all users for admin"""
    supabase = get_supabase_admin_client()
    
    # Get user profiles
    profiles_result = supabase.table("user_profiles").select("*").execute()
    
    return profiles_result.data or []

@router.post("/user-profiles")
async def get_user_profiles(user_ids: list[str], user: UserContext = Depends(require_role(["staff", "admin"]))):
    """Get user profiles by user IDs"""
    supabase = get_supabase_admin_client()
    
    result = supabase.table("user_profiles").select("*").in_("user_id", user_ids).execute()
    
    return result.data or []

@router.get("/points/transactions")
async def get_points_transactions(current_user: UserContext = Depends(require_role(["admin"]))):
    """Get all points transactions for admin"""
    supabase = get_supabase_admin_client()
    
    result = supabase.table("points_transactions").select(
        "*, user_profiles(username)"
    ).order("created_at", desc=True).execute()
    
    return result.data

@router.get("/admin/emails")
async def get_admin_emails(user: UserContext = Depends(require_role(["admin"]))):
    """Get admin email list"""
    supabase = get_supabase_admin_client()
    
    result = supabase.table("admin_settings").select("admin_emails").single().execute()
    
    if not result.data:
        return []
    
    try:
        import json
        return json.loads(result.data.get("admin_emails", "[]"))
    except:
        return []

@router.put("/admin/emails")
async def update_admin_emails(emails: list[str], user: UserContext = Depends(require_role(["admin"]))):
    """Update admin email list"""
    supabase = get_supabase_admin_client()
    
    import json
    emails_json = json.dumps(emails)
    
    # Update or insert admin settings
    result = supabase.table("admin_settings").upsert({
        "id": 1,
        "admin_emails": emails_json
    }).execute()
    
    return {"message": "Admin emails updated successfully"}

@router.get("/food-items")
async def get_food_items(user: UserContext = Depends(require_role(["admin"]))):
    """Get food items list"""
    supabase = get_supabase_admin_client()
    result = supabase.table("charges_items").select("name, price").eq("active", True).order("name").execute()
    return [{"name": item["name"], "price": float(item.get("price", 0))} for item in (result.data or [])]

@router.put("/food-items")
async def update_food_items(items: list[dict], user: UserContext = Depends(require_role(["admin"]))):
    """Update food items list - replaces all items"""
    supabase = get_supabase_admin_client()
    # Get all existing items and delete them
    existing = supabase.table("charges_items").select("id").execute()
    if existing.data:
        for item in existing.data:
            supabase.table("charges_items").delete().eq("id", item["id"]).execute()
    # Insert new items
    if items:
        insert_data = [{"name": item["name"], "price": float(item.get("price", 0)), "active": True} for item in items]
        supabase.table("charges_items").insert(insert_data).execute()
    return {"message": "Food items updated successfully"}

@router.get("/stations/reservations")
async def get_stations_with_reservations(
    date: str = Query(..., description="Date in YYYY-MM-DD format"),
    user: UserContext = Depends(require_role(["staff", "admin"]))
):
    """Get all stations with their reservations for a specific date"""
    update_booking_statuses()
    supabase = get_supabase_admin_client()
    
    # Get all active stations (sorted by name)
    stations_result = supabase.table("stations").select("*").eq("active", True).order("name").execute()
    stations = stations_result.data or []
    
    # Get all reservations for this date (start_time IS NULL = reservations, not cancelled)
    reservations_result = supabase.table("bookings").select(
        "*, user_profiles!bookings_user_fk(username, full_name), stations(*)"
    ).gte("start_at", f"{date}").lt("start_at", f"{date}T23:59:59").is_("start_time", "null").neq("status", "CANCELLED").neq("status", "ENDED").execute()
    
    reservations = reservations_result.data or []
    
    # ALSO get checked-in bookings (start_time IS NOT NULL AND checked_in = True) - no date filter since start_at is updated on check-in
    checked_in_result = supabase.table("bookings").select(
        "*, user_profiles!bookings_user_fk(username, full_name), stations(*)"
    ).not_.is_("start_time", "null").eq("checked_in", True).neq("status", "CANCELLED").neq("status", "ENDED").execute()
    
    checked_in_bookings = checked_in_result.data or []
    
    # ALSO get ALL unassigned reservations (no station_id) regardless of date for the sidebar
    unassigned_result = supabase.table("bookings").select(
        "*, user_profiles!bookings_user_fk(username, full_name)"
    ).is_("station_id", "null").is_("start_time", "null").neq("status", "CANCELLED").neq("status", "ENDED").execute()
    
    unassigned_bookings = unassigned_result.data or []
    
    # Combine both lists
    bookings = reservations + checked_in_bookings
    
    # Merge unassigned reservations into bookings (avoid duplicates)
    existing_ids = {b.get("id") for b in bookings}
    for unassigned in unassigned_bookings:
        if unassigned.get("id") not in existing_ids:
            bookings.append(unassigned)
    
    # Group bookings by station_id (null bookings are unassigned)
    station_reservations = {}
    unassigned_reservations = []
    
    # Initialize all stations
    for station in stations:
        station_reservations[station["id"]] = {
            "station": station,
            "reservations": []
        }
    
    # Assign bookings to stations
    for booking in bookings:
        if booking.get("station_id") and booking["station_id"] in station_reservations:
            station_id = booking["station_id"]
            is_checked_in = booking.get("checked_in", False) and booking.get("checked_in_at")
            
            if is_checked_in:
                # For checked-in bookings, only keep the most recent one per station
                existing_checked_in = [b for b in station_reservations[station_id]["reservations"] 
                                      if b.get("checked_in", False) and b.get("checked_in_at")]
                if existing_checked_in:
                    # Keep only the most recent checked-in booking
                    existing_latest = max(existing_checked_in, key=lambda b: b.get("checked_in_at", ""))
                    if booking.get("checked_in_at", "") > existing_latest.get("checked_in_at", ""):
                        # Remove old checked-in bookings and add new one
                        station_reservations[station_id]["reservations"] = [
                            b for b in station_reservations[station_id]["reservations"] 
                            if not (b.get("checked_in", False) and b.get("checked_in_at"))
                        ]
                        station_reservations[station_id]["reservations"].append(booking)
                else:
                    # No existing checked-in booking, add this one
                    station_reservations[station_id]["reservations"].append(booking)
            else:
                # Regular reservation, add normally
                station_reservations[station_id]["reservations"].append(booking)
        else:
            # Unassigned reservation (no station_id yet)
            unassigned_reservations.append(booking)
    
    # Convert to list format
    result = []
    for station_id, data in station_reservations.items():
        result.append(data)
    
    # Add unassigned reservations as a special entry
    if unassigned_reservations:
        result.append({
            "station": {"id": None, "name": "Unassigned Reservations", "type": "MIXED"},
            "reservations": unassigned_reservations
        })
    
    return result

@router.post("/bookings/{booking_id}/checkin")
async def checkin_booking(
    booking_id: str,
    station_id: str = Query(..., description="Station ID to assign"),
    user: UserContext = Depends(require_role(["staff", "admin"]))
):
    """Check in a user and assign them to a station"""
    supabase = get_supabase_admin_client()
    
    # Verify station exists and is active
    station_result = supabase.table("stations").select("*").eq("id", station_id).eq("active", True).single().execute()
    if not station_result.data:
        raise HTTPException(status_code=404, detail="Station not found or inactive")
    
    # Get booking
    booking_result = supabase.table("bookings").select("*").eq("id", booking_id).single().execute()
    if not booking_result.data:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    booking = booking_result.data
    
    # Check if already checked in
    if booking.get("checked_in_at"):
        raise HTTPException(status_code=400, detail="Booking already checked in")
    
    # Check if station is available (no overlapping checked-in bookings)
    # Check for ANY active checked-in booking on this station (regardless of date)
    overlap_result = supabase.table("bookings").select("*") \
        .eq("station_id", station_id) \
        .neq("status", "CANCELLED") \
        .neq("status", "ENDED") \
        .neq("id", booking_id) \
        .eq("checked_in", True) \
        .execute()
    
    if overlap_result.data:
        raise HTTPException(status_code=400, detail="Station already has an active booking")
    
    # Update booking: assign station, set check-in time, set status to ONGOING
    now = datetime.now(timezone.utc)
    
    # Calculate actual start_at and end_at based on check-in time and duration
    start_at = now.isoformat()
    duration_hours = booking.get("duration_hours", 1)
    end_at = (now + timedelta(hours=duration_hours)).isoformat()
    
    # Extract time components from check-in timestamp
    start_time_str = now.strftime("%H:%M")
    end_time_dt = now + timedelta(hours=duration_hours)
    end_time_str = end_time_dt.strftime("%H:%M")

    # Check if user has any active prepaid card
    prepaid_card = None
    user_id = booking.get("user_id")
    if user_id:
        card_result = supabase.table("user_prepaid_cards").select("*") \
            .eq("user_id", user_id).gt("remaining_minutes", 0).order("created_at").limit(1).execute()
        if card_result.data:
            prepaid_card = card_result.data[0]
    
    update_data = {
        "station_id": station_id,
        "checked_in_at": start_at,
        "checked_in": True,
        "status": "ONGOING",
        "start_at": start_at,
        "end_at": end_at,
        "start_time": start_time_str,
        "end_time": end_time_str,
    }

    if prepaid_card:
        update_data["billing_type"] = "PREPAID"
        update_data["prepaid_card_id"] = prepaid_card["id"]
    
    result = supabase.table("bookings").update(update_data).eq("id", booking_id).execute()
    
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to check in booking")
    
    return result.data[0]

@router.post("/bookings/{booking_id}/timer/start")
async def start_timer(
    booking_id: str,
    user: UserContext = Depends(require_role(["staff", "admin"]))
):
    """Start timer for a checked-in booking"""
    supabase = get_supabase_admin_client()
    
    # Get booking
    booking_result = supabase.table("bookings").select("*").eq("id", booking_id).single().execute()
    if not booking_result.data:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    booking = booking_result.data
    
    # Check if already checked in
    if not booking.get("checked_in_at"):
        raise HTTPException(status_code=400, detail="Booking must be checked in to start timer")
    
    # Check if timer already running
    if booking.get("timer_started_at"):
        raise HTTPException(status_code=400, detail="Timer already running")
    
    # Start timer
    now = datetime.now(timezone.utc)
    result = supabase.table("bookings").update({
        "timer_started_at": now.isoformat()
    }).eq("id", booking_id).execute()
    
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to start timer")
    
    return result.data[0]

@router.post("/bookings/{booking_id}/timer/stop")
async def stop_timer(
    booking_id: str,
    user: UserContext = Depends(require_role(["staff", "admin"]))
):
    """Stop timer and accumulate elapsed time"""
    supabase = get_supabase_admin_client()
    
    # Get booking
    booking_result = supabase.table("bookings").select("*").eq("id", booking_id).single().execute()
    if not booking_result.data:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    booking = booking_result.data
    
    # Check if timer is running
    if not booking.get("timer_started_at"):
        raise HTTPException(status_code=400, detail="Timer is not running")
    
    # Calculate elapsed time
    started_at = datetime.fromisoformat(booking["timer_started_at"].replace('Z', '+00:00'))
    now = datetime.now(timezone.utc)
    elapsed_seconds = int((now - started_at).total_seconds())
    
    # Add to total
    total_seconds = (booking.get("timer_total_seconds") or 0) + elapsed_seconds
    
    # Stop timer
    result = supabase.table("bookings").update({
        "timer_total_seconds": total_seconds,
        "timer_started_at": None
    }).eq("id", booking_id).execute()
    
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to stop timer")

    # If booking is prepaid, deduct minutes from user's prepaid card and mark as paid
    if booking.get("billing_type") == "PREPAID" and booking.get("prepaid_card_id") and booking.get("user_id"):
        elapsed_min = max(1, int(elapsed_seconds / 60))
        card_result = supabase.table("user_prepaid_cards").select("*").eq("id", booking["prepaid_card_id"]).single().execute()
        card = card_result.data
        if card:
            remaining = card.get("remaining_minutes", 0) or 0
            if elapsed_min <= remaining:
                # Fully covered by prepaid
                supabase.table("user_prepaid_cards").update({"remaining_minutes": remaining - elapsed_min}).eq("id", card["id"]).execute()
                supabase.table("bookings").update({
                    "prepaid_minutes_used": elapsed_min, "total_amount": 0, "amount_paid": 0,
                    "remaining_amount": 0, "payment_status": "PREPAID", "paid": True
                }).eq("id", booking_id).execute()
            else:
                # Overflow: charge extra hours (ceil to next hour)
                overflow_min = elapsed_min - remaining
                overflow_hours = (overflow_min + 59) // 60
                station_res = supabase.table("stations").select("hourly_rate").eq("id", booking.get("station_id")).single().execute()
                hourly_rate = booking.get("hourly_rate") or (station_res.data.get("hourly_rate") if station_res.data else 120)
                overflow_charge = overflow_hours * hourly_rate
                supabase.table("user_prepaid_cards").update({"remaining_minutes": 0}).eq("id", card["id"]).execute()
                supabase.table("bookings").update({
                    "prepaid_minutes_used": remaining, "billing_type": "PARTIAL_PREPAID",
                    "total_amount": overflow_charge, "amount_paid": 0, "remaining_amount": overflow_charge,
                    "payment_status": "PENDING", "paid": False
                }).eq("id", booking_id).execute()
    
    # Update user's total playtime
    user_id = booking.get("user_id")
    if user_id:
        user_result = supabase.table("user_profiles").select("total_playtime_seconds").eq("user_id", user_id).single().execute()
        current_playtime = (user_result.data.get("total_playtime_seconds") or 0) if user_result.data else 0
        new_playtime = current_playtime + elapsed_seconds
        
        supabase.table("user_profiles").update({
            "total_playtime_seconds": new_playtime
        }).eq("user_id", user_id).execute()
    
    return result.data[0]

@router.post("/bookings/{booking_id}/start-grace")
async def start_grace_time(
    booking_id: str,
    user: UserContext = Depends(require_role(["staff", "admin"]))
):
    """Start grace time when booking time ends"""
    supabase = get_supabase_admin_client()
    
    now = datetime.now(timezone.utc)
    result = supabase.table("bookings").update({
        "grace_time_started_at": now.isoformat()
    }).eq("id", booking_id).execute()
    
    return {"message": "Grace time started", "grace_started_at": now.isoformat()}

@router.post("/bookings/{booking_id}/extend-hour")
async def extend_booking_hour(
    booking_id: str,
    user: UserContext = Depends(require_role(["staff", "admin"]))
):
    """Auto-extend booking by 1 hour when grace time ends"""
    supabase = get_supabase_admin_client()
    
    # Get booking details
    booking_result = supabase.table("bookings").select("*, stations(hourly_rate)").eq("id", booking_id).single().execute()
    if not booking_result.data:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    booking = booking_result.data
    hourly_rate = booking.get('custom_hourly_rate') or booking['stations']['hourly_rate']
    current_amount = booking.get('total_amount', 0)
    user_count = booking.get('user_count', 1)
    
    # Calculate new total
    extension_amount = hourly_rate * user_count
    new_total = current_amount + extension_amount
    
    # Update booking
    result = supabase.table("bookings").update({
        "duration_hours": booking['duration_hours'] + 1,
        "total_amount": new_total,
        "grace_time_started_at": None,
        "auto_extended_hours": (booking.get('auto_extended_hours', 0) or 0) + 1
    }).eq("id", booking_id).execute()
    
    return {"message": "Booking extended by 1 hour", "new_total": new_total}

@router.get("/bookings/{booking_id}/receipt")
async def generate_receipt(
    booking_id: str,
    user: UserContext = Depends(require_role(["admin", "staff"]))
):
    """Generate PDF receipt for a booking"""
    supabase = get_supabase_admin_client()
    
    # Fetch booking with user and station data
    result = supabase.table("bookings").select(
        "*, user_profiles!bookings_user_fk(username, full_name), stations(name, type, hourly_rate)"
    ).eq("id", booking_id).execute()
    
    if not result.data:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    booking = result.data[0]
    
    # Check if booking is checked-in or ended
    if not booking.get("checked_in_at") and booking.get("status") != "ENDED":
        raise HTTPException(status_code=400, detail="Receipt can only be generated for checked-in or ended bookings")
    
    # Create PDF in memory
    try:
        from reportlab.lib.pagesizes import letter
        from reportlab.pdfgen import canvas
    except ModuleNotFoundError:
        raise HTTPException(
            status_code=503, 
            detail="PDF generation requires 'reportlab' package. Please install it: pip install reportlab"
        )
    buffer = BytesIO()
    from reportlab.lib.colors import HexColor
    c = canvas.Canvas(buffer, pagesize=letter)
    width, height = letter
    
    # Colors
    bg_dark = HexColor("#1a1a2e")
    cyan = HexColor("#00d4ff")
    yellow = HexColor("#ffd700")
    white = HexColor("#ffffff")
    gray = HexColor("#888888")
    
    # Background
    c.setFillColor(bg_dark)
    c.rect(0, 0, width, height, fill=True, stroke=False)
    
    # Helper functions
    def draw_line(y_pos):
        c.setStrokeColor(cyan)
        c.setLineWidth(0.5)
        c.line(50, y_pos, width - 50, y_pos)
    
    def draw_row(label, value, y_pos, bold=False):
        c.setFillColor(gray if not bold else white)
        c.setFont("Helvetica-Bold" if bold else "Helvetica", 10)
        c.drawString(50, y_pos, label)
        c.setFillColor(white if not bold else yellow)
        c.drawRightString(width - 50, y_pos, str(value))
    
    # Header
    y = height - 60
    c.setFillColor(yellow)
    c.setFont("Helvetica-Bold", 24)
    c.drawCentredString(width / 2, y, "NEO GAMING CAFE")
    y -= 25
    c.setFillColor(cyan)
    c.setFont("Helvetica", 12)
    c.drawCentredString(width / 2, y, "- RECEIPT -")
    y -= 30
    draw_line(y)
    
    # Booking Info
    y -= 25
    c.setFillColor(white)
    c.setFont("Helvetica", 9)
    c.drawString(50, y, f"ID: {booking['id']}")
    c.drawRightString(width - 50, y, datetime.fromisoformat(booking['created_at'].replace('Z', '+00:00')).strftime('%d/%m/%Y %H:%M'))
    
    # Customer & Station
    y -= 30
    user_profile = booking.get("user_profiles", {})
    station = booking.get("stations", {})
    draw_row("Customer", user_profile.get('full_name') or user_profile.get('username', 'N/A'), y)
    y -= 18
    draw_row("Station", f"{station.get('name', 'N/A')} ({station.get('type', '')})", y)
    y -= 25
    draw_line(y)
    
    # Session Details
    y -= 25
    c.setFillColor(yellow)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(50, y, "SESSION DETAILS")
    y -= 20
    if booking.get("start_at"):
        start_dt = datetime.fromisoformat(booking["start_at"].replace('Z', '+00:00'))
        draw_row("Start", start_dt.strftime('%d/%m/%Y %H:%M'), y)
        y -= 18
    if booking.get("end_at"):
        end_dt = datetime.fromisoformat(booking["end_at"].replace('Z', '+00:00'))
        draw_row("End", end_dt.strftime('%d/%m/%Y %H:%M'), y)
        y -= 18
    draw_row("Duration", f"{booking.get('duration_hours', 0)} hour(s)", y)
    y -= 18
    draw_row("Joysticks/Users", booking.get('user_count', 1), y)
    y -= 25
    draw_line(y)
    
    # Charges
    y -= 25
    c.setFillColor(yellow)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(50, y, "CHARGES")
    y -= 20
    hourly_rate = float(booking.get("custom_hourly_rate") or station.get("hourly_rate") or 0)
    draw_row("Rate per Hour", f"₹{hourly_rate:.0f}", y)
    y -= 18
    base_amount = float(booking.get("total_amount", 0))
    draw_row("Session Amount", f"₹{base_amount:.0f}", y)
    y -= 18
    
    # Discount
    discount_type_raw = (booking.get("discount_type") or "NONE").upper()
    discount_value = float(booking.get("discount_value") or 0)
    if discount_type_raw in ("PERCENTAGE", "AMOUNT") and discount_value > 0:
        disc_label = f"{discount_value}%" if discount_type_raw == "PERCENTAGE" else f"₹{discount_value:.0f}"
        draw_row("Discount", f"-{disc_label}", y)
        y -= 18
    
    # Coupon
    if booking.get("coupon_code"):
        draw_row(f"Coupon ({booking['coupon_code']})", f"-₹{float(booking.get('coupon_discount', 0)):.0f}", y)
        y -= 18
    
    # Food
    food_total = float(booking.get("food_total", 0))
    if food_total > 0:
        draw_row("Food & Snacks", f"₹{food_total:.0f}", y)
        y -= 18
    
    y -= 10
    draw_line(y)
    
    # Total
    y -= 25
    total = base_amount + food_total
    c.setFillColor(yellow)
    c.setFont("Helvetica-Bold", 14)
    c.drawString(50, y, "TOTAL")
    c.drawRightString(width - 50, y, f"₹{total:.0f}")
    y -= 25
    draw_line(y)
    
    # Payment
    y -= 25
    c.setFillColor(yellow)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(50, y, "PAYMENT")
    y -= 20
    amount_paid = float(booking.get("amount_paid", 0))
    remaining_amount = float(booking.get("remaining_amount", 0))
    draw_row("Amount Paid", f"₹{amount_paid:.0f}", y)
    y -= 18
    if remaining_amount > 0:
        draw_row("Balance Due", f"₹{remaining_amount:.0f}", y, bold=True)
        y -= 18
    elif remaining_amount < 0:
        draw_row("Balance Return", f"₹{abs(remaining_amount):.0f}", y)
        y -= 18
    draw_row("Status", booking.get('payment_status', 'PENDING'), y)
    y -= 18
    if booking.get('payment_method'):
        draw_row("Method", booking.get('payment_method', 'N/A'), y)
    y -= 30
    draw_line(y)
    
    # Footer
    y -= 30
    c.setFillColor(cyan)
    c.setFont("Helvetica", 10)
    c.drawCentredString(width / 2, y, "Thank you for gaming with us!")
    y -= 15
    c.setFillColor(gray)
    c.setFont("Helvetica", 8)
    c.drawCentredString(width / 2, y, "See you again soon!")
    
    c.save()
    buffer.seek(0)
    
    # Return PDF as response
    return Response(
        content=buffer.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="receipt_{booking_id}.pdf"'}
    )

