try { require('dotenv').config(); } catch (e) { /* dotenv not available in production */ }

/** @type {import('prisma').PrismaConfig} */
module.exports = {
  datasource: {
    url: process.env.DATABASE_URL || "",
  },
};

