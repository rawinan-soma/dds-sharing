-- Runs once, when the postgres volume is first created. The application
-- connects as dds_app_login (APP_DATABASE_URL), never as the owner that
-- migrates, so the grants in the migrations actually bind it (spec §6.4).
-- dev-only password: production provisions its own login on the host.
CREATE ROLE dds_app NOLOGIN;
CREATE ROLE dds_app_login LOGIN PASSWORD 'dds_app' IN ROLE dds_app;
