-- scripts/init-databases.sql
-- This runs automatically when PostgreSQL container starts for the first time
CREATE DATABASE orders_db;

CREATE DATABASE vendors_db;

-- auth_db is already created via POSTGRES_DB env var
-- So now you have: auth_db, orders_db, vendors_db
-- All accessible with the same username/password