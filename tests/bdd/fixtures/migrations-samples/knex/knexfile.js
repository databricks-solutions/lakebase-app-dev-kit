// Knex configuration fixture. Connection is sourced from DATABASE_URL so
// the fixture works for live tests against any branch DSN.
module.exports = {
  client: "pg",
  connection: process.env.DATABASE_URL,
  migrations: {
    directory: "./migrations",
  },
};
