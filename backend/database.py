import os
import logging
from pathlib import Path
try:
    from .runtime_storage import sqlite_database_path
except ImportError:
    from runtime_storage import sqlite_database_path
from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker

# Keep local development persistent; Vercel SQLite is instance-local scratch storage.
DB_DIR = os.path.dirname(os.path.abspath(__file__))
DB_FILE = str(sqlite_database_path(Path(DB_DIR)))
if os.environ.get("VERCEL"):
    logging.getLogger(__name__).warning(
        "SQLite uses ephemeral /tmp storage: interview, document and message records "
        "are not durable or shared across serverless instances. Use an external database "
        "for persistent history."
    )
SQLALCHEMY_DATABASE_URL = f"sqlite:///{DB_FILE}"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False}
)

# Enable SQLite foreign key constraint enforcement
@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA temp_store=MEMORY")
    cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
