require('dotenv').config();

/** @type {import('prisma').PrismaConfig} */
module.exports = {
  datasource: {
    url: process.env.DATABASE_URL || "",
  },
};

