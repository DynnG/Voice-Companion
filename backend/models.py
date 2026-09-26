import datetime
import uuid
from sqlalchemy import Column, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

try:
    from .database import Base
except ImportError:
    from database import Base

def generate_uuid(prefix: str = "") -> str:
    unique_id = uuid.uuid4().hex[:12]
    return f"{prefix}{unique_id}" if prefix else unique_id

class Interview(Base):
    __tablename__ = "interviews"

    id = Column(String(64), primary_key=True, index=True, default=lambda: generate_uuid("intv-"))
    title = Column(String(255), nullable=False, default="Interview - Software Developer")
    job_role = Column(String(128), nullable=False, default="Software Developer")
    status = Column(String(32), nullable=False, default="setup")  # "setup", "active", "completed"
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships with cascading deletes
    documents = relationship(
        "Document",
        back_populates="interview",
        cascade="all, delete-orphan",
        order_by="Document.created_at.asc()"
    )
    messages = relationship(
        "Message",
        back_populates="interview",
        cascade="all, delete-orphan",
        order_by="Message.created_at.asc()"
    )

class Document(Base):
    __tablename__ = "documents"

    id = Column(String(64), primary_key=True, index=True, default=lambda: generate_uuid("doc-"))
    interview_id = Column(String(64), ForeignKey("interviews.id", ondelete="CASCADE"), nullable=False, index=True)
    filename = Column(String(255), nullable=False)
    category = Column(String(64), nullable=False, default="resume")  # "resume", "job_description", "portfolio", "other"
    size = Column(String(32), nullable=True, default="")
    extracted_text = Column(Text, nullable=True, default="")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    interview = relationship("Interview", back_populates="documents")

class Message(Base):
    __tablename__ = "messages"

    id = Column(String(64), primary_key=True, index=True, default=lambda: generate_uuid("msg-"))
    interview_id = Column(String(64), ForeignKey("interviews.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(32), nullable=False)  # "user" or "interviewer"
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    interview = relationship("Interview", back_populates="messages")
