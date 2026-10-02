"""Central SQLAlchemy access: remote-only Turso in production, SQLite locally."""
import logging
import os
import threading
from pathlib import Path
from urllib.parse import urlsplit

try:
    from . import config  # Load local .env before reading database configuration.
except ImportError:
    import config

from fastapi import HTTPException
from sqlalchemy import create_engine, event
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.pool import NullPool
from sqlalchemy.schema import CreateTable, CreateIndex

logger = logging.getLogger(__name__)
DB_DIR = Path(__file__).resolve().parent


class DatabaseConfigurationError(RuntimeError):
    pass


class DatabaseUnavailable(RuntimeError):
    pass


def database_settings(environment=None):
    env = os.environ if environment is None else environment
    url = env.get('DATABASE_URL', '').strip()
    if not url:
        if env.get('VERCEL'):
            raise DatabaseConfigurationError('DATABASE_URL is required on Vercel; local or /tmp SQLite fallback is disabled.')
        path = DB_DIR / 'voice_companion.db'
        return f'sqlite:///{path}', {'check_same_thread': False}, str(path), True
    if url.startswith('sqlite:///') and not env.get('VERCEL'):
        return url, {'check_same_thread': False}, 'configured local SQLite database', True
    parsed = urlsplit(url)
    if (parsed.scheme not in ('libsql', 'https') or not parsed.hostname
            or parsed.username or parsed.password or parsed.query or parsed.fragment
            or parsed.path not in ('', '/')):
        raise DatabaseConfigurationError('DATABASE_URL must be a remote libsql:// or https:// Turso host, without credentials, query parameters or a file path.')
    token = env.get('DATABASE_AUTH_TOKEN', '').strip()
    if not token:
        raise DatabaseConfigurationError('DATABASE_AUTH_TOKEN is required for the hosted Turso database.')
    return f'sqlite+libsql://{parsed.netloc}?secure=true', {'auth_token': token, 'check_same_thread': False}, f'libsql://{parsed.hostname}', False


SQLALCHEMY_DATABASE_URL, _connect_args, DATABASE_TARGET, IS_LOCAL_DATABASE = database_settings()
DB_FILE = SQLALCHEMY_DATABASE_URL[len('sqlite:///'):] if IS_LOCAL_DATABASE else None
try:
    engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args=_connect_args,
                           poolclass=NullPool, hide_parameters=True)
except (ImportError, SQLAlchemyError) as error:
    raise DatabaseConfigurationError('Could not load the database driver; install backend requirements (Turso remote access requires Linux/macOS).') from None


@event.listens_for(engine, 'connect')
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    try:
        cursor.execute('PRAGMA foreign_keys=ON')
        if IS_LOCAL_DATABASE:
            cursor.execute('PRAGMA temp_store=MEMORY')
    finally:
        cursor.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()
_schema_lock = threading.Lock()
_schema_ready = False


def database_failure(operation, error):
    # Never stringify driver exceptions: they can contain tokens/SQL/document text.
    logger.error('Database %s failed for %s (%s); credentials and query data redacted',
                 operation, DATABASE_TARGET, type(error).__name__)
    return DatabaseUnavailable(f'Database {operation} failed for {DATABASE_TARGET}. Check database connectivity and credentials.')


def init_db():
    global _schema_ready
    if _schema_ready:
        return
    with _schema_lock:
        if _schema_ready:
            return
        # Deferred import registers tables without introducing circular imports.
        if __package__:
            from . import models
        else:
            import models
        try:
            with engine.begin() as connection:
                for table in Base.metadata.sorted_tables:
                    connection.execute(CreateTable(table, if_not_exists=True))
                    for index in table.indexes:
                        connection.execute(CreateIndex(index, if_not_exists=True))
            _schema_ready = True
        except Exception as error:
            raise database_failure('schema initialization', error) from None


def get_db():
    try:
        init_db()
    except DatabaseUnavailable as error:
        raise HTTPException(status_code=503, detail=str(error)) from None
    db = SessionLocal()
    try:
        yield db
    except SQLAlchemyError as error:
        db.rollback()
        failure = database_failure('request', error)
        raise HTTPException(status_code=503, detail=str(failure)) from None
    finally:
        db.close()
