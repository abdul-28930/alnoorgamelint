import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
import os

def send_booking_confirmation(email: str, phone: str, booking_details: dict):
    """Send booking confirmation notification"""
    try:
        # Simple email notification
        subject = "Booking Confirmed - Neo Gaming Cafe"
        message = f"""
        <html>
        <body style="font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 20px;">
          <div style="max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px;">
            <h1 style="color: #00ffff; text-align: center; margin-bottom: 10px;">Neo Gaming Cafe</h1>
            <h2 style="color: #333; text-align: center;">Booking Confirmed! 🎮</h2>
            <div style="background: #1a1a1a; color: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 8px 0;"><strong>Station:</strong> {booking_details.get('station_name')}</p>
              <p style="margin: 8px 0;"><strong>Date:</strong> {booking_details.get('date')}</p>
              <p style="margin: 8px 0;"><strong>Time:</strong> {booking_details.get('start_time')} - {booking_details.get('end_time')}</p>
              <p style="margin: 8px 0;"><strong>Duration:</strong> {booking_details.get('duration')} hours</p>
              <p style="margin: 8px 0;"><strong>Users:</strong> {booking_details.get('user_count')} user(s)</p>
              <p style="margin: 8px 0; font-size: 18px;"><strong>Total: ₹{booking_details.get('total_amount')}</strong></p>
            </div>
            <p style="text-align: center; color: #666; font-size: 16px;">See you at Neo Gaming Cafe! 🚀</p>
          </div>
        </body>
        </html>
        """
        
        send_email(email, subject, message)
        print(f"Booking confirmation sent to {email}")
        
    except Exception as e:
        print(f"Failed to send booking confirmation: {e}")

def send_booking_reminder(email: str, phone: str, booking_details: dict):
    """Send 1-hour reminder notification"""
    try:
        subject = "Reminder: Your gaming session starts in 1 hour!"
        message = f"""
        Hi!
        
        Reminder: Your gaming session starts in 1 hour.
        
        Station: {booking_details.get('station_name')}
        Time: {booking_details.get('start_time')}
        
        Please arrive 5 minutes early.
        
        Neo Gaming Cafe Team
        """
        
        send_email(email, subject, message)
        print(f"Booking reminder sent to {email}")
        
    except Exception as e:
        print(f"Failed to send booking reminder: {e}")

def send_email(to_email: str, subject: str, message: str):
    """Simple email sender (configure SMTP settings)"""
    try:
        # Basic SMTP configuration (replace with your settings)
        smtp_server = os.getenv('SMTP_SERVER', 'smtp.gmail.com')
        smtp_port = int(os.getenv('SMTP_PORT', '587'))
        smtp_username = os.getenv('SMTP_USERNAME', '')
        smtp_password = os.getenv('SMTP_PASSWORD', '')
        
        if not smtp_username:
            print("SMTP not configured - skipping email")
            return
            
        msg = MIMEMultipart()
        msg['From'] = smtp_username
        msg['To'] = to_email
        msg['Subject'] = subject
        msg.attach(MIMEText(message, 'html'))
        
        with smtplib.SMTP(smtp_server, smtp_port) as server:
            server.starttls()
            server.login(smtp_username, smtp_password)
            server.send_message(msg)
            
    except Exception as e:
        print(f"Failed to send email: {e}")

def check_and_send_reminders():
    """Check for upcoming bookings and send reminders"""
    from datetime import datetime, timedelta
    from .database import get_supabase_admin_client
    
    supabase = get_supabase_admin_client()
    
    # Use IST for all reminder checks
    now = datetime.now()  # This will be server time (should be IST)
    
    # Check 1h, 30m, 5m reminders
    reminders = [(60, 'reminder_1h_sent'), (30, 'reminder_30m_sent'), (5, 'reminder_5m_sent')]
    
    for minutes, column in reminders:
        target_time = now + timedelta(minutes=minutes)
        end_time = target_time + timedelta(minutes=2)
        
        # Format as proper timestamptz for comparison
        target_str = target_time.isoformat()
        end_str = end_time.isoformat()
        
        result = supabase.table("bookings").select("*, stations(*)").eq(column, False).gte("start_at", target_str).lt("start_at", end_str).execute()
        
        for booking in result.data or []:
            # Get user email from auth.users table
            try:
                user_result = supabase.table("auth.users").select("email").eq("id", booking["user_id"]).single().execute()
                if user_result.data and user_result.data.get("email"):
                    send_reminder_email(user_result.data["email"], minutes, booking)
                supabase.table("bookings").update({column: True}).eq("id", booking["id"]).execute()
            except Exception as email_error:
                print(f"Failed to send reminder for booking {booking['id']}: {email_error}")

def send_reminder_email(email: str, minutes: int, booking: dict):
    """Send booking reminder email"""
    # Extract start time from IST string for display
    start_time = booking.get('start_at', '').split()[1][:5] if booking.get('start_at') else 'N/A'
    
    subject = f"Gaming Session Starts in {minutes} Minutes!"
    message = f"""
    <html>
    <body style="font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px;">
        <h1 style="color: #00ffff; text-align: center;">Neo Gaming Cafe</h1>
        <h2 style="color: #333; text-align: center;">Reminder: Session in {minutes} minutes! ⏰</h2>
        <div style="background: #1a1a1a; color: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Station:</strong> {booking.get('stations', {}).get('name', 'N/A')}</p>
          <p><strong>Time:</strong> {start_time}</p>
        </div>
        <p style="text-align: center; color: #666;">Please arrive 5 minutes early! 🎮</p>
      </div>
    </body>
    </html>
    """
    send_email(email, subject, message)