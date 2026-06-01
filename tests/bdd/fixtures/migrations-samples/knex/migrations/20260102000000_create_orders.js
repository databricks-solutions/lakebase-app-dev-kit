exports.up = function (knex) {
  return knex.schema.createTable("orders", (table) => {
    table.increments("id").primary();
    table.integer("user_id").notNullable().references("id").inTable("users");
    table.integer("total_cents").notNullable();
    table.timestamp("placed_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists("orders");
};
