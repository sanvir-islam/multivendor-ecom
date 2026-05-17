-- This runs automatically when PostgreSQL container starts for the first time
-- CREATE DATABASE auth_db -> is already created via POSTGRES_DB env var
CREATE DATABASE orders_db;

CREATE DATABASE vendors_db;

-- Add the test databases here!
CREATE DATABASE auth_db_test;

CREATE DATABASE orders_db_test;

CREATE DATABASE vendors_db_test;

-- All accessible with the same username/password
-- Create new DB -> docker exec -it ecom-postgres psql -U ecom_admin -d auth_db -c "CREATE DATABASE auth_db_test;"