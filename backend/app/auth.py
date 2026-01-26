from fastapi import HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from pydantic import BaseModel
from .config import get_settings
from .database import get_supabase_admin_client

security = HTTPBearer()

class UserContext(BaseModel):
    id: str
    email: str
    role: str = "user"

def verify_jwt_token(token: str) -> dict:
    print(f"Received token: {token[:50]}...")
    try:
        settings = get_settings()
        payload = jwt.decode(token, key="", options={"verify_signature": False, "verify_aud": False})
        print(f"Token payload: {payload}")
        return payload
    except JWTError as e:
        print(f"JWT Error: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token"
        )

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> UserContext:
    payload = verify_jwt_token(credentials.credentials)
    user_id = payload.get("sub")
    email = payload.get("email", "")
    
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload"
        )
    
    # Check user role from database
    supabase = get_supabase_admin_client()
    role = "user"
    
    try:
        # First check user_roles table
        result = supabase.table("user_roles").select("role").eq("user_id", user_id).execute()
        if result.data:
            role = result.data[0]["role"]
        else:
            # If no role in user_roles, check admin_settings
            import json
            admin_result = supabase.table("admin_settings").select("admin_emails").single().execute()
            if admin_result.data:
                admin_emails = json.loads(admin_result.data.get("admin_emails", "[]"))
                if email in admin_emails:
                    role = "admin"
    except:
        # Fallback: check admin_settings if user_roles fails
        try:
            import json
            admin_result = supabase.table("admin_settings").select("admin_emails").single().execute()
            if admin_result.data:
                admin_emails = json.loads(admin_result.data.get("admin_emails", "[]"))
                if email in admin_emails:
                    role = "admin"
        except:
            role = "user"
    
    return UserContext(id=user_id, email=email, role=role)

def require_role(required_roles: list[str]):
    def role_checker(user: UserContext = Depends(get_current_user)) -> UserContext:
        if user.role not in required_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions"
            )
        return user
    return role_checker 