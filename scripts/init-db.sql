-- Initialize RagSpace Database with all required schemas
-- This script creates all schemas needed by different microservices

-- Create schemas
CREATE SCHEMA IF NOT EXISTS ragauth;
CREATE SCHEMA IF NOT EXISTS upload;
CREATE SCHEMA IF NOT EXISTS scene_detector;
CREATE SCHEMA IF NOT EXISTS chat_manager;
CREATE SCHEMA IF NOT EXISTS payment;

-- Grant privileges to postgres user on all schemas
GRANT ALL PRIVILEGES ON SCHEMA ragauth TO postgres;
GRANT ALL PRIVILEGES ON SCHEMA upload TO postgres;
GRANT ALL PRIVILEGES ON SCHEMA scene_detector TO postgres;
GRANT ALL PRIVILEGES ON SCHEMA chat_manager TO postgres;
GRANT ALL PRIVILEGES ON SCHEMA payment TO postgres;

-- Set search path to include all schemas
ALTER DATABASE ragspace SET search_path TO public, ragauth, upload, scene_detector, chat_manager, payment;

-- Output confirmation
\echo 'RagSpace database initialized with all required schemas'
\echo 'Schemas created: ragauth, upload, scene_detector, chat_manager, payment'
