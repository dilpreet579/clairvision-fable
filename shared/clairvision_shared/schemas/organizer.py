import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class OrganizerRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    is_active: bool
    invited_by_id: uuid.UUID | None = None
    created_at: datetime


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=12)


class AcceptInviteRequest(BaseModel):
    token: str
    password: str = Field(min_length=12)


class InviteOrganizerRequest(BaseModel):
    email: EmailStr
