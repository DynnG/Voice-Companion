import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict

# Document Schemas
class DocumentBase(BaseModel):
    filename: str
    category: str = "resume"
    size: Optional[str] = ""
    extracted_text: Optional[str] = ""

class DocumentCreate(DocumentBase):
    id: Optional[str] = None

class DocumentResponse(DocumentBase):
    id: str
    interview_id: str
    created_at: datetime.datetime

    model_config = ConfigDict(from_attributes=True)

# Message Schemas
class MessageBase(BaseModel):
    role: str  # "user" | "interviewer"
    content: str

class MessageCreate(MessageBase):
    id: Optional[str] = None

class MessageResponse(MessageBase):
    id: str
    interview_id: str
    created_at: datetime.datetime

    model_config = ConfigDict(from_attributes=True)

# Interview Schemas
class InterviewCreate(BaseModel):
    id: Optional[str] = None
    title: Optional[str] = None
    job_role: Optional[str] = "Software Developer"
    status: Optional[str] = "setup"

class InterviewUpdate(BaseModel):
    title: Optional[str] = None
    job_role: Optional[str] = None
    status: Optional[str] = None

class InterviewSummaryResponse(BaseModel):
    id: str
    title: str
    job_role: str
    status: str
    created_at: datetime.datetime
    updated_at: datetime.datetime
    document_count: int = 0
    message_count: int = 0
    last_message: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class InterviewDetailResponse(BaseModel):
    id: str
    title: str
    job_role: str
    status: str
    created_at: datetime.datetime
    updated_at: datetime.datetime
    documents: List[DocumentResponse] = []
    messages: List[MessageResponse] = []

    model_config = ConfigDict(from_attributes=True)
